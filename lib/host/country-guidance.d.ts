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
export declare const COUNTRY_DIRECTIVE_GUIDANCE: string;
/** Structural mirror of the `systemPrompt` registry face this module uses. */
export interface SystemPromptLike {
    section(section: {
        name: string;
        order: number;
        text: string;
    }): unknown;
    getSectionOrder?(name: string): number;
}
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
export declare function registerCountryGuidance(ctx: {
    inject?: (deps: string[], callback: (scope: any) => void) => unknown;
    systemPrompt?: SystemPromptLike;
}): boolean;
/**
 * Text to hand back to the model when it wrote a `country:` directive we could
 * not resolve. Silent fallback would teach it nothing, and it would keep
 * emitting the same invalid code.
 */
export declare function countryDirectiveNotice(hints: SearchHints): string | undefined;
