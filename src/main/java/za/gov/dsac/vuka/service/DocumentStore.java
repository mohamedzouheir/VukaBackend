package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Where the bytes actually live.
 *
 * <h2>Content addressed, so a version chain cannot lie</h2>
 *
 * A file is stored under the SHA-256 of its own contents. Three consequences, and all three are
 * the reason rather than a side effect:
 *
 * <ul>
 *   <li>Re-uploading an unchanged file writes nothing and produces the same path, which is how
 *       {@link DocumentVersionService} can refuse to open a new version for bytes that did not
 *       change. Without that, a poller that sees its own mirrored upload come back from Microsoft
 *       would open version 2, then version 3, forever.</li>
 *   <li>A stored file can never be modified in place, because modifying it would change where it
 *       belongs. Evidence a reviewer opened in March is the file they opened in March.</li>
 *   <li>The hash on the receipt and the hash of the path are the same number, so a receipt can be
 *       checked by anyone holding the file, without access to this system.</li>
 * </ul>
 *
 * <h2>Why the filesystem</h2>
 *
 * Because the deployment target is a single Cloud Run service with a Cloud SQL database, and the
 * honest answer for object storage is that it is one interface implementation away rather than
 * pretending a bucket is already there. {@code vuka.documents.root} points at a volume. On a
 * multi-instance deployment it must be a shared one, and that is stated in the README rather than
 * discovered.
 */
@Service
public class DocumentStore {

    private static final Logger log = LoggerFactory.getLogger(DocumentStore.class);

    private final Path root;

    public DocumentStore(@Value("${vuka.documents.root:./var/documents}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    /** SHA-256 of the bytes, lower case hex. The same value the receipt quotes. */
    public static String hash(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required of every Java platform. If it is missing, nothing else here works either.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /**
     * Stores the bytes and returns the storage path recorded on the document row.
     *
     * <p>Writing is idempotent: identical bytes for the same entity resolve to the same path and
     * the second write is skipped. The write itself goes to a temporary file and is then moved
     * into place, so a process killed mid-write leaves no half file that hashes to a lie.
     */
    public String store(UUID entityId, byte[] content) {
        String digest = hash(content);
        Path target = pathFor(entityId, digest);
        try {
            if (Files.exists(target)) return relative(target);
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), "incoming-", ".part");
            Files.write(temp, content);
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (FileAlreadyExistsException | AtomicMoveNotSupportedException e) {
                // Another request stored the same bytes first, or the filesystem cannot do an
                // atomic move. Either way the destination content is correct by construction.
                Files.deleteIfExists(temp);
                if (!Files.exists(target)) Files.write(target, content);
            }
            return relative(target);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store document for entity " + entityId, e);
        }
    }

    /** Reads a stored file back. */
    public byte[] read(String storagePath) {
        try {
            return Files.readAllBytes(resolve(storagePath));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + storagePath, e);
        }
    }

    public boolean exists(String storagePath) {
        return storagePath != null && Files.exists(resolve(storagePath));
    }

    private Path pathFor(UUID entityId, String digest) {
        // Two levels of fan-out. A directory with fifty thousand entries in it is a directory
        // nobody can list, and evidence for 28 entities over several years gets there.
        return root.resolve(entityId.toString())
                   .resolve(digest.substring(0, 2))
                   .resolve(digest.substring(2, 4))
                   .resolve(digest);
    }

    private String relative(Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }

    /**
     * Resolves a stored path back to a real file, refusing anything that escapes the root.
     *
     * <p>Storage paths are generated here and never taken from a request, so this is a second
     * line rather than the first. It is cheap and it means a future caller that does pass user
     * input in cannot walk the filesystem with it.
     */
    private Path resolve(String storagePath) {
        Path resolved = root.resolve(storagePath).normalize();
        if (!resolved.startsWith(root)) {
            log.warn("Refused a storage path outside the document root: {}", storagePath);
            throw new IllegalArgumentException("Storage path outside the document root");
        }
        return resolved;
    }
}
