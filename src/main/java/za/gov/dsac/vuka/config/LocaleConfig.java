package za.gov.dsac.vuka.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;

import java.util.List;
import java.util.Locale;

/**
 * Language selection for the citizen surface.
 *
 * <h2>Why the language is in the URL</h2>
 *
 * The same reason the mobile flow carries its step index there. A page whose language is a
 * query parameter stays cacheable, survives a dropped connection, and opens in the language
 * it was shared in when a link is forwarded. A cookie would do none of those and would mean
 * the public surface starts storing something about a reader who never signed in, which is
 * the opposite of the narrow, non-personal projection the citizen view is supposed to be.
 *
 * <h2>Why these five</h2>
 *
 * They are the largest home-language groups in the country, and the point is to demonstrate
 * that the surface is built to carry languages rather than to claim the set is complete. It
 * is not: there are twelve official languages and this covers five of them. The remaining
 * seven are a translation job, not an engineering one, which is the honest way to put it.
 */
@Configuration
public class LocaleConfig {

    /** A language offered on the citizen surface, named in itself rather than in English. */
    public record Language(String tag, String name) {}

    public static final List<Language> SUPPORTED = List.of(
            new Language("en", "English"),
            new Language("af", "Afrikaans"),
            new Language("zu", "isiZulu"),
            new Language("xh", "isiXhosa"),
            new Language("st", "Sesotho"));

    private static final List<Locale> LOCALES =
            SUPPORTED.stream().map(l -> Locale.forLanguageTag(l.tag())).toList();

    private static final Locale FALLBACK = Locale.ENGLISH;

    @Bean
    public LocaleResolver localeResolver() {
        return new UrlLocaleResolver();
    }

    /**
     * Resolves in one order: an explicit {@code lang} parameter, then the browser's
     * Accept-Language, then English.
     */
    private static final class UrlLocaleResolver implements LocaleResolver {

        @Override
        public Locale resolveLocale(HttpServletRequest request) {
            Locale chosen = byTag(request.getParameter("lang"));
            return chosen != null ? chosen : fromAcceptLanguage(request.getHeader("Accept-Language"));
        }

        /** Stateless by design. There is nowhere to write a preference to, and nothing that should. */
        @Override
        public void setLocale(HttpServletRequest request, HttpServletResponse response, Locale locale) {
            throw new UnsupportedOperationException(
                    "Language is carried in the lang query parameter, not in server-side state.");
        }

        private static Locale byTag(String tag) {
            if (tag == null || tag.isBlank()) return null;
            String language = Locale.forLanguageTag(tag).getLanguage();
            if (language.isEmpty()) return null;
            return LOCALES.stream()
                    .filter(l -> l.getLanguage().equals(language))
                    .findFirst()
                    .orElse(null);
        }

        private static Locale fromAcceptLanguage(String header) {
            if (header == null || header.isBlank()) return FALLBACK;
            try {
                Locale match = Locale.lookup(Locale.LanguageRange.parse(header), LOCALES);
                return match != null ? match : FALLBACK;
            } catch (IllegalArgumentException e) {
                // A malformed header is a client's problem and not a reason to fail a public page.
                return FALLBACK;
            }
        }
    }
}
