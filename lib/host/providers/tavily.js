/**
 * dsh-web-tools — Tavily provider adapter.
 *
 * API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Base URL: https://api.tavily.com
 * - Auth: `Authorization: Bearer tvly-...` (verified 2026-08-20)
 * - POST /search — search_depth basic/advanced/fast/ultra-fast, chunks_per_source
 * - POST /extract — URL extraction for web_fetch
 *
 * Error codes (verified):
 *   400 bad request, 401 auth, 429 rate-limit,
 *   432 plan limit exceeded, 433 paygo limit exceeded, 500 server
 *
 * @module
 */
import { providerError, classifyHttpStatus, resolveContext, parseRetryAfter } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
/**
 * Tavily's `country` parameter is NOT an ISO 3166-1 alpha-2 code. It takes a
 * lowercase English country name from a fixed enumeration:
 *
 *   "Boost search results from a specific country. This will prioritize content
 *    from the selected country in the search results. Available only if topic is
 *    `general`." — https://docs.tavily.com/documentation/api-reference/endpoint/search
 *
 * Our shared `LocaleHint.country` is alpha-2 (what Brave, Exa, Firecrawl and
 * You.com expect), so the two vocabularies have to be bridged here. Forwarding
 * the raw code made every query that merely mentioned a country fail outright:
 *
 *   bad-request: Tavily: Invalid country. Must be a valid country name from the
 *   list of supported countries
 *
 * — a hard 400 before retrieval ever ran. Anything absent from this table is
 * dropped rather than forwarded: losing a ranking nudge is much cheaper than
 * losing the whole search.
 */
const TAVILY_COUNTRY_BY_ISO2 = (() => {
    const packed = "AF:afghanistan,AL:albania,DZ:algeria,AD:andorra,AO:angola,AR:argentina,AM:armenia," +
        "AU:australia,AT:austria,AZ:azerbaijan,BS:bahamas,BH:bahrain,BD:bangladesh,BB:barbados," +
        "BY:belarus,BE:belgium,BZ:belize,BJ:benin,BT:bhutan,BO:bolivia,BA:bosnia and herzegovina," +
        "BW:botswana,BR:brazil,BN:brunei,BG:bulgaria,BF:burkina faso,BI:burundi,KH:cambodia," +
        "CM:cameroon,CA:canada,CV:cape verde,CF:central african republic,TD:chad,CL:chile," +
        "CN:china,CO:colombia,KM:comoros,CG:congo,CR:costa rica,HR:croatia,CU:cuba,CY:cyprus," +
        "CZ:czech republic,DK:denmark,DJ:djibouti,DO:dominican republic,EC:ecuador,EG:egypt," +
        "SV:el salvador,GQ:equatorial guinea,ER:eritrea,EE:estonia,ET:ethiopia,FJ:fiji,FI:finland," +
        "FR:france,GA:gabon,GM:gambia,GE:georgia,DE:germany,GH:ghana,GR:greece,GT:guatemala," +
        "GN:guinea,HT:haiti,HN:honduras,HU:hungary,IS:iceland,IN:india,ID:indonesia,IR:iran," +
        "IQ:iraq,IE:ireland,IL:israel,IT:italy,JM:jamaica,JP:japan,JO:jordan,KZ:kazakhstan," +
        "KE:kenya,KW:kuwait,KG:kyrgyzstan,LV:latvia,LB:lebanon,LS:lesotho,LR:liberia,LY:libya," +
        "LI:liechtenstein,LT:lithuania,LU:luxembourg,MG:madagascar,MW:malawi,MY:malaysia," +
        "MV:maldives,ML:mali,MT:malta,MR:mauritania,MU:mauritius,MX:mexico,MD:moldova,MC:monaco," +
        "MN:mongolia,ME:montenegro,MA:morocco,MZ:mozambique,MM:myanmar,NA:namibia,NP:nepal," +
        "NL:netherlands,NZ:new zealand,NI:nicaragua,NE:niger,NG:nigeria,KP:north korea," +
        "MK:north macedonia,NO:norway,OM:oman,PK:pakistan,PA:panama,PG:papua new guinea," +
        "PY:paraguay,PE:peru,PH:philippines,PL:poland,PT:portugal,QA:qatar,RO:romania,RU:russia," +
        "RW:rwanda,SA:saudi arabia,SN:senegal,RS:serbia,SG:singapore,SK:slovakia,SI:slovenia," +
        "SO:somalia,ZA:south africa,KR:south korea,SS:south sudan,ES:spain,LK:sri lanka,SD:sudan," +
        "SE:sweden,CH:switzerland,SY:syria,TJ:tajikistan,TZ:tanzania,TH:thailand,TG:togo," +
        "TT:trinidad and tobago,TN:tunisia,TR:turkey,TM:turkmenistan,UG:uganda,UA:ukraine," +
        "AE:united arab emirates,GB:united kingdom,US:united states,UY:uruguay,UZ:uzbekistan," +
        "VE:venezuela,VN:vietnam,YE:yemen,ZM:zambia,ZW:zimbabwe";
    const table = {};
    for (const entry of packed.split(",")) {
        const sep = entry.indexOf(":");
        table[entry.slice(0, sep)] = entry.slice(sep + 1);
    }
    return table;
})();
/** Every value Tavily accepts, for pass-through validation of already-normalised names. */
const TAVILY_COUNTRY_NAMES = new Set(Object.values(TAVILY_COUNTRY_BY_ISO2));
/**
 * Translate a locale country into Tavily's vocabulary.
 *
 * Accepts an alpha-2 code ("FR") or an already-normalised Tavily name
 * ("france"). Returns `undefined` when Tavily has no equivalent, so the caller
 * omits the parameter instead of sending a value the API rejects with a 400.
 */
export function resolveTavilyCountry(country) {
    const value = (country ?? "").trim().toLowerCase();
    if (!value)
        return undefined;
    const byCode = TAVILY_COUNTRY_BY_ISO2[value.toUpperCase()];
    if (byCode)
        return byCode;
    return TAVILY_COUNTRY_NAMES.has(value) ? value : undefined;
}
/**
 * Build the POST request body for Tavily's /search endpoint.
 * Supports:
 *  - search_depth: "basic" | "advanced" | "fast" | "ultra-fast"
 *  - chunks_per_source: supported on basic, advanced, fast (not ultra-fast)
 *  - topic: "news" | "finance" from hints (code falls back to general)
 *  - time_range: "day" | "week" | "month" | "year"
 *  - start_date: RFC3339 / YYYY-MM-DD from hints
 *  - include_domains / exclude_domains
 *  - country: translated from the alpha-2 hint (see TAVILY_COUNTRY_BY_ISO2)
 */
export function buildTavilySearchBody(query, maxResults, options, hints) {
    const max_results = Math.min(Math.max(maxResults ?? 5, 1), 20);
    const cleanQ = hints?.cleanQuery ? hints.cleanQuery : query;
    const requestBody = {
        query: cleanQ,
        max_results,
        include_answer: false,
    };
    if (options?.autoParameters) {
        requestBody.auto_parameters = true;
    }
    else {
        const depth = options?.searchDepth ?? "basic";
        requestBody.search_depth = depth;
        // Tavily docs: chunks_per_source is supported on basic, advanced, fast (not ultra-fast)
        if (depth !== "ultra-fast" && typeof options?.chunksPerSource === "number") {
            requestBody.chunks_per_source = options.chunksPerSource;
        }
    }
    // 1. Topic mapping: Tavily accepts general, news, and finance.
    if (hints?.topic === "news" || hints?.topic === "finance") {
        requestBody.topic = hints.topic;
    }
    // 2. Freshness & date filtering
    if (hints?.freshness?.preset) {
        // Tavily does not allow time_range together with start_date or end_date.
        requestBody.time_range = hints.freshness.preset;
    }
    else {
        if (hints?.freshness?.after) {
            requestBody.start_date = hints.freshness.after;
        }
        if (hints?.freshness?.before) {
            requestBody.end_date = hints.freshness.before;
        }
    }
    // 3. Domain constraints
    if (hints?.domains?.include && hints.domains.include.length > 0) {
        requestBody.include_domains = hints.domains.include;
    }
    if (hints?.domains?.exclude && hints.domains.exclude.length > 0) {
        requestBody.exclude_domains = hints.domains.exclude;
    }
    // 4. Country — Tavily only honours it when topic is general, and only in its
    //    own name vocabulary. An unmappable value is dropped, never forwarded.
    if (requestBody.topic === undefined || requestBody.topic === "general") {
        const country = resolveTavilyCountry(hints?.locale?.country);
        if (country)
            requestBody.country = country;
    }
    return requestBody;
}
export const TAVILY_META = {
    name: "tavily",
    label: "Tavily",
    description: "AI-optimized web search (chunks & depth)",
    credSuffix: "TAVILY",
    fetchCapable: true,
    needsBaseUrl: false,
};
/**
 * Parse a Tavily HTTP error response into a classified ProviderError.
 * Tavily returns `{ detail: { error: "..." } }` on error.
 * 432 = plan limit, 433 = paygo limit — both treated as quota.
 */
async function throwTavilyError(res) {
    const status = res.status;
    let message;
    try {
        const body = await res.json();
        message = typeof body?.detail?.error === "string" ? body.detail.error : undefined;
    }
    catch {
        // Non-JSON body — fall through to status-based classification.
    }
    const retryAfterRaw = res.headers.get("retry-after");
    let retryHint = "";
    if (retryAfterRaw) {
        const seconds = Number(retryAfterRaw);
        if (Number.isFinite(seconds) && seconds > 0) {
            retryHint = ` (retry after ${seconds}s)`;
        }
    }
    if (status === 401 || status === 403) {
        throw providerError("auth", `Tavily: ${message ?? "auth failed"}${retryHint}`, status);
    }
    if (status === 432 || status === 433) {
        throw providerError("quota", `Tavily: ${message ?? "plan limit exceeded"}${retryHint}`, status);
    }
    if (status === 429) {
        throw providerError("rate-limit", `Tavily: rate limit exceeded${retryHint}`, status, parseRetryAfter(res));
    }
    if (status === 408) {
        throw providerError("timeout", `Tavily: request timed out`, status);
    }
    if (status >= 500) {
        throw providerError("server", `Tavily: server error (HTTP ${status})${retryHint}`, status);
    }
    const code = classifyHttpStatus(status);
    throw providerError(code, `Tavily: ${message ?? `HTTP ${status}`}${retryHint}`, status);
}
export const TavilyProvider = {
    ...TAVILY_META,
    async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
        const { signal, options, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Tavily API key is not configured");
        const requestBody = buildTavilySearchBody(query, maxResults, options, hints);
        const res = await fetchWithProxy(TAVILY_SEARCH_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
            signal,
        });
        if (!res.ok)
            await throwTavilyError(res);
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
            // Tavily returns `content` (NLP summary in basic mode) — the best evidence field.
            if (typeof r.content === "string" && r.content) {
                s.snippet = r.content.length > 1200 ? r.content.slice(0, 1200) + "…" : r.content;
            }
            if (typeof r.published_date === "string" && r.published_date)
                s.publishedAt = r.published_date;
            return s;
        })
            .filter((x) => x !== null);
        return { sources };
    },
    async fetch(url, apiKey, _baseUrl, contextOrSignal) {
        const { signal, options } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Tavily API key is not configured");
        const body = { urls: [url] };
        if (options?.fetchExtractDepth) {
            body.extract_depth = options.fetchExtractDepth;
        }
        const res = await fetchWithProxy(TAVILY_EXTRACT_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok)
            await throwTavilyError(res);
        const data = await res.json();
        const failed = Array.isArray(data?.failed_results) ? data.failed_results[0] : undefined;
        if (failed)
            throw providerError("server", `Tavily extract failed for ${failed.url ?? url}: ${failed.error ?? "unknown"}`);
        const content = data?.results?.[0]?.raw_content;
        if (typeof content !== "string" || !content)
            throw providerError("server", `Tavily returned no content for ${url}`);
        return { text: content };
    },
};
