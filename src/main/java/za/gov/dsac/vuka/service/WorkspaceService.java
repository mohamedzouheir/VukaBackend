package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The work list that sits around an entity's documents.
 *
 * <p>Requirement (d) asks for tasks set "internally and externally (up or down in the operations
 * process)". The comments half of that requirement lives in {@link CommentService}, which anchors
 * every comment to the target, result or document version it is about; this class deliberately
 * does not offer a second way to write one.
 *
 * <p><b>Internal or external is derived, not declared.</b> Whether a task crosses the
 * departmental boundary is decided by who set it and who has to do it, read from the user
 * directory, rather than from a field the caller fills in. A flag the client chooses is a flag
 * that is wrong within a week, and this one is reported on.
 */
@Service
public class WorkspaceService {

    private final TaskItemRepository tasks;
    private final DocumentRecordRepository documents;
    private final PublicEntityRepository entities;
    private final UserProfileRepository users;
    private final SubmissionRepository submissions;

    public WorkspaceService(TaskItemRepository tasks, DocumentRecordRepository documents,
                            PublicEntityRepository entities, UserProfileRepository users,
                            SubmissionRepository submissions) {
        this.tasks = tasks;
        this.documents = documents;
        this.entities = entities;
        this.users = users;
        this.submissions = submissions;
    }

    // ------------------------------------------------------------------
    // Tasks
    // ------------------------------------------------------------------

    /**
     * Sets a task on someone.
     *
     * @param assignedToUid  Firebase uid of whoever must do it
     * @param assignedToName their display name, denormalised so a list renders without a lookup per row
     */
    @Transactional
    public TaskItem createTask(UUID entityId, String title, String description,
                               String assignedToUid, String assignedToName, LocalDate dueDate,
                               UUID documentId, UUID submissionId, VukaPrincipal who) {

        TaskItem task = new TaskItem();
        task.setEntity(entities.findById(entityId).orElseThrow());
        task.setSubmission(submissionId == null ? null : submissions.findById(submissionId).orElse(null));
        task.setDocument(documentId == null ? null : documents.findById(documentId).orElse(null));
        task.setTitle(title);
        task.setDescription(description);
        task.setAssignedToUid(assignedToUid);
        task.setAssignedToName(resolveName(assignedToUid, assignedToName));
        task.setAssignedByUid(who.uid());
        task.setCreatedByName(who.name());
        task.setDueDate(dueDate);
        task.setStatus(Enums.TaskStatus.OPEN);
        task.setExternal(crossesTheBoundary(who, assignedToUid));
        task.setCreatedAt(Instant.now());
        return tasks.save(task);
    }

    /** Moves a task along. Only the assignee, the person who set it, or DSAC may. */
    @Transactional
    public TaskItem updateTaskStatus(UUID taskId, Enums.TaskStatus status, VukaPrincipal who) {
        TaskItem task = tasks.findById(taskId).orElseThrow();
        boolean mayTouch = who.isDsac()
                || who.uid().equals(task.getAssignedToUid())
                || who.uid().equals(task.getAssignedByUid());
        if (!mayTouch) throw new IllegalStateException("That task belongs to someone else.");
        task.setStatus(status);
        task.setCompletedAt(status == Enums.TaskStatus.DONE ? Instant.now() : null);
        return tasks.save(task);
    }

    public List<TaskItem> tasksFor(UUID entityId) {
        return tasks.findByEntityIdOrderByCreatedAtDesc(entityId);
    }

    public List<TaskItem> myOpenTasks(VukaPrincipal who) {
        return tasks.findByAssignedToUidAndStatusOrderByDueDateAsc(who.uid(), Enums.TaskStatus.OPEN);
    }

    // ------------------------------------------------------------------

    private String resolveName(String uid, String fallback) {
        return users.findByUid(uid)
                .map(UserProfile::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElse(fallback);
    }

    /**
     * Whether the task crosses the departmental boundary, which is what "externally" means in
     * the challenge text.
     *
     * <p>Read from the directory rather than taken from the request. Where the assignee is not in
     * the directory, the safer reading is that they are outside it: a DSAC officer assigning work
     * to a uid the department does not know is not an internal task.
     */
    private boolean crossesTheBoundary(VukaPrincipal who, String assignedToUid) {
        Optional<UserProfile> assignee = users.findByUid(assignedToUid);
        boolean assigneeIsDsac = assignee
                .map(UserProfile::getRole)
                .map(role -> role == Enums.Role.DSAC_REVIEWER
                          || role == Enums.Role.DSAC_EXECUTIVE
                          || role == Enums.Role.ADMIN)
                .orElse(false);
        return who.isDsac() != assigneeIsDsac;
    }
}
