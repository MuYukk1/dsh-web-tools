/**
 * dsh-web-tools — deterministic fallback policy (pure logic).
 *
 * Retryable failures trigger fallback to the next provider in order:
 *   429 (rate limit), 408 (timeout), 5xx, network unavailable, provider
 *   unavailable, caller timeout, AND auth failures (401/403): a bad key on
 *   one provider should not block the user's search — the key is marked
 *   unhealthy and the UI shows an auth error, but the search continues.
 *   A provider-side 400 also falls through: it is that provider rejecting a
 *   parameter (Tavily once rejected every `country` code), and the next source
 *   may serve the same query fine. The failure stays in `attempts`, so nothing
 *   is hidden — but the user still gets results.
 * Non-retryable (never fall back): schema/config bugs — silently switching
 * would hide a broken configuration that no provider can serve.
 * Terminal: caller cancellation (aborted) — the whole chain must stop
 * immediately, never continue to the next provider.
 * @module
 */

/** Error kinds the fallback treats as retryable. */
export const RETRYABLE = new Set(["rate-limit", "timeout", "server", "network", "unavailable", "auth", "bad-request"]);

/** Error kinds that never trigger fallback. */
export const NON_RETRYABLE = new Set(["config"]);

/** Error kinds that terminate the whole chain (caller cancellation). */
export const TERMINAL = new Set(["aborted"]);

/**
 * Classify a provider failure.
 * @param opts
 * @param opts.code machine code from the provider adapter.
 * @returns {"retryable"|"non-retryable"|"terminal"}
 */
export function classifyFailure(opts: { code: string }): "retryable" | "non-retryable" | "terminal" {
  const { code } = opts;
  if (TERMINAL.has(code)) return "terminal";
  if (RETRYABLE.has(code)) return "retryable";
  if (NON_RETRYABLE.has(code)) return "non-retryable";
  // unknown codes are treated as retryable (conservative: try the next provider)
  return "retryable";
}

/**
 * Compute the fallback chain for one operation: the default provider first,
 * then every configured fallback entry in order (deduped). No artificial cap —
 * the user configures the chain; total time is bounded by the attempt timeout
 * and the DSH tool-level timeout.
 */
export function fallbackChain(opts: {
  defaultProvider: string;
  fallbackOrder: string[];
}): string[] {
  const { defaultProvider, fallbackOrder } = opts;
  const chain = [defaultProvider];
  const seen = new Set(chain);
  for (const name of fallbackOrder ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    chain.push(name);
  }
  return chain;
}

/**
 * Deterministic decision record for one search attempt.
 */
export function attemptRecord(opts: {
  provider: string;
  attempt: number;
  outcome: "retryable" | "non-retryable" | "terminal" | "success";
  latencyMs?: number;
}): { provider: string; attempt: number; outcome: string; latencyMs?: number } {
  const { provider, attempt, outcome, latencyMs } = opts;
  return {
    provider,
    attempt,
    outcome,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
  };
}
