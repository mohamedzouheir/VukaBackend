package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditFindingRepository extends JpaRepository<AuditFinding, UUID> {

    /** With the year loaded: the drilldown labels each finding after the session has closed. */
    @EntityGraph(attributePaths = {"financialYear"})
    List<AuditFinding> findByEntityId(UUID entityId);
    List<AuditFinding> findByEntityIdAndFinancialYearId(UUID entityId, UUID financialYearId);
}
