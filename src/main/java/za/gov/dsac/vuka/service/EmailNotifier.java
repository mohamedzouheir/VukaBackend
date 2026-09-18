package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Properties;

/**
 * Sends the deadline countdown by email, which is the one channel every entity has.
 *
 * <h2>Why email and plain SMTP</h2>
 *
 * A Teams channel workflow is often switched off by a department's Microsoft 365 policy, and
 * a small entity may not use Teams at all. Every entity has a mailbox. SMTP is the lowest common
 * denominator: Microsoft 365, Azure Communication Services, SendGrid and a government mail relay
 * all accept it, so the provider is a deployment decision rather than a code change. Sending
 * through Graph instead would need {@code Mail.Send} as an application permission, which lets the
 * app send as any mailbox in the tenant and is a much larger ask than a reminder justifies.
 *
 * <h2>Off unless configured, and safe in a demo</h2>
 *
 * With no host set, nothing is sent and the countdown is still logged. The seeded contact
 * addresses are invented, so {@code redirect-to} sends every message to one address instead,
 * with the intended recipients named in the body. Set it for any demonstration.
 *
 * <p>The password is read from a file, the same rule as the Firebase key and the Microsoft client
 * secret: the path is configuration, the value never sits in an environment variable.
 */
@Service
public class EmailNotifier {

    private static final Logger log = LoggerFactory.getLogger(EmailNotifier.class);

    private final String host;
    private final int port;
    private final String username;
    private final String passwordPath;
    private final String from;
    private final String redirectTo;

    public EmailNotifier(@Value("${vuka.mail.host:}") String host,
                         @Value("${vuka.mail.port:587}") int port,
                         @Value("${vuka.mail.username:}") String username,
                         @Value("${vuka.mail.password-path:}") String passwordPath,
                         @Value("${vuka.mail.from:}") String from,
                         @Value("${vuka.mail.redirect-to:}") String redirectTo) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.passwordPath = passwordPath;
        this.from = from;
        this.redirectTo = redirectTo;
    }

    public boolean isConfigured() {
        return notBlank(host) && notBlank(from);
    }

    /**
     * Sends one message. Returns false rather than throwing: a reminder that could not be
     * delivered must not stop the run that was about to remind the other entities.
     *
     * @param recipients intended addresses; blanks and duplicates are dropped
     */
    public boolean send(Collection<String> recipients, String subject, String body) {
        List<String> to = clean(recipients);
        if (!isConfigured() || to.isEmpty()) return false;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        if (notBlank(redirectTo)) {
            message.setTo(redirectTo.trim());
            message.setSubject("[redirected] " + subject);
            message.setText("Intended for: " + String.join(", ", to) + "\n\n" + body);
        } else {
            message.setTo(to.toArray(String[]::new));
            message.setSubject(subject);
            message.setText(body);
        }
        try {
            sender().send(message);
            return true;
        } catch (Exception e) {
            // Addresses are left out of the warning: they are personal information and logs get shared.
            log.warn("Reminder email failed: {}", e.getMessage());
            return false;
        }
    }

    /** Lower-cased, trimmed, blanks and duplicates removed, order kept. */
    static List<String> clean(Collection<String> recipients) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (recipients != null) {
            for (String r : recipients) {
                if (notBlank(r)) out.add(r.trim().toLowerCase(Locale.ROOT));
            }
        }
        return List.copyOf(out);
    }

    /** Built per send, so a rotated password file takes effect without a restart. */
    private JavaMailSenderImpl sender() throws IOException {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setDefaultEncoding(StandardCharsets.UTF_8.name());
        Properties props = sender.getJavaMailProperties();
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.connectiontimeout", "10000");
        props.put("mail.smtp.timeout", "10000");
        if (notBlank(username)) {
            sender.setUsername(username);
            sender.setPassword(notBlank(passwordPath)
                    ? Files.readString(Path.of(passwordPath), StandardCharsets.UTF_8).trim()
                    : "");
            props.put("mail.smtp.auth", "true");
        }
        return sender;
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }
}
