package za.gov.dsac.vuka.service.karabo;

/**
 * Something Karabo could not do, named by kind rather than by message.
 *
 * <p>The kind is what reaches the browser, and the panel turns it into a sentence in the reader's
 * language. A provider's own error text never reaches the screen: it is in English, it can carry
 * request identifiers and deployment names, and it tells the reader nothing they can act on.
 */
public class KaraboException extends RuntimeException {

    public enum Kind {
        /** No endpoint, deployment or key. The panel says Karabo is not connected. */
        NOT_CONFIGURED,
        /** Anonymous questions are switched off. The panel asks the reader to sign in. */
        SIGN_IN_REQUIRED,
        /** Too many questions too quickly, or too many today. */
        RATE_LIMITED,
        /** The question or history was malformed or too long. */
        INVALID,
        /** Foundry's content filter declined the question or the answer. */
        FILTERED,
        /** Foundry did not answer in time. */
        TIMEOUT,
        /** Foundry answered with an error, or with something that could not be read. */
        PROVIDER
    }

    private final Kind kind;

    public KaraboException(Kind kind, String detail) {
        super(detail);
        this.kind = kind;
    }

    public KaraboException(Kind kind, String detail, Throwable cause) {
        super(detail, cause);
        this.kind = kind;
    }

    public Kind kind() { return kind; }
}
