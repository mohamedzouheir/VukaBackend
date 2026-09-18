package za.gov.dsac.vuka.web;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.service.*;
import za.gov.dsac.vuka.service.microsoft.MicrosoftWorkspaceService;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The entity workspace: documents and their versions, tasks, and the Microsoft binding.
 *
 * <p>Comments are next door in {@code /api/comments}, because they anchor to targets and results
 * as well as to documents and so are not a property of this surface.
 *
 * <h2>Who may do what</h2>
 *
 * Reading follows the tenancy rule used everywhere else: an entity reporter sees their own
 * entity, DSAC sees all of them. Writing does not follow it symmetrically, and the asymmetry is
 * deliberate:
 *
 * <ul>
 *   <li><b>Only the entity uploads evidence.</b> A DSAC reviewer with an upload button could put
 *       a document into an entity's repository under the entity's name. That is the same failure
 *       as a reviewer confirming a figure on an entity's behalf, which {@code SecurityConfig}
 *       already refuses on the reporter surface.</li>
 *   <li><b>Only DSAC decides.</b> Approval is a departmental act. An entity approving its own
 *       submission is not an approval.</li>
 *   <li><b>Both sides set tasks.</b> That is the point of a shared workspace, and the direction
 *       of a task is recorded rather than restricted.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {

    private final DocumentVersionService documents;
    private final WorkspaceService workspace;
    private final MicrosoftWorkspaceService microsoft;

    public WorkspaceController(DocumentVersionService documents, WorkspaceService workspace,
                               MicrosoftWorkspaceService microsoft) {
        this.documents = documents;
        this.workspace = workspace;
        this.microsoft = microsoft;
    }

    // ------------------------------------------------------------------
    // Documents
    // ------------------------------------------------------------------

    /**
     * One version of one document, as the API shows it.
     *
     * @param receiptNumber  issued on arrival; proof of receipt, not a decision
     * @param contentHash    SHA-256 of the bytes, so a holder of the file can check this row
     * @param microsoftState what has happened between this version and the entity's Microsoft drive
     */
    public record DocumentView(UUID id, String documentKey, String fileName, String documentType,
                               int version, boolean current, long sizeBytes, String contentHash,
                               String source, String uploadedBy, Instant uploadedAt,
                               String receiptNumber, Instant receivedAt,
                               String approvalStatus, String decidedBy, Instant decidedAt,
                               String decisionNote, String agsaCriterion,
                               String microsoftState, String microsoftVersionLabel,
                               String microsoftWebUrl, String microsoftError) {

        static DocumentView of(DocumentRecord d) {
            return new DocumentView(
                    d.getId(), d.getDocumentKey(), d.getFileName(),
                    d.getDocumentType() == null ? null : d.getDocumentType().name(),
                    d.getVersion(), d.isCurrent(), d.getSizeBytes(), d.getContentHash(),
                    d.getSource() == null ? null : d.getSource().name(),
                    d.getUploadedByUid(), d.getUploadedAt(),
                    d.getReceiptNumber(), d.getReceivedAt(),
                    d.getApprovalStatus() == null ? null : d.getApprovalStatus().name(),
                    d.getDecidedByName(), d.getDecidedAt(), d.getDecisionNote(),
                    d.getAgsaCriterion() == null ? null : d.getAgsaCriterion().name(),
                    d.getGraphSyncState() == null ? null : d.getGraphSyncState().name(),
                    d.getGraphVersionLabel(), d.getGraphWebUrl(), d.getGraphSyncError());
        }
    }

    /** Current versions of everything in the entity's repository. */
    @GetMapping("/entity/{entityId}/documents")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<DocumentView>> list(@PathVariable("entityId") UUID entityId,
                                                   @AuthenticationPrincipal VukaPrincipal who) {
        if (!who.canRead(entityId.toString())) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(documents.currentDocuments(entityId).stream().map(DocumentView::of).toList());
    }

    /**
     * Uploads a document, which is either the first version of it or the next one.
     *
     * <p>The response is a receipt. It carries the version number, the reference, and the hash of
     * what was stored, which between them answer the three questions a reporter has after
     * pressing the button: did it arrive, is it the newest, and is it the file I meant to send.
     */
    @PostMapping(value = "/entity/{entityId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
    public ResponseEntity<?> upload(@PathVariable("entityId") UUID entityId,
                                    @RequestParam("file") MultipartFile file,
                                    @RequestParam(name = "documentType", required = false) String documentType,
                                    @RequestParam(name = "agsaCriterion", required = false) String agsaCriterion,
                                    @RequestParam(name = "submissionId", required = false) UUID submissionId,
                                    @AuthenticationPrincipal VukaPrincipal who) throws IOException {

        if (!who.canRead(entityId.toString())) return ResponseEntity.status(403).build();
        if (file.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "The file is empty."));

        var incoming = DocumentVersionService.Incoming.upload(
                entityId,
                parse(Enums.DocumentType.class, documentType),
                file.getOriginalFilename(),
                file.getContentType(),
                file.getBytes(),
                who,
                submissionId,
                parse(Enums.AgsaCriterion.class, agsaCriterion));

        DocumentVersionService.Stored stored = documents.store(incoming);

        return ResponseEntity.ok(Map.of(
                "document", DocumentView.of(stored.record()),
                "newVersion", stored.newVersion(),
                // Said plainly, because a reporter who uploads the same file twice and sees
                // "version 1" both times needs to know the second upload was not lost.
                "message", stored.newVersion()
                        ? "Received as version " + stored.record().getVersion() + "."
                        : "Identical to the version already held. Nothing was changed."));
    }

    /** Every version of one document, newest first. */
    @GetMapping("/document/{documentId}/history")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<DocumentView>> history(@PathVariable("documentId") UUID documentId,
                                                      @AuthenticationPrincipal VukaPrincipal who) {
        DocumentRecord doc = documents.find(documentId).orElse(null);
        if (doc == null || !who.canRead(doc.getEntity().getId().toString())) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(documents.history(doc.getEntity().getId(), doc.getDocumentKey())
                .stream().map(DocumentView::of).toList());
    }

    /**
     * Downloads one version.
     *
     * <p>By version id rather than by document, so a reviewer can open the file as it was in
     * March rather than whatever replaced it. That is the entire point of keeping the chain.
     */
    @GetMapping("/document/{documentId}/content")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<byte[]> content(@PathVariable("documentId") UUID documentId,
                                          @AuthenticationPrincipal VukaPrincipal who) {
        DocumentRecord doc = documents.find(documentId).orElse(null);
        if (doc == null || !who.canRead(doc.getEntity().getId().toString())) {
            return ResponseEntity.notFound().build();
        }
        byte[] bytes = documents.content(doc);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(doc.getFileName() == null ? "document" : doc.getFileName())
                        .build().toString())
                .contentType(doc.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(doc.getContentType()))
                .body(bytes);
    }

    public record DecisionRequest(boolean approve, String note) {}

    /** DSAC accepts or rejects a version, by name. */
    @PostMapping("/document/{documentId}/decision")
    @PreAuthorize("@can.has('REVIEW_SUBMISSIONS')")
    public ResponseEntity<?> decide(@PathVariable("documentId") UUID documentId,
                                    @RequestBody DecisionRequest request,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        if (documents.find(documentId).isEmpty()) return ResponseEntity.notFound().build();
        try {
            return ResponseEntity.ok(DocumentView.of(
                    documents.decide(documentId, request.approve(), request.note(), who)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ------------------------------------------------------------------
    // Tasks
    // ------------------------------------------------------------------

    public record TaskView(UUID id, String title, String description, String assignedToName,
                           String createdByName, LocalDate dueDate, String status,
                           boolean external, UUID documentId, Instant createdAt) {
        static TaskView of(TaskItem t) {
            return new TaskView(t.getId(), t.getTitle(), t.getDescription(), t.getAssignedToName(),
                    t.getCreatedByName(), t.getDueDate(),
                    t.getStatus() == null ? null : t.getStatus().name(),
                    t.isExternal(),
                    t.getDocument() == null ? null : t.getDocument().getId(),
                    t.getCreatedAt());
        }
    }

    @GetMapping("/entity/{entityId}/tasks")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<TaskView>> tasks(@PathVariable("entityId") UUID entityId,
                                                @AuthenticationPrincipal VukaPrincipal who) {
        if (!who.canRead(entityId.toString())) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(workspace.tasksFor(entityId).stream().map(TaskView::of).toList());
    }

    /** Open work assigned to the caller, across every entity they can see. */
    @GetMapping("/tasks/mine")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<TaskView>> myTasks(@AuthenticationPrincipal VukaPrincipal who) {
        return ResponseEntity.ok(workspace.myOpenTasks(who).stream().map(TaskView::of).toList());
    }

    public record TaskRequest(String title, String description, String assignedToUid,
                              String assignedToName, LocalDate dueDate,
                              UUID documentId, UUID submissionId) {}

    @PostMapping("/entity/{entityId}/tasks")
    @PreAuthorize("@can.has('PARTICIPATE')")
    public ResponseEntity<?> createTask(@PathVariable("entityId") UUID entityId,
                                        @RequestBody TaskRequest request,
                                        @AuthenticationPrincipal VukaPrincipal who) {
        if (!who.canRead(entityId.toString())) return ResponseEntity.status(403).build();
        TaskItem task = workspace.createTask(entityId, request.title(), request.description(),
                request.assignedToUid(), request.assignedToName(), request.dueDate(),
                request.documentId(), request.submissionId(), who);
        return ResponseEntity.ok(TaskView.of(task));
    }

    public record TaskStatusRequest(String status) {}

    @PostMapping("/task/{taskId}/status")
    @PreAuthorize("@can.has('PARTICIPATE')")
    public ResponseEntity<?> taskStatus(@PathVariable("taskId") UUID taskId,
                                        @RequestBody TaskStatusRequest request,
                                        @AuthenticationPrincipal VukaPrincipal who) {
        Enums.TaskStatus status = parse(Enums.TaskStatus.class, request.status());
        if (status == null) return ResponseEntity.badRequest().body(Map.of("error", "Unknown status."));
        try {
            return ResponseEntity.ok(TaskView.of(workspace.updateTaskStatus(taskId, status, who)));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        }
    }

    // ------------------------------------------------------------------
    // Microsoft 365
    // ------------------------------------------------------------------

    public record BindRequest(String driveId, String siteHostname, String sitePath, String folderPath) {}

    /**
     * Binds an entity's workspace to a SharePoint document library.
     *
     * <p>Administrator only. This is the call that decides which folder in a department's tenant
     * a reporting system may read and write, and it is not a reviewer's decision to make.
     */
    @PostMapping("/entity/{entityId}/microsoft/bind")
    @PreAuthorize("@can.has('ADMINISTER')")
    public ResponseEntity<?> bind(@PathVariable("entityId") UUID entityId,
                                  @RequestBody BindRequest request) {
        try {
            EntityWorkspace bound = microsoft.bind(entityId, request.driveId(),
                    request.siteHostname(), request.sitePath(), request.folderPath());
            return ResponseEntity.ok(Map.of(
                    "driveId", String.valueOf(bound.getDriveId()),
                    "folderPath", String.valueOf(bound.getFolderPath())));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
        }
    }

    public record WebhookRequest(String webhookUrl) {}

    /**
     * Sets the Teams channel the deadline countdown posts into.
     *
     * <p>Write only. The URL is a capability: anyone holding it can post to that channel, so it
     * is never read back out of this API and never logged.
     */
    @PostMapping("/entity/{entityId}/microsoft/teams-webhook")
    @PreAuthorize("@can.has('ADMINISTER')")
    public ResponseEntity<?> teamsWebhook(@PathVariable("entityId") UUID entityId,
                                          @RequestBody WebhookRequest request) {
        microsoft.setTeamsWebhook(entityId, request.webhookUrl());
        return ResponseEntity.ok(Map.of("status", request.webhookUrl() == null ? "cleared" : "set"));
    }

    /** Runs a delta poll now rather than waiting for the timer. Useful on stage. */
    @PostMapping("/entity/{entityId}/microsoft/sync")
    @PreAuthorize("@can.has('REVIEW_SUBMISSIONS')")
    public ResponseEntity<?> syncNow(@PathVariable("entityId") UUID entityId) {
        EntityWorkspace workspaceRow = microsoft.workspaceFor(entityId);
        if (!workspaceRow.isBoundToMicrosoft()) {
            return ResponseEntity.ok(Map.of("picked", 0, "note", "No Microsoft drive is bound to this entity."));
        }
        try {
            return ResponseEntity.ok(Map.of("picked", microsoft.pull(workspaceRow.getId())));
        } catch (RuntimeException e) {
            microsoft.recordSyncError(workspaceRow.getId(), e.getMessage());
            return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
        }
    }

    /** What the integration is doing. The first thing to look at when someone says it is broken. */
    @GetMapping("/microsoft/status")
    @PreAuthorize("@can.has('VIEW_PORTFOLIO')")
    public ResponseEntity<?> microsoftStatus() {
        MicrosoftWorkspaceService.Status status = microsoft.status();
        return ResponseEntity.ok(Map.of(
                "configured", status.configured(),
                "syncEnabled", status.syncEnabled(),
                "boundDrives", status.boundDrives(),
                "pendingMirror", status.pending(),
                "failedMirror", status.failed()));
    }

    // ------------------------------------------------------------------

    /** Enum from a request string, or null. An unknown value is not worth a 500. */
    private static <E extends Enum<E>> E parse(Class<E> type, String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Enum.valueOf(type, value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
