package za.gov.dsac.vuka.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.DocumentRecord;
import za.gov.dsac.vuka.domain.ExtractionResult;
import za.gov.dsac.vuka.repository.DocumentRecordRepository;
import za.gov.dsac.vuka.repository.ExtractionResultRepository;

import java.util.Map;
import java.util.UUID;

/**
 * Document metadata.
 *
 * <h2>Why this returns metadata rather than bytes</h2>
 *
 * The uploaded file's bytes are not stored in this build. {@code DocumentRecord.storagePath} names
 * where they would live in an object store, and wiring that store is a deployment decision rather
 * than a product one: on Cloud Run it is a bucket, in the department's own data centre it is
 * something else, and both are one implementation of one interface behind this endpoint.
 *
 * <p>What is stored, and what this returns, is everything needed to say whether the evidence chain
 * holds: the file name, its size, its content hash, who uploaded it and when, which target it is
 * attached to, and which of the Auditor-General's tests it was offered against. That is the part
 * the accountability claim rests on. A reviewer who cannot open the PDF but can see that a named
 * person attached a hashed file against the completeness test on a specific indicator is in a
 * materially better position than one reading an emailed spreadsheet, and saying exactly that is
 * better than implying the bytes are here.
 *
 * <p>The frontend links to this endpoint from every source cell and every evidence chip, so
 * wiring a real store later is a change to this one method rather than to nine screens.
 */
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentRecordRepository documents;
    private final ExtractionResultRepository extractions;

    public DocumentController(DocumentRecordRepository documents,
                              ExtractionResultRepository extractions) {
        this.documents = documents;
        this.extractions = extractions;
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
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
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

        String note = "The stored bytes are not served in this build. Everything the evidence "
                + "chain rests on is here: the file name, its size, its content hash, who uploaded "
                + "it, when, the target it is attached to and the Auditor-General's test it was "
                + "offered against. The storage path names where the bytes belong in an object "
                + "store, which is a deployment decision rather than a product one."
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

    /** A blunt health signal for the demo: how much evidence exists at all. */
    @GetMapping("/count")
    @PreAuthorize("hasAnyRole('DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public Map<String, Object> count() {
        return Map.of("documents", documents.count());
    }
}
