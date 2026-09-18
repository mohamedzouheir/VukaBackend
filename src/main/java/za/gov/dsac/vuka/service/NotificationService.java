package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import za.gov.dsac.vuka.service.microsoft.TeamsNotifier;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Deadline countdowns at 30 days, 15 days, and hourly inside the final day.
 *
 * <h2>Why the message names specific targets</h2>
 *
 * A reminder that says "your report is due" is nagging. A reminder that says "these four
 * targets have no evidence attached" is a tool. The extra query costs nothing and is the
 * difference between a notification people act on and one they filter to a folder.
 *
 * <h2>Where it lands</h2>
 *
 * Into the entity's Microsoft Teams channel where one has been bound, and into the log either
 * way. A countdown that arrives in the channel the finance officer already has open is worth
 * several that arrive in an inbox beside everything else, and it is the point at which the
 * early warning requirement and the workspace requirement stop being two separate features.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final ReportingPeriodRepository periods;
    private final PublicEntityRepository entities;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final SubmissionRepository submissions;
    private final EntityWorkspaceRepository workspaces;
    private final TeamsNotifier teams;

    public NotificationService(ReportingPeriodRepository periods, PublicEntityRepository entities,
                               TargetRepository targets, TargetResultRepository results,
                               SubmissionRepository submissions, EntityWorkspaceRepository workspaces,
                               TeamsNotifier teams) {
        this.periods = periods;
        this.entities = entities;
        this.targets = targets;
        this.results = results;
        this.submissions = submissions;
        this.workspaces = workspaces;
        this.teams = teams;
    }

    /** Runs hourly. The hourly cadence is what makes the final-day countdown possible. */
    @Scheduled(cron = "0 0 * * * *", zone = "Africa/Johannesburg")
    public void fireCountdowns() {
        LocalDate today = LocalDate.now();
        List<ReportingPeriod> upcoming =
                periods.findByRegulatoryDeadlineBetween(today, today.plusDays(31));

        for (ReportingPeriod period : upcoming) {
            long daysOut = ChronoUnit.DAYS.between(today, period.getRegulatoryDeadline());
            Enums.NotificationOffset offset = offsetFor(daysOut);
            if (offset == null) continue;

            for (PublicEntity entity : entities.findAll()) {
                if (hasSubmitted(entity.getId(), period.getId())) continue;
                notifyEntity(entity, period, offset, daysOut);
            }
        }
    }

    /** 30 and 15 days exactly, then every hour on the final day. Nothing in between. */
    private Enums.NotificationOffset offsetFor(long daysOut) {
        if (daysOut == 30) return Enums.NotificationOffset.THIRTY_DAYS;
        if (daysOut == 15) return Enums.NotificationOffset.FIFTEEN_DAYS;
        if (daysOut <= 1 && daysOut >= 0) return Enums.NotificationOffset.HOURLY;
        return null;
    }

    private boolean hasSubmitted(UUID entityId, UUID periodId) {
        return submissions.findByEntityIdAndReportingPeriodId(entityId, periodId)
                .map(s -> s.getStatus() == Enums.SubmissionStatus.SUBMITTED
                       || s.getStatus() == Enums.SubmissionStatus.UNDER_REVIEW
                       || s.getStatus() == Enums.SubmissionStatus.APPROVED)
                .orElse(false);
    }

    /**
     * Builds and sends the message.
     *
     * <p>Delivered to the entity's Teams channel where one is bound, and logged in every case.
     * Email is still not wired: a mail provider is a configuration decision for whoever deploys
     * this, and the useful part, working out what is actually outstanding, is done either way.
     */
    private void notifyEntity(PublicEntity entity, ReportingPeriod period,
                              Enums.NotificationOffset offset, long daysOut) {

        UUID fyId = period.getFinancialYear().getId();
        List<Target> entityTargets = targets.findByEntityIdAndFinancialYearId(entity.getId(), fyId);

        List<String> outstanding = entityTargets.stream()
                .filter(t -> results.findByTargetId(t.getId()).isEmpty())
                .map(Target::getIndicatorRef)
                .toList();

        String body = outstanding.isEmpty()
                ? String.format("%s: %s is due in %d day(s). All targets have evidence attached.",
                    entity.getShortName(), period.getLabel(), daysOut)
                : String.format("%s: %s is due in %d day(s). %d target(s) still have no evidence attached: %s",
                    entity.getShortName(), period.getLabel(), daysOut,
                    outstanding.size(), String.join(", ", outstanding));

        log.info("[{}] -> {} : {}", offset, entity.getContactEmail(), body);

        workspaces.findByEntityId(entity.getId())
                .map(EntityWorkspace::getTeamsWebhookUrl)
                .ifPresent(webhook -> {
                    Map<String, String> facts = new LinkedHashMap<>();
                    facts.put("Reporting period", period.getLabel());
                    facts.put("Due", String.valueOf(period.getRegulatoryDeadline()));
                    facts.put("Basis", period.getDeadlineBasis() == null
                            ? "Departmental instruction"
                            : period.getDeadlineBasis().name());
                    facts.put("Targets without evidence", outstanding.isEmpty()
                            ? "None"
                            : outstanding.size() + ": " + String.join(", ", outstanding));
                    teams.post(webhook,
                            entity.getShortName() + ": " + period.getLabel()
                                    + " is due in " + daysOut + " day(s)",
                            body, facts);
                });
    }
}
