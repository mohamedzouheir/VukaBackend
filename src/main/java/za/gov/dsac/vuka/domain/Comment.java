package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Feedback anchored to a specific target, result or document rather than buried in an email thread.
 *
 * <h2>Nothing here is edited and nothing is deleted</h2>
 *
 * <p>The only column that changes after insert is {@link #resolved}, with {@link #updatedAt} and
 * the three resolver columns recording who closed the point and when. There is no endpoint that
 * rewrites a body and none that removes a row, for the same reason there is no endpoint that
 * edits a confirmed figure: a reviewer's objection that can be quietly withdrawn is not a record
 * of anything.
 *
 * <p>That is also what makes the poll behind "visible on screen in real time" cheap. Because rows
 * only ever arrive, the pair (row count, latest {@code updatedAt}) changes if and only if the
 * thread changed, so a client asking every five seconds is answered from an aggregate and told
 * "nothing new" without a single row being read.
 */
@Entity
@Table(name = "comment")
public class Comment {

    @Id
    @GeneratedValue
    private UUID id;

    /** Entity the thread concerns. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** What the comment is attached to. */
    @Enumerated(EnumType.STRING)
    private Enums.AnchorType anchorType;

    /** Id of the thing it is attached to. */
    private UUID anchorId;

    /** Parent comment, for replies. */
    private UUID parentId;

    /** Author uid. */
    @Column(length = 128)
    private String authorUid;

    /** Author display name. */
    @Column(length = 200)
    private String authorName;

    /** Author's role at time of writing. */
    @Enumerated(EnumType.STRING)
    private Enums.Role authorRole;

    /** The comment. */
    @Column(length = 4000)
    private String body;

    /** Whether the point is closed. */
    @Column(name = "is_resolved", nullable = false)
    private boolean resolved;

    /** Who closed the point. Null while it is open. */
    @Column(length = 128)
    private String resolvedByUid;

    /** Their display name, so the workspace can name them without a second lookup. */
    @Column(length = 200)
    private String resolvedByName;

    /** When it was closed. */
    private Instant resolvedAt;

    /** When written. */
    @Column(nullable = false)
    private Instant createdAt;

    /** Creation time, then the time {@link #resolved} last flipped. The poll cursor. */
    @Column(nullable = false)
    private Instant updatedAt;

    /**
     * The poll cursor is never null, whoever writes the row.
     *
     * <p>{@code CommentService} sets both times itself. This is here for any other writer, because
     * a row that arrives without {@code updatedAt} either fails the not-null constraint or, worse,
     * would be invisible to the digest every client polls, and the comment would never appear
     * without a reload.
     */
    @PrePersist
    void stampCursor() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = createdAt;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public Enums.AnchorType getAnchorType() { return anchorType; }
    public void setAnchorType(Enums.AnchorType anchorType) { this.anchorType = anchorType; }

    public UUID getAnchorId() { return anchorId; }
    public void setAnchorId(UUID anchorId) { this.anchorId = anchorId; }

    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }

    public String getAuthorUid() { return authorUid; }
    public void setAuthorUid(String authorUid) { this.authorUid = authorUid; }

    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }

    public Enums.Role getAuthorRole() { return authorRole; }
    public void setAuthorRole(Enums.Role authorRole) { this.authorRole = authorRole; }

    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }

    public boolean isResolved() { return resolved; }
    public void setResolved(boolean resolved) { this.resolved = resolved; }

    public String getResolvedByUid() { return resolvedByUid; }
    public void setResolvedByUid(String resolvedByUid) { this.resolvedByUid = resolvedByUid; }

    public String getResolvedByName() { return resolvedByName; }
    public void setResolvedByName(String resolvedByName) { this.resolvedByName = resolvedByName; }

    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
