import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting helpers using Upstash Redis.
 *
 * Gracefully degrades to `null` if UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN are not configured — routes will skip
 * rate-limiting rather than erroring during local development.
 */

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function createLimiter(
  redis: Redis | null,
  prefix: string,
  requests: number,
  windowSeconds: number
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix,
    analytics: false,
  });
}

const redis = createRedis();

/**
 * Proof upload: 10 uploads per user per minute.
 * Prevents bulk-upload abuse / storage hammering.
 */
export const proofUploadLimiter = createLimiter(redis, 'rl:proof-upload', 10, 60);

/**
 * Manual escalation: 5 escalations per user per minute.
 * Prevents spam-escalation flooding the notification system.
 */
export const escalationLimiter = createLimiter(redis, 'rl:escalation', 5, 60);

/**
 * Auth-adjacent / admin user management: 20 requests per IP per minute.
 * Applied to admin user creation and similar sensitive endpoints.
 */
export const authLimiter = createLimiter(redis, 'rl:auth', 20, 60);

/**
 * Apply a rate limiter in a Next.js Route Handler.
 *
 * Returns a `NextResponse` 429 if the limit is exceeded, or `null` if the
 * request is allowed (or if rate limiting is disabled / unconfigured).
 *
 * @param limiter  One of the exported limiters above (may be null if unconfigured)
 * @param key      A string that identifies the caller — typically user_id or IP
 */
export async function applyRateLimit(
  limiter: Ratelimit | null,
  key: string
): Promise<{ limited: boolean; headers: Record<string, string> }> {
  if (!limiter) {
    return { limited: false, headers: {} };
  }

  const { success, limit, remaining, reset } = await limiter.limit(key);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };

  return { limited: !success, headers };
}
