package za.gov.dsac.vuka.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import za.gov.dsac.vuka.domain.Enums.NotificationOffset;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.ReportingPeriod;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

class NotificationScheduleTest {

    private static long runs(NotificationOffset offset, boolean email) {
        return IntStream.range(0, 24)
                .filter(h -> email ? NotificationService.emailDue(offset, h)
                                   : NotificationService.teamsDue(offset, h))
                .count();
    }

    @Test
    @DisplayName("Reminders fall on 30 days, 15 days, the day before and the day itself, and nowhere else")
    void offsets() {
        assertEquals(NotificationOffset.THIRTY_DAYS, NotificationService.offsetFor(30));
        assertEquals(NotificationOffset.FIFTEEN_DAYS, NotificationService.offsetFor(15));
        assertEquals(NotificationOffset.HOURLY, NotificationService.offsetFor(1));
        assertEquals(NotificationOffset.HOURLY, NotificationService.offsetFor(0));
        for (long d : new long[] {31, 29, 16, 14, 2, -1}) {
            assertNull(NotificationService.offsetFor(d), "day " + d);
        }
    }

    @Test
    @DisplayName("An hourly job sends one email a day, not twenty-four")
    void emailOncePerDay() {
        for (NotificationOffset o : NotificationOffset.values()) {
            assertEquals(1, runs(o, true), o.name());
        }
        assertTrue(NotificationService.emailDue(NotificationOffset.THIRTY_DAYS, NotificationService.MORNING_HOUR));
        assertFalse(NotificationService.emailDue(null, NotificationService.MORNING_HOUR));
    }

    @Test
    @DisplayName("Teams gets one post at 30 and 15 days and an hourly countdown at the end")
    void teamsCadence() {
        assertEquals(1, runs(NotificationOffset.THIRTY_DAYS, false));
        assertEquals(1, runs(NotificationOffset.FIFTEEN_DAYS, false));
        assertEquals(24, runs(NotificationOffset.HOURLY, false));
        assertFalse(NotificationService.teamsDue(null, NotificationService.MORNING_HOUR));
    }

    @Test
    @DisplayName("The email names the targets that still have no evidence")
    void body() {
        PublicEntity entity = new PublicEntity();
        entity.setName("Iziko Museums of South Africa");
        ReportingPeriod period = new ReportingPeriod();
        period.setLabel("Q2 2026/27");
        period.setRegulatoryDeadline(LocalDate.of(2026, 10, 30));

        String text = NotificationService.emailBody(entity, period, "is due in 15 day(s)",
                List.of("PO 1.1", "PO 2.3"));
        assertTrue(text.contains("Q2 2026/27 is due in 15 day(s) (2026-10-30)"));
        assertTrue(text.contains("2 target(s) still have no evidence attached"));
        assertTrue(text.contains("  - PO 1.1\n") && text.contains("  - PO 2.3\n"));

        String done = NotificationService.emailBody(entity, period, "is due today", List.of());
        assertTrue(done.contains("Every target has evidence attached"));
    }

    @Test
    @DisplayName("Recipients drop blanks and duplicates, and nothing is sent with no relay configured")
    void recipients() {
        assertEquals(List.of("a@x.org.za", "b@x.org.za"),
                EmailNotifier.clean(Arrays.asList(" A@x.org.za", null, "", "a@x.org.za", "b@x.org.za")));

        EmailNotifier off = new EmailNotifier("", 587, "", "", "", "");
        assertFalse(off.isConfigured());
        assertFalse(off.send(List.of("a@x.org.za"), "s", "b"));
    }
}
