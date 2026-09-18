package za.gov.dsac.vuka.web;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.Enums;
import za.gov.dsac.vuka.service.CommentService;
import za.gov.dsac.vuka.service.CommentService.Anchor;
import za.gov.dsac.vuka.service.CommentService.ThreadView;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Comments on figures, results and documents, and the endpoint a client watches.
 *
 * <h2>The live part</h2>
 *
 * <p>Both read endpoints carry an {@code ETag}. A client polls every five seconds with
 * {@code If-None-Match} and gets {@code 304} with no body until something is actually said. The
 * validator is computed from two aggregates, so an unchanged poll never reads a comment row, and
 * the answer stays the same size whether the thread holds three comments or three hundred.
 *
 * <p>Requirement (d) asks for comments "visible on screen in real time". This is the whole of our
 * answer to it and the reasoning is in {@link CommentService}: at a five second cadence the
 * difference from a socket is not visible to a person, and the socket is the part that breaks on
 * conference wifi.
 *
 * <h2>What is missing, deliberately</h2>
 *
 * <p>No edit endpoint and no delete endpoint. A comment can be resolved and that is all that ever
 * happens to it, which is the same stance this system takes on confirmed figures. An objection a
 * reviewer can quietly rewrite afterwards is not a record of a dispute, and the audit trail that
 * makes the rest of the product defensible would have a hole in it exactly where disagreements
 * live.
 */
@RestController
@RequestMapping("/api/comments")
public class CommentController {

    private final CommentService service;

    public CommentController(CommentService service) {
        this.service = service;
    }

    // ---------- one thread ----------

    /**
     * Everything said about one target, result or document.
     *
     * <p>404 covers both "no such anchor" and "not your entity". Telling a caller that a target
     * exists but belongs to someone else is a disclosure about another entity, which is the rule
     * the export and mobile surfaces already follow.
     */
    @GetMapping("/thread")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<ThreadView> thread(@RequestParam("anchorType") String anchorType,
                                             @RequestParam("anchorId") UUID anchorId,
                                             @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
                                             @AuthenticationPrincipal VukaPrincipal who) {

        Anchor anchor = readableAnchor(anchorType, anchorId, who);
        if (anchor == null) return ResponseEntity.notFound().build();

        String etag = service.digest(anchor).etag();
        if (matches(ifNoneMatch, etag)) return notModified(etag);

        return ResponseEntity.ok().eTag(etag).cacheControl(noStore()).body(service.thread(anchor));
    }

    // ---------- the workspace ----------

    /** Every thread for one entity, open ones first. The workspace view of requirement (d). */
    @GetMapping("/workspace")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<ThreadView>> workspace(@RequestParam("entityId") UUID entityId,
                                                      @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
                                                      @AuthenticationPrincipal VukaPrincipal who) {

        if (!who.canRead(entityId.toString())) return ResponseEntity.status(403).build();

        String etag = service.digest(entityId).etag();
        if (matches(ifNoneMatch, etag)) return notModified(etag);

        return ResponseEntity.ok().eTag(etag).cacheControl(noStore()).body(service.workspace(entityId));
    }

    // ---------- writing ----------

    /**
     * @param anchorType TARGET, RESULT or DOCUMENT
     * @param anchorId   the row being discussed, which is also where the entity comes from
     * @param parentId   the comment being answered, or null to open a thread
     * @param body       what was written
     */
    public record PostRequest(String anchorType, UUID anchorId, UUID parentId, String body) {}

    @PostMapping
    @PreAuthorize("@can.has('PARTICIPATE')")
    public ResponseEntity<?> post(@RequestBody PostRequest req, @AuthenticationPrincipal VukaPrincipal who) {
        Anchor anchor = readableAnchor(req.anchorType(), req.anchorId(), who);
        if (anchor == null) return ResponseEntity.notFound().build();

        try {
            var saved = service.post(anchor, req.parentId(), req.body(), who);
            return ResponseEntity.ok(Map.of(
                    "id", saved.getId(),
                    "entityId", anchor.entityId(),
                    "anchorType", anchor.type().name(),
                    "anchorId", anchor.id(),
                    "createdAt", saved.getCreatedAt().toString()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    public record ResolveRequest(boolean resolved) {}

    /**
     * Closes or reopens a point. The author or any DSAC role; an entity cannot close an objection
     * raised against its own figures.
     */
    @PostMapping("/{commentId}/resolve")
    @PreAuthorize("@can.has('PARTICIPATE')")
    public ResponseEntity<?> resolve(@PathVariable("commentId") UUID commentId,
                                     @RequestBody ResolveRequest req,
                                     @AuthenticationPrincipal VukaPrincipal who) {
        return service.setResolved(commentId, req.resolved(), who)
                .<ResponseEntity<?>>map(c -> ResponseEntity.ok(Map.of(
                        "id", c.getId(),
                        "resolved", c.isResolved(),
                        "resolvedBy", c.getResolvedByName() == null ? "" : c.getResolvedByName(),
                        "at", c.getResolvedAt() == null ? "" : c.getResolvedAt().toString())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // ------------------------------------------------------------------

    /** The anchor when it exists and this caller may see the entity behind it, otherwise null. */
    private Anchor readableAnchor(String anchorType, UUID anchorId, VukaPrincipal who) {
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

    /**
     * Does the validator the client is holding still describe the thread?
     *
     * <p>Header equality is not enough. {@code If-None-Match} may carry several validators, may
     * carry {@code *}, and passes through infrastructure that is entitled to drop the weak
     * marker, so the opaque part is what is compared.
     */
    static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) return false;
        for (String candidate : ifNoneMatch.split(",")) {
            String held = candidate.trim();
            if (held.equals("*") || opaquePart(held).equals(opaquePart(etag))) return true;
        }
        return false;
    }

    /** An ETag without its weak marker or its quotes. */
    static String opaquePart(String etag) {
        String t = etag.startsWith("W/") ? etag.substring(2) : etag;
        return t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")
                ? t.substring(1, t.length() - 1) : t;
    }

    /** 304, carrying the validator again so the client keeps holding it. */
    private static <T> ResponseEntity<T> notModified(String etag) {
        return ResponseEntity.status(304).eTag(etag).cacheControl(noStore()).build();
    }

    /**
     * Never cached, always revalidated.
     *
     * <p>The ETag is the whole point and a stored copy would defeat it: a reviewer's objection
     * sitting in a proxy for thirty seconds is the failure this endpoint exists to prevent. The
     * response is also per-caller, because what a reporter may read is not what a reviewer may.
     */
    private static org.springframework.http.CacheControl noStore() {
        return org.springframework.http.CacheControl.noStore().mustRevalidate();
    }
}
