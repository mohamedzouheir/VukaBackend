package za.gov.dsac.vuka.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
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
        return "public-index";
    }

    /**
     * One entity.
     *
     * An unpublished entity returns 404 rather than a "not published yet" page: the
     * public surface should not confirm what exists behind it.
     */
    @GetMapping("/entity/{id}")
    public String entity(@PathVariable UUID id, Model model) {
        var view = publication.findPublished(id);
        if (view == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        model.addAttribute("e", view);
        return "public-entity";
    }
}
