package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import za.gov.dsac.vuka.service.microsoft.TeamsNotifier;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Deadline countdowns at 30 days, 15 days, the day before and the day itself.
 *
 * <h2>Why the message names specific targets</h2>
 *
 * A reminder that says "your report is due" is nagging. A reminder that says "these four
 * targets have no evidence attached" is a tool. The extra query costs nothing and is the
 * difference between a notification people act on and one they filter to a folder.
 *
 * <h2>Where it lands</h2>
 *
 * By email to the entity's contact address and its registered reporters, because every entity
 * has a mailbox and many departments restrict Teams workflows. Email goes once, at 08:00, on
 * each of those four days: a reminder every hour in an inbox is how a sender gets filtered.
 *
 * <p>Where an administrator has also bound a Teams channel workflow, the same countdown is
 * posted there, hourly on the last two days, since a channel post is cheaper to ignore than an
 * email. Teams is optional; email is the channel that is expected to work everywhere. Every
 * reminder is logged either way.
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
    private final UserProfileRepository users;
    private final EmailNotifier email;
    private final TeamsNotifier teams;

    /** The deadlines are South African dates, whatever zone the server runs in. */
    private static final ZoneId SAST = ZoneId.of("Africa/Johannesburg");

    /** The one run a day that sends email and the 30 and 15 day posts. */
    static final int MORNING_HOUR = 8;

    public NotificationService(ReportingPeriodRepository periods, PublicEntityRepository entities,
                               TargetRepository targets, TargetResultRepository results,
                               SubmissionRepository submissions, EntityWorkspaceRepository workspaces,
                               UserProfileRepository users, EmailNotifier email,
                               TeamsNotifier teams) {
        this.periods = periods;
        this.entities = entities;
        this.targets = targets;
        this.results = results;
        this.submissions = submissions;
        this.workspaces = workspaces;
        this.users = users;
        this.email = email;
        this.teams = teams;
    }

    /**
     * Runs hourly, which is what the final-day Teams countdown needs. Everything else is gated
     * to the morning run, so a 30 day reminder goes once rather than on every run that day.
     */
    @Scheduled(cron = "0 0 * * * *", zone = "Africa/Johannesburg")
    public void fireCountdowns() {
        ZonedDateTime now = ZonedDateTime.now(SAST);
        LocalDate today = now.toLocalDate();
        List<ReportingPeriod> upcoming =
                periods.findByRegulatoryDeadlineBetween(today, today.plusDays(31));

        for (ReportingPeriod period : upcoming) {
            long daysOut = ChronoUnit.DAYS.between(today, period.getRegulatoryDeadline());
            Enums.NotificationOffset offset = offsetFor(daysOut);
            boolean sendEmail = emailDue(offset, now.getHour());
            boolean postTeams = teamsDue(offset, now.getHour());
            if (!sendEmail && !postTeams) continue;

            for (PublicEntity entity : entities.findAll()) {
                if (hasSubmitted(entity.getId(), period.getId())) continue;
                notifyEntity(entity, period, offset, daysOut, sendEmail, postTeams);
            }
        }
    }

    /** Email goes once a day, on the morning run, whatever the offset. */
    static boolean emailDue(Enums.NotificationOffset offset, int hour) {
        return offset != null && hour == MORNING_HOUR;
    }

    /** Teams gets the morning run too, and every hour on the last two days. */
    static boolean teamsDue(Enums.NotificationOffset offset, int hour) {
        if (offset == null) return false;
        return offset == Enums.NotificationOffset.HOURLY || hour == MORNING_HOUR;
    }

    /** 30 and 15 days exactly, then the day before and the day itself. Nothing in between. */
    static Enums.NotificationOffset offsetFor(long daysOut) {
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
     * Builds and sends the message: by email where a mail relay is configured, to the entity's
     * Teams channel where one is bound, and to the log in every case.
     */
    private void notifyEntity(PublicEntity entity, ReportingPeriod period,
                              Enums.NotificationOffset offset, long daysOut,
                              boolean sendEmail, boolean postTeams) {

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

        log.info("[{}] {} : {}", offset, entity.getShortName(), body);

        if (sendEmail) {
            List<String> to = new ArrayList<>();
            to.add(entity.getContactEmail());
            users.findByEntityIdAndRole(entity.getId(), Enums.Role.ENTITY_REPORTER)
                    .forEach(u -> to.add(u.getEmail()));
            String due = daysOut == 0 ? "is due today" : "is due in " + daysOut + " day(s)";
            email.send(to,
                    "Vuka: " + period.getLabel() + " " + due,
                    emailBody(entity, period, due, outstanding));
        }

        if (!postTeams) return;
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

    /** Plain text, so it reads the same in Outlook, a phone and a government webmail client. */
    static String emailBody(PublicEntity entity, ReportingPeriod period, String due,
                            List<String> outstanding) {
        StringBuilder b = new StringBuilder();
        b.append(entity.getName()).append("\n\n");
        b.append(period.getLabel()).append(' ').append(due)
         .append(" (").append(period.getRegulatoryDeadline()).append(").\n\n");
        if (outstanding.isEmpty()) {
            b.append("Every target has evidence attached. What remains is to confirm the figures and submit.\n");
        } else {
            b.append(outstanding.size()).append(" target(s) still have no evidence attached:\n");
            outstanding.forEach(ref -> b.append("  - ").append(ref).append('\n'));
        }
        b.append("\nSign in to Vuka to upload the completed template and attach the evidence.\n");
        b.append("\nThis reminder stops once the period is submitted.\n");
        return b.toString();
    }
}
