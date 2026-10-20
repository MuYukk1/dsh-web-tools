/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = true` (token-efficient extractive highlights;
 *   Exa 3.0 upgrades this to cross-result Dynamic Highlights at no charge)
 * - `type: "auto"` for balanced neural / keyword retrieval. Exa 3.0's lineup
 *   is `auto` / `lite` / `deep-lite` / `deep`; the legacy `fast` / `instant` /
 *   `deep-reasoning` values were removed from the plugin (settings saved
 *   before v0.3.9 are migrated by normalizeExaSearchType).
 * - `type: "lite"` serves cached content only and REJECTS freshness parameters
 *   (a parameter lite does not support returns a 400), so `maxAgeHours` is
 *   omitted for lite instead of forwarded.
 * - Response `notices` explain how results were produced — Exa's docs say to
 *   pass them to the model with the results — so they are surfaced through
 *   SearchOutcome.content. `warnings` are for the integrator, not the model,
 *   and are intentionally not forwarded.
 * - /contents uses `urls` + `text: true` for full-page markdown fetch
 *
 * @module
 */
import { providerError, classifyHttpStatus, resolveContext, parseRetryAfter } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
import { endpointViewOf } from "../endpoints.js";
/** Official fallback. The search endpoint is overridable via providerBaseUrls;
 *  `/contents` (web_fetch) stays pinned to the official host on purpose — a
 *  gateway that proxies /search may not proxy extraction, and reusing the
 *  override there would send the credential to an unverified endpoint. */
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
/**
 * Build the POST request body for Exa /search.
 * Supports:
 *  - query (cleanQuery)
 *  - type: auto / fast / deep etc.
 *  - category: "publication" (research), "news" (news), "financial report" (finance), "company", "people"
 *  - includeDomains / excludeDomains
 *  - startPublishedDate / endPublishedDate (ISO 8601)
 *  - userLocation (country code)
 */
export function buildExaSearchBody(query, numResults, options, hints) {
    const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
    const type = options?.searchType ?? "auto";
    const body = {
        query: cleanQ,
        type,
        numResults,
        contents: {
            highlights: true,
            // Exa Lite serves cached content only and rejects freshness parameters
            // with a 400 that names them — omit rather than forward on lite.
            ...(typeof options?.maxAgeHours === "number" && type !== "lite" ? { maxAgeHours: options.maxAgeHours } : {}),
        },
    };
    // 1. Category mapping (Exa officially uses "publication" for papers/academic, "news", "financial report")
    if (hints?.topic === "research") {
        body.category = "publication";
    }
    else if (hints?.topic === "news") {
        body.category = "news";
    }
    else if (hints?.topic === "finance") {
        body.category = "financial report";
    }
    // 2. Domain filters
    if (hints?.domains?.include && hints.domains.include.length > 0) {
        body.includeDomains = hints.domains.include;
    }
    if (hints?.domains?.exclude && hints.domains.exclude.length > 0) {
        body.excludeDomains = hints.domains.exclude;
    }
    // 3. Date filters (ISO 8601)
    if (hints?.freshness?.after) {
        body.startPublishedDate = `${hints.freshness.after}T00:00:00.000Z`;
    }
    if (hints?.freshness?.before) {
        body.endPublishedDate = `${hints.freshness.before}T23:59:59.999Z`;
    }
    // 4. User location
    if (hints?.locale?.country) {
        body.userLocation = hints.locale.country;
    }
    return body;
}
/**
 * Parse an Exa HTTP error response into a classified ProviderError.
 *
 * Exa returns machine-readable error `tag` in the JSON body (verified
 * against https://exa.ai/docs/reference/error-codes):
 *   INVALID_API_KEY → 401, NO_MORE_CREDITS → 402,
 *   API_KEY_BUDGET_EXCEEDED → 402, TEAM_BUDGET_EXCEEDED → 402,
 *   ACCESS_DENIED → 403.
 *
 * 429 has a separate shape (no tag, may carry Retry-After header).
 * We parse Retry-After (seconds → ms) and attach it to the error message
 * so the runtime can use it for cooldown.
 */
async function throwExaError(res) {
    const status = res.status;
    // Try to read Exa's JSON error body for the machine-readable tag.
    let tag;
    let message;
    try {
        const body = await res.json();
        tag = typeof body?.error?.tag === "string" ? body.error.tag : undefined;
        message = typeof body?.error?.message === "string" ? body.error.message : undefined;
    }
    catch {
        // Non-JSON body — fall through to status-based classification.
    }
    // Retry-After header (seconds) — present on 429, sometimes on 503.
    const retryAfterRaw = res.headers.get("retry-after");
    let retryHint = "";
    if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds) && seconds > 0) {
            retryHint = ` (retry after ${seconds}s)`;
        }
    }
    // Exa-specific tag → precise code mapping.
    if (tag === "INVALID_API_KEY" || status === 401) {
        throw providerError("auth", `Exa: invalid or missing API key${retryHint}`, status);
    }
    if (tag === "NO_MORE_CREDITS" || tag === "API_KEY_BUDGET_EXCEEDED" || tag === "TEAM_BUDGET_EXCEEDED" || status === 402) {
        throw providerError("quota", `Exa: ${tag ?? "credits exhausted"}${retryHint}`, status);
    }
    if (tag === "ACCESS_DENIED" || status === 403) {
        throw providerError("auth", `Exa: access denied${retryHint}`, status);
    }
    if (status === 429) {
        throw providerError("rate-limit", `Exa: rate limit exceeded${retryHint}`, status, parseRetryAfter(res));
    }
    if (status === 408) {
        throw providerError("timeout", `Exa: request timed out`, status);
    }
    if (status >= 500) {
        throw providerError("server", `Exa: server error (HTTP ${status})${retryHint}`, status);
    }
    // Fallback: classify by status using the shared taxonomy.
    const code = classifyHttpStatus(status);
    throw providerError(code, `Exa: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}
/**
 * Flatten an Exa 3.0 `notices` array into one model-facing string.
 *
 * Exa's docs: notices "tell the model reading the results how they were
 * produced" (e.g. when no page matched a `site:` operator and the search ran
 * without it). The item shape is read defensively (`message` / `description`
 * / `text` / raw JSON) so a future field rename degrades to a verbose but
 * harmless note instead of a crash.
 */
export function formatExaNotices(notices) {
    if (!Array.isArray(notices) || notices.length === 0)
        return undefined;
    const lines = [];
    for (const n of notices) {
        if (typeof n === "string") {
            if (n.trim())
                lines.push(n.trim());
        }
        else if (n && typeof n === "object") {
            const o = n;
            let line = "";
            for (const key of ["message", "description", "text", "notice"]) {
                if (typeof o[key] === "string" && o[key].trim()) {
                    line = o[key].trim();
                    break;
                }
            }
            if (!line) {
                try {
                    line = JSON.stringify(o);
                }
                catch {
                    line = "";
                }
            }
            if (line)
                lines.push(line);
        }
    }
    const unique = [...new Set(lines)];
    return unique.length > 0 ? `Exa: ${unique.join(" | ")}` : undefined;
}
export const EXA_META = {
    name: "exa",
    label: "Exa",
    description: "Semantic / neural web search (highlights & auto search)",
    credSuffix: "EXA",
    fetchCapable: true,
    needsBaseUrl: false,
};
export const ExaProvider = {
    ...EXA_META,
    async search(query, maxResults, apiKey, baseUrl, contextOrSignal) {
        const { signal, options, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Exa API key is not configured");
        const numResults = typeof maxResults === "number" && maxResults > 0 ? Math.min(maxResults, 25) : 10;
        const body = buildExaSearchBody(query, numResults, options, hints);
        const searchUrl = endpointViewOf("exa", { exa: baseUrl })?.url ?? EXA_SEARCH_URL;
        const res = await fetchWithProxy(searchUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": token,
            },
            body: JSON.stringify(body),
            signal,
        }, { provider: "exa" });
        if (!res.ok)
            await throwExaError(res);
        const raw = await res.json();
        const results = Array.isArray(raw?.results) ? raw.results : [];
        const sources = results
            .map((r) => {
            const url = typeof r?.url === "string" ? r.url : "";
            if (!url)
                return null;
            const s = { url };
            if (typeof r.title === "string" && r.title)
                s.title = r.title;
            // highlights[] is query-relevant extractive markup (preferred over raw text for agent density)
            if (Array.isArray(r.highlights) && r.highlights.length > 0) {
                const joined = r.highlights.filter((h) => typeof h === "string").join("\n\n").trim();
                if (joined)
                    s.snippet = joined.length > 1200 ? joined.slice(0, 1200) + "…" : joined;
            }
            else if (typeof r.text === "string" && r.text) {
                s.snippet = r.text.length > 600 ? r.text.slice(0, 600) + "…" : r.text;
            }
            if (typeof r.publishedDate === "string" && r.publishedDate)
                s.publishedAt = r.publishedDate;
            return s;
        })
            .filter((x) => x !== null);
        // Exa 3.0 notices ride the SearchOutcome.content channel; `warnings`
        // (integrator-facing, e.g. IGNORED_FIELD) are deliberately not forwarded.
        const notices = formatExaNotices(raw?.notices);
        return notices ? { sources, content: notices } : { sources };
    },
    async fetch(url, apiKey, _baseUrl, contextOrSignal) {
        const { signal, options } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Exa API key is not configured");
        const body = {
            urls: [url],
            text: true,
        };
        // Share the same content freshness setting as search (maxAgeHours).
        if (typeof options?.maxAgeHours === "number") {
            body.maxAgeHours = options.maxAgeHours;
        }
        const res = await fetchWithProxy(EXA_CONTENTS_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": token,
            },
            body: JSON.stringify(body),
            signal,
        }, { provider: "exa" });
        if (!res.ok)
            await throwExaError(res);
        const data = await res.json();
        // Exa /contents returns per-URL statuses in data.statuses[] (HTTP 200 may still have a URL error).
        const statusEntry = Array.isArray(data?.statuses) ? data.statuses[0] : undefined;
        if (statusEntry && statusEntry.status !== "success" && statusEntry.status !== 200) {
            const errMsg = statusEntry.error?.message || statusEntry.error?.tag || `status ${statusEntry.status}`;
            throw providerError("server", `Exa /contents failed for ${url}: ${errMsg}`);
        }
        const result = data?.results?.[0];
        const text = typeof result?.text === "string" ? result.text : "";
        if (!text)
            throw providerError("server", `Exa returned no text content for ${url}`);
        return { text };
    },
};
