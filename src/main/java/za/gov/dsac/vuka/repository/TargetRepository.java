package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TargetRepository extends JpaRepository<Target, UUID> {

    List<Target> findByEntityIdAndFinancialYearId(UUID entityId, UUID financialYearId);
    Optional<Target> findByEntityIdAndFinancialYearIdAndIndicatorRef(UUID entityId, UUID financialYearId, String indicatorRef);
    long countByEntityIdAndFinancialYearId(UUID entityId, UUID financialYearId);
}
