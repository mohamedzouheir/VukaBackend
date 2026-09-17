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

    /** What needs doing. */
    @Column(length = 2000)
    private String description;

    /** When it is due. */
    private LocalDate dueDate;

    /** State. */
    @Enumerated(EnumType.STRING)
    private Enums.TaskStatus status;

    /** True when assigned outside DSAC, which the brief asks for explicitly. */
    @Column(name = "is_external", nullable = false)
    private boolean external;

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
}
