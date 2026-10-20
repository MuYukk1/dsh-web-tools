/**
 * dsh-web-tools — Provider-native option contracts.
 *
 * Pure data + predicates defining the valid option values for each provider's
 * UI controls. These are extracted from ProviderPreferencesSection.tsx so
 * unit tests can verify the contracts without a DOM environment.
 * @module
 */
import { normalizeExaSearchType } from "../../shared/provider-options.js";
/** Brave context_threshold_mode values accepted by the API. */
export const BRAVE_THRESHOLD_OPTIONS = ["strict", "balanced", "lenient", "disabled"];
/** Brave context_threshold_mode UI labels (zh). */
export const BRAVE_THRESHOLD_LABELS_ZH = ["严格", "平衡", "宽松", "关闭"];
/** Brave context_token_budget presets in ascending order. */
export const BRAVE_TOKEN_BUDGET_PRESETS = [4096, 8192, 16384, 32768];
/** Brave endpoint preference modes. */
export const BRAVE_ENDPOINT_OPTIONS = ["auto", "llm-context", "web-search"];
/** Parallel primary UI modes (stable, always available). */
export const PARALLEL_PRIMARY_MODES = ["advanced", "basic"];
/** Parallel experimental modes (compatible but not primary). */
export const PARALLEL_EXPERIMENTAL_MODES = ["fast", "turbo"];
/** All Parallel modes accepted by the adapter. */
export const PARALLEL_ALL_MODES = [...PARALLEL_PRIMARY_MODES, ...PARALLEL_EXPERIMENTAL_MODES];
/** Tavily search depth options. */
export const TAVILY_DEPTH_OPTIONS = ["basic", "advanced", "fast", "ultra-fast"];
/** Whether chunks_per_source should be shown for a given Tavily depth and autoParams state. */
export function tavilyChunksVisible(depth, autoParams) {
    return depth === "advanced" && !autoParams;
}
/** Exa search type options — the Exa 3.0 lineup (legacy fast / instant / deep-reasoning removed). */
export const EXA_SEARCH_TYPE_OPTIONS = ["auto", "lite", "deep-lite", "deep"];
/** Map an Exa mode to its SIMPLE (primary) UI bucket. */
export function exaPrimaryMode(mode) {
    const m = normalizeExaSearchType(mode) ?? "auto";
    if (m === "auto")
        return "auto";
    // lite is Exa 3.0's recommended low-latency type.
    if (m === "lite")
        return "fast";
    return "deep";
}
/**
 * Lossless primary-mode guard: clicking "深入" must never overwrite an
 * existing precise deep variant (deep-lite / deep) with plain "deep". The
 * precise value is only changeable in the native picker.
 */
export function exaPrimaryApplyable(v, currentMode) {
    const m = normalizeExaSearchType(currentMode) ?? "auto";
    if (v === "deep" && m.startsWith("deep"))
        return false;
    return true;
}
/** You.com extraction mode options. */
export const YOU_EXTRACTION_MODE_OPTIONS = ["highlights", "none"];
/** Firecrawl fetch options. */
export const FIRECRAWL_FETCH_OPTIONS = { onlyMainContent: true, maxAgeMs: 172800000 };
/** Jina engine options. */
export const JINA_ENGINE_OPTIONS = ["auto", "curl", "browser"];
