package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {

    Optional<RiskScore> findByEntityIdAndReportingPeriodId(UUID entityId, UUID reportingPeriodId);
    List<RiskScore> findByReportingPeriodIdOrderByScoreDesc(UUID reportingPeriodId);

    /**
     * Every score for a period, with its signals already loaded.
     *
     * <h2>Why a fetch join rather than a lazy read</h2>
     *
     * {@code RiskScore.signals} is lazy and {@code open-in-view} is false, which is the right
     * setting: a view that can still trigger database work is a view that can issue queries
     * nobody wrote. The consequence is that a controller reading {@code getSignals()} outside a
     * transaction gets a {@code LazyInitializationException}, and the portfolio endpoint did.
     *
     * <p>Wrapping the read in a transaction would fix the exception and leave a second problem:
     * twenty eight entities would mean one query for the scores and twenty eight more for their
     * signals. This loads both in one.
     *
     * <p>{@code distinct} is required because the join multiplies each score by its signal count,
     * and without it the same score comes back five times.
     */
    @Query("""
           select distinct rs from RiskScore rs
             left join fetch rs.signals
            where rs.reportingPeriod.id = :periodId
           """)
    List<RiskScore> findByPeriodWithSignals(@Param("periodId") UUID periodId);

    /**
     * One entity's score for a period, with its signals already loaded.
     *
     * <p>Used wherever a single score is rendered with its explanation, which is every surface
     * that shows a score at all. The score is never displayed alone, so the signals are never
     * optional and there is no reason to defer loading them.
     */
    @Query("""
           select distinct rs from RiskScore rs
             left join fetch rs.signals
            where rs.entity.id = :entityId
              and rs.reportingPeriod.id = :periodId
           """)
    Optional<RiskScore> findByEntityAndPeriodWithSignals(@Param("entityId") UUID entityId,
                                                         @Param("periodId") UUID periodId);
}
