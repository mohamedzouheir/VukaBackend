package za.gov.dsac.vuka.service.microsoft;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriUtils;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * The Microsoft Graph calls Vuka makes, and nothing else.
 *
 * <h2>Scope</h2>
 *
 * Five operations: get a token, resolve a site's document library, put a file into a drive, read
 * a drive's changes since last time, and read a file's SharePoint version label. That is the
 * whole surface. There is no Graph SDK dependency because five REST calls do not justify one,
 * and because a reader can check each of these URLs against Microsoft's published reference in
 * about a minute, which is a property worth having in a system whose pitch is that its claims are
 * checkable.
 *
 * <h2>Client credentials, not a signed-in user</h2>
 *
 * Vuka talks to the drive as an application, with admin-consented application permissions. The
 * alternative, acting as the signed-in reporter, would mean the poller stops working the moment
 * that person is on leave, and would tie a departmental record to one employee's session. The
 * cost is that the drive sees "Vuka" as the actor rather than a person, which is exactly why
 * every version row records the human separately.
 *
 * <h2>Failure</h2>
 *
 * Every method throws {@link GraphException} with the status and the first part of Graph's own
 * error body. Callers record that string on the document row rather than swallowing it, because
 * an integration that fails quietly is worse than one that is switched off.
 */
@Service
public class MicrosoftGraphClient {

    private static final Logger log = LoggerFactory.getLogger(MicrosoftGraphClient.class);

    /** Above this, Graph wants an upload session rather than a single PUT. */
    private static final long SIMPLE_UPLOAD_LIMIT = 4L * 1024 * 1024;

    /** Refresh a little before expiry so a long call cannot start on a token that dies mid-flight. */
    private static final Duration EXPIRY_MARGIN = Duration.ofMinutes(2);

    private final MicrosoftGraphProperties props;
    private final RestClient http = RestClient.builder().build();

    private volatile String cachedToken;
    private volatile Instant cachedTokenExpiry = Instant.EPOCH;

    public MicrosoftGraphClient(MicrosoftGraphProperties props) {
        this.props = props;
    }

    public boolean isConfigured() {
        return props.isConfigured();
    }

    /** A Graph call that did not succeed, carrying enough of the answer to act on. */
    public static class GraphException extends RuntimeException {
        public GraphException(String message) { super(message); }
        public GraphException(String message, Throwable cause) { super(message, cause); }
    }

    // ------------------------------------------------------------------
    // Token
    // ------------------------------------------------------------------

    /**
     * An application access token for Graph, cached until shortly before it expires.
     *
     * <p>Tokens last an hour. Fetching one per call would put a second round trip in front of
     * every file operation and would get the app throttled on a large library.
     */
    public synchronized String accessToken() {
        if (cachedToken != null && Instant.now().isBefore(cachedTokenExpiry)) return cachedToken;
        if (!props.isConfigured()) throw new GraphException("Microsoft 365 is not configured");

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", props.getClientId());
        form.add("client_secret", props.clientSecret());
        form.add("scope", "https://graph.microsoft.com/.default");
        form.add("grant_type", "client_credentials");

        try {
            JsonNode body = http.post()
                    .uri(URI.create(props.tokenEndpoint()))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            if (body == null || !body.hasNonNull("access_token")) {
                throw new GraphException("Token endpoint returned no access_token");
            }
            cachedToken = body.get("access_token").asText();
            long ttl = body.path("expires_in").asLong(3600);
            cachedTokenExpiry = Instant.now().plusSeconds(ttl).minus(EXPIRY_MARGIN);
            log.debug("Obtained a Graph token, valid for {}s", ttl);
            return cachedToken;
        } catch (GraphException e) {
            throw e;
        } catch (Exception e) {
            // The message deliberately does not include the form, which holds the client secret.
            throw new GraphException("Could not obtain a Microsoft Graph token: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------------
    // Drives
    // ------------------------------------------------------------------

    /**
     * The default document library of a SharePoint site, addressed the way a person would name it.
     *
     * @param hostname e.g. {@code contoso.sharepoint.com}
     * @param sitePath e.g. {@code sites/IzikoReporting}
     */
    public String resolveDriveIdForSite(String hostname, String sitePath) {
        JsonNode site = get("/sites/" + hostname + ":/" + trimSlashes(sitePath));
        String siteId = site.path("id").asText(null);
        if (siteId == null) throw new GraphException("No site at " + hostname + "/" + sitePath);
        JsonNode drive = get("/sites/" + siteId + "/drive");
        String driveId = drive.path("id").asText(null);
        if (driveId == null) throw new GraphException("Site " + siteId + " has no default document library");
        return driveId;
    }

    /** A file in a drive, in the few fields Vuka records. */
    public record DriveItem(String id, String name, String webUrl, long size, String mimeType,
                            String parentPath, String downloadUrl, String lastModifiedBy,
                            Instant lastModifiedAt, boolean deleted, boolean folder) {

        /** Path inside the drive, root-relative, with no leading slash. */
        public String drivePath() {
            String parent = parentPath == null ? "" : parentPath;
            int marker = parent.indexOf("root:");
            String folderPart = marker < 0 ? "" : parent.substring(marker + "root:".length());
            folderPart = trimSlashes(folderPart);
            return folderPart.isEmpty() ? name : folderPart + "/" + name;
        }
    }

    /**
     * Writes a file into a drive at a path, creating the folders it needs.
     *
     * <p>Small files go in one PUT. Larger ones go through an upload session, which is Graph's
     * requirement above 4MB rather than a choice; the whole file still goes in a single range,
     * because Vuka caps uploads at 15MB and the per-range limit is 60MiB.
     */
    public DriveItem putFile(String driveId, String drivePath, byte[] content, String contentType) {
        return content.length <= SIMPLE_UPLOAD_LIMIT
                ? simpleUpload(driveId, drivePath, content, contentType)
                : sessionUpload(driveId, drivePath, content, contentType);
    }

    private DriveItem simpleUpload(String driveId, String drivePath, byte[] content, String contentType) {
        URI uri = graphUri("/drives/" + driveId + "/root:/" + encodePath(drivePath) + ":/content");
        try {
            JsonNode item = http.put()
                    .uri(uri)
                    .header("Authorization", "Bearer " + accessToken())
                    .contentType(mediaType(contentType))
                    .body(content)
                    .retrieve()
                    .body(JsonNode.class);
            return toDriveItem(item);
        } catch (Exception e) {
            throw new GraphException("Upload of " + drivePath + " failed: " + e.getMessage(), e);
        }
    }

    private DriveItem sessionUpload(String driveId, String drivePath, byte[] content, String contentType) {
        URI create = graphUri("/drives/" + driveId + "/root:/" + encodePath(drivePath) + ":/createUploadSession");
        try {
            JsonNode session = http.post()
                    .uri(create)
                    .header("Authorization", "Bearer " + accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    // replace, because a new upload of the same key is a new version of that file
                    // in SharePoint's own version history, not a second file with a suffix.
                    .body("{\"item\":{\"@microsoft.graph.conflictBehavior\":\"replace\"}}")
                    .retrieve()
                    .body(JsonNode.class);

            String uploadUrl = session == null ? null : session.path("uploadUrl").asText(null);
            if (uploadUrl == null) throw new GraphException("No uploadUrl in the upload session response");

            JsonNode item = http.put()
                    .uri(URI.create(uploadUrl))
                    // The session URL carries its own authorisation. Sending the app token here
                    // as well is what Microsoft's own documentation tells you not to do.
                    .header("Content-Range", "bytes 0-" + (content.length - 1) + "/" + content.length)
                    .body(content)
                    .retrieve()
                    .body(JsonNode.class);

            return toDriveItem(item);
        } catch (GraphException e) {
            throw e;
        } catch (Exception e) {
            throw new GraphException("Chunked upload of " + drivePath + " failed: " + e.getMessage(), e);
        }
    }

    /**
     * SharePoint's own version label for a file, such as {@code 3.0}.
     *
     * <p>Kept beside Vuka's integer version so that a reviewer looking at the document library and
     * a reviewer looking at Vuka can establish they are discussing the same bytes.
     */
    public Optional<String> latestVersionLabel(String driveId, String itemId) {
        try {
            JsonNode versions = get("/drives/" + driveId + "/items/" + itemId + "/versions");
            String newest = null;
            Instant newestAt = Instant.EPOCH;
            for (JsonNode v : versions.path("value")) {
                Instant at = instant(v.path("lastModifiedDateTime").asText(null));
                if (at != null && !at.isBefore(newestAt)) {
                    newestAt = at;
                    newest = v.path("id").asText(null);
                }
            }
            return Optional.ofNullable(newest);
        } catch (GraphException e) {
            // A missing version history is not a reason to fail an upload that already succeeded.
            log.debug("No version label for {}: {}", itemId, e.getMessage());
            return Optional.empty();
        }
    }

    // ------------------------------------------------------------------
    // Delta: the part that makes "triggered at save" true
    // ------------------------------------------------------------------

    /**
     * One page of changes.
     *
     * @param items     changed files and folders
     * @param nextLink  more pages to read now, or null
     * @param deltaLink the cursor to store and use next time, or null where nextLink is set
     */
    public record DeltaPage(List<DriveItem> items, String nextLink, String deltaLink) {}

    /**
     * What changed in a drive since a cursor.
     *
     * <p>With a null cursor this enumerates the drive, which is what a first sync should do. The
     * returned deltaLink is stored on the workspace, and a poll a minute later costs one request
     * that usually returns nothing. This is why the integration can be checked every few minutes
     * without any webhook infrastructure: Graph does support change notifications, but they
     * require a public HTTPS endpoint Microsoft can reach, and a hackathon deployment behind a
     * tunnel is exactly where that goes wrong on stage.
     */
    public DeltaPage delta(String driveId, String cursor) {
        URI uri = cursor != null && !cursor.isBlank()
                ? URI.create(cursor)
                : graphUri("/drives/" + driveId + "/root/delta");

        JsonNode page = getAt(uri);
        List<DriveItem> items = new ArrayList<>();
        for (JsonNode node : page.path("value")) items.add(toDriveItem(node));

        return new DeltaPage(items,
                page.path("@odata.nextLink").asText(null),
                page.path("@odata.deltaLink").asText(null));
    }

    /**
     * Downloads a file.
     *
     * <p>Uses the pre-authenticated download URL Graph returns on the item where there is one.
     * That URL is short-lived and carries its own credential, so it must not be logged, stored or
     * handed to a client; it is read once, here, and dropped.
     */
    public byte[] download(DriveItem item, String driveId) {
        try {
            if (item.downloadUrl() != null) {
                return http.get().uri(URI.create(item.downloadUrl())).retrieve().body(byte[].class);
            }
            return http.get()
                    .uri(graphUri("/drives/" + driveId + "/items/" + item.id() + "/content"))
                    .header("Authorization", "Bearer " + accessToken())
                    .retrieve()
                    .body(byte[].class);
        } catch (Exception e) {
            throw new GraphException("Download of " + item.name() + " failed: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------------
    // Plumbing
    // ------------------------------------------------------------------

    private JsonNode get(String path) {
        return getAt(graphUri(path));
    }

    private JsonNode getAt(URI uri) {
        try {
            JsonNode body = http.get()
                    .uri(uri)
                    .header("Authorization", "Bearer " + accessToken())
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null) throw new GraphException("Empty response from " + uri.getPath());
            return body;
        } catch (GraphException e) {
            throw e;
        } catch (Exception e) {
            throw new GraphException("Graph GET " + uri.getPath() + " failed: " + e.getMessage(), e);
        }
    }

    private URI graphUri(String path) {
        return URI.create(props.getGraphBaseUrl() + path);
    }

    /** Encodes each segment of a drive path, leaving the separators alone. */
    static String encodePath(String drivePath) {
        return Arrays.stream(trimSlashes(drivePath).split("/"))
                .filter(s -> !s.isEmpty())
                .map(s -> UriUtils.encodePathSegment(s, StandardCharsets.UTF_8))
                .reduce((a, b) -> a + "/" + b)
                .orElse("");
    }

    static String trimSlashes(String s) {
        if (s == null) return "";
        int from = 0;
        int to = s.length();
        while (from < to && s.charAt(from) == '/') from++;
        while (to > from && s.charAt(to - 1) == '/') to--;
        return s.substring(from, to);
    }

    private static MediaType mediaType(String contentType) {
        try {
            return contentType == null || contentType.isBlank()
                    ? MediaType.APPLICATION_OCTET_STREAM
                    : MediaType.parseMediaType(contentType);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private static Instant instant(String iso) {
        try {
            return iso == null ? null : Instant.parse(iso);
        } catch (Exception e) {
            return null;
        }
    }

    static DriveItem toDriveItem(JsonNode node) {
        if (node == null) throw new GraphException("Graph returned no item");
        return new DriveItem(
                node.path("id").asText(null),
                node.path("name").asText(null),
                node.path("webUrl").asText(null),
                node.path("size").asLong(0),
                node.path("file").path("mimeType").asText(null),
                node.path("parentReference").path("path").asText(null),
                node.path("@microsoft.graph.downloadUrl").asText(null),
                node.path("lastModifiedBy").path("user").path("displayName").asText(null),
                instant(node.path("lastModifiedDateTime").asText(null)),
                node.has("deleted"),
                node.has("folder"));
    }
}
