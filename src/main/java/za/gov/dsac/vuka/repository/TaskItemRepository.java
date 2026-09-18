package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TaskItemRepository extends JpaRepository<TaskItem, UUID> {

    List<TaskItem> findByEntityId(UUID entityId);
    List<TaskItem> findByAssignedToUid(String assignedToUid);

    /** The workspace task list, newest first. */
    List<TaskItem> findByEntityIdOrderByCreatedAtDesc(UUID entityId);

    /** Open work for one person, across entities, which is what a DSAC officer's day looks like. */
    List<TaskItem> findByAssignedToUidAndStatusOrderByDueDateAsc(String assignedToUid, Enums.TaskStatus status);
}
