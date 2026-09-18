package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.EntityWorkspace;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EntityWorkspaceRepository extends JpaRepository<EntityWorkspace, UUID> {

    Optional<EntityWorkspace> findByEntityId(UUID entityId);

    /** The workspaces the Microsoft poller has anything to do. */
    List<EntityWorkspace> findByDriveIdIsNotNull();
}
