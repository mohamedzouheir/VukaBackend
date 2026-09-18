package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserProfileRepository extends JpaRepository<UserProfile, UUID> {

    Optional<UserProfile> findByUid(String uid);
    Optional<UserProfile> findByEmail(String email);

    /** The people who report for an entity, who receive its deadline reminders. */
    List<UserProfile> findByEntityIdAndRole(UUID entityId, Enums.Role role);
}
