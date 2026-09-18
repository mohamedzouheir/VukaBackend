package za.gov.dsac.vuka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import za.gov.dsac.vuka.config.Capability;

import java.util.EnumSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static za.gov.dsac.vuka.config.Capability.*;

/**
 * The capability table is what stops one role's screens from offering another role's actions.
 * Each test is one sentence of the governance story, and changing a role's powers means changing
 * one of these on purpose.
 */
class CapabilityTest {

    @Test
    @DisplayName("Only the entity puts figures and evidence on the record")
    void onlyReportersSubmit() {
        assertTrue(SUBMIT_REPORTING.grantedTo("ENTITY_REPORTER"));
        for (String role : Set.of("DSAC_REVIEWER", "DSAC_EXECUTIVE", "ADMIN")) {
            assertFalse(SUBMIT_REPORTING.grantedTo(role), role + " must not write on an entity's behalf");
        }
    }

    @Test
    @DisplayName("A DSAC executive reads everything and changes nothing")
    void executiveIsReadOnly() {
        assertEquals(EnumSet.of(READ_OWN_REPORTING, VIEW_PORTFOLIO), Capability.setOf("DSAC_EXECUTIVE"));
    }

    @Test
    @DisplayName("A reporter never sees across entities, reviews, or administers")
    void reporterStaysInTheirLane() {
        assertEquals(EnumSet.of(READ_OWN_REPORTING, SUBMIT_REPORTING, PARTICIPATE, DOWNLOAD_TEMPLATE),
                Capability.setOf("ENTITY_REPORTER"));
    }

    @Test
    @DisplayName("A reviewer reviews and discusses, and cannot submit or administer")
    void reviewerReviews() {
        assertEquals(EnumSet.of(READ_OWN_REPORTING, PARTICIPATE, DOWNLOAD_TEMPLATE, VIEW_PORTFOLIO,
                REVIEW_SUBMISSIONS), Capability.setOf("DSAC_REVIEWER"));
    }

    @Test
    @DisplayName("An unknown or missing role can do nothing at all")
    void unknownRoleHasNothing() {
        assertTrue(Capability.of(null).isEmpty());
        assertTrue(Capability.of("SOMETHING_ELSE").isEmpty());
    }
}
