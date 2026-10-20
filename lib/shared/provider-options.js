/**
 * dsh-web-tools — Provider-native typed execution options.
 *
 * Dedicated typed settings per provider. No universal SearchOptions.
 * @module
 */
/**
 * Map a stored searchType onto the Exa 3.0 vocabulary.
 *
 * Exa 3.0 (2026-10-19) retired `fast` / `instant` / `deep-reasoning`; its own
 * migration guidance maps them to `lite` / `deep`. Settings saved before
 * v0.3.9 may still hold a legacy value — migrate instead of dropping, so a
 * "fast" user does not silently fall back to `auto`. Unknown values return
 * undefined and are dropped by the sanitizer.
 */
export function normalizeExaSearchType(value) {
    if (typeof value !== "string")
        return undefined;
    if (value === "fast" || value === "instant")
        return "lite";
    if (value === "deep-reasoning")
        return "deep";
    if (value === "auto" || value === "lite" || value === "deep-lite" || value === "deep")
        return value;
    return undefined;
}
