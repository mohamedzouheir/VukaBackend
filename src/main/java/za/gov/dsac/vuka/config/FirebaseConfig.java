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

    @Bean
    public FirebaseAuth firebaseAuth() throws Exception {
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
    }
}
