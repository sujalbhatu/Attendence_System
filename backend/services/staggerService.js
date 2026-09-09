// Memory-based slot allocator for flattening the 10:00 AM Thundering Herd
const sessionCounters = new Map();

export class StaggerService {
  /**
   * Assigns a staggered upload window (0 to 6000ms delay) with random jitter
   * to spread incoming image uploads evenly across the ML pipeline.
   */
  static assignUploadDelay(sessionId) {
    const key = sessionId.toString();
    const currentCount = (sessionCounters.get(key) || 0) + 1;
    sessionCounters.set(key, currentCount);

    // Stagger every 25 students into a 1.5-second time slice
    const bucket = Math.floor((currentCount - 1) / 25);
    const jitterMs = Math.floor(Math.random() * 600); // 0-600ms random jitter
    const delayMs = Math.min(6000, (bucket * 1500) + jitterMs);

    return delayMs;
  }

  static resetSession(sessionId) {
    sessionCounters.delete(sessionId.toString());
  }
}
