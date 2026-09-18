package za.gov.dsac.vuka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import za.gov.dsac.vuka.web.CitizenSurface;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static za.gov.dsac.vuka.web.CitizenSurface.View.LITE;
import static za.gov.dsac.vuka.web.CitizenSurface.View.RICH;

class CitizenSurfaceTest {

    private static CitizenSurface.View choose(String view, String saveData, String ect, String downlink) {
        return CitizenSurface.choose(view, saveData, ect, downlink, true);
    }

    @Test
    @DisplayName("With nothing to go on, the full view is served and its own watchdog decides")
    void defaultIsRich() {
        assertEquals(RICH, choose(null, null, null, null));
        assertEquals(RICH, choose(null, null, "4g", "10"));
    }

    @Test
    @DisplayName("Save-Data, a slow effective connection or a thin downlink gets the light view")
    void slowGetsLite() {
        assertEquals(LITE, choose(null, "on", null, null));
        assertEquals(LITE, choose(null, null, "slow-2g", null));
        assertEquals(LITE, choose(null, null, "2g", null));
        assertEquals(LITE, choose(null, null, "3g", null));
        assertEquals(LITE, choose(null, null, "4g", "0.6"));
    }

    @Test
    @DisplayName("The reader's own choice beats every hint, both ways")
    void explicitChoiceWins() {
        assertEquals(RICH, choose("rich", "on", "2g", "0.1"));
        assertEquals(LITE, choose("lite", null, "4g", "10"));
        assertEquals(LITE, choose(" LITE ", null, null, null));
    }

    @Test
    @DisplayName("Nonsense in a parameter or a hint is ignored, not guessed at")
    void garbageIgnored() {
        assertEquals(RICH, choose("fancy", null, null, "fast"));
        assertEquals(RICH, choose(null, "off", "5g", null));
    }

    @Test
    @DisplayName("A build without the frontend serves the light view, even when the full one is asked for")
    void noBundleMeansLite() {
        assertEquals(LITE, CitizenSurface.choose("rich", null, "4g", "10", false));
    }
}
