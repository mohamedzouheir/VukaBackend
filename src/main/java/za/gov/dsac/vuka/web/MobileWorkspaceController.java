package za.gov.dsac.vuka.web;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.service.DocumentVersionService;
import za.gov.dsac.vuka.service.WorkspaceService;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * The workspace on a phone.
 *
 * <p>Requirement (d) ends with "full functionality in mobile devices and allow for mobile working
 * environment", and a workspace that exists only in a desktop dashboard does not meet it. So the
 * repository, the version history, the receipt, the comment thread and the task list are all here,
 * server-rendered, on the same surface and with the same page budget as the submission flow.
 *
 * <h2>Comments are one tap away, not on this page</h2>
 *
 * The document page links to the comment thread about that document at
 * {@code /m/comments/document/{id}}, served by {@link MobileCommentController}. That thread is
 * where the live part is: a small inline poller asks every five seconds whether anything was said
 * and is answered 304 with no body until something was. Keeping it on its own page keeps this one
 * inside the page budget, and keeps a single write path for comments rather than two.
 */
@Controller
@RequestMapping("/m/workspace")
public class MobileWorkspaceController {

    private final DocumentVersionService documents;
    private final WorkspaceService workspace;

    public MobileWorkspaceController(DocumentVersionService documents, WorkspaceService workspace) {
        this.documents = documents;
        this.workspace = workspace;
    }

    /** The repository, the task list, and the upload form. */
    @GetMapping
    public String home(@RequestParam(name = "receipt", required = false) String receipt,
                       @RequestParam(name = "note", required = false) String note,
                       @AuthenticationPrincipal VukaPrincipal who, Model model) {

        UUID entityId = entityOf(who);
        if (entityId == null) {
            model.addAttribute("message", "This view is for entity reporters.");
            return "mobile-message";
        }

        model.addAttribute("who", who);
        model.addAttribute("documents", documents.currentDocuments(entityId));
        model.addAttribute("tasks", workspace.tasksFor(entityId).stream()
                .filter(t -> t.getStatus() != Enums.TaskStatus.DONE)
                .toList());
        model.addAttribute("types", Enums.DocumentType.values());
        model.addAttribute("receipt", receipt);
        model.addAttribute("note", note);
        return "mobile-workspace";
    }

    /**
     * Uploads a document and shows the receipt.
     *
     * <p>Redirects rather than rendering, for the same reason the submission flow does: a
     * reporter on a failing connection reloads, and a reload that replays a multipart POST is how
     * the same file arrives twice. Here it would not corrupt anything, because identical bytes do
     * not open a version, but the reporter would still see a second receipt for one upload.
     */
    @PostMapping("/upload")
    public String upload(@RequestParam("file") MultipartFile file,
                         @RequestParam(name = "documentType", required = false) String documentType,
                         @AuthenticationPrincipal VukaPrincipal who, Model model) throws IOException {

        UUID entityId = entityOf(who);
        if (entityId == null) {
            model.addAttribute("message", "This view is for entity reporters.");
            return "mobile-message";
        }
        if (file.isEmpty()) {
            return "redirect:/m/workspace?note=" + encode("Nothing was attached to that upload.");
        }

        Enums.DocumentType type;
        try {
            type = Enums.DocumentType.valueOf(documentType);
        } catch (Exception e) {
            type = null;
        }

        DocumentVersionService.Stored stored = documents.store(DocumentVersionService.Incoming.upload(
                entityId, type, file.getOriginalFilename(), file.getContentType(),
                file.getBytes(), who, null, null));

        String note = stored.newVersion()
                ? "Received as version " + stored.record().getVersion() + "."
                : "That file is identical to the version already held, so nothing changed.";

        return "redirect:/m/workspace?receipt=" + encode(stored.record().getReceiptNumber())
                + "&note=" + encode(note);
    }

    /** One document: every version, and the conversation about it. */
    @GetMapping("/document/{documentId}")
    public String document(@PathVariable("documentId") UUID documentId,
                           @AuthenticationPrincipal VukaPrincipal who, Model model) {

        DocumentRecord doc = documents.find(documentId).orElse(null);
        if (doc == null || !who.canRead(doc.getEntity().getId().toString())) {
            model.addAttribute("message", "Not found.");
            return "mobile-message";
        }

        List<DocumentRecord> history = documents.history(doc.getEntity().getId(), doc.getDocumentKey());
        model.addAttribute("doc", doc);
        model.addAttribute("history", history);
        model.addAttribute("entityId", doc.getEntity().getId());
        return "mobile-document";
    }

    // ------------------------------------------------------------------

    private static UUID entityOf(VukaPrincipal who) {
        return who.entityId() == null ? null : UUID.fromString(who.entityId());
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value,
                java.nio.charset.StandardCharsets.UTF_8);
    }
}
