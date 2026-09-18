package za.gov.dsac.vuka.service.microsoft;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * What Vuka needs to talk to a public entity's Microsoft 365 tenant.
 *
 * <h2>Application permissions, and why they are the smallest set that works</h2>
 *
 * The app registration needs {@code Files.ReadWrite.All} or, where the workspaces are SharePoint
 * document libraries rather than OneDrive, {@code Sites.ReadWrite.All}, granted as application
 * permissions with tenant admin consent. It does not need {@code Sites.FullControl.All}, it does
 * not need mail or calendar, and it does not need any directory read: nothing here enumerates
 * people. Where a tenant wants the blast radius smaller still, {@code Sites.Selected} plus a
 * per-site grant restricts the app to exactly the libraries the department has been given, which
 * is the configuration to ask for in a real deployment and is worth saying out loud in a room
 * that contains a security officer.
 *
 * <h2>The secret is read from a file</h2>
 *
 * Same rule as the Firebase web API key: the path is configuration, the value is not, so the
 * secret never appears in an environment variable, a process listing, a container image layer or
 * a crash dump of the environment. On Azure or GCP the file is a mounted secret.
 *
 * <p>Nothing is configured by default, and that is a supported state rather than a broken one:
 * the workspace, its documents, its version chain, its comments and its tasks all work with no
 * tenant at all, and the integration reports itself as not configured.
 */
@Component
@ConfigurationProperties(prefix = "vuka.microsoft")
public class MicrosoftGraphProperties {

    /** Directory (tenant) id of the entity's Microsoft 365 tenant. */
    private String tenantId = "";

    /** Application (client) id of the Vuka app registration. */
    private String clientId = "";

    /** Path to a file holding the client secret. Not the secret itself. */
    private String clientSecretPath = "";

    /** Overridable so a test or an air-gapped deployment can point at something else. */
    private String graphBaseUrl = "https://graph.microsoft.com/v1.0";

    private String loginBaseUrl = "https://login.microsoftonline.com";

    /** Turns the background poller off without unconfiguring the tenant. */
    private boolean syncEnabled = true;

    /** How many changed files one poll will pull down. A cap, so one poll cannot run for an hour. */
    private int maxFilesPerSync = 50;

    /** Largest file Vuka will pull out of a drive. Matches the multipart limit. */
    private long maxFileBytes = 15L * 1024 * 1024;

    public boolean isConfigured() {
        return notBlank(tenantId) && notBlank(clientId) && notBlank(clientSecretPath);
    }

    /** Reads the secret at the moment it is needed, so a rotated secret does not need a restart. */
    public String clientSecret() {
        try {
            return Files.readString(Path.of(clientSecretPath), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the Microsoft client secret file", e);
        }
    }

    public String tokenEndpoint() {
        return loginBaseUrl + "/" + tenantId + "/oauth2/v2.0/token";
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getClientSecretPath() { return clientSecretPath; }
    public void setClientSecretPath(String clientSecretPath) { this.clientSecretPath = clientSecretPath; }

    public String getGraphBaseUrl() { return graphBaseUrl; }
    public void setGraphBaseUrl(String graphBaseUrl) { this.graphBaseUrl = graphBaseUrl; }

    public String getLoginBaseUrl() { return loginBaseUrl; }
    public void setLoginBaseUrl(String loginBaseUrl) { this.loginBaseUrl = loginBaseUrl; }

    public boolean isSyncEnabled() { return syncEnabled; }
    public void setSyncEnabled(boolean syncEnabled) { this.syncEnabled = syncEnabled; }

    public int getMaxFilesPerSync() { return maxFilesPerSync; }
    public void setMaxFilesPerSync(int maxFilesPerSync) { this.maxFilesPerSync = maxFilesPerSync; }

    public long getMaxFileBytes() { return maxFileBytes; }
    public void setMaxFileBytes(long maxFileBytes) { this.maxFileBytes = maxFileBytes; }
}
