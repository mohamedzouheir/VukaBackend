package za.gov.dsac.vuka.web;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.DocumentRecord;
import za.gov.dsac.vuka.domain.ExtractionResult;
import za.gov.dsac.vuka.repository.DocumentRecordRepository;
import za.gov.dsac.vuka.repository.ExtractionResultRepository;
import za.gov.dsac.vuka.service.DocumentVersionService;

import java.util.Map;
import java.util.UUID;

/**
 * Document metadata.
 *
 * <h2>Why this returns metadata rather than bytes</h2>
 *
 * The bytes are stored, content-addressed by their SHA-256, by {@code DocumentStore}, and a
 * version is downloaded from {@code GET /api/workspace/document/{id}/content}. This endpoint stays
 * metadata only because it is what every source cell and evidence chip opens, and what a reviewer
 * needs there first is whether the evidence chain holds: the file name, its size, its content
 * hash, who uploaded it and when, which target it is attached to, and which of the
 * Auditor-General's tests it was offered against. The response carries the download path so the
 * file is one click further on.
 *
 * <p>The frontend links to this endpoint from every source cell and every evidence chip, so
 * wiring a real store later is a change to this one method rather than to nine screens.
 */
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentRecordRepository documents;
    private final ExtractionResultRepository extractions;
    private final DocumentVersionService versions;

    public DocumentController(DocumentRecordRepository documents,
                              ExtractionResultRepository extractions,
                              DocumentVersionService versions) {
        this.documents = documents;
        this.extractions = extractions;
        this.versions = versions;
    }

    public record DocumentView(UUID documentId, String fileName, String documentType,
                               long sizeBytes, String contentHash, String uploadedByUid,
                               String uploadedAt, String approvalStatus, String agsaCriterion,
                               UUID targetId, String indicatorRef, UUID submissionId,
                               String storagePath, String note) {}

    /**
     * One document.
     *
     * <p>The id may also be an extraction id, because the frontend links a source cell straight to
     * whatever it has: an extraction row knows which uploaded file it was read from, and resolving
     * that here means the provenance cell does not have to hold two kinds of link.
     */
    @GetMapping("/{id}")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    // Transactional because an extraction's document is a lazy proxy, and reading its file name
    // outside a session threw, which answered every source cell link with a 500.
    @Transactional(readOnly = true)
    public ResponseEntity<?> document(@PathVariable("id") UUID id,
                                      @AuthenticationPrincipal VukaPrincipal who) {

        DocumentRecord doc = documents.findById(id).orElse(null);
        String sourceCell = null;

        if (doc == null) {
            // Try it as an extraction id, which is what a source cell link carries.
            ExtractionResult x = extractions.findById(id).orElse(null);
            if (x == null) return ResponseEntity.notFound().build();
            doc = x.getDocumentRecord();
            sourceCell = x.getSourceLocation();
            if (doc == null) return ResponseEntity.notFound().build();
        }

        // Not FORBIDDEN. A caller learning that a document exists but belongs to another entity
        // has learned something about that entity's reporting.
        if (who != null && doc.getEntity() != null
                && !who.canRead(doc.getEntity().getId().toString())) {
            return ResponseEntity.notFound().build();
        }

        String note = "Metadata for one stored version. The file itself is at "
                + "/api/workspace/document/" + doc.getId() + "/content, and its SHA-256 above is the "
                + "hash of exactly those bytes."
                + (sourceCell == null ? "" : " Read from cell " + sourceCell + ".");

        return ResponseEntity.ok(new DocumentView(
                doc.getId(), doc.getFileName(),
                doc.getDocumentType() == null ? null : doc.getDocumentType().name(),
                doc.getSizeBytes(), doc.getContentHash(), doc.getUploadedByUid(),
                doc.getUploadedAt() == null ? null : doc.getUploadedAt().toString(),
                doc.getApprovalStatus() == null ? null : doc.getApprovalStatus().name(),
                doc.getAgsaCriterion() == null ? null : doc.getAgsaCriterion().name(),
                doc.getTarget() == null ? null : doc.getTarget().getId(),
                doc.getTarget() == null ? null : doc.getTarget().getIndicatorRef(),
                doc.getSubmission() == null ? null : doc.getSubmission().getId(),
                doc.getStoragePath(), note));
    }

    /**
     * The file itself, by document id or by extraction id, resolved the same way as the metadata
     * above. This is what an evidence chip and a source cell link open: a reporter or reviewer who
     * clicks a file name wants the file, not a JSON description of it.
     */
    @GetMapping("/{id}/content")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> content(@PathVariable("id") UUID id,
                                          @AuthenticationPrincipal VukaPrincipal who) {
        DocumentRecord doc = documents.findById(id).orElse(null);
        if (doc == null) {
            ExtractionResult x = extractions.findById(id).orElse(null);
            doc = x == null ? null : x.getDocumentRecord();
        }
        if (doc == null || (who != null && doc.getEntity() != null
                && !who.canRead(doc.getEntity().getId().toString()))) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(doc.getFileName() == null ? "document" : doc.getFileName())
                        .build().toString())
                .contentType(doc.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(doc.getContentType()))
                .body(versions.content(doc));
    }

    /** A blunt health signal for the demo: how much evidence exists at all. */
    @GetMapping("/count")
    @PreAuthorize("@can.has('VIEW_PORTFOLIO')")
    public Map<String, Object> count() {
        return Map.of("documents", documents.count());
    }
}
