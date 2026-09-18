package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Work assigned to someone, inside DSAC or out at an entity.
 *
 * <p>The challenge asks for tasks set "internally and externally (up or down in the operations
 * process)". {@link #external} is the only field that distinguishes the two, and it is set from
 * the roles involved rather than from a checkbox the caller controls: a DSAC officer assigning
 * work to an entity, or an entity raising something with DSAC, is external by construction.
 */
@Entity
@Table(name = "task_item")
public class TaskItem {

    @Id
    @GeneratedValue
    private UUID id;

    /** Entity concerned. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    /** Related submission, where relevant. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id")
    private Submission submission;

    /** Who must do it. */
    @Column(length = 128)
    private String assignedToUid;

    /** Their display name. */
    @Column(length = 200)
    private String assignedToName;

    /** Who assigned it. */
    @Column(length = 128)
    private String assignedByUid;

    /** One line, shown in lists. */
    @Column(name = "title", length = 300)
    private String title;

    /** What needs doing. */
    @Column(length = 2000)
    private String description;

    /** When it is due. */
    private LocalDate dueDate;

    /** State. */
    @Enumerated(EnumType.STRING)
    private Enums.TaskStatus status;

    /** True when the task crosses the departmental boundary in either direction. */
    @Column(name = "is_external", nullable = false)
    private boolean external;

    /** Display name of whoever set it, so a list reads without a second lookup per row. */
    @Column(name = "created_by_name", length = 200)
    private String createdByName;

    /** The document version the task is about, where it is about one. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id")
    private DocumentRecord document;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public Submission getSubmission() { return submission; }
    public void setSubmission(Submission submission) { this.submission = submission; }

    public String getAssignedToUid() { return assignedToUid; }
    public void setAssignedToUid(String assignedToUid) { this.assignedToUid = assignedToUid; }

    public String getAssignedToName() { return assignedToName; }
    public void setAssignedToName(String assignedToName) { this.assignedToName = assignedToName; }

    public String getAssignedByUid() { return assignedByUid; }
    public void setAssignedByUid(String assignedByUid) { this.assignedByUid = assignedByUid; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public Enums.TaskStatus getStatus() { return status; }
    public void setStatus(Enums.TaskStatus status) { this.status = status; }

    public boolean isExternal() { return external; }
    public void setExternal(boolean external) { this.external = external; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getCreatedByName() { return createdByName; }
    public void setCreatedByName(String createdByName) { this.createdByName = createdByName; }

    public DocumentRecord getDocument() { return document; }
    public void setDocument(DocumentRecord document) { this.document = document; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
