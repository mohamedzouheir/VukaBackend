package za.gov.dsac.vuka.service.microsoft;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.DocumentVersionService;

import java.time.Instant;
import java.util.*;

/**
 * Keeps an entity's Vuka workspace and its Microsoft 365 folder saying the same thing.
 *
 * <h2>Two directions, one rule</h2>
 *
 * <pre>
 *   upload in Vuka   -&gt; mirrored into the bound drive, SharePoint records its own version
 *   save in Microsoft -&gt; delta poll picks it up, Vuka opens a version and issues a receipt
 * </pre>
 *
 * Both directions end in {@link DocumentVersionService}, which versions a document only when its
 * bytes changed. That single rule is what stops the two directions from feeding each other: Vuka
 * mirrors an upload, Graph reports that mirrored file as a change, the poller downloads it, the
 * hash matches, and nothing is versioned. Without it the loop never terminates.
 *
 * <h2>Why polling rather than change notifications</h2>
 *
 * Graph can push change notifications to a subscribed URL, and in a permanent deployment that is
 * the right answer. It needs a public HTTPS endpoint Microsoft can reach and a validation
 * handshake, which is a dependency on inbound connectivity that a demonstration should not have.
 * Delta polling needs nothing but an outbound connection, costs one request per workspace per
 * interval when nothing has changed, and produces identical results a few minutes later. The
 * upgrade path is a subscription that calls {@link #pullChanges()} instead of the timer.
 *
 * <h2>What happens with no tenant configured</h2>
 *
 * Nothing, loudly. Every scheduled method returns immediately, every document keeps the
 * {@code NOT_CONFIGURED} sync state, and the workspace works exactly as it does with a tenant
 * minus the mirroring. This is the state most demonstrations run in and it is not a failure.
 */
@Service
public class MicrosoftWorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(MicrosoftWorkspaceService.class);

    /** Retried as well as first attempts, because a tenant that was down for an hour is the normal failure. */
    private static final List<Enums.GraphSyncState> MIRRORABLE =
            List.of(Enums.GraphSyncState.PENDING, Enums.GraphSyncState.FAILED);

    private final MicrosoftGraphClient graph;
    private final MicrosoftGraphProperties props;
    private final EntityWorkspaceRepository workspaces;
    private final DocumentRecordRepository documents;
    private final DocumentVersionService versions;
    private final PublicEntityRepository entities;

    public MicrosoftWorkspaceService(MicrosoftGraphClient graph, MicrosoftGraphProperties props,
                                     EntityWorkspaceRepository workspaces,
                                     DocumentRecordRepository documents,
                                     DocumentVersionService versions,
                                     PublicEntityRepository entities) {
        this.graph = graph;
        this.props = props;
        this.workspaces = workspaces;
        this.documents = documents;
        this.versions = versions;
        this.entities = entities;
    }

    // ------------------------------------------------------------------
    // Binding
    // ------------------------------------------------------------------

    /** The entity's workspace, created on first use. A workspace with no drive is a normal workspace. */
    @Transactional
    public EntityWorkspace workspaceFor(UUID entityId) {
        return workspaces.findByEntityId(entityId).orElseGet(() -> {
            EntityWorkspace w = new EntityWorkspace();
            w.setEntity(entities.findById(entityId).orElseThrow());
            w.setFolderPath("Vuka");
            w.setCreatedAt(Instant.now());
            return workspaces.save(w);
        });
    }

    /**
     * Binds a workspace to a SharePoint document library.
     *
     * <p>Either a drive id directly, or a site addressed the way a person would write it down,
     * which is what an administrator will actually have in front of them: the hostname and the
     * site path out of the browser address bar.
     */
    @Transactional
    public EntityWorkspace bind(UUID entityId, String driveId, String siteHostname, String sitePath,
                                String folderPath) {
        EntityWorkspace workspace = workspaceFor(entityId);
        String resolved = driveId;
        if ((resolved == null || resolved.isBlank()) && siteHostname != null && sitePath != null) {
            resolved = graph.resolveDriveIdForSite(siteHostname, sitePath);
        }
        if (resolved == null || resolved.isBlank()) {
            throw new IllegalArgumentException("Supply a driveId, or a site hostname and path.");
        }
        workspace.setDriveId(resolved);
        if (folderPath != null && !folderPath.isBlank()) {
            workspace.setFolderPath(MicrosoftGraphClient.trimSlashes(folderPath));
        }
        // A rebind starts from the beginning of the new drive rather than from a cursor issued
        // against the old one, which Graph would reject anyway.
        workspace.setDeltaLink(null);
        workspace.setLastSyncError(null);
        workspaces.save(workspace);

        // Everything already held for this entity now has somewhere to go.
        for (DocumentRecord doc : documents.findByEntityIdAndSupersededOnIsNullOrderByUploadedAtDesc(entityId)) {
            if (doc.getGraphSyncState() == Enums.GraphSyncState.NOT_CONFIGURED) {
                doc.setGraphSyncState(Enums.GraphSyncState.PENDING);
                documents.save(doc);
            }
        }
        log.info("Entity {} bound to drive {} folder {}", entityId, resolved, workspace.getFolderPath());
        return workspace;
    }

    /** Where the entity's Teams countdown goes. Written, never read back over the API. */
    @Transactional
    public void setTeamsWebhook(UUID entityId, String webhookUrl) {
        EntityWorkspace workspace = workspaceFor(entityId);
        workspace.setTeamsWebhookUrl(webhookUrl == null || webhookUrl.isBlank() ? null : webhookUrl.trim());
        workspaces.save(workspace);
    }

    // ------------------------------------------------------------------
    // Vuka -> Microsoft
    // ------------------------------------------------------------------

    /** Pushes everything queued. Runs a minute after the last run finished, not on a fixed clock. */
    @Scheduled(fixedDelayString = "${vuka.microsoft.mirror-interval-ms:60000}", initialDelay = 20000)
    public void mirrorPending() {
        if (!enabled()) return;
        List<DocumentRecord> queue = documents.findByGraphSyncStateInOrderByUploadedAtAsc(MIRRORABLE);
        int done = 0;
        for (DocumentRecord doc : queue) {
            if (done >= props.getMaxFilesPerSync()) break;
            mirror(doc.getId());
            done++;
        }
        if (done > 0) log.info("Mirrored {} document version(s) to Microsoft 365", done);
    }

    /**
     * Pushes one version into the bound drive.
     *
     * <p>A failure is written onto the row and left there. The document is still in Vuka, still
     * versioned, still has a receipt; what failed is the copy in SharePoint, and the next run
     * tries again. Losing the upload because the mirror failed would be the wrong trade.
     */
    @Transactional
    public void mirror(UUID documentId) {
        DocumentRecord doc = documents.findById(documentId).orElse(null);
        if (doc == null) return;

        EntityWorkspace workspace = workspaces.findByEntityId(doc.getEntity().getId()).orElse(null);
        if (workspace == null || !workspace.isBoundToMicrosoft()) {
            doc.setGraphSyncState(Enums.GraphSyncState.NOT_CONFIGURED);
            documents.save(doc);
            return;
        }

        try {
            byte[] content = versions.content(doc);
            String drivePath = workspace.drivePathFor(doc.getDocumentKey());
            MicrosoftGraphClient.DriveItem item =
                    graph.putFile(workspace.getDriveId(), drivePath, content, doc.getContentType());

            doc.setGraphDriveId(workspace.getDriveId());
            doc.setGraphItemId(item.id());
            doc.setGraphWebUrl(item.webUrl());
            graph.latestVersionLabel(workspace.getDriveId(), item.id()).ifPresent(doc::setGraphVersionLabel);
            doc.setGraphSyncedAt(Instant.now());
            doc.setGraphSyncState(Enums.GraphSyncState.SYNCED);
            doc.setGraphSyncError(null);
        } catch (RuntimeException e) {
            doc.setGraphSyncState(Enums.GraphSyncState.FAILED);
            doc.setGraphSyncError(truncate(e.getMessage()));
            log.warn("Mirroring {} failed: {}", doc.getDocumentKey(), e.getMessage());
        }
        documents.save(doc);
    }

    // ------------------------------------------------------------------
    // Microsoft -> Vuka
    // ------------------------------------------------------------------

    /** Asks every bound drive what changed. This is the "triggered at save" half of the requirement. */
    @Scheduled(fixedDelayString = "${vuka.microsoft.poll-interval-ms:300000}", initialDelay = 30000)
    public void pullChanges() {
        if (!enabled()) return;
        for (EntityWorkspace workspace : workspaces.findByDriveIdIsNotNull()) {
            try {
                int picked = pull(workspace.getId());
                if (picked > 0) log.info("Picked up {} change(s) from drive {}", picked, workspace.getDriveId());
            } catch (RuntimeException e) {
                log.warn("Delta sync failed for entity {}: {}",
                        workspace.getEntity().getId(), e.getMessage());
                recordSyncError(workspace.getId(), e.getMessage());
            }
        }
    }

    /**
     * Reads one workspace's changes and versions the ones that are documents.
     *
     * <p>The cursor is stored only once the page has been processed. A crash halfway through
     * means the same page is read again next time, and a re-read of an unchanged file versions
     * nothing, so at-least-once delivery is safe here by construction.
     */
    @Transactional
    public int pull(UUID workspaceId) {
        EntityWorkspace workspace = workspaces.findById(workspaceId).orElseThrow();
        if (!workspace.isBoundToMicrosoft()) return 0;

        UUID entityId = workspace.getEntity().getId();
        String cursor = workspace.getDeltaLink();
        int picked = 0;
        int pages = 0;

        while (true) {
            MicrosoftGraphClient.DeltaPage page = graph.delta(workspace.getDriveId(), cursor);

            for (MicrosoftGraphClient.DriveItem item : page.items()) {
                if (picked >= props.getMaxFilesPerSync()) break;
                if (ingest(entityId, workspace, item)) picked++;
            }

            if (page.deltaLink() != null) {
                workspace.setDeltaLink(page.deltaLink());
                break;
            }
            if (page.nextLink() == null || picked >= props.getMaxFilesPerSync() || ++pages > 20) {
                // Out of budget for this run. The cursor is left where it was, so the next run
                // re-reads from there rather than skipping what we did not get to.
                break;
            }
            cursor = page.nextLink();
        }

        workspace.setLastSyncedAt(Instant.now());
        workspace.setLastSyncError(null);
        workspaces.save(workspace);
        return picked;
    }

    /** One changed drive item. Returns true where it became a version here. */
    private boolean ingest(UUID entityId, EntityWorkspace workspace, MicrosoftGraphClient.DriveItem item) {
        if (item.folder() || item.name() == null) return false;

        if (item.deleted()) {
            // A file deleted in SharePoint is not deleted here. The version chain is the audit
            // record, and a document that can be removed from the record by deleting it in
            // OneDrive is not a document repository. It is noted and left alone.
            log.info("Drive item {} was deleted in Microsoft 365; the Vuka version chain is unchanged",
                    item.name());
            return false;
        }

        String key = keyWithin(workspace, item);
        if (key == null) return false;

        if (item.size() > props.getMaxFileBytes()) {
            log.warn("Skipping {} from Microsoft 365: {} bytes is over the {} byte limit",
                    key, item.size(), props.getMaxFileBytes());
            return false;
        }

        byte[] content = graph.download(item, workspace.getDriveId());
        var incoming = DocumentVersionService.Incoming.fromMicrosoft(
                entityId,
                typeFromKey(key),
                item.name(),
                item.mimeType(),
                content,
                item.lastModifiedBy() == null ? "Microsoft 365" : item.lastModifiedBy(),
                new DocumentVersionService.GraphRef(
                        workspace.getDriveId(), item.id(), null, item.webUrl()));

        DocumentVersionService.Stored stored = versions.storeAtKey(incoming, key);
        if (stored.newVersion()) {
            graph.latestVersionLabel(workspace.getDriveId(), item.id())
                 .ifPresent(label -> {
                     stored.record().setGraphVersionLabel(label);
                     documents.save(stored.record());
                 });
        }
        return stored.newVersion();
    }

    /**
     * The document key for a drive item, or null where the item is outside the workspace folder.
     *
     * <p>An entity's SharePoint site holds everything the entity does. Only the bound folder is
     * reporting evidence, and pulling the rest of the library into a departmental system would be
     * both a surprise and a privacy problem.
     */
    private String keyWithin(EntityWorkspace workspace, MicrosoftGraphClient.DriveItem item) {
        String path = item.drivePath();
        String folder = MicrosoftGraphClient.trimSlashes(
                workspace.getFolderPath() == null ? "" : workspace.getFolderPath());
        if (folder.isEmpty()) return path;
        String prefix = folder + "/";
        if (!path.toLowerCase(Locale.ROOT).startsWith(prefix.toLowerCase(Locale.ROOT))) return null;
        String key = path.substring(prefix.length());
        return key.isBlank() ? null : key;
    }

    /** Reads the document type out of the first folder, where a reporter filed it under one. */
    private Enums.DocumentType typeFromKey(String key) {
        int slash = key.indexOf('/');
        if (slash <= 0) return null;
        String folder = key.substring(0, slash).toUpperCase(Locale.ROOT).replace(' ', '_');
        try {
            return Enums.DocumentType.valueOf(folder);
        } catch (IllegalArgumentException e) {
            // A folder of their own making. The file is still evidence and still versioned; it
            // simply is not one of the filings the challenge names, and guessing would be worse.
            return null;
        }
    }

    @Transactional
    public void recordSyncError(UUID workspaceId, String message) {
        workspaces.findById(workspaceId).ifPresent(w -> {
            w.setLastSyncError(truncate(message));
            workspaces.save(w);
        });
    }

    // ------------------------------------------------------------------
    // Status
    // ------------------------------------------------------------------

    /**
     * What the integration is doing, in the form a person asks about it.
     *
     * @param configured  a tenant, client id and secret are present
     * @param syncEnabled the poller is switched on
     * @param boundDrives how many entities have a drive
     * @param pending     versions queued to be mirrored
     * @param failed      versions whose last mirror attempt failed
     */
    public record Status(boolean configured, boolean syncEnabled, long boundDrives,
                         long pending, long failed) {}

    public Status status() {
        return new Status(
                graph.isConfigured(),
                props.isSyncEnabled(),
                workspaces.findByDriveIdIsNotNull().size(),
                documents.findByGraphSyncStateInOrderByUploadedAtAsc(
                        List.of(Enums.GraphSyncState.PENDING)).size(),
                documents.findByGraphSyncStateInOrderByUploadedAtAsc(
                        List.of(Enums.GraphSyncState.FAILED)).size());
    }

    private boolean enabled() {
        return props.isSyncEnabled() && graph.isConfigured();
    }

    private static String truncate(String message) {
        if (message == null) return null;
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }
}
