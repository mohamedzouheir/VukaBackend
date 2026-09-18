package za.gov.dsac.vuka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.ResponseEntity;
import za.gov.dsac.vuka.domain.ReportingPeriod;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.repository.ReportingPeriodRepository;
import za.gov.dsac.vuka.service.ReporterAccountService;
import za.gov.dsac.vuka.service.ReportingViewService;
import za.gov.dsac.vuka.web.AdminController;
import za.gov.dsac.vuka.web.AdminController.DueDateRequest;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * The deadline an administrator sets is what lateness is measured against, so the rules on moving
 * it are governance rather than validation. Each test is one of them.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DeadlineRulesTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Africa/Johannesburg"));

    @Mock PublicEntityRepository entities;
    @Mock ReportingPeriodRepository periods;
    @Mock ReportingViewService views;
    @Mock ReporterAccountService accounts;

    AdminController admin;
    ReportingPeriod quarter;

    @BeforeEach
    void setUp() {
        admin = new AdminController(entities, periods, views, accounts);
        quarter = new ReportingPeriod();
        quarter.setId(UUID.randomUUID());
        quarter.setLabel("Q2");
        quarter.setPeriodEnd(TODAY.plusDays(10));
        quarter.setSubmissionDueDate(TODAY.plusDays(40));
        when(periods.findById(quarter.getId())).thenReturn(Optional.of(quarter));
    }

    private ResponseEntity<?> set(LocalDate date) {
        return admin.setDueDate(quarter.getId(), new DueDateRequest(date), null);
    }

    @Test
    @DisplayName("A deadline still ahead can be brought forward")
    void bringsForward() {
        LocalDate earlier = TODAY.plusDays(12);
        assertEquals(200, set(earlier).getStatusCode().value());
        assertEquals(earlier, quarter.getSubmissionDueDate());
        verify(periods).save(quarter);
    }

    @Test
    @DisplayName("A deadline that has passed cannot be moved, because lateness was measured against it")
    void passedIsFixed() {
        quarter.setPeriodEnd(TODAY.minusDays(60));
        quarter.setSubmissionDueDate(TODAY.minusDays(1));
        assertEquals(409, set(TODAY.plusDays(30)).getStatusCode().value());
        assertEquals(TODAY.minusDays(1), quarter.getSubmissionDueDate());
        verify(periods, never()).save(any());
    }

    @Test
    @DisplayName("A new deadline cannot be in the past")
    void notInThePast() {
        assertEquals(400, set(TODAY.minusDays(1)).getStatusCode().value());
        verify(periods, never()).save(any());
    }

    @Test
    @DisplayName("A deadline cannot fall before the quarter has finished")
    void notBeforeQuarterEnds() {
        assertEquals(400, set(TODAY.plusDays(5)).getStatusCode().value());
        verify(periods, never()).save(any());
    }

    @Test
    @DisplayName("A departmental instruction cannot be later than a statutory deadline")
    void notLaterThanTheLaw() {
        quarter.setRegulatoryDeadline(TODAY.plusDays(20));
        assertEquals(400, set(TODAY.plusDays(25)).getStatusCode().value());
        verify(periods, never()).save(any());
    }
}
