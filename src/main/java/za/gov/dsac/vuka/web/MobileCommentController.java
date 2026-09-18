package za.gov.dsac.vuka.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.Enums;
import za.gov.dsac.vuka.service.CommentService;
import za.gov.dsac.vuka.service.CommentService.Anchor;
import za.gov.dsac.vuka.service.CommentService.CommentView;
import za.gov.dsac.vuka.service.CommentService.ThreadView;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Comments on the phone.
 *
 * <h2>Why this surface exists at all</h2>
 *
 * <p>Requirement (d) asks for comments visible in real time <em>and</em> for full functionality on
 * a mobile device, and the two together are the whole point: the person who has to answer a
 * disputed figure at a small entity is the same person who captured it, from a phone. A comment
 * thread that only a desktop dashboard can open leaves them reading about the dispute in an email
 * and answering it in a different tool, which is the situation this replaces.
 *
 * <h2>How it updates without a reload</h2>
 *
 * <p>The thread is rendered by the server and is complete on arrival. A few hundred bytes of
 * script then re-fetch {@code /live} every five seconds with the ETag the page was served with,
 * and replace the list when — and only when — the server says it moved. With script switched off
 * or failed, the page is the thread as it stood when it loaded, which is what the rest of this
 * surface already promises; nothing here is script-only.
 *
 * <p>The announcement is deliberately not the list. Marking the list itself as a live region
 * would make a screen reader re-read every comment in it each time one arrived. A one line status
 * outside the list says what changed, and the list is simply correct for anyone who looks at it.
 */
@Controller
@RequestMapping("/m/comments")
public class MobileCommentController {

    private static final ZoneId SAST = ZoneId.of("Africa/Johannesburg");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM, HH:mm");

    /** Read by the poller to work out how many comments arrived, without parsing the markup. */
    static final String COUNT_HEADER = "X-Vuka-Comments";

    private final CommentService service;

    public MobileCommentController(CommentService service) {
        this.service = service;
    }

    // ---------- the workspace list ----------

    /** Every thread about this entity, open ones first. */
    @GetMapping
    public String list(@AuthenticationPrincipal VukaPrincipal who, Model model) {
        UUID entityId = entityOf(who);
        if (entityId == null) {
            model.addAttribute("message", "This view is for entity reporters.");
            return "mobile-message";
        }

        List<ThreadRow> rows = new ArrayList<>();
        for (ThreadView t : service.workspace(entityId)) {
            rows.add(new ThreadRow(t.anchorType().name().toLowerCase(), t.anchorId(), t.label(),
                    t.open(), t.count(), when(t.lastActivity())));
        }

        model.addAttribute("who", who);
        model.addAttribute("threads", rows);
        return "mobile-comments";
    }

    /** One row in the list: what it is about, whether it is still open, and when it last moved. */
    public record ThreadRow(String anchorType, UUID anchorId, String label,
                            boolean open, int count, String lastActivity) {}

    // ---------- one thread ----------

    @GetMapping("/{anchorType}/{anchorId}")
    public String thread(@PathVariable("anchorType") String anchorType,
                         @PathVariable("anchorId") UUID anchorId,
                         @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Anchor anchor = ownAnchor(anchorType, anchorId, who);
        if (anchor == null) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        model.addAttribute("anchorType", anchor.type().name().toLowerCase());
        model.addAttribute("anchorId", anchor.id());
        model.addAttribute("label", anchor.label());
        model.addAttribute("etag", service.digest(anchor).etag());
        model.addAttribute("comments", flatten(service.thread(anchor)));
        return "mobile-thread";
    }

    /**
     * The thread on its own, for the poller.
     *
     * <p>Answers 304 with no body while nothing has been said, which is what makes a five second
     * poll from a phone on mobile data defensible. A quiet afternoon costs the reporter one set of
     * request headers every five seconds and nothing else.
     */
    @GetMapping("/{anchorType}/{anchorId}/live")
    public String live(@PathVariable("anchorType") String anchorType,
                       @PathVariable("anchorId") UUID anchorId,
                       @AuthenticationPrincipal VukaPrincipal who,
                       WebRequest request, HttpServletResponse response, Model model) {

        model.addAttribute("comments", List.of());

        Anchor anchor = ownAnchor(anchorType, anchorId, who);
        if (anchor == null) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            return "mobile-thread-live";
        }

        CommentService.Digest digest = service.digest(anchor);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store, must-revalidate");
        response.setHeader(COUNT_HEADER, String.valueOf(digest.count()));

        // Sets the ETag, compares what the client is holding, and on a match writes 304 and
        // marks the request handled. Returning null then skips rendering entirely, which is the
        // point: an unchanged thread costs one index scan and no template.
        if (request.checkNotModified(digest.etag())) return null;

        model.addAttribute("comments", flatten(service.thread(anchor)));
        return "mobile-thread-live";
    }

    // ---------- writing ----------

    /**
     * Adds to the thread, then redirects onto it.
     *
     * <p>Redirects rather than rendering, for the reason the rest of this surface does: a reporter
     * on a failing connection reloads, and a reload that replays a POST is how the same objection
     * gets answered twice.
     */
    @PostMapping("/{anchorType}/{anchorId}")
    public String add(@PathVariable("anchorType") String anchorType,
                      @PathVariable("anchorId") UUID anchorId,
                      @RequestParam(name = "parentId", required = false) UUID parentId,
                      @RequestParam("body") String body,
                      @AuthenticationPrincipal VukaPrincipal who, Model model) {

        Anchor anchor = ownAnchor(anchorType, anchorId, who);
        if (anchor == null) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        try {
            service.post(anchor, parentId, body, who);
        } catch (IllegalArgumentException e) {
            model.addAttribute("message", e.getMessage());
            return "mobile-message";
        }

        return "redirect:/m/comments/" + anchor.type().name().toLowerCase() + "/" + anchor.id();
    }

    // ------------------------------------------------------------------

    /**
     * The anchor, or null when it does not exist or belongs to another entity.
     *
     * <p>Null for both, and the callers say "Not found" either way. A reporter who could tell an
     * anchor apart from someone else's anchor has learned something about another entity's
     * register, which is the rule {@link MobileController} already follows for submissions.
     */
    private Anchor ownAnchor(String anchorType, UUID anchorId, VukaPrincipal who) {
        Enums.AnchorType type;
        try {
            type = Enums.AnchorType.valueOf(String.valueOf(anchorType).toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
        return service.anchor(type, anchorId)
                .filter(a -> who.canRead(a.entityId().toString()))
                .orElse(null);
    }

    private static UUID entityOf(VukaPrincipal who) {
        return who.entityId() == null ? null : UUID.fromString(who.entityId());
    }

    /**
     * Roots then their replies, in one list with a depth flag.
     *
     * <p>A flat list with an indent renders in a fraction of the markup a nested one needs, and
     * on a 360 pixel screen two levels is all that is legible anyway.
     */
    private List<Line> flatten(ThreadView thread) {
        List<Line> lines = new ArrayList<>();
        for (CommentView root : thread.roots()) {
            lines.add(line(root, false));
            for (CommentView reply : root.replies()) lines.add(line(reply, true));
        }
        return lines;
    }

    private Line line(CommentView c, boolean isReply) {
        return new Line(c.id(), c.authorName(), roleWording(c.authorRole()), c.body(),
                when(c.createdAt()), c.resolved(), c.resolvedByName(), isReply);
    }

    /** One comment as the template needs it: no lookups left to do, no formatting left to do. */
    public record Line(UUID id, String authorName, String authorRole, String body,
                       String when, boolean resolved, String resolvedByName, boolean reply) {}

    /**
     * The role, in the words a reporter uses.
     *
     * <p>"DSAC_REVIEWER" is a database value. Who is talking to you is the single most useful
     * thing on this screen, and it should not need decoding.
     */
    private static String roleWording(String role) {
        if (role == null) return "";
        return switch (role) {
            case "ENTITY_REPORTER" -> "your entity";
            case "DSAC_REVIEWER" -> "DSAC review";
            case "DSAC_EXECUTIVE" -> "DSAC";
            case "ADMIN" -> "system administrator";
            default -> "";
        };
    }

    private static String when(Instant at) {
        return at == null ? "" : WHEN.format(at.atZone(SAST));
    }
}
