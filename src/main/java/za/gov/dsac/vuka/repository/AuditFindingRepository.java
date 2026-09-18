package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    /**
     * An entity's findings, with the audited financial year already loaded.
     *
     * <p>{@code AuditFinding.financialYear} is lazy and {@code open-in-view} is false, so reading
     * {@code getFinancialYear().getLabel()} to render a finding threw
     * {@code LazyInitializationException} and the entity drilldown answered an error on every
     * call. Fetching the year with the finding fixes that and also avoids one query per finding,
     * which for an entity with a cycle of qualified audits is the difference between one query
     * and half a dozen.
     */
    @Query("""
           select f from AuditFinding f
             left join fetch f.financialYear
            where f.entity.id = :entityId
           """)
    List<AuditFinding> findByEntityIdWithYear(@Param("entityId") UUID entityId);
    List<AuditFinding> findByEntityIdAndFinancialYearId(UUID entityId, UUID financialYearId);
}
