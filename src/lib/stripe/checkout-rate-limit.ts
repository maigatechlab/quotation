// In-memory sliding-window rate limit for the public checkout session
// endpoint — no session/auth to key off, so we key by client IP. Mirrors the
// pattern in src/lib/password-reset-rate-limit.ts.
const WINDOW_MS = 3_600_000; // 1 hour
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

export function resetCheckoutRateLimitForTests(): void {
  attempts.clear();
}

/** Returns true if the request is allowed; records the attempt either way. */
export function checkCheckoutRateLimit(ip: string, now = Date.now()): boolean {
  const recent = (attempts.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);

  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(ip, recent);
    return false;
  }

  recent.push(now);
  attempts.set(ip, recent);
  return true;
}
