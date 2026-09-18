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

    /** The role as a person would say it, for messages that tell someone why they were refused. */
    public String roleLabel() {
        if (role == null) return "an account with no role";
        return switch (role) {
            case "ENTITY_REPORTER" -> "an entity reporter";
            case "DSAC_REVIEWER" -> "a DSAC reviewer";
            case "DSAC_EXECUTIVE" -> "a DSAC executive, which is read only";
            case "ADMIN" -> "an administrator";
            default -> role;
        };
    }

    public boolean canRead(String targetEntityId) {
        return isDsac() || (entityId != null && entityId.equals(targetEntityId));
    }
}
