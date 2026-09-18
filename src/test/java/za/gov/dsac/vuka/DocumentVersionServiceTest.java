package za.gov.dsac.vuka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.DocumentStore;
import za.gov.dsac.vuka.service.DocumentVersionService;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Version control of documents, which is the half of requirement (d) that is a claim about data
 * rather than about a screen. Each of these encodes something the workspace says out loud.
 *
 * <p>The repositories are mocked and the store is real, on a temporary directory, because the
 * behaviour under test is the version chain and the content comparison rather than the mapping.
 */
class DocumentVersionServiceTest {

    private static final VukaPrincipal REPORTER =
            new VukaPrincipal("uid-1", "reporter@entity.org.za", "A Reporter", "ENTITY_REPORTER", null);

    private final UUID entityId = UUID.randomUUID();

    private DocumentRecordRepository documents;
    private EntityWorkspaceRepository workspaces;
    private DocumentVersionService service;

    /** Whatever the service saved, in the order it saved it. */
    private final List<DocumentRecord> saved = new ArrayList<>();

    @BeforeEach
    void setUp(@TempDir Path root) {
        documents = mock(DocumentRecordRepository.class);
        workspaces = mock(EntityWorkspaceRepository.class);
        PublicEntityRepository entities = mock(PublicEntityRepository.class);
        SubmissionRepository submissions = mock(SubmissionRepository.class);

        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);
        entity.setShortName("Test entity");
        when(entities.findById(entityId)).thenReturn(Optional.of(entity));
        when(workspaces.findByEntityId(entityId)).thenReturn(Optional.empty());

        // Stands in for the database generating an id on insert, which the receipt number needs.
        when(documents.save(any())).thenAnswer(invocation -> {
            DocumentRecord d = invocation.getArgument(0);
            if (d.getId() == null) d.setId(UUID.randomUUID());
            saved.add(d);
            return d;
        });
        when(documents.saveAndFlush(any())).thenAnswer(invocation -> {
            DocumentRecord d = invocation.getArgument(0);
            saved.add(d);
            return d;
        });
        when(documents.findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(any(), anyString()))
                .thenReturn(Optional.empty());

        service = new DocumentVersionService(
                new DocumentStore(root.toString()), documents, entities, submissions, workspaces,
                mock(TargetRepository.class));
    }

    private DocumentVersionService.Incoming upload(String fileName, String body) {
        return DocumentVersionService.Incoming.upload(
                entityId, Enums.DocumentType.ANNUAL_REPORT, fileName, "application/pdf",
                body.getBytes(StandardCharsets.UTF_8), REPORTER, null, null);
    }

    @Test
    @DisplayName("A first upload is version 1, and it arrives with a receipt")
    void firstUploadIsVersionOne() {
        DocumentVersionService.Stored stored = service.store(upload("Annual report.pdf", "one"));

        assertTrue(stored.newVersion());
        DocumentRecord doc = stored.record();
        assertEquals(1, doc.getVersion());
        assertNull(doc.getSupersedes());
        assertTrue(doc.isCurrent());
        assertNotNull(doc.getReceivedAt());
        assertNotNull(doc.getReceiptNumber(), "a receipt is issued on arrival, not on approval");
        assertTrue(doc.getReceiptNumber().startsWith("VK-"));
        assertEquals(Enums.ApprovalStatus.PENDING, doc.getApprovalStatus());
        assertNull(doc.getDecidedAt(), "a receipt is not a departmental decision");
        assertEquals(64, doc.getContentHash().length(), "SHA-256 in hex");
    }

    @Test
    @DisplayName("Re-uploading the same bytes does not open a version")
    void identicalBytesDoNotVersion() {
        DocumentRecord first = service.store(upload("Annual report.pdf", "one")).record();
        when(documents.findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(
                eq(entityId), anyString())).thenReturn(Optional.of(first));

        DocumentVersionService.Stored again = service.store(upload("Annual report.pdf", "one"));

        assertFalse(again.newVersion());
        assertEquals(first.getId(), again.record().getId());
        assertEquals(1, again.record().getVersion());
    }

    @Test
    @DisplayName("Changed bytes open the next version and supersede the one before it")
    void changedBytesVersion() {
        DocumentRecord first = service.store(upload("Annual report.pdf", "one")).record();
        when(documents.findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(
                eq(entityId), anyString())).thenReturn(Optional.of(first));

        DocumentRecord second = service.store(upload("Annual report.pdf", "two")).record();

        assertEquals(2, second.getVersion());
        assertSame(first, second.getSupersedes());
        assertNotNull(first.getSupersededOn(), "the earlier version is closed, not overwritten");
        assertTrue(second.isCurrent());
        assertNotEquals(first.getContentHash(), second.getContentHash());
    }

    @Test
    @DisplayName("The supersede is flushed before the new version is inserted")
    void supersedeIsFlushedFirst() {
        DocumentRecord first = service.store(upload("Annual report.pdf", "one")).record();
        when(documents.findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(
                eq(entityId), anyString())).thenReturn(Optional.of(first));

        service.store(upload("Annual report.pdf", "two"));

        // Not a style point. The partial unique index allows one current version per key, and
        // Hibernate orders inserts before updates within a flush, so a correct sequence of calls
        // fails on a correct constraint unless the supersede is pushed out first.
        InOrder order = inOrder(documents);
        order.verify(documents).saveAndFlush(first);
        order.verify(documents, atLeastOnce()).save(any());
    }

    @Test
    @DisplayName("A save in Microsoft 365 is versioned exactly like an upload, and says where it came from")
    void microsoftSaveIsAVersion() {
        DocumentRecord first = service.store(upload("Annual report.pdf", "one")).record();
        when(documents.findByEntityIdAndDocumentKeyIgnoreCaseAndSupersededOnIsNull(
                eq(entityId), anyString())).thenReturn(Optional.of(first));

        var fromSharePoint = DocumentVersionService.Incoming.fromMicrosoft(
                entityId, Enums.DocumentType.ANNUAL_REPORT, "Annual report.pdf", "application/pdf",
                "corrected".getBytes(StandardCharsets.UTF_8), "T Ndlovu",
                new DocumentVersionService.GraphRef("drive-1", "item-1", "3.0", "https://example/x"));

        DocumentRecord version = service.storeAtKey(fromSharePoint, first.getDocumentKey()).record();

        assertEquals(2, version.getVersion());
        assertEquals(Enums.DocumentSource.MICROSOFT_365, version.getSource());
        assertEquals(Enums.GraphSyncState.SOURCE, version.getGraphSyncState(),
                "bytes that came from the drive are never pushed back to it");
        assertEquals("item-1", version.getGraphItemId());
        assertEquals("3.0", version.getGraphVersionLabel());
    }

    @Test
    @DisplayName("With no tenant bound, a document says so rather than sitting in a queue forever")
    void noTenantIsNotAFailure() {
        DocumentRecord doc = service.store(upload("Annual report.pdf", "one")).record();
        assertEquals(Enums.GraphSyncState.NOT_CONFIGURED, doc.getGraphSyncState());
    }

    @Test
    @DisplayName("A bound workspace queues the upload for mirroring")
    void boundWorkspaceQueuesTheUpload() {
        EntityWorkspace workspace = new EntityWorkspace();
        workspace.setDriveId("drive-1");
        workspace.setFolderPath("Vuka");
        when(workspaces.findByEntityId(entityId)).thenReturn(Optional.of(workspace));

        DocumentRecord doc = service.store(upload("Annual report.pdf", "one")).record();
        assertEquals(Enums.GraphSyncState.PENDING, doc.getGraphSyncState());
    }

    @Test
    @DisplayName("The key is the type folder and a safe file name, and case never forks the chain")
    void keysAreStable() {
        assertEquals("ANNUAL_REPORT/annual report.pdf",
                DocumentVersionService.documentKey(Enums.DocumentType.ANNUAL_REPORT, "annual report.pdf"));

        // The lookup that decides identity ignores case, so these two are one document. The key
        // keeps its own case so the folder reads properly in SharePoint.
        assertTrue(DocumentVersionService.documentKey(Enums.DocumentType.ANNUAL_REPORT, "Annual Report.pdf")
                .equalsIgnoreCase(
                        DocumentVersionService.documentKey(Enums.DocumentType.ANNUAL_REPORT, "annual report.pdf")));

        assertEquals("FINANCIALS/report.pdf",
                DocumentVersionService.documentKey(Enums.DocumentType.FINANCIALS, "C:\\Users\\me\\report.pdf"),
                "an uploader's local directory structure is none of our business");
        String awkward = DocumentVersionService.documentKey(
                Enums.DocumentType.QUARTERLY_REPORT, "q1?report*|financials<>.xlsx");
        assertEquals("QUARTERLY_REPORT/", awkward.substring(0, awkward.indexOf('/') + 1));
        assertFalse(awkward.substring(awkward.indexOf('/') + 1).matches(".*[\\\\:*?\"<>|#%].*"),
                "characters SharePoint refuses never reach it");
    }

    @Test
    @DisplayName("A rejection must carry a reason")
    void rejectionNeedsAReason() {
        DocumentRecord doc = service.store(upload("Annual report.pdf", "one")).record();
        when(documents.findById(doc.getId())).thenReturn(Optional.of(doc));

        VukaPrincipal reviewer =
                new VukaPrincipal("uid-2", "r@dsac.gov.za", "A Reviewer", "DSAC_REVIEWER", null);

        assertThrows(IllegalArgumentException.class,
                () -> service.decide(doc.getId(), false, "  ", reviewer));

        DocumentRecord approved = service.decide(doc.getId(), true, null, reviewer);
        assertEquals(Enums.ApprovalStatus.APPROVED, approved.getApprovalStatus());
        assertEquals("A Reviewer", approved.getDecidedByName());
        assertNotNull(approved.getDecidedAt());
    }
}
