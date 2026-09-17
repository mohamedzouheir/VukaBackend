package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Feedback anchored to a specific target, result or document rather than buried in an email thread.
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

    /** When written. */
    @Column(nullable = false)
    private Instant createdAt;

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

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
