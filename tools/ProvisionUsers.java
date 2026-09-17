import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Creates Firebase accounts and sets the two custom claims Vuka reads.
 *
 * <h2>Why this is a script and not a screen</h2>
 *
 * Section 12 of the frontend design cuts the user administration screen first, and the reason is
 * that nobody watches an admin form during a demo. The claims are what matter:
 *
 * <pre>
 *   role      ENTITY_REPORTER | DSAC_REVIEWER | DSAC_EXECUTIVE | ADMIN
 *   entityId  the entity a reporter is bound to; absent for DSAC roles
 * </pre>
 *
 * {@code entityId} lives on the signed token rather than in a request parameter precisely so a
 * client cannot choose it. That single comparison in {@code VukaPrincipal.canRead} is the whole
 * tenancy model, which is why this script refuses to give a DSAC role an entity id: a token shaped
 * differently from production would make the demo prove something that is not true.
 *
 * <h2>Running it</h2>
 *
 * Java 21 runs a single source file directly, so there is nothing to build:
 *
 * <pre>
 *   # list what exists, and the claims on each account
 *   java -cp "&lt;jars&gt;" tools/ProvisionUsers.java list
 *
 *   # create or update one account
 *   java -cp "&lt;jars&gt;" tools/ProvisionUsers.java set reviewer@dsac.gov.za 'Passw0rd!' DSAC_REVIEWER
 *   java -cp "&lt;jars&gt;" tools/ProvisionUsers.java set nomsa@iziko.org.za 'Passw0rd!' ENTITY_REPORTER &lt;entity-uuid&gt;
 * </pre>
 *
 * {@code provision-users.ps1} beside this file builds the classpath and passes the credential, so
 * in practice you run that instead.
 *
 * <p>Setting a claim does not affect an already issued token until it refreshes, which the
 * Firebase client SDK does about hourly. Sign out and back in after changing a role.
 */
public class ProvisionUsers {

    private static final List<String> ROLES =
            List.of("ENTITY_REPORTER", "DSAC_REVIEWER", "DSAC_EXECUTIVE", "ADMIN");

    public static void main(String[] args) throws Exception {
        String credentialsPath = System.getenv("FIREBASE_CREDENTIALS");
        if (credentialsPath == null || credentialsPath.isBlank()) {
            System.err.println("FIREBASE_CREDENTIALS is not set. Point it at the service account JSON.");
            System.exit(2);
        }

        try (InputStream in = new FileInputStream(credentialsPath)) {
            FirebaseApp.initializeApp(FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(in))
                    .build());
        }
        FirebaseAuth auth = FirebaseAuth.getInstance();

        if (args.length == 0) {
            usage();
            System.exit(2);
        }

        switch (args[0]) {
            case "list" -> list(auth);
            case "set" -> set(auth, args);
            default -> {
                usage();
                System.exit(2);
            }
        }
    }

    /** Every account, with the claims Vuka will read off its token. */
    private static void list(FirebaseAuth auth) throws FirebaseAuthException {
        System.out.printf("%-38s %-16s %-38s %s%n", "EMAIL", "ROLE", "ENTITY ID", "UID");
        System.out.println("-".repeat(120));

        int n = 0;
        for (UserRecord u : auth.listUsers(null).iterateAll()) {
            Map<String, Object> claims = u.getCustomClaims();
            Object role = claims.get("role");
            Object entityId = claims.get("entityId");

            System.out.printf("%-38s %-16s %-38s %s%n",
                    u.getEmail() == null ? "(no email)" : u.getEmail(),
                    role == null ? "NO ROLE CLAIM" : role,
                    entityId == null ? "" : entityId,
                    u.getUid());
            n++;
        }

        System.out.println();
        if (n == 0) {
            System.out.println("No accounts yet. Create one with: set <email> <password> <ROLE> [entityId]");
        } else {
            System.out.println(n + " accounts. An account with NO ROLE CLAIM can sign in to Firebase but");
            System.out.println("every Vuka endpoint will refuse it, because FirebaseTokenFilter sets no");
            System.out.println("principal without a role. That is the correct behaviour and it looks like");
            System.out.println("a broken login, so check this column first when somebody cannot get in.");
        }
    }

    /** Creates the account if it does not exist, then sets its claims. */
    private static void set(FirebaseAuth auth, String[] args) throws FirebaseAuthException {
        if (args.length < 4) {
            usage();
            System.exit(2);
        }
        String email = args[1];
        String password = args[2];
        String role = args[3].toUpperCase();
        String entityId = args.length > 4 ? args[4] : null;

        if (!ROLES.contains(role)) {
            System.err.println("Unknown role: " + role);
            System.err.println("One of: " + String.join(", ", ROLES));
            System.exit(2);
        }

        // A DSAC role with an entity id would be a token shape production never issues, and the
        // demo would then be exercising a path that does not exist. Refuse rather than silently
        // drop it, so the mistake is visible now rather than in the judging room.
        if (!"ENTITY_REPORTER".equals(role) && entityId != null) {
            System.err.println("Only ENTITY_REPORTER carries an entityId. A DSAC role reads every entity");
            System.err.println("through VukaPrincipal.isDsac, so binding one to a single entity would");
            System.err.println("misrepresent how access control actually works.");
            System.exit(2);
        }
        if ("ENTITY_REPORTER".equals(role) && entityId == null) {
            System.err.println("ENTITY_REPORTER needs an entityId, or the account can reach nothing.");
            System.err.println("Take one from GET /api/dashboard/portfolio, or from the portfolio screen.");
            System.exit(2);
        }

        UserRecord user;
        try {
            user = auth.getUserByEmail(email);
            System.out.println("Found existing account: " + user.getUid());
            auth.updateUser(new UserRecord.UpdateRequest(user.getUid()).setPassword(password));
            System.out.println("Password updated.");
        } catch (FirebaseAuthException e) {
            user = auth.createUser(new UserRecord.CreateRequest()
                    .setEmail(email)
                    .setPassword(password)
                    .setEmailVerified(true));
            System.out.println("Created account: " + user.getUid());
        }

        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role);
        if (entityId != null) claims.put("entityId", entityId);

        auth.setCustomUserClaims(user.getUid(), claims);

        System.out.println("Claims set: role=" + role + (entityId == null ? "" : ", entityId=" + entityId));
        System.out.println();
        System.out.println("Sign out and back in before testing. A token already in a browser keeps its");
        System.out.println("old claims until it refreshes, which is roughly hourly.");
    }

    private static void usage() {
        System.out.println("""
                Vuka user provisioning.

                  list
                      Every account and the claims on it.

                  set <email> <password> <ROLE> [entityId]
                      Creates the account if needed, then sets its claims.
                      ROLE is one of ENTITY_REPORTER, DSAC_REVIEWER, DSAC_EXECUTIVE, ADMIN.
                      entityId is required for ENTITY_REPORTER and rejected for the others.

                Requires FIREBASE_CREDENTIALS pointing at the service account JSON.
                """);
    }
}
