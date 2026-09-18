package za.gov.dsac.vuka.web;

import org.springframework.context.MessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import za.gov.dsac.vuka.config.LocaleConfig;
import za.gov.dsac.vuka.service.PublicationService;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * The data behind the full citizen view.
 *
 * <p>The same projection the light view renders, as JSON, and nothing more. Everything the
 * {@link PublicationService} Javadoc says is absent is absent here too: no risk scores, no
 * unconfirmed figures, no contact details, no comments. An unpublished entity is a 404.
 *
 * <p>Open to the world like the rest of {@code /public/**}, and read-only.
 */
@RestController
@RequestMapping("/public/api")
public class PublicApiController {

    private final PublicationService publication;
    private final MessageSource messages;

    /** Every key in the English bundle, which is the fallback and so the complete list. */
    private final List<String> keys;

    public PublicApiController(PublicationService publication, MessageSource messages) {
        this.publication = publication;
        this.messages = messages;
        try {
            this.keys = PropertiesLoaderUtils.loadProperties(new ClassPathResource("messages.properties"))
                    .stringPropertyNames().stream().sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("messages.properties is missing from the classpath", e);
        }
    }

    @GetMapping("/entities")
    public List<PublicationService.CitizenView> entities() {
        return publication.publishedEntities();
    }

    @GetMapping("/entities/{id}")
    public PublicationService.CitizenView entity(@PathVariable("id") UUID id) {
        var view = publication.findPublished(id);
        if (view == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return view;
    }

    /**
     * The citizen strings in one language, resolved the way the light view resolves them: the
     * {@code lang} parameter, then Accept-Language, then English, with a key missing from a
     * translation falling back to English.
     *
     * <p>Patterns are returned unformatted, with their {0} placeholders, and filled in on the
     * page. One set of translation files serves both views, so a corrected isiZulu sentence is
     * corrected in both.
     */
    @GetMapping("/messages")
    public Map<String, Object> strings(Locale locale) {
        Map<String, String> out = new TreeMap<>();
        for (String key : keys) {
            out.put(key, messages.getMessage(key, null, key, locale));
        }
        return Map.of(
                "lang", locale.getLanguage(),
                "languages", LocaleConfig.SUPPORTED,
                "messages", out);
    }
}
