package za.gov.dsac.vuka.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import za.gov.dsac.vuka.config.LocaleConfig;
import za.gov.dsac.vuka.service.PublicationService;

import java.util.UUID;

/**
 * The citizen view. No authentication.
 *
 * Served in one of two forms, chosen per request by {@link CitizenSurface}: the light view,
 * server-rendered here with no framework and a few kilobytes on the wire, for a reader on a
 * low-end phone with limited data; or the full view, a React page served from the built bundle,
 * for a reader whose connection can carry it. Both offer a link to the other, and both read the
 * same {@link PublicationService} projection.
 *
 * Unpublished entities are a 404 in both, so neither confirms what exists behind it.
 */
@Controller
@RequestMapping("/public")
public class PublicController {

    /** The full view's page, built by Vite into static/. Absent in a backend-only build. */
    private static final String RICH_PAGE = "forward:/citizen.html";

    private final PublicationService publication;
    private final boolean richAvailable;

    public PublicController(PublicationService publication) {
        this.publication = publication;
        this.richAvailable = new ClassPathResource("static/citizen.html").exists();
    }

    /** Index of every entity DSAC has approved for publication. */
    @GetMapping
    public String index(@RequestParam(name = "view", required = false) String view,
                        HttpServletRequest request, HttpServletResponse response, Model model) {
        if (rich(view, request, response)) return RICH_PAGE;
        model.addAttribute("entities", publication.publishedEntities());
        languages(model, "/public");
        return "public-index";
    }

    /**
     * One entity.
     *
     * An unpublished entity returns 404 rather than a "not published yet" page: the
     * public surface should not confirm what exists behind it. The full view gets the same
     * answer from the JSON endpoint, so choosing it does not route around the check.
     */
    @GetMapping("/entity/{id}")
    public String entity(@PathVariable("id") UUID id,
                         @RequestParam(name = "view", required = false) String view,
                         HttpServletRequest request, HttpServletResponse response, Model model) {
        if (rich(view, request, response)) return RICH_PAGE;
        var entity = publication.findPublished(id);
        if (entity == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        model.addAttribute("e", entity);
        languages(model, "/public/entity/" + id);
        return "public-entity";
    }

    /**
     * Decides the view and sets the headers that make the decision work.
     *
     * <p>Accept-CH asks a browser that supports client hints to send the connection hints on the
     * next request. Vary tells any cache between here and the reader that the same URL answers
     * differently by hint, so a light page cached for one reader is never served as the full page
     * to another, or the other way round.
     */
    private boolean rich(String view, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Accept-CH", CitizenSurface.HINTS);
        response.addHeader("Vary", CitizenSurface.HINTS);
        return CitizenSurface.choose(view,
                request.getHeader("Save-Data"),
                request.getHeader("ECT"),
                request.getHeader("Downlink"),
                richAvailable) == CitizenSurface.View.RICH;
    }

    /**
     * Feeds the language switcher and the link to the full view.
     *
     * <p>The path is passed in rather than read from the request because Thymeleaf 3.1 removed
     * the servlet objects from the expression context. It is also the better shape: the switcher
     * links back to the page you are on, and the controller is the thing that knows what that is.
     */
    private void languages(Model model, String path) {
        model.addAttribute("languages", LocaleConfig.SUPPORTED);
        model.addAttribute("path", path);
        model.addAttribute("richAvailable", richAvailable);
    }
}
