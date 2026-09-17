package za.gov.dsac.vuka.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.FileInputStream;
import java.io.InputStream;

/**
 * Initialises the Firebase Admin SDK, which this application uses for exactly one thing:
 * verifying the ID tokens the browser obtains from Firebase Auth.
 *
 * Identity lives in Firebase. Everything else — the performance data, the audit trail,
 * the risk scores — lives in PostgreSQL, which the department can host and keep.
 */
@Configuration
public class FirebaseConfig {

    private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

    @Value("${vuka.firebase.credentials-path:}")
    private String credentialsPath;

    /**
     * The token verifier, or nothing.
     *
     * <h2>Why a missing credential is not a startup failure</h2>
     *
     * This used to throw, which meant the whole application refused to boot on a machine with no
     * Firebase project attached. That is the wrong failure: the citizen view needs no identity at
     * all, the Thymeleaf surfaces and the migrations have nothing to do with Firebase, and a
     * reviewer running this locally for the first time should see an application that starts and
     * declines to authenticate rather than a stack trace with no obvious cause.
     *
     * <p>So a missing or unreadable credential is logged loudly and the bean comes back null.
     * Spring injects that as an absent bean, {@link FirebaseTokenFilter} skips verification, and
     * every authenticated endpoint answers 401 because no request can produce a principal. The
     * security posture is unchanged: with no verifier present, nothing verifies, and nothing is
     * waved through.
     *
     * @return the Firebase token verifier, or null where no usable credential was found
     */
    @Bean
    public FirebaseAuth firebaseAuth() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                GoogleCredentials credentials;
                if (credentialsPath != null && !credentialsPath.isBlank()) {
                    try (InputStream in = new FileInputStream(credentialsPath)) {
                        credentials = GoogleCredentials.fromStream(in);
                    }
                    log.info("Firebase credentials loaded from {}", credentialsPath);
                } else {
                    // Works on Cloud Run and GCE without a key file on disk.
                    credentials = GoogleCredentials.getApplicationDefault();
                    log.info("Firebase using application default credentials");
                }
                FirebaseApp.initializeApp(FirebaseOptions.builder()
                        .setCredentials(credentials)
                        .build());
            }
            return FirebaseAuth.getInstance();
        } catch (Exception e) {
            log.warn("");
            log.warn("  No usable Firebase credential, so ID tokens cannot be verified: {}",
                    e.getMessage());
            log.warn("  The application will start. /public needs no identity and works normally.");
            log.warn("  Every authenticated endpoint will answer 401 until a credential is set,");
            log.warn("  through FIREBASE_CREDENTIALS, or until vuka.dev-auth.enabled is turned on");
            log.warn("  for a local demo.");
            log.warn("");
            return null;
        }
    }
}
