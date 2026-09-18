package za.gov.dsac.vuka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.*;
import za.gov.dsac.vuka.service.SubmissionService.ConfirmedRow;
import za.gov.dsac.vuka.service.SubmissionService.ReasonRequired;
import za.gov.dsac.vuka.service.SubmissionService.StateException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * What these tests are actually defending.
 *
 * <p>The confirm modal tells a reporter that a figure "cannot be edited afterwards", and the pitch
 * says performance data is append-only. Both were true only on the screen: the server accepted a
 * new figure on a submitted period, a second submission, and an approval of a period nobody had
 * submitted. These tests hold the server to what the screen says, and hold the phone to the same
 * two reason rules as the office surface.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SubmissionStateTest {

    @Mock private TemplateParser parser;
    @Mock private UnitCostService unitCost;
    @Mock private SubmissionRepository submissions;
    @Mock private TargetRepository targets;
    @Mock private TargetResultRepository results;
    @Mock private ExtractionResultRepository extractions;
    @Mock private DocumentVersionService documentVersions;
    @Mock private PublicEntityRepository entities;
    @Mock private ReportingPeriodRepository periods;
    @Mock private CommentRepository comments;

    private SubmissionService service;

    private final UUID entityId = UUID.randomUUID();
    private final UUID fyId = UUID.randomUUID();
    private Submission submission;
    private Target disputed;
    private Target settled;
    private final List<TargetResult> filed = new ArrayList<>();
    private final List<Comment> thread = new ArrayList<>();

    private static final VukaPrincipal REPORTER =
            new VukaPrincipal("uid-reporter", "r@entity.org.za", "N Mabaso", "ENTITY_REPORTER", null);
    private static final VukaPrincipal REVIEWER =
            new VukaPrincipal("uid-reviewer", "l@dsac.gov.za", "L Dlamini", "DSAC_REVIEWER", null);

    @BeforeEach
    void setUp() {
        service = new SubmissionService(parser, unitCost, submissions, targets, results, extractions,
                documentVersions, entities, periods, comments);

        PublicEntity entity = new PublicEntity();
        entity.setId(entityId);
        FinancialYear fy = new FinancialYear();
        fy.setId(fyId);
        ReportingPeriod period = new ReportingPeriod();
        period.setId(UUID.randomUUID());
        period.setFinancialYear(fy);
        period.setQuarter(2);

        submission = new Submission();
        submission.setId(UUID.randomUUID());
        submission.setEntity(entity);
        submission.setReportingPeriod(period);
        submission.setStatus(Enums.SubmissionStatus.DRAFT);

        disputed = target("1.1", new BigDecimal("10"));
        settled = target("1.2", new BigDecimal("10"));

        when(submissions.findById(submission.getId())).thenReturn(Optional.of(submission));
        when(submissions.save(any(Submission.class))).thenAnswer(i -> i.getArgument(0));
        when(targets.findById(disputed.getId())).thenReturn(Optional.of(disputed));
        when(targets.findById(settled.getId())).thenReturn(Optional.of(settled));
        when(targets.findByEntityIdAndFinancialYearId(entityId, fyId)).thenReturn(List.of(disputed, settled));
        when(results.findBySubmissionId(submission.getId())).thenReturn(filed);
        when(results.save(any(TargetResult.class))).thenAnswer(i -> i.getArgument(0));
        when(comments.findByEntityIdOrderByCreatedAtDesc(entityId)).thenReturn(thread);
    }

    private Target target(String ref, BigDecimal q2) {
        Target t = new Target();
        t.setId(UUID.randomUUID());
        t.setIndicatorRef(ref);
        t.setQ2Target(q2);
        return t;
    }

    private void file(Target t) {
        TargetResult r = new TargetResult();
        r.setTarget(t);
        r.setActualValue(BigDecimal.TEN);
        r.setConfirmedAt(Instant.now());
        filed.add(r);
    }

    private void dispute(Target t) {
        Comment c = new Comment();
        c.setAnchorType(Enums.AnchorType.TARGET);
        c.setAnchorId(t.getId());
        c.setAuthorRole(Enums.Role.DSAC_REVIEWER);
        c.setBody("Please check this figure.");
        thread.add(c);
    }

    private static ConfirmedRow row(Target t, String value, String reason) {
        return new ConfirmedRow(t.getId(), value == null ? null : new BigDecimal(value), null, reason);
    }

    // ------------------------------------------------------------------ confirm

    @Test
    @DisplayName("A submitted period refuses a new figure")
    void submittedRefusesConfirm() {
        submission.setStatus(Enums.SubmissionStatus.SUBMITTED);
        assertThrows(StateException.class,
                () -> service.confirm(submission.getId(), List.of(row(settled, "999", null)), REPORTER));
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("An approved period refuses a new figure")
    void approvedRefusesConfirm() {
        submission.setStatus(Enums.SubmissionStatus.APPROVED);
        assertThrows(StateException.class,
                () -> service.confirm(submission.getId(), List.of(row(settled, "10", null)), REPORTER));
        verify(results, never()).save(any());
    }

    @Test
    @DisplayName("A returned period reopens only the disputed figure")
    void returnedReopensOnlyDisputed() {
        file(disputed);
        file(settled);
        dispute(disputed);
        submission.setStatus(Enums.SubmissionStatus.RETURNED);

        assertEquals(1, service.confirm(submission.getId(), List.of(row(disputed, "9", null)), REPORTER));
        assertThrows(StateException.class,
                () -> service.confirm(submission.getId(), List.of(row(settled, "11", null)), REPORTER));
    }

    @Test
    @DisplayName("A shortfall past twenty percent needs a reason")
    void shortfallNeedsReason() {
        assertThrows(ReasonRequired.class,
                () -> service.confirm(submission.getId(), List.of(row(settled, "7", null)), REPORTER));
        assertEquals(1, service.confirm(submission.getId(),
                List.of(row(settled, "7", "Venue closed for repairs.")), REPORTER));
        // Twenty percent exactly is inside the line.
        assertEquals(1, service.confirm(submission.getId(), List.of(row(disputed, "8", null)), REPORTER));
    }

    @Test
    @DisplayName("No figure needs a reason, and is never stored as zero")
    void absenceNeedsReason() {
        assertThrows(ReasonRequired.class,
                () -> service.confirm(submission.getId(), List.of(row(settled, null, null)), REPORTER));
        service.confirm(submission.getId(), List.of(row(settled, null, "No result this quarter. Deferred.")), REPORTER);
        verify(results).save(argThat(r -> r.getActualValue() == null));
    }

    // ------------------------------------------------------------------ submit

    @Test
    @DisplayName("A period with an unanswered target cannot be submitted")
    void submitNeedsEveryTarget() {
        file(disputed);
        StateException e = assertThrows(StateException.class,
                () -> service.submit(submission.getId(), REPORTER));
        assertTrue(e.getMessage().startsWith("1 target"));
    }

    @Test
    @DisplayName("A submitted period cannot be submitted again")
    void noSecondSubmit() {
        file(disputed);
        file(settled);
        assertEquals(Enums.SubmissionStatus.SUBMITTED, service.submit(submission.getId(), REPORTER).getStatus());
        assertThrows(StateException.class, () -> service.submit(submission.getId(), REPORTER));
    }

    // ------------------------------------------------------------------ review

    @Test
    @DisplayName("A draft nobody submitted cannot be approved or returned")
    void draftCannotBeReviewed() {
        assertThrows(StateException.class, () -> service.review(submission.getId(), true, null, REVIEWER));
        assertThrows(StateException.class, () -> service.review(submission.getId(), false, "No.", REVIEWER));
    }

    @Test
    @DisplayName("A submitted period can be approved once")
    void approveOnce() {
        submission.setStatus(Enums.SubmissionStatus.SUBMITTED);
        assertEquals(Enums.SubmissionStatus.APPROVED,
                service.review(submission.getId(), true, null, REVIEWER).getStatus());
        assertThrows(StateException.class, () -> service.review(submission.getId(), true, null, REVIEWER));
    }
}
