package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.AuditOutcomeRecord;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditOutcomeRecordRepository extends JpaRepository<AuditOutcomeRecord, UUID> {

    List<AuditOutcomeRecord> findByEntityId(UUID entityId);

    Optional<AuditOutcomeRecord> findByEntityIdAndFinancialYearId(UUID entityId, UUID financialYearId);

    /** Most recent audited year first, so "the latest outcome" is the first element. */
    List<AuditOutcomeRecord> findByEntityIdOrderByFinancialYearStartDateDesc(UUID entityId);
}
