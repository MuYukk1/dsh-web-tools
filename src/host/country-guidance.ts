/**
 * dsh-web-tools — model-facing guidance for the `country:` directive.
 *
 * DSH's `web_search` schema is owned by `dsh-tool-web` and accepts exactly one
 * argument (`queries: string[]`), so a provider plugin cannot add a `country`
 * parameter to it. The supported way for the model to pin a region is therefore
 * a query operator, and the model only learns about it through a system-prompt
 * section — hence this module.
 *
 * Precedence, highest first:
 *   1. the model's `country:<code>` directive (explicit intent),
 *   2. inference from country names in the query (`EXPLICIT_COUNTRY_PATTERNS`),
 *   3. the provider's own default (no `country` parameter at all),
 *   4. the next provider in the fallback chain, when this one rejects the request.
 * @module
 */

import type { SearchHints } from "./search-hints.ts";

/** Injected as a system-prompt section; keep it short and imperative. */
export const COUNTRY_DIRECTIVE_GUIDANCE =
  'Country targeting: to get results from a specific country, append `country:<code>` to ONE query, ' +
  'e.g. "electric vehicle subsidies country:de". Use an ISO 3166-1 alpha-2 code (de, us, gb, jp, sg). ' +
  "The directive is stripped before the search runs and overrides the country inferred from country " +
  "names in the query; an unrecognised code is ignored and the query still runs without a country filter.";

/** Structural mirror of the `systemPrompt` registry face this module uses. */
export interface SystemPromptLike {
  section(section: { name: string; order: number; text: string }): unknown;
  getSectionOrder?(name: string): number;
}

/** Order used when the host does not expose `getSectionOrder` (right after web_search's own section). */
const DEFAULT_ORDER = 2001;

/**
 * Register the guidance once the `systemPrompt` service is available.
 *
 * Deliberately an optional dependency: adding `systemPrompt` to the plugin's
 * `inject` list would leave the whole plugin pending on a host that lacks the
 * service (the exact failure mode `webRuntime` caused on DSH 0.2.1). A missing
 * prompt section costs discoverability, never functionality.
 *
 * @returns whether a registration was attempted synchronously.
 */
export function registerCountryGuidance(ctx: {
  inject?: (deps: string[], callback: (scope: any) => void) => unknown;
  systemPrompt?: SystemPromptLike;
}): boolean {
  const register = (scope: { systemPrompt?: SystemPromptLike }) => {
    const prompt = scope?.systemPrompt;
    if (!prompt || typeof prompt.section !== "function") return;
    const order =
      (typeof prompt.getSectionOrder === "function" ? prompt.getSectionOrder("TOOL_WEB_SEARCH") : DEFAULT_ORDER - 1) + 1;
    try {
      prompt.section({ name: "tool:web_search:country", order, text: COUNTRY_DIRECTIVE_GUIDANCE });
    } catch {
      // A colliding name/order must never take the plugin down; the directive
      // still works, the model just learns about it from the docs instead.
    }
  };

  if (typeof ctx.inject === "function") {
    ctx.inject(["systemPrompt"], register);
    return true;
  }
  register(ctx);
  return Boolean(ctx.systemPrompt);
}

/**
 * Text to hand back to the model when it wrote a `country:` directive we could
 * not resolve. Silent fallback would teach it nothing, and it would keep
 * emitting the same invalid code.
 */
export function countryDirectiveNotice(hints: SearchHints): string | undefined {
  const directive = hints.countryDirective;
  if (!directive || directive.code) return undefined;
  const written = directive.raw ? `"${directive.raw}"` : "(empty)";
  return (
    `Note: ignored unrecognised country directive ${written} — expected an ISO 3166-1 alpha-2 code ` +
    `such as "de", or an English country name such as "germany". The search ran without a country filter.`
  );
}
