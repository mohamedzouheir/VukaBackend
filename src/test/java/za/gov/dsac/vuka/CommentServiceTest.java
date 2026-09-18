package za.gov.dsac.vuka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.CommentService;
import za.gov.dsac.vuka.service.ReportingViewService;
import za.gov.dsac.vuka.service.CommentService.Anchor;
import za.gov.dsac.vuka.service.CommentService.Digest;
import za.gov.dsac.vuka.service.CommentService.ThreadView;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * What these tests are actually defending.
 *
 * <p>Three claims are made about commenting in the specification and in the pitch, and each one
 * is a claim about something the code refuses to do rather than something it offers. A comment
 * always lands on the figure in dispute. A thread cannot be crossed with another thread. An
 * entity cannot close an objection the department raised against its own numbers. Those are the
 * tests here, plus the arithmetic behind the poll, because a validator that is wrong in the
 * cheap direction means a reporter never sees the query.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommentServiceTest {

    @Mock private CommentRepository comments;
    @Mock private PublicEntityRepository entities;
    @Mock private TargetRepository targets;
    @Mock private TargetResultRepository results;
    @Mock private DocumentRecordRepository documents;

    private CommentService service;

    private final UUID entityId = UUID.randomUUID();
    private final UUID targetId = UUID.randomUUID();
    private Anchor anchor;

    private static final VukaPrincipal REVIEWER =
            new VukaPrincipal("uid-reviewer", "r@dsac.gov.za", "L Mokoena", "DSAC_REVIEWER", null);

    @BeforeEach
    void setUp() {
        service = new CommentService(comments, entities, targets, results, documents);

        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);

        Target target = new Target();
        target.setId(targetId);
        target.setEntity(entity);
        target.setIndicatorRef("1.1.1");
        target.setIndicator("Number of programmes delivered");

        when(entities.findById(entityId)).thenReturn(Optional.of(entity));
        when(targets.findById(targetId)).thenReturn(Optional.of(target));
        // The database assigns the id. Without this the mock hands back rows with a null id,
        // every reply is filed against a null parent, and the threading assertions below pass
        // by agreeing that null equals null.
        when(comments.save(any(Comment.class))).thenAnswer(i -> {
            Comment saved = i.getArgument(0);
            if (saved.getId() == null) saved.setId(UUID.randomUUID());
            return saved;
        });

        anchor = service.anchor(Enums.AnchorType.TARGET, targetId).orElseThrow();
    }

    private VukaPrincipal reporter() {
        return new VukaPrincipal("uid-reporter", "t@entity.org.za", "T Ndlovu",
                "ENTITY_REPORTER", entityId.toString());
    }

    // ---------- anchoring ----------

    @Test
    @DisplayName("The entity comes off the anchor, so a comment cannot be filed against the wrong one")
    void entityIsReadOffTheAnchor() {
        assertEquals(entityId, anchor.entityId());
        assertEquals("1.1.1 Number of programmes delivered", anchor.label());

        Comment c = service.post(anchor, null, "This figure does not match the annexure.", REVIEWER);
        assertEquals(entityId, c.getEntity().getId());
        assertEquals(targetId, c.getAnchorId());
        assertEquals(Enums.AnchorType.TARGET, c.getAnchorType());
    }

    @Test
    @DisplayName("An anchor that does not exist is not an anchor")
    void unknownAnchorResolvesToNothing() {
        assertTrue(service.anchor(Enums.AnchorType.TARGET, UUID.randomUUID()).isEmpty());
        assertTrue(service.anchor(Enums.AnchorType.TARGET, null).isEmpty());
        assertTrue(service.anchor(null, targetId).isEmpty());
    }

    // ---------- writing ----------

    @Test
    @DisplayName("An empty comment is refused rather than stored")
    void emptyBodyRefused() {
        assertThrows(IllegalArgumentException.class, () -> service.post(anchor, null, "   ", REVIEWER));
        assertThrows(IllegalArgumentException.class, () -> service.post(anchor, null, null, REVIEWER));
        verify(comments, never()).save(any());
    }

    @Test
    @DisplayName("A comment longer than the column is refused before the database sees it")
    void oversizeBodyRefused() {
        String tooLong = "x".repeat(CommentService.MAX_BODY + 1);
        assertThrows(IllegalArgumentException.class, () -> service.post(anchor, null, tooLong, REVIEWER));
    }

    @Test
    @DisplayName("The author's uid, name and role at the time of writing are stamped on the row")
    void authorIsRecorded() {
        Comment c = service.post(anchor, null, "Which annexure is this from?", REVIEWER);
        assertEquals("uid-reviewer", c.getAuthorUid());
        assertEquals("L Mokoena", c.getAuthorName());
        assertEquals(Enums.Role.DSAC_REVIEWER, c.getAuthorRole());
        assertEquals(c.getCreatedAt(), c.getUpdatedAt());
        assertFalse(c.isResolved());
    }

    // ---------- threading ----------

    @Test
    @DisplayName("A reply to a reply lands on the same thread rather than growing a tree")
    void repliesAreOneLevelDeep() {
        Comment root = service.post(anchor, null, "This figure is disputed.", REVIEWER);
        when(comments.findById(root.getId())).thenReturn(Optional.of(root));

        Comment reply = service.post(anchor, root.getId(), "Corrected, see page 4.", reporter());
        assertEquals(root.getId(), reply.getParentId());
        when(comments.findById(reply.getId())).thenReturn(Optional.of(reply));

        Comment replyToReply = service.post(anchor, reply.getId(), "Thank you.", REVIEWER);
        assertEquals(root.getId(), replyToReply.getParentId(),
                "a reply to a reply belongs to the root, not to the reply");
    }

    @Test
    @DisplayName("A reply cannot be attached across two different threads")
    void repliesCannotCrossAnchors() {
        UUID otherTargetId = UUID.randomUUID();
        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);
        Target other = new Target();
        other.setId(otherTargetId);
        other.setEntity(entity);
        other.setIndicatorRef("2.2.2");
        other.setIndicator("Something else entirely");
        when(targets.findById(otherTargetId)).thenReturn(Optional.of(other));

        Comment elsewhere = service.post(
                service.anchor(Enums.AnchorType.TARGET, otherTargetId).orElseThrow(),
                null, "About a different indicator.", REVIEWER);
        when(comments.findById(elsewhere.getId())).thenReturn(Optional.of(elsewhere));

        assertThrows(IllegalArgumentException.class,
                () -> service.post(anchor, elsewhere.getId(), "Reply in the wrong place.", reporter()));
    }

    @Test
    @DisplayName("Replies nest under the comment they answer, in the order they were written")
    void threadIsAssembledForReading() {
        Comment root = service.post(anchor, null, "Disputed.", REVIEWER);
        when(comments.findById(root.getId())).thenReturn(Optional.of(root));
        Comment first = service.post(anchor, root.getId(), "First answer.", reporter());
        Comment second = service.post(anchor, root.getId(), "Second answer.", reporter());
        Comment separate = service.post(anchor, null, "A separate point.", REVIEWER);

        when(comments.findByEntityIdAndAnchorTypeAndAnchorIdOrderByCreatedAtAsc(
                entityId, Enums.AnchorType.TARGET, targetId))
                .thenReturn(List.of(root, first, second, separate));

        ThreadView view = service.thread(anchor);
        assertEquals(4, view.count());
        assertEquals(2, view.roots().size());
        assertEquals(2, view.roots().get(0).replies().size());
        assertEquals("First answer.", view.roots().get(0).replies().get(0).body());
        assertEquals("Second answer.", view.roots().get(0).replies().get(1).body());
        assertTrue(view.open(), "a thread with an unresolved root is open");
    }

    // ---------- resolving ----------

    @Test
    @DisplayName("An entity cannot close an objection DSAC raised against its own figures")
    void entityCannotCloseTheDepartmentsPoint() {
        Comment raisedByDsac = service.post(anchor, null, "This does not reconcile.", REVIEWER);
        when(comments.findById(raisedByDsac.getId())).thenReturn(Optional.of(raisedByDsac));

        assertTrue(service.setResolved(raisedByDsac.getId(), true, reporter()).isEmpty());
        assertFalse(raisedByDsac.isResolved());
    }

    @Test
    @DisplayName("The author closes their own point, and closing is attributed")
    void authorClosesTheirOwnPoint() {
        Comment raisedByDsac = service.post(anchor, null, "This does not reconcile.", REVIEWER);
        when(comments.findById(raisedByDsac.getId())).thenReturn(Optional.of(raisedByDsac));

        Comment closed = service.setResolved(raisedByDsac.getId(), true, REVIEWER).orElseThrow();
        assertTrue(closed.isResolved());
        assertEquals("L Mokoena", closed.getResolvedByName());
        assertEquals("uid-reviewer", closed.getResolvedByUid());
        assertNotNull(closed.getResolvedAt());
    }

    @Test
    @DisplayName("Reopening clears the attribution rather than leaving a stale name on an open point")
    void reopeningClearsTheAttribution() {
        Comment c = service.post(anchor, null, "Disputed.", REVIEWER);
        when(comments.findById(c.getId())).thenReturn(Optional.of(c));
        service.setResolved(c.getId(), true, REVIEWER);

        Comment reopened = service.setResolved(c.getId(), false, REVIEWER).orElseThrow();
        assertFalse(reopened.isResolved());
        assertNull(reopened.getResolvedByName());
        assertNull(reopened.getResolvedAt());
    }

    @Test
    @DisplayName("Closing a point moves the poll cursor, or nobody watching would learn it closed")
    void resolvingMovesTheCursor() throws Exception {
        Comment c = service.post(anchor, null, "Disputed.", REVIEWER);
        when(comments.findById(c.getId())).thenReturn(Optional.of(c));
        Instant written = c.getUpdatedAt();

        Thread.sleep(2);
        Comment closed = service.setResolved(c.getId(), true, REVIEWER).orElseThrow();

        assertTrue(closed.getUpdatedAt().isAfter(written));
        assertEquals(written, closed.getCreatedAt(), "the creation time is not rewritten");
    }

    @Test
    @DisplayName("Resolving something already in that state is not a write")
    void resolvingIsIdempotent() {
        Comment c = service.post(anchor, null, "Disputed.", REVIEWER);
        when(comments.findById(c.getId())).thenReturn(Optional.of(c));
        Instant before = c.getUpdatedAt();

        service.setResolved(c.getId(), false, REVIEWER);
        assertEquals(before, c.getUpdatedAt());
    }

    // ---------- the poll ----------

    @Test
    @DisplayName("The validator moves when a comment arrives and when one is closed, and not otherwise")
    void digestTracksTheThread() {
        Instant t1 = Instant.parse("2026-09-18T08:00:00Z");
        Instant t2 = Instant.parse("2026-09-18T08:00:05Z");

        String quiet = new Digest(2, t1).etag();
        assertEquals(quiet, new Digest(2, t1).etag(), "an unchanged thread must produce the same validator");
        assertNotEquals(quiet, new Digest(3, t1).etag(), "a new comment must move it");
        assertNotEquals(quiet, new Digest(2, t2).etag(), "closing a point must move it");
        assertEquals("W/\"c0-0\"", new Digest(0, null).etag(), "an empty thread still has a validator");
    }

    @Test
    @DisplayName("The workspace lists open threads first, then by what moved most recently")
    void workspaceOrdersByWhatNeedsAnswering() {
        Comment old = comment(Instant.parse("2026-09-01T08:00:00Z"), true, targetId);
        UUID otherTargetId = UUID.randomUUID();
        Comment recent = comment(Instant.parse("2026-09-17T08:00:00Z"), false, otherTargetId);

        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);
        Target other = new Target();
        other.setId(otherTargetId);
        other.setEntity(entity);
        other.setIndicatorRef("2.2.2");
        other.setIndicator("Second indicator");
        when(targets.findById(otherTargetId)).thenReturn(Optional.of(other));

        when(comments.findByEntityIdOrderByCreatedAtAsc(entityId))
                .thenReturn(new ArrayList<>(List.of(old, recent)));

        List<ThreadView> views = service.workspace(entityId);
        assertEquals(2, views.size());
        assertTrue(views.get(0).open(), "the open thread comes first");
        assertEquals(otherTargetId, views.get(0).anchorId());
    }

    @Test
    @DisplayName("A comment on something no longer in the register is labelled, never dropped")
    void orphanedAnchorsStillAppear() {
        Comment orphan = comment(Instant.parse("2026-09-01T08:00:00Z"), false, UUID.randomUUID());
        when(comments.findByEntityIdOrderByCreatedAtAsc(entityId)).thenReturn(List.of(orphan));

        List<ThreadView> views = service.workspace(entityId);
        assertEquals(1, views.size());
        assertEquals("No longer in the register", views.get(0).label());
    }

    // ---------- what counts as a dispute ----------

    @Test
    @DisplayName("A reporter's reply is not a dispute, and a closed dispute is no longer one")
    void onlyAnOpenDepartmentObjectionIsADispute() {
        Comment objection = comment(Instant.parse("2026-09-01T08:00:00Z"), false, targetId);
        assertTrue(ReportingViewService.isOpenDispute(objection));

        Comment reply = comment(Instant.parse("2026-09-01T09:00:00Z"), false, targetId);
        reply.setParentId(objection.getId());
        reply.setAuthorRole(Enums.Role.ENTITY_REPORTER);
        assertFalse(ReportingViewService.isOpenDispute(reply),
                "otherwise 'corrected' is shown to the entity as the Department disputing the figure");

        Comment reporterOpened = comment(Instant.parse("2026-09-01T10:00:00Z"), false, targetId);
        reporterOpened.setAuthorRole(Enums.Role.ENTITY_REPORTER);
        assertFalse(ReportingViewService.isOpenDispute(reporterOpened));

        Comment closed = comment(Instant.parse("2026-09-01T11:00:00Z"), true, targetId);
        assertFalse(ReportingViewService.isOpenDispute(closed));

        Comment onADocument = comment(Instant.parse("2026-09-01T12:00:00Z"), false, targetId);
        onADocument.setAnchorType(Enums.AnchorType.DOCUMENT);
        assertFalse(ReportingViewService.isOpenDispute(onADocument));
    }

    private Comment comment(Instant at, boolean resolved, UUID anchorId) {
        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);
        Comment c = new Comment();
        c.setId(UUID.randomUUID());
        c.setEntity(entity);
        c.setAnchorType(Enums.AnchorType.TARGET);
        c.setAnchorId(anchorId);
        c.setAuthorName("L Mokoena");
        c.setAuthorRole(Enums.Role.DSAC_REVIEWER);
        c.setBody("Something.");
        c.setResolved(resolved);
        c.setCreatedAt(at);
        c.setUpdatedAt(at);
        return c;
    }
}
