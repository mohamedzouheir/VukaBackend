package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
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

    /**
     * Everything assigned to the caller, open work first by due date, then closed work newest
     * first. The screens filter by status; returning only OPEN hid work marked in progress and
     * left the Done filter permanently empty.
     */
    public List<TaskItem> myTasks(VukaPrincipal who) {
        return tasks.findByAssignedToUid(who.uid()).stream()
                .sorted(Comparator
                        .comparing((TaskItem t) -> t.getStatus() == Enums.TaskStatus.DONE)
                        .thenComparing(TaskItem::getDueDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /**
     * Records who has signed in, so they can be assigned work. Role and entity come from the signed
     * token and are refreshed on every sign in; a display name already held is kept when the token
     * carries none, because Firebase tokens often do not.
     */
    @Transactional
    public void recordSignIn(VukaPrincipal who) {
        if (who == null || who.uid() == null || who.role() == null) return;
        Enums.Role role;
        try {
            role = Enums.Role.valueOf(who.role());
        } catch (IllegalArgumentException e) {
            return;
        }
        UserProfile u = users.findByUid(who.uid()).orElseGet(UserProfile::new);
        u.setUid(who.uid());
        if (who.email() != null) u.setEmail(who.email());
        if (who.name() != null && !who.name().isBlank()) u.setDisplayName(who.name());
        else if (u.getDisplayName() == null) u.setDisplayName(who.email());
        u.setRole(role);
        UUID entityId = null;
        try {
            entityId = who.entityId() == null ? null : UUID.fromString(who.entityId());
        } catch (IllegalArgumentException ignored) {
            // A malformed claim is reported by /api/me already; it just binds nothing here.
        }
        u.setEntity(role == Enums.Role.ENTITY_REPORTER && entityId != null
                ? entities.findById(entityId).orElse(null) : null);
        users.save(u);
    }

    /** Someone a task on this entity can be assigned to. */
    public record Person(String uid, String name, String role, boolean dsac) {}

    /**
     * Who a task on this entity can go to: everyone at the Department, and the reporters of this
     * entity. Nobody at another entity, because a task is visible to its assignee and an entity's
     * work is not another entity's business.
     */
    public List<Person> assignableFor(UUID entityId) {
        return users.findAll().stream()
                .filter(u -> u.getRole() != null)
                .filter(u -> u.getRole() != Enums.Role.ENTITY_REPORTER
                        || (u.getEntity() != null && entityId.equals(u.getEntity().getId())))
                .map(u -> new Person(u.getUid(),
                        u.getDisplayName() == null || u.getDisplayName().isBlank() ? u.getUid() : u.getDisplayName(),
                        u.getRole().name(), u.getRole() != Enums.Role.ENTITY_REPORTER))
                .sorted(Comparator.comparing(Person::dsac).thenComparing(Person::name))
                .toList();
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
