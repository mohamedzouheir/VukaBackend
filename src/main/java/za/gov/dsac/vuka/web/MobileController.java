package za.gov.dsac.vuka.web;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.SubmissionService;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * The low-bandwidth submission path.
 *
 * <h2>Who this is for</h2>
 *
 * Six of the 32 funded bodies are NPOs that may be two or three people, working from a
 * phone on mobile data. A desktop portal is a barrier for exactly the organisations
 * least able to absorb one, and a reporting system they cannot use is a reporting system
 * that produces late submissions and blank dashboards.
 *
 * <h2>Why it is server-rendered</h2>
 *
 * One indicator per screen, no JavaScript framework, no client-side routing. The page
 * arrives complete. This is the surface that carries the accessibility claim, so it
 * ships before anything more ambitious.
 */
@Controller
@RequestMapping("/m")
public class MobileController {

    private final TargetRepository targets;
    private final SubmissionRepository submissions;
    private final TargetResultRepository results;
    private final SubmissionService submissionService;

    public MobileController(TargetRepository targets, SubmissionRepository submissions,
                            TargetResultRepository results, SubmissionService submissionService) {
        this.targets = targets;
        this.submissions = submissions;
        this.results = results;
        this.submissionService = submissionService;
    }

    /** Landing: what is outstanding for this reporter's entity. */
    @GetMapping
    public String home(@AuthenticationPrincipal VukaPrincipal who, Model model) {
        if (who.entityId() == null) {
            model.addAttribute("message", "This view is for entity reporters.");
            return "mobile-message";
        }
        UUID entityId = UUID.fromString(who.entityId());
        List<Submission> open = submissions.findByEntityIdOrderByCreatedAtDesc(entityId).stream()
                .filter(s -> s.getStatus() == Enums.SubmissionStatus.DRAFT
                          || s.getStatus() == Enums.SubmissionStatus.RETURNED)
                .toList();

        model.addAttribute("who", who);
        model.addAttribute("open", open);
        return "mobile-home";
    }

    /**
     * One indicator, one screen.
     *
     * The index is carried in the URL rather than in session state, so a dropped
     * connection loses nothing: the reporter reloads and is exactly where they were.
     */
    @GetMapping("/submission/{submissionId}/step/{index}")
    public String step(@PathVariable("submissionId") UUID submissionId, @PathVariable("index") int index,
                       @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Submission submission = ownSubmission(submissionId, who);
        if (submission == null) {
            // "Not your entity" was the message here, and it confirmed that the submission
            // exists. That is a disclosure about another entity, so both cases read the same now.
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        List<Target> list = targetsFor(submission);

        if (index >= list.size()) {
            model.addAttribute("submission", submission);
            model.addAttribute("total", list.size());
            return "mobile-done";
        }

        Target t = list.get(index);
        model.addAttribute("submission", submission);
        model.addAttribute("target", t);
        model.addAttribute("index", index);
        model.addAttribute("total", list.size());
        model.addAttribute("quarterTarget", quarterTarget(t, submission.getReportingPeriod().getQuarter()));
        model.addAttribute("existing", latestAnswer(submissionId, t.getId()));
        return "mobile-step";
    }

    /**
     * Saves one indicator and moves to the next.
     *
     * <p>Writes through {@link SubmissionService#confirm} rather than touching the repositories,
     * so a figure captured on a phone lands in exactly the same place, with the same named
     * confirmer on it, as one parsed out of a spreadsheet. There is one write path for
     * performance data and this is it.
     *
     * <p>Redirects rather than rendering. A reporter on a failing connection reloads, and a
     * reload that replays a POST is how the same quarter gets submitted twice.
     */
    @PostMapping("/submission/{submissionId}/step/{index}")
    public String saveStep(@PathVariable("submissionId") UUID submissionId, @PathVariable("index") int index,
                           @RequestParam("actualValue") BigDecimal actualValue,
                           @RequestParam(name = "spendToDate", required = false) BigDecimal spendToDate,
                           @RequestParam(name = "varianceExplanation", required = false) String varianceExplanation,
                           @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Submission submission = ownSubmission(submissionId, who);
        if (submission == null) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        List<Target> list = targetsFor(submission);
        if (index < 0 || index >= list.size()) {
            model.addAttribute("message", "That indicator is not part of this report.");
            return "mobile-message";
        }

        submissionService.confirm(submissionId,
                List.of(new SubmissionService.ConfirmedRow(
                        list.get(index).getId(), actualValue, spendToDate, varianceExplanation)),
                who);

        return "redirect:/m/submission/" + submissionId + "/step/" + (index + 1);
    }

    /** Hands the period to DSAC. The one irreversible action on this surface. */
    @PostMapping("/submission/{submissionId}/submit")
    public String submit(@PathVariable("submissionId") UUID submissionId,
                         @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Submission submission = ownSubmission(submissionId, who);
        if (submission == null) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        submissionService.submit(submissionId, who);
        return "redirect:/m/submission/" + submissionId + "/submitted";
    }

    /**
     * The receipt.
     *
     * <p>Its own page rather than a flash message, because a reporter who cannot see that the
     * department has their report will send it again. The frontend design document names that
     * exact failure, and a redirect target that survives a reload is the answer to it.
     */
    @GetMapping("/submission/{submissionId}/submitted")
    public String submitted(@PathVariable("submissionId") UUID submissionId,
                            @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Submission submission = ownSubmission(submissionId, who);
        if (submission == null) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        List<Target> list = targetsFor(submission);
        long answered = list.stream()
                .filter(t -> latestAnswer(submissionId, t.getId()) != null)
                .count();

        model.addAttribute("submission", submission);
        model.addAttribute("total", list.size());
        model.addAttribute("answered", answered);
        return "mobile-submitted";
    }

    // ------------------------------------------------------------------

    /**
     * The submission, or null when it is not this reporter's.
     *
     * <p>Null rather than a distinguishable refusal, and the callers render "Not found" for both
     * cases. Telling a caller that a submission exists but belongs to someone else is itself a
     * disclosure about another entity, which is the same rule ExportController follows.
     */
    private Submission ownSubmission(UUID submissionId, VukaPrincipal who) {
        Submission submission = submissions.findById(submissionId).orElse(null);
        if (submission == null) return null;
        return who.canRead(submission.getEntity().getId().toString()) ? submission : null;
    }

    private List<Target> targetsFor(Submission submission) {
        return targets.findByEntityIdAndFinancialYearId(
                submission.getEntity().getId(),
                submission.getReportingPeriod().getFinancialYear().getId());
    }

    private TargetResult latestAnswer(UUID submissionId, UUID targetId) {
        return results.findBySubmissionIdAndTargetIdOrderByConfirmedAtDesc(submissionId, targetId)
                .stream().findFirst().orElse(null);
    }

    private BigDecimal quarterTarget(Target t, Integer q) {
        if (q == null) return t.getAnnualTarget();
        return switch (q) {
            case 1 -> t.getQ1Target();
            case 2 -> t.getQ2Target();
            case 3 -> t.getQ3Target();
            case 4 -> t.getQ4Target();
            default -> t.getAnnualTarget();
        };
    }
}
