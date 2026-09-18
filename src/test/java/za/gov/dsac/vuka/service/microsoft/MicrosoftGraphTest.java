package za.gov.dsac.vuka.service.microsoft;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The parts of the Microsoft integration that can be checked without a tenant: how a drive path is
 * addressed, how a changed file maps onto a workspace key, and what is actually posted to Teams.
 *
 * <p>In the same package as what it tests, because the path builder and the JSON mapping are
 * package-private: they are internals of the client rather than API, and widening them so a test
 * in another package could reach them would be the test changing the design.
 *
 * <p>These are the pieces that go wrong silently. A mis-encoded path does not fail, it writes a
 * file somewhere nobody looks; a parent reference read wrongly files a quarterly report under an
 * annual one.
 */
class MicrosoftGraphTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    @DisplayName("Drive paths are encoded per segment, and the separators survive")
    void pathEncoding() {
        assertEquals("Vuka/ANNUAL_REPORT/annual%20report.pdf",
                MicrosoftGraphClient.encodePath("Vuka/ANNUAL_REPORT/annual report.pdf"));
        // Leading and trailing slashes would produce an empty segment and a 400 from Graph.
        assertEquals("Vuka/x.pdf", MicrosoftGraphClient.encodePath("/Vuka/x.pdf/"));
        // '&' is legal in a path segment under RFC 3986 and stays; '?' and '#' would end the path.
        assertEquals("Vuka/Q1%20&%20Q2.xlsx", MicrosoftGraphClient.encodePath("Vuka/Q1 & Q2.xlsx"));
        assertEquals("Vuka/what%3F%23.xlsx", MicrosoftGraphClient.encodePath("Vuka/what?#.xlsx"));
    }

    @Test
    @DisplayName("A changed file reports its path inside the drive, not inside Graph's addressing")
    void drivePathFromParentReference() throws Exception {
        JsonNode item = JSON.readTree("""
            {
              "id": "01ABCDEF",
              "name": "annual report.pdf",
              "size": 20480,
              "webUrl": "https://contoso.sharepoint.com/sites/Iziko/Shared%20Documents/Vuka/x.pdf",
              "file": { "mimeType": "application/pdf" },
              "parentReference": { "driveId": "b!x", "path": "/drive/root:/Vuka/ANNUAL_REPORT" },
              "lastModifiedDateTime": "2026-09-18T06:12:44Z",
              "lastModifiedBy": { "user": { "displayName": "T Ndlovu" } }
            }
            """);

        MicrosoftGraphClient.DriveItem parsed = MicrosoftGraphClient.toDriveItem(item);

        assertEquals("Vuka/ANNUAL_REPORT/annual report.pdf", parsed.drivePath());
        assertEquals("T Ndlovu", parsed.lastModifiedBy(), "the person is recorded, not the app");
        assertFalse(parsed.folder());
        assertFalse(parsed.deleted());
        assertEquals("application/pdf", parsed.mimeType());
    }

    @Test
    @DisplayName("A file at the root of the drive has no folder in front of it")
    void drivePathAtRoot() throws Exception {
        JsonNode item = JSON.readTree("""
            { "id": "1", "name": "notes.docx", "parentReference": { "path": "/drive/root:" } }
            """);
        assertEquals("notes.docx", MicrosoftGraphClient.toDriveItem(item).drivePath());
    }

    @Test
    @DisplayName("A deleted file is recognised as deleted rather than as an empty one")
    void deletedItem() throws Exception {
        JsonNode item = JSON.readTree("""
            { "id": "1", "name": "gone.pdf", "deleted": { "state": "deleted" },
              "parentReference": { "path": "/drive/root:/Vuka" } }
            """);
        assertTrue(MicrosoftGraphClient.toDriveItem(item).deleted());
    }

    @Test
    @DisplayName("With nothing configured, the client says so instead of trying")
    void unconfiguredIsAState() {
        MicrosoftGraphProperties props = new MicrosoftGraphProperties();
        MicrosoftGraphClient client = new MicrosoftGraphClient(props);
        assertFalse(client.isConfigured());
        assertThrows(MicrosoftGraphClient.GraphException.class, client::accessToken);

        props.setTenantId("t");
        props.setClientId("c");
        assertFalse(props.isConfigured(), "a tenant with no secret path is not configured");
    }

    @Test
    @DisplayName("The Teams payload is an Adaptive Card, and a value with a quote in it cannot break it")
    void teamsCardIsWellFormed() throws Exception {
        Map<String, String> facts = new LinkedHashMap<>();
        facts.put("Reporting period", "Q1 2026/27");
        facts.put("Targets without evidence", "2: PI-1 \"attendance\", PI-4");

        String payload = new TeamsNotifier().card(
                "Iziko: Q1 2026/27 is due in 15 days", "Two targets have no evidence attached.",
                facts, "Open Vuka", "https://vuka.example/m");

        JsonNode parsed = JSON.readTree(payload);
        assertEquals("message", parsed.path("type").asText());
        JsonNode card = parsed.path("attachments").get(0);
        assertEquals("application/vnd.microsoft.card.adaptive", card.path("contentType").asText());
        assertEquals("AdaptiveCard", card.path("content").path("type").asText());
        assertEquals("Reporting period",
                card.path("content").path("body").get(2).path("facts").get(0).path("title").asText());
        assertEquals("Open Vuka", card.path("content").path("actions").get(0).path("title").asText());
    }

    @Test
    @DisplayName("Posting with no webhook configured does nothing and says so")
    void noWebhookIsNotAFailure() {
        assertFalse(new TeamsNotifier().post(null, "t", "b", Map.of()));
        assertFalse(new TeamsNotifier().post("  ", "t", "b", Map.of()));
    }
}
