/**
 * dsh-web-tools — Provider-native typed execution options.
 *
 * Dedicated typed settings per provider. No universal SearchOptions.
 * @module
 */
/** The Exa /search `type` values the plugin offers — the Exa 3.0 lineup. */
export type ExaSearchType = "auto" | "lite" | "deep-lite" | "deep";
/**
 * Map a stored searchType onto the Exa 3.0 vocabulary.
 *
 * Exa 3.0 (2026-10-19) retired `fast` / `instant` / `deep-reasoning`; its own
 * migration guidance maps them to `lite` / `deep`. Settings saved before
 * v0.3.9 may still hold a legacy value — migrate instead of dropping, so a
 * "fast" user does not silently fall back to `auto`. Unknown values return
 * undefined and are dropped by the sanitizer.
 */
export declare function normalizeExaSearchType(value: unknown): ExaSearchType | undefined;
export interface ExaProviderOptions {
    /**
     * Exa /search `type`. Exa 3.0 (2026-10-19) recommends `auto`, `lite` and
     * `deep`. `lite` serves cached content only and rejects freshness
     * parameters. Legacy `fast` / `instant` / `deep-reasoning` are migrated to
     * `lite` / `deep` by normalizeExaSearchType.
     */
    searchType?: ExaSearchType;
    maxAgeHours?: number;
}
export interface TavilyProviderOptions {
    searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
    chunksPerSource?: 1 | 2 | 3;
    autoParameters?: boolean;
    /** Extract depth for /extract (web_fetch). */
    fetchExtractDepth?: "basic" | "advanced";
}
export interface BraveProviderOptions {
    endpointPreference?: "auto" | "llm-context" | "web-search";
    contextThresholdMode?: "strict" | "balanced" | "lenient" | "disabled";
    contextTokenBudget?: number;
}
export interface YouProviderOptions {
    extractionMode?: "highlights" | "none";
    fetchCrawlTimeoutSec?: number;
    fetchMaxAgeSec?: number;
}
export interface FirecrawlProviderOptions {
    fetchOnlyMainContent?: boolean;
    fetchMaxAgeMs?: number;
}
export interface ParallelProviderOptions {
    mode?: "turbo" | "fast" | "basic" | "advanced";
    maxCharsTotal?: number;
}
export interface JinaProviderOptions {
    /**
     * Reader page loading engine.
     * undefined / auto = Jina default.
     */
    fetchEngine?: "auto" | "curl" | "browser";
    /**
     * Max acceptable cache age in seconds.
     * undefined = Jina default. 0 = force fresh (X-No-Cache equivalent).
     */
    fetchCacheToleranceSec?: number;
    /**
     * Trim output rather than reject — the normal context-size guard.
     */
    fetchMaxTokens?: number;
    /**
     * Hard budget guard; Jina rejects the request if the page would exceed it.
     */
    fetchTokenBudget?: number;
    /**
     * Higher-quality HTML→Markdown conversion (ReaderLM-v2); ~3x Reader tokens.
     */
    fetchReaderLmV2?: boolean;
}
export interface ProviderOptionsMap {
    exa: ExaProviderOptions;
    tavily: TavilyProviderOptions;
    brave: BraveProviderOptions;
    you: YouProviderOptions;
    firecrawl: FirecrawlProviderOptions;
    parallel: ParallelProviderOptions;
    jina: JinaProviderOptions;
}
export type KnownProviderWithOptions = keyof ProviderOptionsMap;
export type StoredProviderOptions = Partial<{
    [K in keyof ProviderOptionsMap]: ProviderOptionsMap[K];
}>;
export interface ProviderOptionView<T extends object = Record<string, unknown>> {
    overrides: Partial<T>;
    effective: T;
    customized: boolean;
    isDefault: boolean;
}
