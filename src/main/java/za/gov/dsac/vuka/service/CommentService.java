package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.time.Instant;
import java.util.*;

/**
 * Comments, anchored to the thing being discussed, and the digest that makes them live.
 *
 * <h2>Every comment lands on something</h2>
 *
 * <p>There is no way to comment on an entity in general. The anchor is required, it is a target,
 * a confirmed result or a document version, and the entity is read off it rather than passed in.
 * That is a deliberate narrowing, and it is the difference the frontend design document draws in
 * J3: a reviewer who returns a submission with one free text box makes the entity guess which
 * number is in dispute, and the entity guesses wrong. Anchoring routes the objection to the
 * figure it is about.
 *
 * <p>A consequence worth stating because it looks like an omission: the entity id is not a
 * parameter on the write path. A caller cannot file a comment against entity A that points at
 * entity B's target, because there is only one entity in the request and the anchor supplies it.
 *
 * <h2>Threads are one level deep</h2>
 *
 * <p>A reply to a reply attaches to the same root. A tree is unreadable on a phone, and this
 * conversation is short by nature: a figure is disputed, the entity answers, the point is closed.
 *
 * <h2>Why this is enough for "in real time"</h2>
 *
 * <p>{@link #digest} answers the polling question — has anything changed — from two aggregates,
 * without reading a single comment. Comments are append-only, so (count, latest change) moves if
 * and only if the thread moved. A client polls it every five seconds, gets a validator back, and
 * sends it again next time; the server answers "no" in a few hundred microseconds and no bytes.
 * The websocket layer that would replace this buys a live cursor, costs a stateful connection per
 * open tab, and is the part of a demo most likely to fail on conference wifi.
 */
@Service
public class CommentService {

    /** The longest a single comment may be. Matches the column, checked before the database sees it. */
    public static final int MAX_BODY = 4000;

    private final CommentRepository comments;
    private final PublicEntityRepository entities;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final DocumentRecordRepository documents;

    public CommentService(CommentRepository comments, PublicEntityRepository entities,
                          TargetRepository targets, TargetResultRepository results,
                          DocumentRecordRepository documents) {
        this.comments = comments;
        this.entities = entities;
        this.targets = targets;
        this.results = results;
        this.documents = documents;
    }

    // ------------------------------------------------------------------
    // Anchors
    // ------------------------------------------------------------------

    /**
     * A resolved anchor: what is being discussed, which entity it belongs to, and how to name it
     * on screen.
     *
     * @param type     target, result or document
     * @param id       the row being discussed
     * @param entityId the entity that owns it, which is also the entity the comment belongs to
     * @param label    human wording, so a thread list reads as indicators rather than as uuids
     */
    public record Anchor(Enums.AnchorType type, UUID id, UUID entityId, String label) {}

    /** The anchor, or empty when nothing of that type and id exists. */
    public Optional<Anchor> anchor(Enums.AnchorType type, UUID anchorId) {
        if (type == null || anchorId == null) return Optional.empty();
        return switch (type) {
            case TARGET -> targets.findById(anchorId)
                    .filter(t -> t.getEntity() != null)
                    .map(t -> new Anchor(type, anchorId, t.getEntity().getId(),
                            label(t.getIndicatorRef(), t.getIndicator())));
            case RESULT -> results.findById(anchorId)
                    .filter(r -> r.getTarget() != null && r.getTarget().getEntity() != null)
                    .map(r -> new Anchor(type, anchorId, r.getTarget().getEntity().getId(),
                            "Reported figure for " + label(r.getIndicatorRef(), r.getTarget().getIndicator())));
            case DOCUMENT -> documents.findById(anchorId)
                    .filter(d -> d.getEntity() != null)
                    .map(d -> new Anchor(type, anchorId, d.getEntity().getId(),
                            d.getFileName() == null ? String.valueOf(d.getDocumentType()) : d.getFileName()));
        };
    }

    private static String label(String ref, String wording) {
        if (ref == null || ref.isBlank()) return wording == null ? "" : wording;
        return wording == null || wording.isBlank() ? ref : ref + " " + wording;
    }

    // ------------------------------------------------------------------
    // Writing
    // ------------------------------------------------------------------

    /**
     * Files a comment against an anchor.
     *
     * <p>Callers check that {@code who} may reach {@link Anchor#entityId()} before calling. This
     * method does not, because the two surfaces enforce tenancy differently and a silent second
     * check here would let one of them stop doing it without a test noticing.
     *
     * @param anchor   the resolved anchor, which supplies the entity
     * @param parentId the comment being replied to, or null to open a thread
     * @param body     what was written, trimmed and length-checked here
     * @param who      the author, whose uid, name and role are stamped on the row
     */
    @Transactional
    public Comment post(Anchor anchor, UUID parentId, String body, VukaPrincipal who) {
        String text = body == null ? "" : body.trim();
        if (text.isEmpty()) throw new IllegalArgumentException("A comment needs a body.");
        if (text.length() > MAX_BODY) {
            throw new IllegalArgumentException("A comment is limited to " + MAX_BODY + " characters.");
        }

        PublicEntity entity = entities.findById(anchor.entityId())
                .orElseThrow(() -> new IllegalArgumentException("No such entity."));

        Instant now = Instant.now();
        Comment c = new Comment();
        c.setEntity(entity);
        c.setAnchorType(anchor.type());
        c.setAnchorId(anchor.id());
        c.setParentId(rootOf(parentId, anchor));
        c.setAuthorUid(who.uid());
        c.setAuthorName(who.name());
        c.setAuthorRole(roleOf(who));
        c.setBody(text);
        c.setResolved(false);
        c.setCreatedAt(now);
        c.setUpdatedAt(now);
        return comments.save(c);
    }

    /**
     * Flattens a reply-to-a-reply onto the thread it belongs to, and refuses a parent from a
     * different anchor outright. Crossing anchors would let a comment appear under a target it
     * was never written about, which is the one thing anchoring exists to prevent.
     */
    private UUID rootOf(UUID parentId, Anchor anchor) {
        if (parentId == null) return null;
        Comment parent = comments.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("No such comment to reply to."));
        if (parent.getAnchorType() != anchor.type() || !anchor.id().equals(parent.getAnchorId())) {
            throw new IllegalArgumentException("That reply belongs to a different thread.");
        }
        return parent.getParentId() == null ? parent.getId() : parent.getParentId();
    }

    private static Enums.Role roleOf(VukaPrincipal who) {
        try {
            return Enums.Role.valueOf(who.role());
        } catch (IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }

    /**
     * Closes or reopens a point.
     *
     * <p>Who may: the author, or any DSAC role. An entity cannot close an objection DSAC raised
     * against its own figures by itself, which is the only asymmetry in this feature and is the
     * point of it. Returns empty when the comment does not exist or the caller may not touch it,
     * so the caller cannot tell those two apart.
     */
    @Transactional
    public Optional<Comment> setResolved(UUID commentId, boolean resolved, VukaPrincipal who) {
        Comment c = comments.findById(commentId).orElse(null);
        if (c == null) return Optional.empty();
        if (c.getEntity() == null || !who.canRead(c.getEntity().getId().toString())) return Optional.empty();

        boolean isAuthor = who.uid() != null && who.uid().equals(c.getAuthorUid());
        if (!isAuthor && !who.isDsac()) return Optional.empty();

        if (c.isResolved() == resolved) return Optional.of(c);

        c.setResolved(resolved);
        c.setResolvedByUid(resolved ? who.uid() : null);
        c.setResolvedByName(resolved ? who.name() : null);
        c.setResolvedAt(resolved ? Instant.now() : null);
        // The poll cursor. Without this a client watching the thread would never learn that the
        // point was closed, because no row arrived.
        c.setUpdatedAt(Instant.now());
        return Optional.of(comments.save(c));
    }

    // ------------------------------------------------------------------
    // Reading
    // ------------------------------------------------------------------

    /** One comment and, where it opened a thread, the replies under it. */
    public record CommentView(UUID id, UUID parentId, String authorName, String authorRole,
                              String body, Instant createdAt, boolean resolved,
                              String resolvedByName, Instant resolvedAt,
                              List<CommentView> replies) {}

    /** Everything said about one anchor. */
    public record ThreadView(Enums.AnchorType anchorType, UUID anchorId, String label,
                             boolean open, Instant lastActivity, int count,
                             List<CommentView> roots) {}

    /** One thread, in reading order, replies nested under the comment they answer. */
    public ThreadView thread(Anchor anchor) {
        return assemble(anchor.type(), anchor.id(), anchor.label(),
                comments.findByEntityIdAndAnchorTypeAndAnchorIdOrderByCreatedAtAsc(
                        anchor.entityId(), anchor.type(), anchor.id()));
    }

    /**
     * Every thread in one workspace, the ones still open first and then by latest activity.
     *
     * <p>An anchor whose row has since been superseded still resolves, because nothing in this
     * system is deleted; an anchor that cannot be resolved at all is labelled rather than
     * dropped, so a comment never silently disappears from the workspace.
     */
    public List<ThreadView> workspace(UUID entityId) {
        Map<String, List<Comment>> byAnchor = new LinkedHashMap<>();
        for (Comment c : comments.findByEntityIdOrderByCreatedAtAsc(entityId)) {
            byAnchor.computeIfAbsent(c.getAnchorType() + ":" + c.getAnchorId(), k -> new ArrayList<>()).add(c);
        }

        List<ThreadView> views = new ArrayList<>();
        for (List<Comment> thread : byAnchor.values()) {
            Comment first = thread.get(0);
            String label = anchor(first.getAnchorType(), first.getAnchorId())
                    .map(Anchor::label)
                    .orElse("No longer in the register");
            views.add(assemble(first.getAnchorType(), first.getAnchorId(), label, thread));
        }

        views.sort(Comparator.comparingInt((ThreadView t) -> t.open() ? 0 : 1)
                .thenComparing(ThreadView::lastActivity, Comparator.reverseOrder()));
        return views;
    }

    private ThreadView assemble(Enums.AnchorType type, UUID anchorId, String label, List<Comment> thread) {
        Map<UUID, List<CommentView>> replies = new HashMap<>();
        for (Comment c : thread) {
            if (c.getParentId() != null) {
                replies.computeIfAbsent(c.getParentId(), k -> new ArrayList<>()).add(view(c, List.of()));
            }
        }

        List<CommentView> roots = new ArrayList<>();
        for (Comment c : thread) {
            if (c.getParentId() == null) {
                roots.add(view(c, replies.getOrDefault(c.getId(), List.of())));
            }
        }

        boolean open = thread.stream().anyMatch(c -> c.getParentId() == null && !c.isResolved());
        Instant last = thread.stream().map(Comment::getUpdatedAt)
                .filter(Objects::nonNull).max(Instant::compareTo).orElse(Instant.EPOCH);

        return new ThreadView(type, anchorId, label, open, last, thread.size(), roots);
    }

    private static CommentView view(Comment c, List<CommentView> replies) {
        return new CommentView(c.getId(), c.getParentId(), c.getAuthorName(),
                c.getAuthorRole() == null ? null : c.getAuthorRole().name(),
                c.getBody(), c.getCreatedAt(), c.isResolved(),
                c.getResolvedByName(), c.getResolvedAt(), replies);
    }

    // ------------------------------------------------------------------
    // The poll
    // ------------------------------------------------------------------

    /**
     * What a client holds between polls.
     *
     * @param count      comments in scope
     * @param lastChange the latest write in scope, or null where there are none
     */
    public record Digest(long count, Instant lastChange) {

        /**
         * The validator sent as an ETag.
         *
         * <p>Weak, because two responses with the same digest are equivalent rather than
         * byte-identical: they can differ in whitespace, in negotiated language, or because a
         * template changed between them. Semantics is what a poll is asking about.
         */
        public String etag() {
            return "W/\"c" + count + "-" + (lastChange == null ? "0" : lastChange.toEpochMilli()) + "\"";
        }
    }

    /** How many points are still open against this entity. The badge on the reporter's home screen. */
    public long openThreadCount(UUID entityId) {
        return comments.countByEntityIdAndParentIdIsNullAndResolvedFalse(entityId);
    }

    /** The whole workspace. */
    public Digest digest(UUID entityId) {
        return new Digest(comments.countByEntityId(entityId), comments.lastChangeForEntity(entityId));
    }

    /** One thread. */
    public Digest digest(Anchor anchor) {
        return new Digest(
                comments.countByEntityIdAndAnchorTypeAndAnchorId(anchor.entityId(), anchor.type(), anchor.id()),
                comments.lastChangeForAnchor(anchor.entityId(), anchor.type(), anchor.id()));
    }
}
