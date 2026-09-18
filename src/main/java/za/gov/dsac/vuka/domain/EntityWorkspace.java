package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * An entity's workspace, and the binding between it and Microsoft 365 where one exists.
 *
 * <p>The challenge asks for workspaces that "seamlessly integrate with Microsoft Technologies".
 * The integration this models is the one public entities actually have: a SharePoint document
 * library or a OneDrive folder that their staff already save into from Word, Excel and Teams.
 * Vuka binds to that folder rather than asking anyone to stop using it, so a save there becomes
 * a version here, and an upload here appears there.
 *
 * <p>A workspace with a null {@link #driveId} is not a broken workspace. It is an entity whose
 * documents live only in Vuka, which is every entity on a deployment with no tenant configured,
 * and the whole document surface works that way.
 */
@Entity
@Table(name = "entity_workspace")
public class EntityWorkspace {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id", nullable = false, unique = true)
    private PublicEntity entity;

    /** Microsoft Graph drive id of the bound document library. Null for a Vuka-only workspace. */
    @Column(name = "drive_id", length = 200)
    private String driveId;

    /** Folder inside that drive, relative to its root, with no leading or trailing slash. */
    @Column(name = "folder_path", length = 500)
    private String folderPath;

    /**
     * Graph's delta cursor for the bound drive.
     *
     * <p>This one opaque string is what makes "version control triggered at save" true rather
     * than aspirational: the poller asks Graph what changed since this cursor, and a file someone
     * saved in Teams five minutes ago comes back in that answer.
     */
    @Column(name = "delta_link", columnDefinition = "text")
    private String deltaLink;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    /** The last failure, kept visible rather than only logged. An integration silently not running is worse than one that says it is broken. */
    @Column(name = "last_sync_error", length = 1000)
    private String lastSyncError;

    /**
     * Incoming webhook for the entity's Teams channel.
     *
     * <p>A capability URL: anyone holding it can post to that channel. It is writable by an
     * administrator and never returned over the API, which is why there is no getter used by any
     * controller response.
     */
    @Column(name = "teams_webhook_url", length = 1000)
    private String teamsWebhookUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** True when there is a Microsoft drive to talk to. */
    public boolean isBoundToMicrosoft() {
        return driveId != null && !driveId.isBlank();
    }

    /** The full path of a workspace-relative key inside the bound drive. */
    public String drivePathFor(String documentKey) {
        String folder = folderPath == null || folderPath.isBlank() ? "" : folderPath + "/";
        return folder + documentKey;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }

    public String getDriveId() { return driveId; }
    public void setDriveId(String driveId) { this.driveId = driveId; }

    public String getFolderPath() { return folderPath; }
    public void setFolderPath(String folderPath) { this.folderPath = folderPath; }

    public String getDeltaLink() { return deltaLink; }
    public void setDeltaLink(String deltaLink) { this.deltaLink = deltaLink; }

    public Instant getLastSyncedAt() { return lastSyncedAt; }
    public void setLastSyncedAt(Instant lastSyncedAt) { this.lastSyncedAt = lastSyncedAt; }

    public String getLastSyncError() { return lastSyncError; }
    public void setLastSyncError(String lastSyncError) { this.lastSyncError = lastSyncError; }

    public String getTeamsWebhookUrl() { return teamsWebhookUrl; }
    public void setTeamsWebhookUrl(String teamsWebhookUrl) { this.teamsWebhookUrl = teamsWebhookUrl; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
