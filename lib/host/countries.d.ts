/**
 * dsh-web-tools — country vocabulary shared by the hint layer and the adapters.
 *
 * Two different things live here, and keeping them apart is the whole point:
 *
 *  - **ISO 3166-1 alpha-2** is the plugin's canonical form. It is what
 *    `SearchHints.locale.country` carries, what Brave / Exa / Firecrawl / You.com
 *    accept, and what the model may write as `country:de`.
 *  - **English country names** are only needed by Tavily, whose `country`
 *    parameter takes a lowercase name from a fixed enumeration rather than a
 *    code. `countryName()` bridges the canonical code to that vocabulary and
 *    returns `undefined` for anything Tavily does not enumerate.
 *
 * `resolveCountryCode()` is the single place a model-supplied or query-derived
 * country becomes a canonical code. It returns `undefined` instead of throwing
 * or guessing: callers drop the hint, they never forward an unvalidated value
 * (Tavily answers those with a 400 that used to abort the whole search).
 * @module
 */
/** ISO 3166-1 alpha-2 → lowercase English name, for the countries Tavily enumerates. */
export declare const COUNTRY_NAMES: Readonly<Record<string, string>>;
/**
 * Canonicalise a country written as an alpha-2 code ("de", "DE"), an English
 * name ("germany", "United Kingdom") or a common alias ("uk").
 *
 * @returns the uppercase alpha-2 code, or `undefined` when the value is not a
 *   country we recognise. Callers must treat `undefined` as "no country" —
 *   never forward the original text.
 */
export declare function resolveCountryCode(value: string | undefined): string | undefined;
/**
 * The lowercase English name a provider needs for a canonical code.
 * @returns `undefined` when the country is not in that vocabulary.
 */
export declare function countryName(iso2: string | undefined): string | undefined;
