package za.gov.dsac.vuka.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import za.gov.dsac.vuka.config.LocaleConfig;
import za.gov.dsac.vuka.service.PublicationService;

import java.util.UUID;

/**
 * The citizen view. No authentication, deliberately tiny payload.
 *
 * Server-rendered rather than a single-page app because the audience is a person on a
 * low-end phone with limited data. There is no framework to download, no API round trip,
 * and the whole page compresses to a few kilobytes.
 */
@Controller
@RequestMapping("/public")
public class PublicController {

    private final PublicationService publication;

    public PublicController(PublicationService publication) {
        this.publication = publication;
    }

    /** Index of every entity DSAC has approved for publication. */
    @GetMapping
    public String index(Model model) {
        model.addAttribute("entities", publication.publishedEntities());
        languages(model, "/public");
        return "public-index";
    }

    /**
     * One entity.
     *
     * An unpublished entity returns 404 rather than a "not published yet" page: the
     * public surface should not confirm what exists behind it.
     */
    @GetMapping("/entity/{id}")
    public String entity(@PathVariable("id") UUID id, Model model) {
        var view = publication.findPublished(id);
        if (view == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        model.addAttribute("e", view);
        languages(model, "/public/entity/" + id);
        return "public-entity";
    }

    /**
     * Feeds the language switcher.
     *
     * <p>The path is passed in rather than read from the request because Thymeleaf 3.1 removed
     * the servlet objects from the expression context. It is also the better shape: the switcher
     * links back to the page you are on, and the controller is the thing that knows what that is.
     */
    private static void languages(Model model, String path) {
        model.addAttribute("languages", LocaleConfig.SUPPORTED);
        model.addAttribute("path", path);
    }
}
