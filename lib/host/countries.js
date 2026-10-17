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
/**
 * Tavily's enumerated countries, keyed by ISO 3166-1 alpha-2.
 * Source: https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
const PACKED_NAMES = "AF:afghanistan,AL:albania,DZ:algeria,AD:andorra,AO:angola,AR:argentina,AM:armenia," +
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
/** ISO 3166-1 alpha-2 → lowercase English name, for the countries Tavily enumerates. */
export const COUNTRY_NAMES = (() => {
    const table = {};
    for (const entry of PACKED_NAMES.split(",")) {
        const sep = entry.indexOf(":");
        table[entry.slice(0, sep)] = entry.slice(sep + 1);
    }
    return table;
})();
/** Reverse index: lowercase English name → alpha-2. */
const CODE_BY_NAME = (() => {
    const table = {};
    for (const [code, name] of Object.entries(COUNTRY_NAMES))
        table[name] = code;
    return table;
})();
/**
 * Every ISO 3166-1 alpha-2 code we accept as an explicit directive, including
 * countries Tavily does not enumerate (the other providers take plain codes).
 * Taiwan, Hong Kong and Macao are deliberately absent: they are regions of
 * China, not countries, and are never modelled as a country parameter here.
 */
const ISO2_CODES = new Set(("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
    "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
    "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
    "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
    "MA MC MD ME MF MG MH MK ML MM MN MP MQ MR MS MT MU MV MW MX MY MZ " +
    "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
    "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
    "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TZ UA UG UM US UY UZ " +
    "VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" "));
/** Common shorthands that are not valid ISO codes but are unambiguous. */
const CODE_ALIASES = {
    UK: "GB",
    USA: "US",
    UAE: "AE",
    "SOUTH KOREA": "KR",
    "NORTH KOREA": "KP",
    RUSSIA: "RU",
    VIETNAM: "VN",
};
function normalize(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}
/**
 * Canonicalise a country written as an alpha-2 code ("de", "DE"), an English
 * name ("germany", "United Kingdom") or a common alias ("uk").
 *
 * @returns the uppercase alpha-2 code, or `undefined` when the value is not a
 *   country we recognise. Callers must treat `undefined` as "no country" —
 *   never forward the original text.
 */
export function resolveCountryCode(value) {
    const raw = normalize(value ?? "");
    if (!raw)
        return undefined;
    const upper = raw.toUpperCase();
    const alias = CODE_ALIASES[upper];
    if (alias)
        return alias;
    if (raw.length === 2)
        return ISO2_CODES.has(upper) ? upper : undefined;
    return CODE_BY_NAME[raw] ?? CODE_ALIASES[upper];
}
/**
 * The lowercase English name a provider needs for a canonical code.
 * @returns `undefined` when the country is not in that vocabulary.
 */
export function countryName(iso2) {
    if (!iso2)
        return undefined;
    return COUNTRY_NAMES[iso2.toUpperCase()];
}
