import { Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number;
}

/**
 * Resilient HTTP client for outbound calls to external providers
 * (Razorpay, ShipRocket, SMS/WhatsApp, etc.).
 *
 * Implements explicit timeouts, and wraps calls in a circuit breaker so a
 * failing dependency fails fast instead of exhausting resources
 * (RESILIENCY-10). All external calls MUST go through this service.
 */
@Injectable()
export class ResilientHttpService {
  private readonly logger = new Logger(ResilientHttpService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  /**
   * Perform an HTTP request identified by a logical `dependency` name (used to
   * scope the circuit breaker, e.g. "razorpay", "shiprocket").
   */
  async request<T>(dependency: string, url: string, options: HttpRequestOptions = {}): Promise<T> {
    const breaker = this.getBreaker(dependency, options.timeoutMs ?? 8000);
    return breaker.fire(url, options) as Promise<T>;
  }

  private getBreaker(dependency: string, timeoutMs: number): CircuitBreaker {
    const existing = this.breakers.get(dependency);
    if (existing) return existing;

    const action = async (url: string, options: HttpRequestOptions): Promise<unknown> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? timeoutMs);
      try {
        const res = await fetch(url, {
          method: options.method ?? 'GET',
          headers: {
            'content-type': 'application/json',
            ...(options.headers ?? {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`${dependency} responded ${res.status}`);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      } finally {
        clearTimeout(timer);
      }
    };

    const breaker = new CircuitBreaker(action, {
      timeout: timeoutMs,
      errorThresholdPercentage: 50,
      resetTimeout: 15_000,
      rollingCountTimeout: 30_000,
    });
    breaker.on('open', () => this.logger.warn(`Circuit OPEN for dependency "${dependency}"`));
    breaker.on('halfOpen', () => this.logger.log(`Circuit HALF-OPEN for "${dependency}"`));
    breaker.on('close', () => this.logger.log(`Circuit CLOSED for "${dependency}"`));

    this.breakers.set(dependency, breaker);
    return breaker;
  }
}
