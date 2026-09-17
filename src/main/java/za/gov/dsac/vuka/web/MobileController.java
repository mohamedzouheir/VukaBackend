package za.gov.dsac.vuka.web;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

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
    private final ReportingPeriodRepository periods;
    private final TargetResultRepository results;

    public MobileController(TargetRepository targets, SubmissionRepository submissions,
                            ReportingPeriodRepository periods, TargetResultRepository results) {
        this.targets = targets;
        this.submissions = submissions;
        this.periods = periods;
        this.results = results;
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
    public String step(@PathVariable UUID submissionId, @PathVariable int index,
                       @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Submission submission = submissions.findById(submissionId).orElseThrow();
        if (!who.canRead(submission.getEntity().getId().toString())) {
            model.addAttribute("message", "Not your entity.");
            return "mobile-message";
        }

        UUID fyId = submission.getReportingPeriod().getFinancialYear().getId();
        List<Target> list = targets.findByEntityIdAndFinancialYearId(
                submission.getEntity().getId(), fyId);

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
        model.addAttribute("existing",
                results.findByTargetId(t.getId()).stream().findFirst().orElse(null));
        return "mobile-step";
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
