package za.gov.dsac.vuka.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import za.gov.dsac.vuka.service.SubmissionService;

import java.util.Map;

/**
 * An action the submission's state does not allow answers 409 with a sentence the screen can
 * show as it is, rather than a 500 with a stack trace behind it.
 *
 * <p>Limited to the JSON controllers. The phone surface renders its own message page.
 */
@RestControllerAdvice(annotations = RestController.class)
public class StateConflictAdvice {

    @ExceptionHandler(SubmissionService.StateException.class)
    public ResponseEntity<Map<String, String>> conflict(SubmissionService.StateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "conflict", "message", e.getMessage()));
    }
}
