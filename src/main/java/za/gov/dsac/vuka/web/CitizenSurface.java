package za.gov.dsac.vuka.web;

import java.util.Locale;
import java.util.Set;

/**
 * Which of the two citizen views a request gets.
 *
 * <h2>Two views, one address</h2>
 *
 * The citizen view exists twice. The light one is server-rendered Thymeleaf with no framework and
 * a few kilobytes on the wire, for a reader on a low-end phone paying for data. The full one is a
 * React page with a search, sector filters and charts, for a reader on a connection that can
 * carry it. Both read the same {@link za.gov.dsac.vuka.service.PublicationService} projection, so
 * they cannot disagree about a figure, and both live at {@code /public}: a link shared from one
 * opens in whichever suits the person who receives it.
 *
 * <h2>How the choice is made, in order</h2>
 *
 * <ol>
 *   <li>The reader's own choice, {@code ?view=lite} or {@code ?view=rich}, always wins. It is in
 *       the URL for the reason {@link za.gov.dsac.vuka.config.LocaleConfig} gives for the
 *       language: a cookie would mean storing something about a reader who never signed in.</li>
 *   <li>{@code Save-Data: on}. The reader has told their browser they are paying for data.</li>
 *   <li>The {@code ECT} and {@code Downlink} client hints, where the browser sends them. A 3G
 *       effective connection or less than one megabit gets the light view.</li>
 *   <li>Without a hint the full view is served. It carries its own check: a few lines of inline
 *       script read the browser's connection before the bundle downloads, and a watchdog moves the
 *       reader to the light view if the bundle has not started after a few seconds. That covers
 *       the browsers that send no hints, which the server cannot see into.</li>
 * </ol>
 *
 * A deployment built without the frontend has no full view to serve, and every request gets the
 * light one rather than a 404.
 */
public final class CitizenSurface {

    public enum View { LITE, RICH }

    /** Effective connection types too slow for the full view. */
    private static final Set<String> SLOW = Set.of("slow-2g", "2g", "3g");

    /** Megabits per second. Below this the full view's first load takes several seconds. */
    private static final double MIN_DOWNLINK = 1.0;

    /** The client hints the full view is chosen on. Sent in Accept-CH and Vary. */
    public static final String HINTS = "Save-Data, ECT, Downlink";

    private CitizenSurface() {}

    public static View choose(String viewParam, String saveData, String ect, String downlink,
                              boolean richAvailable) {
        if (!richAvailable) return View.LITE;

        View asked = parse(viewParam);
        if (asked != null) return asked;

        if (saveData != null && saveData.trim().equalsIgnoreCase("on")) return View.LITE;
        if (ect != null && SLOW.contains(ect.trim().toLowerCase(Locale.ROOT))) return View.LITE;
        if (downlink != null) {
            try {
                if (Double.parseDouble(downlink.trim()) < MIN_DOWNLINK) return View.LITE;
            } catch (NumberFormatException ignored) {
                // A malformed hint is not a reason to guess. Fall through to the default.
            }
        }
        return View.RICH;
    }

    /** The reader's explicit choice, or null where they made none or wrote something else. */
    public static View parse(String viewParam) {
        if (viewParam == null) return null;
        return switch (viewParam.trim().toLowerCase(Locale.ROOT)) {
            case "lite" -> View.LITE;
            case "rich" -> View.RICH;
            default -> null;
        };
    }
}
