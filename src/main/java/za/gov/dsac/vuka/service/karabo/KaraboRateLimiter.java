package za.gov.dsac.vuka.service.karabo;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * How often one caller may ask.
 *
 * <p>A signed-in person is counted by their uid. Anyone else is counted by address, per minute
 * and per day, and the daily count is the real cost ceiling for a public endpoint in front of a
 * paid model: without it, one script on one laptop decides the Department's Foundry bill.
 *
 * <h2>Why in memory</h2>
 *
 * One instance is what runs today, and a limiter that forgets on restart errs towards letting a
 * reader ask. On more than one instance each keeps its own count, so the effective limit
 * multiplies by the instance count; the Foundry deployment's own tokens-per-minute quota is the
 * backstop that does not. A shared store is the change to make before scaling out.
 */
@Component
public class KaraboRateLimiter {

    private static final long MINUTE = 60_000L;
    private static final long DAY = 24 * 60 * MINUTE;
    /** Beyond this many tracked callers, idle ones are dropped so the map cannot grow forever. */
    private static final int MAX_KEYS = 50_000;

    private final Map<String, Deque<Long>> seen = new ConcurrentHashMap<>();
    private final Clock clock;

    public KaraboRateLimiter() {
        this(Clock.systemUTC());
    }

    KaraboRateLimiter(Clock clock) {
        this.clock = clock;
    }

    /**
     * Records a question from {@code key} if it is within both limits.
     *
     * @param perDay zero or less for no daily limit
     * @return false where either limit is reached, and then nothing is recorded
     */
    public boolean tryAcquire(String key, int perMinute, int perDay) {
        long now = clock.millis();
        if (seen.size() > MAX_KEYS) sweep(now);

        Deque<Long> times = seen.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            long horizon = perDay > 0 ? DAY : MINUTE;
            while (!times.isEmpty() && now - times.peekFirst() >= horizon) times.pollFirst();

            long lastMinute = times.stream().filter(t -> now - t < MINUTE).count();
            if (lastMinute >= perMinute) return false;
            if (perDay > 0 && times.size() >= perDay) return false;

            times.addLast(now);
            return true;
        }
    }

    private void sweep(long now) {
        seen.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Long last = e.getValue().peekLast();
                return last == null || now - last >= DAY;
            }
        });
    }
}
