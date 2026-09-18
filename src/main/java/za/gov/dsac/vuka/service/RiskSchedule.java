package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import za.gov.dsac.vuka.domain.FinancialYear;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.ReportingPeriod;
import za.gov.dsac.vuka.repository.FinancialYearRepository;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.repository.ReportingPeriodRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * When risk scores are computed.
 *
 * <p>Scores were only ever computed when a reviewer pressed Recompute, so a fresh start showed the
 * review queue "sorted by risk" with every entity unscored, and the executive, who has no such
 * button, saw twenty eight tiles reading "not scored". The endpoint's own comment said it also ran
 * nightly, and nothing did. Now it runs once the seed has loaded, every night, and from the button,
 * all through this one method.
 */
@Component
public class RiskSchedule {

    private static final Logger log = LoggerFactory.getLogger(RiskSchedule.class);

    private final RiskService riskService;
    private final PublicEntityRepository entities;
    private final FinancialYearRepository years;
    private final ReportingPeriodRepository periods;

    public RiskSchedule(RiskService riskService, PublicEntityRepository entities,
                        FinancialYearRepository years, ReportingPeriodRepository periods) {
        this.riskService = riskService;
        this.entities = entities;
        this.years = years;
        this.periods = periods;
    }

    /** After every ApplicationRunner, the seed included, has finished. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStart() {
        log.info("Risk scores computed at start: {}", recompute(null));
    }

    @Scheduled(cron = "0 30 2 * * *", zone = "Africa/Johannesburg")
    public void nightly() {
        log.info("Risk scores computed nightly: {}", recompute(null));
    }

    /** Scores every entity for one period, or for the current one where none is named. */
    public Map<String, Object> recompute(UUID periodId) {
        UUID period = periodId != null ? periodId : currentPeriodId();
        if (period == null) return Map.of("computed", 0, "reason", "no current reporting period");

        int n = 0;
        for (PublicEntity e : entities.findAll()) {
            riskService.computeAndStore(e.getId(), period);
            n++;
        }
        return Map.of("computed", n, "periodId", period, "at", Instant.now().toString());
    }

    /** The most recent period whose window has opened. */
    private UUID currentPeriodId() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return null;
        return periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId()).stream()
                .filter(p -> p.getPeriodStart() != null && !p.getPeriodStart().isAfter(LocalDate.now()))
                .reduce((a, b) -> b)
                .map(ReportingPeriod::getId)
                .orElse(null);
    }
}
