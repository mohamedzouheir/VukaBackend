package za.gov.dsac.vuka.config;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * What each role may do, written down once.
 *
 * <h2>Why this exists</h2>
 *
 * Before this, the answer lived in three places that had drifted apart: the {@code @PreAuthorize}
 * strings on each controller, a set of role helpers in the dashboard, and the phone surface's URL
 * rule. The dashboard treated a DSAC executive as read only while two endpoints still let an
 * executive post a comment or approve a document, so what a person could do and what the screen
 * offered them were different things.
 *
 * <p>Now every endpoint asks {@code @can.has('X')} rather than naming roles, and {@code /api/me}
 * returns the caller's capabilities so the dashboard shows exactly the actions the API will
 * accept. A role gains or loses an action here, in one line, and both sides move together.
 *
 * <h2>The shape of it</h2>
 *
 * <pre>
 *                       reporter  reviewer  executive  admin
 *   READ_OWN_REPORTING     x         x          x        x     reads are also tenancy checked
 *   SUBMIT_REPORTING       x                                  figures, evidence, uploads
 *   PARTICIPATE            x         x                   x     comment, set and move tasks
 *   DOWNLOAD_TEMPLATE      x         x                   x
 *   VIEW_PORTFOLIO                   x          x        x     across entities
 *   REVIEW_SUBMISSIONS               x                   x     approve, return, decide, recompute
 *   ADMINISTER                                           x     publication, Microsoft binding
 * </pre>
 *
 * The executive column is the point of the design: it reads everything and changes nothing. The
 * reporter column is the other point: only the entity puts figures and evidence on the record,
 * and nobody at DSAC can do it on the entity's behalf.
 */
public enum Capability {

    READ_OWN_REPORTING("ENTITY_REPORTER", "DSAC_REVIEWER", "DSAC_EXECUTIVE", "ADMIN"),
    SUBMIT_REPORTING("ENTITY_REPORTER"),
    PARTICIPATE("ENTITY_REPORTER", "DSAC_REVIEWER", "ADMIN"),
    DOWNLOAD_TEMPLATE("ENTITY_REPORTER", "DSAC_REVIEWER", "ADMIN"),
    VIEW_PORTFOLIO("DSAC_REVIEWER", "DSAC_EXECUTIVE", "ADMIN"),
    REVIEW_SUBMISSIONS("DSAC_REVIEWER", "ADMIN"),
    ADMINISTER("ADMIN");

    private final Set<String> roles;

    Capability(String... roles) {
        this.roles = Set.of(roles);
    }

    public boolean grantedTo(String role) {
        return role != null && roles.contains(role);
    }

    /** Everything a role may do, in declaration order. */
    public static List<Capability> of(String role) {
        return Arrays.stream(values()).filter(c -> c.grantedTo(role)).toList();
    }

    public static Set<Capability> setOf(String role) {
        Set<Capability> set = EnumSet.noneOf(Capability.class);
        set.addAll(of(role));
        return set;
    }
}
