package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * The one write path for documents, and the whole of "version control triggered at save/upload".
 *
 * <h2>The rule</h2>
 *
 * A document is its key. An arrival of that key either changes the bytes or it does not:
 *
 * <ul>
 *   <li><b>Changed.</b> A new row is written at version n+1, pointing at the row it replaces,
 *       and the replaced row is stamped superseded. Two rows, both readable, forever.</li>
 *   <li><b>Unchanged.</b> Nothing is versioned. The existing row is returned and the caller is
 *       told it was unchanged.</li>
 * </ul>
 *
 * <p>The second case is not an optimisation. Vuka mirrors uploads into the entity's Microsoft
 * drive, and the delta poller then sees that mirrored file as a change in the drive. Without
 * content comparison, every upload would ping-pong into an unbounded chain of versions of itself,
 * each one indistinguishable from real reporting activity. Comparing the SHA-256 is what makes
 * bidirectional sync convergent.
 *
 * <h2>Order of writes</h2>
 *
 * The partial unique index on (entity_id, document_key) where superseded_on is null means the
 * database will not hold two current versions of one document. Hibernate orders inserts before
 * updates within a flush, so the supersede has to be flushed explicitly before the new row is
 * inserted, or a correct sequence of calls fails on a correct constraint.
 */
@Service
public class DocumentVersionService {

    private static final Logger log = LoggerFactory.getLogger(DocumentVersionService.class);

    private static final DateTimeFormatter RECEIPT_DAY =
            DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneId.of("Africa/Johannesburg"));

    /** Characters SharePoint refuses in a file name, plus the ones that would break a path key. */
    private static final String ILLEGAL_IN_NAME = "[\\\\/:*?\"<>|#%]";

    private final DocumentStore store;
    private final DocumentRecordRepository documents;
    private final PublicEntityRepository entities;
    private final SubmissionRepository submissions;
    private final EntityWorkspaceRepository workspaces;
    private final TargetRepository targets;

    public DocumentVersionService(DocumentStore store, DocumentRecordRepository documents,
                                  PublicEntityRepository entities, SubmissionRepository submissions,
                                  EntityWorkspaceRepository workspaces, TargetRepository targets) {
        this.store = store;
        this.documents = documents;
        this.entities = entities;
        this.submissions = submissions;
        this.workspaces = workspaces;
        this.targets = targets;
    }

    // ------------------------------------------------------------------
    // What arrives
    // ------------------------------------------------------------------

    /**
     * A document arriving from somewhere, in the shape this service needs it.
     *
     * @param entityId      owning entity
     * @param documentType  which of the filings the challenge lists this is
     * @param fileName      as the person named it; kept for display, never used as an identity
     * @param contentType   media type, so a download is served as what it is
     * @param content       the bytes
     * @param source        upload, or a save picked up from Microsoft 365
     * @param actorUid      who did it; a Firebase uid for an upload, a Graph identity otherwise
     * @param actorName     display name for the same person
     * @param submissionId  the filing this supports, where it supports one
     * @param agsaCriterion which Auditor-General test the evidence is offered against
     * @param graph         Microsoft provenance where the arrival came from, or was mirrored to, a drive
     * @param targetId      the indicator this is evidence for, where it is evidence for one
     */
    public record Incoming(
            UUID entityId,
            Enums.DocumentType documentType,
            String fileName,
            String contentType,
            byte[] content,
            Enums.DocumentSource source,
            String actorUid,
            String actorName,
            UUID submissionId,
            Enums.AgsaCriterion agsaCriterion,
            GraphRef graph,
            UUID targetId) {

        public static Incoming upload(UUID entityId, Enums.DocumentType type, String fileName,
                                      String contentType, byte[] content, VukaPrincipal who,
                                      UUID submissionId, Enums.AgsaCriterion criterion) {
            return new Incoming(entityId, type, fileName, contentType, content,
                    Enums.DocumentSource.VUKA_UPLOAD, who.uid(), who.name(), submissionId, criterion,
                    null, null);
        }

        /** Evidence offered against one indicator, for one of the Auditor-General's tests or none. */
        public static Incoming evidence(UUID entityId, UUID targetId, String fileName, String contentType,
                                        byte[] content, VukaPrincipal who, UUID submissionId,
                                        Enums.AgsaCriterion criterion) {
            return new Incoming(entityId, Enums.DocumentType.QUARTERLY_REPORT, fileName, contentType,
                    content, Enums.DocumentSource.VUKA_UPLOAD, who == null ? null : who.uid(),
                    who == null ? null : who.name(), submissionId, criterion, null, targetId);
        }

        public static Incoming fromMicrosoft(UUID entityId, Enums.DocumentType type, String fileName,
                                             String contentType, byte[] content, String actorName,
                                             GraphRef graph) {
            return new Incoming(entityId, type, fileName, contentType, content,
                    Enums.DocumentSource.MICROSOFT_365, null, actorName, null, null, graph, null);
        }
    }

    /** Where a version sits in a Microsoft drive. */
    public record GraphRef(String driveId, String itemId, String versionLabel, String webUrl) {}

    /**
     * The outcome of an arrival.
     *
     * @param record     the version in force for the key afterwards
     * @param newVersion false where the bytes were identical and nothing was versioned
     */
    public record Stored(DocumentRecord record, boolean newVersion) {}

    // ------------------------------------------------------------------
    // The write path
    // ------------------------------------------------------------------

    @Transactional
    public Stored store(Incoming incoming) {
        String key = incoming.targetId() != null
                ? evidenceKey(incoming.targetId(), incoming.agsaCriterion(), incoming.fileName())
                : documentKey(incoming.documentType(), incoming.fileName());
        return storeAtKey(incoming, key);
    }

    /**
     * Stores at an explicit key, which the Microsoft poller needs: a file saved in SharePoint is
     * identified by its path in the library, not by a type we would have to guess twice.
     */
    @Transactional
    public Stored storeAtKey(Incoming incoming, String key) {
        String digest = DocumentStore.hash(incoming.content());

        DocumentRecord current = documents
                .findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(incoming.entityId(), key)
                .orElse(null);

        if (current != null && digest.equals(current.getContentHash())) {
            // Same bytes. Not a new version of anything. Graph identity may still be news: this
            // is the branch that runs when our own mirrored upload comes back through delta.
            boolean touched = adoptGraphRef(current, incoming.graph());
            if (touched) documents.save(current);
            return new Stored(current, false);
        }

        String storagePath = store.store(incoming.entityId(), incoming.content());

        if (current != null) {
            current.setSupersededOn(Instant.now());
            // Flushed now, and not at the end of the transaction, because the insert below would
            // otherwise be ordered first and meet a still-current row on the unique index.
            documents.saveAndFlush(current);
        }

        DocumentRecord version = new DocumentRecord();
        version.setEntity(entities.findById(incoming.entityId()).orElseThrow());
        version.setSubmission(incoming.submissionId() == null
                ? null
                : submissions.findById(incoming.submissionId()).orElse(null));
        version.setDocumentType(incoming.documentType());
        version.setTarget(incoming.targetId() == null ? null : targets.findById(incoming.targetId()).orElse(null));
        version.setDocumentKey(key);
        version.setFileName(incoming.fileName());
        version.setContentType(incoming.contentType());
        version.setStoragePath(storagePath);
        version.setContentHash(digest);
        version.setSizeBytes(incoming.content().length);
        version.setVersion(current == null ? 1 : current.getVersion() + 1);
        version.setSupersedes(current);
        version.setSource(incoming.source());
        version.setUploadedByUid(incoming.actorUid());
        version.setUploadedAt(Instant.now());
        version.setReceivedAt(Instant.now());
        version.setAgsaCriterion(incoming.agsaCriterion());
        version.setApprovalStatus(Enums.ApprovalStatus.PENDING);
        version.setGraphSyncState(initialSyncState(incoming));
        adoptGraphRef(version, incoming.graph());

        documents.save(version);
        version.setReceiptNumber(receiptNumber(version));
        documents.save(version);

        log.info("Document {} version {} for entity {} ({}), {} bytes",
                key, version.getVersion(), incoming.entityId(), incoming.source(), version.getSizeBytes());

        return new Stored(version, true);
    }

    /**
     * A named DSAC officer accepts or rejects a version.
     *
     * <p>Separate from the receipt on purpose. The receipt is automatic and says the file
     * arrived; this says the department accepts it, and it carries who and when. A rejection
     * without a reason is not actionable by the entity, so the reason is required.
     */
    @Transactional
    public DocumentRecord decide(UUID documentId, boolean approve, String note, VukaPrincipal who) {
        DocumentRecord doc = documents.findById(documentId).orElseThrow();
        if (!approve && (note == null || note.isBlank())) {
            throw new IllegalArgumentException("A rejection must carry a reason.");
        }
        doc.setApprovalStatus(approve ? Enums.ApprovalStatus.APPROVED : Enums.ApprovalStatus.REJECTED);
        doc.setDecidedByUid(who.uid());
        doc.setDecidedByName(who.name());
        doc.setDecidedAt(Instant.now());
        doc.setDecisionNote(note);
        return documents.save(doc);
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    /** Current versions only. The workspace file list. */
    public List<DocumentRecord> currentDocuments(UUID entityId) {
        return documents.findByEntityIdAndSupersededOnIsNullOrderByUploadedAtDesc(entityId);
    }

    /** Every version of one document, newest first. */
    public List<DocumentRecord> history(UUID entityId, String documentKey) {
        return documents.findByEntityIdAndDocumentKeyIgnoreCaseOrderByVersionDesc(entityId, documentKey);
    }

    public Optional<DocumentRecord> find(UUID documentId) {
        return documents.findById(documentId);
    }

    public byte[] content(DocumentRecord doc) {
        return store.read(doc.getStoragePath());
    }

    // ------------------------------------------------------------------
    // Keys and receipts
    // ------------------------------------------------------------------

    /**
     * The workspace path a document is filed under, and the identity of its version chain.
     *
     * <p>The folder is the document type, so the library a DSAC officer opens in SharePoint has
     * the same shape as the repository requirement (c) asks for. Case is preserved here and
     * ignored everywhere identity is decided, which is how SharePoint itself behaves: two
     * reporters uploading {@code Annual Report.pdf} and {@code annual report.pdf} mean one
     * document and must not produce two chains.
     */
    public static String documentKey(Enums.DocumentType type, String fileName) {
        String folder = type == null ? "UNFILED" : type.name();
        return folder + "/" + safeName(fileName);
    }

    /**
     * The key for evidence offered against one indicator.
     *
     * <p>The target and the criterion are part of the identity. One file offered for validity and
     * for completeness on the same indicator is two claims about it, and a re-upload for one test
     * must version that claim without superseding the other. The target is by id rather than by
     * indicator reference because a revised target is a new row, and evidence for version 1 of a
     * target is not evidence for version 2.
     */
    public static String evidenceKey(UUID targetId, Enums.AgsaCriterion criterion, String fileName) {
        return "EVIDENCE/" + targetId + "/" + (criterion == null ? "UNTAGGED" : criterion.name())
                + "/" + safeName(fileName);
    }

    /** A file name safe in a SharePoint library and in a URL path segment. */
    public static String safeName(String fileName) {
        String base = fileName == null || fileName.isBlank() ? "document" : fileName;
        // Anything before the last separator is the uploader's local directory structure and is
        // none of our business; a multipart part can carry one and a browser sometimes does.
        int cut = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        if (cut >= 0 && cut < base.length() - 1) base = base.substring(cut + 1);
        base = base.replaceAll(ILLEGAL_IN_NAME, "-").replaceAll("\\s+", " ").trim();
        if (base.startsWith(".")) base = "document" + base;
        return base.isBlank() ? "document" : base;
    }

    /**
     * A reference the reporter can quote in an email or read down a phone.
     *
     * <p>Derived from the row rather than drawn from a sequence, so two instances issuing
     * receipts at the same moment cannot collide, and so a receipt can be tied back to its row
     * without a lookup table.
     */
    private static String receiptNumber(DocumentRecord doc) {
        String day = RECEIPT_DAY.format(doc.getReceivedAt() == null ? Instant.now() : doc.getReceivedAt());
        String tail = doc.getId().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
        return "VK-" + day + "-" + tail;
    }

    /** PENDING only where there is somewhere to push to. Otherwise the state says so plainly. */
    private Enums.GraphSyncState initialSyncState(Incoming incoming) {
        if (incoming.source() == Enums.DocumentSource.MICROSOFT_365) return Enums.GraphSyncState.SOURCE;
        return workspaces.findByEntityId(incoming.entityId())
                .filter(EntityWorkspace::isBoundToMicrosoft)
                .map(w -> Enums.GraphSyncState.PENDING)
                .orElse(Enums.GraphSyncState.NOT_CONFIGURED);
    }

    /** Copies Microsoft identity onto a row. Returns true where anything changed. */
    private boolean adoptGraphRef(DocumentRecord doc, GraphRef ref) {
        if (ref == null) return false;
        boolean changed = false;
        if (ref.driveId() != null && !ref.driveId().equals(doc.getGraphDriveId())) {
            doc.setGraphDriveId(ref.driveId());
            changed = true;
        }
        if (ref.itemId() != null && !ref.itemId().equals(doc.getGraphItemId())) {
            doc.setGraphItemId(ref.itemId());
            changed = true;
        }
        if (ref.versionLabel() != null && !ref.versionLabel().equals(doc.getGraphVersionLabel())) {
            doc.setGraphVersionLabel(ref.versionLabel());
            changed = true;
        }
        if (ref.webUrl() != null && !ref.webUrl().equals(doc.getGraphWebUrl())) {
            doc.setGraphWebUrl(ref.webUrl());
            changed = true;
        }
        if (changed) {
            doc.setGraphSyncedAt(Instant.now());
            doc.setGraphSyncError(null);
            if (doc.getGraphSyncState() != Enums.GraphSyncState.SOURCE) {
                doc.setGraphSyncState(Enums.GraphSyncState.SYNCED);
            }
        }
        return changed;
    }
}
