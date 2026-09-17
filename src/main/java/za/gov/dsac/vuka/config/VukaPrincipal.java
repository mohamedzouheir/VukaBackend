package za.gov.dsac.vuka.config;

/**
 * The authenticated caller.
 *
 * @param uid      Firebase uid, written onto every confirmation and comment so
 *                 the audit trail names a person rather than a service
 * @param email    caller email
 * @param name     display name, shown beside confirmed figures
 * @param role     ENTITY_REPORTER, DSAC_REVIEWER, DSAC_EXECUTIVE or ADMIN
 * @param entityId the entity a reporter is bound to; null for DSAC roles
 */
public record VukaPrincipal(
        String uid,
        String email,
        String name,
        String role,
        String entityId
) {
    public boolean isDsac() {
        return "DSAC_REVIEWER".equals(role) || "DSAC_EXECUTIVE".equals(role) || "ADMIN".equals(role);
    }

    public boolean canRead(String targetEntityId) {
        return isDsac() || (entityId != null && entityId.equals(targetEntityId));
    }
}
