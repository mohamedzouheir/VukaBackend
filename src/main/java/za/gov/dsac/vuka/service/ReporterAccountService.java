package za.gov.dsac.vuka.service;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.Enums;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.UserProfile;
import za.gov.dsac.vuka.repository.UserProfileRepository;

import java.util.Map;

/**
 * Issues reporter accounts. The only way a reporter account comes to exist.
 *
 * <h2>Why there is no sign up</h2>
 *
 * A reporter's authority is the {@code entityId} claim on their token, which decides whose figures
 * they may put on the record. Letting a person choose that for themselves would let anyone file
 * for any entity. So an account is issued by a DSAC administrator, for one named entity, and the
 * person it is issued to can only sign in.
 *
 * <p>Firebase's own sign-up endpoint cannot be switched off from here, only in the console (User
 * actions, Enable create). It does not matter for access: an account made that way carries no
 * {@code role} claim, and every endpoint refuses a token without one.
 *
 * <h2>With Firebase</h2>
 *
 * The user is created with no password, the {@code role} and {@code entityId} claims are set, and
 * a set-password link is returned for the administrator to send. The link is Firebase's, it
 * expires, and the password never passes through this system or through the administrator.
 *
 * <h2>Without Firebase</h2>
 *
 * On a laptop running development sign in there is nobody to create the credential. The person is
 * still written to the directory against the entity, so they receive its deadline reminders and
 * their name resolves on screen, and the response says plainly that no credential was issued.
 */
@Service
public class ReporterAccountService {

    public record Issued(String uid, String email, String displayName, boolean credentialIssued,
                         String setPasswordLink, String note) {}

    private final ObjectProvider<FirebaseAuth> firebase;
    private final UserProfileRepository users;

    public ReporterAccountService(ObjectProvider<FirebaseAuth> firebase, UserProfileRepository users) {
        this.firebase = firebase;
        this.users = users;
    }

    @Transactional
    public Issued issue(PublicEntity entity, String email, String displayName) {
        String normalised = email.trim().toLowerCase();
        users.findByEmail(normalised).ifPresent(u -> {
            throw new IllegalStateException("An account already exists for " + normalised + ".");
        });

        FirebaseAuth auth = firebase.getIfAvailable();
        String uid;
        String link = null;
        boolean issued;
        String note;

        if (auth == null) {
            uid = "unissued:" + normalised;
            issued = false;
            note = "Recorded in the directory against " + entity.getName() + ", so this person receives "
                    + "its deadline reminders. No credential was issued, because Firebase is not "
                    + "configured on this server. With development sign in, sign in as the reporter "
                    + "and paste this entity's id.";
        } else {
            try {
                UserRecord user = auth.createUser(new UserRecord.CreateRequest()
                        .setEmail(normalised)
                        .setEmailVerified(false)
                        .setDisplayName(displayName));
                uid = user.getUid();
                auth.setCustomUserClaims(uid, Map.of(
                        "role", Enums.Role.ENTITY_REPORTER.name(),
                        "entityId", entity.getId().toString()));
                link = auth.generatePasswordResetLink(normalised);
                issued = true;
                note = "Account issued for " + entity.getName() + ". Send the set-password link to "
                        + normalised + "; it expires, and the password is never seen by DSAC.";
            } catch (FirebaseAuthException e) {
                if (e.getAuthErrorCode() == AuthErrorCode.EMAIL_ALREADY_EXISTS) {
                    throw new IllegalStateException("Firebase already holds an account for " + normalised
                            + ". Set its claims rather than issuing a second one.");
                }
                throw new IllegalStateException("Firebase refused the account: " + e.getMessage());
            }
        }

        UserProfile profile = new UserProfile();
        profile.setUid(uid);
        profile.setEmail(normalised);
        profile.setDisplayName(displayName);
        profile.setRole(Enums.Role.ENTITY_REPORTER);
        profile.setEntity(entity);
        users.save(profile);

        return new Issued(uid, normalised, displayName, issued, link, note);
    }
}
