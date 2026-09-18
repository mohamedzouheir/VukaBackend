package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.repository.PublicEntityRepository;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * When risk scores are computed.
 *
 * <p>Scores were only ever computed when a reviewer pressed Recompute, so a fresh start showed the
 * review queue "sorted by risk" with every entity unscored, and the executive, who has no such
 * button, saw twenty eight tiles reading "not scored". The endpoint's own comment said it also ran
 * nightly, and nothing did. Now it runs once the seed has loaded, every night, and from the button,
 * all through this one method.
 *
 * <p>With no period named it scores two: the quarter that has fallen due, which the Department's
 * screens open on, and the quarter that is open, which the reporter's screens open on. For most
 * of a quarter those are different periods, and scoring only one left the other reading "not
 * scored".
 */
@Component
public class RiskSchedule {

    private static final Logger log = LoggerFactory.getLogger(RiskSchedule.class);

    private final RiskService riskService;
    private final PublicEntityRepository entities;
    private final ReportingViewService views;

    public RiskSchedule(RiskService riskService, PublicEntityRepository entities,
                        ReportingViewService views) {
        this.riskService = riskService;
        this.entities = entities;
        this.views = views;
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

    /** Scores every entity for one period, or for the review and open periods where none is named. */
    public Map<String, Object> recompute(UUID periodId) {
        Set<UUID> targets = new LinkedHashSet<>();
        if (periodId != null) {
            targets.add(periodId);
        } else {
            UUID review = views.reviewPeriodId();
            UUID open = views.currentPeriodId();
            if (review != null) targets.add(review);
            if (open != null) targets.add(open);
        }
        if (targets.isEmpty()) return Map.of("computed", 0, "reason", "no current reporting period");

        int n = 0;
        for (UUID period : targets) {
            for (PublicEntity e : entities.findAll()) {
                riskService.computeAndStore(e.getId(), period);
                n++;
            }
        }
        return Map.of("computed", n, "periodIds", targets, "at", Instant.now().toString());
    }
}
