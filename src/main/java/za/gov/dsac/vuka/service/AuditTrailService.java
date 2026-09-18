package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * The audit trail: who did what, to which figure, and when.
 *
 * <h2>Why this is assembled rather than stored</h2>
 *
 * There is no event table and this does not add one. Every action worth auditing in this system
 * already records its actor and its time on the row it changed, because that was the point:
 * a figure carries the person who confirmed it, a document carries the person who uploaded it and
 * the official who decided on it, a submission carries who filed it and who reviewed it. The
 * accountability chain is the schema.
 *
 * So the trail is read out of those rows rather than duplicated into a log beside them. That
 * matters for more than tidiness. A separate event table can disagree with the records it
 * describes, and when it does, nobody can tell which is true. Here they cannot disagree, because
 * there is only one copy: every line below is a record, not a note about a record.
 *
 * <h2>What this is not</h2>
 *
 * Not the application log. Server logs are diagnostics, they carry stack traces and internal
 * paths, and they are read by whoever runs the service rather than by the Department. This is the
 * accountability record, which is a different artefact for a different reader, and it is the one
 * an auditor would ask for.
 *
 * <h2>Cost</h2>
 *
 * Honest about it: this reads four tables and sorts in memory. At the scale this system is built
 * for, twenty eight entities filing quarterly, that is a few thousand rows a year and it is fine.
 * It would not survive a million rows, and the fix at that point is a materialised event table
 * written on the same transaction as the record. Stated here rather than discovered later.
 */
@Service
public class AuditTrailService {

    private static final ZoneId ZA = ZoneId.of("Africa/Johannesburg");

    private final SubmissionRepository submissions;
    private final TargetResultRepository results;
    private final DocumentRecordRepository documents;
    private final CommentRepository comments;
    private final PublicEntityRepository entities;

    public AuditTrailService(SubmissionRepository submissions, TargetResultRepository results,
                             DocumentRecordRepository documents, CommentRepository comments,
                             PublicEntityRepository entities) {
        this.submissions = submissions;
        this.results = results;
        this.documents = documents;
        this.comments = comments;
        this.entities = entities;
    }

    /**
     * One line of the trail.
     *
     * @param at       when it happened
     * @param type     the kind of action, for filtering
     * @param actor    the person, as recorded at the time. Never resolved fresh: if somebody's
     *                 name changes, the record still says who acted under the name they used
     * @param actorRef the uid, where one was stored
     * @param entity   the body it concerns
     * @param summary  one sentence, in the words the interface uses elsewhere
     * @param detail   the specific figure, file or note, where there is one
     * @param recordId the row this line was read from, so a reader can go and look
     */
    public record AuditEvent(Instant at, String type, String actor, String actorRef,
                             UUID entityId, String entity, String summary, String detail,
                             UUID recordId) {}

    /** The kinds, as the filter offers them. */
    public static final List<String> TYPES = List.of(
            "FIGURE_CONFIRMED", "SUBMISSION_OPENED", "SUBMISSION_SUBMITTED", "SUBMISSION_REVIEWED",
            "DOCUMENT_UPLOADED", "DOCUMENT_RECEIPTED", "DOCUMENT_DECIDED", "COMMENT", "COMMENT_RESOLVED");

    /**
     * The trail, newest first.
     *
     * @param entityId null for every entity. A reporter is always scoped to their own by the
     *                 controller rather than by this method, so the scoping cannot be forgotten
     *                 at one call site and not another
     * @param from     inclusive, by South African date
     * @param to       inclusive
     */
    @Transactional(readOnly = true)
    public List<AuditEvent> trail(UUID entityId, LocalDate from, LocalDate to, String type, int limit) {
        Map<UUID, String> entityNames = new HashMap<>();
        for (PublicEntity e : entities.findAll()) entityNames.put(e.getId(), e.getName());

        List<AuditEvent> out = new ArrayList<>();

        for (Submission s : entityId == null
                ? submissions.findAllByOrderByCreatedAtDesc()
                : submissions.findByEntityIdOrderByCreatedAtDesc(entityId)) {

            UUID eid = s.getEntity().getId();
            String ename = entityNames.getOrDefault(eid, "Unknown entity");
            String period = s.getReportingPeriod() == null ? "a period" : s.getReportingPeriod().getLabel();

            add(out, s.getCreatedAt(), "SUBMISSION_OPENED", s.getSubmittedByName(), s.getSubmittedByUid(),
                    eid, ename, "Opened " + period + " for capture",
                    "Channel " + s.getChannel(), s.getId());

            add(out, s.getSubmittedAt(), "SUBMISSION_SUBMITTED", s.getSubmittedByName(), s.getSubmittedByUid(),
                    eid, ename, "Submitted " + period + " to the Department", null, s.getId());

            if (s.getReviewedAt() != null) {
                // The reviewer's display name is not stored, only the uid. Showing the uid is
                // noise and inventing a name is worse, so the actor reads as the role that acted.
                add(out, s.getReviewedAt(), "SUBMISSION_REVIEWED", "DSAC reviewer", s.getReviewedByUid(),
                        eid, ename,
                        s.getStatus() == Enums.SubmissionStatus.APPROVED
                                ? "Approved " + period
                                : "Returned " + period + " to the entity",
                        s.getReturnReason(), s.getId());
            }

            for (TargetResult r : results.findBySubmissionId(s.getId())) {
                if (r.getConfirmedAt() == null) continue;
                String indicator = r.getTarget() == null ? r.getIndicatorRef() : r.getTarget().getIndicatorRef();
                add(out, r.getConfirmedAt(), "FIGURE_CONFIRMED", r.getConfirmedByName(), r.getConfirmedByUid(),
                        eid, ename,
                        "Confirmed " + (indicator == null ? "a figure" : indicator)
                                + (r.getActualValue() == null ? " as having no result" : " as " + r.getActualValue()),
                        r.getVarianceExplanation(), r.getId());
            }
        }

        for (DocumentRecord d : entityId == null
                ? documents.findAll()
                : documents.findByEntityIdOrderByUploadedAtDesc(entityId)) {

            if (d.getEntity() == null) continue;
            UUID eid = d.getEntity().getId();
            String ename = entityNames.getOrDefault(eid, "Unknown entity");
            String file = d.getFileName() == null ? "a document" : d.getFileName();

            add(out, d.getUploadedAt(), "DOCUMENT_UPLOADED", null, d.getUploadedByUid(), eid, ename,
                    "Uploaded " + file + " (version " + d.getVersion() + ")",
                    d.getContentHash() == null ? null : "sha256 " + shortHash(d.getContentHash()), d.getId());

            add(out, d.getReceivedAt(), "DOCUMENT_RECEIPTED", null, null, eid, ename,
                    "Receipt issued for " + file,
                    d.getReceiptNumber(), d.getId());

            add(out, d.getDecidedAt(), "DOCUMENT_DECIDED", d.getDecidedByName(), d.getDecidedByUid(), eid, ename,
                    (d.getApprovalStatus() == Enums.ApprovalStatus.APPROVED ? "Approved " : "Returned ") + file,
                    d.getDecisionNote(), d.getId());
        }

        for (Comment c : entityId == null
                ? comments.findAll()
                : comments.findByEntityIdOrderByCreatedAtDesc(entityId)) {

            if (c.getEntity() == null) continue;
            UUID eid = c.getEntity().getId();
            String ename = entityNames.getOrDefault(eid, "Unknown entity");

            add(out, c.getCreatedAt(), "COMMENT", c.getAuthorName(), c.getAuthorUid(), eid, ename,
                    c.getAnchorType() == Enums.AnchorType.TARGET
                            ? "Commented on a reported figure"
                            : "Commented on the filing",
                    c.getBody(), c.getId());

            add(out, c.getResolvedAt(), "COMMENT_RESOLVED", c.getResolvedByName(), c.getResolvedByUid(),
                    eid, ename, "Resolved a comment thread", null, c.getId());
        }

        LocalDate fromDay = from;
        LocalDate toDay = to;

        return out.stream()
                .filter(e -> type == null || type.isBlank() || type.equals(e.type()))
                .filter(e -> within(e.at(), fromDay, toDay))
                .sorted(Comparator.comparing(AuditEvent::at).reversed())
                .limit(limit <= 0 ? 500 : limit)
                .toList();
    }

    /** Skips anything with no timestamp: an action that was never recorded is not an event. */
    private static void add(List<AuditEvent> out, Instant at, String type, String actor, String actorRef,
                            UUID entityId, String entity, String summary, String detail, UUID recordId) {
        if (at == null) return;
        out.add(new AuditEvent(at, type, actor == null || actor.isBlank() ? "Not recorded" : actor,
                actorRef, entityId, entity, summary, detail, recordId));
    }

    private static boolean within(Instant at, LocalDate from, LocalDate to) {
        LocalDate day = at.atZone(ZA).toLocalDate();
        if (from != null && day.isBefore(from)) return false;
        return to == null || !day.isAfter(to);
    }

    /** A hash is evidence that the file did not change, not something anybody reads in full. */
    private static String shortHash(String hash) {
        return hash.length() <= 12 ? hash : hash.substring(0, 12);
    }
}
