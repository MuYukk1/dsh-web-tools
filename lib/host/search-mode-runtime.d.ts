/**
 * dsh-web-tools — "Web Research mode" per-session turn policy (Search Mode).
 *
 * The layer sits ABOVE the provider layer: providers only execute web tools;
 * this module decides whether a turn must complete a web research call
 * (web_search OR web_fetch) before it may end. Everything is Host-owned so
 * browser refresh / session switch / relaunch cannot desync the button from
 * the real policy.
 *
 * Deploy strategy follows the proven `dsh-at-file` pattern (agent-scoped event
 * listeners): every agent-scoped listener is registered on that agent's scope
 * context inside `agent/created`, so `@deepseek-ai/dsh-scope` dispatches only
 * the matching agent's events to it.
 *   - `agent/pre-step` (waterfall): freeze the per-turn flag and, on step 1,
 *     inject one plugin-source UserMessage (official `createUserMessage`).
 *     A `required` turn restates the obligation every turn; `auto` and `off`
 *     announce once per session and again only after a mode change or a
 *     rebuilt transcript (`agent/created` with source `clear` / `compact`).
 *   - `tools/result` (emit): receipt that a web_search or web_fetch ran.
 *     Completion — even a total provider failure — counts as "tried"; that is
 *     the requirement.
 *   - `agent/turn-stopping` (serial): no web research yet → `agent.steer()`
 *     once to continue; a second offense `agent.cancel()`s (no infinite loop).
 *
 * `SearchModeRuntime` is pure/framework-free so its state model is unit-testable.
 * @module
 */
import type { WebToolsContext } from "./context-types.ts";
import type { SearchMode, SearchModeView } from "../shared/api-types.ts";
/** The two user-facing modes. */
export type { SearchMode };
/** Per-turn tracking (frozen per turn; mode flips only affect the next turn). */
export interface TurnState {
    turn: number;
    required: boolean;
    /** True when this turn runs with web search switched OFF (tools withheld). */
    disabled: boolean;
    webSearchCompleted: boolean;
    webSearchSucceeded: boolean;
    webFetchCompleted: boolean;
    webFetchSucceeded: boolean;
    correctionCount: number;
}
/** Whether the turn has completed ANY web research (search OR fetch). */
export declare function webResearchCompleted(state: TurnState): boolean;
/** The injected "you must research" instruction the model sees on step 1.
 * Compact: one hard requirement (complete an appropriate web tool), concrete
 * routing (URL → web_fetch, otherwise web_search), honest disclosure on
 * failure. General query-quality guidance belongs to DSH's own tool-web
 * prompt, not this per-turn policy. This default DOES advertise platform
 * routing; use {@link requiredSearchText} to decide per live config. */
export declare const REQUIRED_SEARCH_TEXT: string;
/** Same policy with the platform-routing lines dropped (both platforms off). */
export declare const REQUIRED_SEARCH_TEXT_NO_PLATFORMS: string;
/**
 * Pick the policy text for the live configuration.
 * @param platformsEnabled - true when at least one platform source may serve a
 *   routed query. Omitted (or true) keeps the full text.
 */
export declare function requiredSearchText(platformsEnabled?: boolean): string;
/** One-shot steer used when the model tries to end without researching. */
export declare const REQUIRED_SEARCH_CORRECTION_TEXT = "Web Search is required for this turn. Call web_search or web_fetch before finalizing.";
/**
 * Pure per-session state machine: one mode per session, one frozen flag per
 * turn. `auto` is the absence of an entry — clearing keeps the map tidy.
 */
export declare class SearchModeRuntime {
    private readonly modes;
    private readonly turns;
    private readonly announced;
    private readonly searchAvailable;
    constructor(searchAvailable?: () => boolean);
    getMode(sessionId: string): SearchMode;
    setMode(sessionId: string, mode: SearchMode): void;
    /**
     * The mode whose one-shot notice was already injected into this session, or
     * undefined when nothing has been announced yet. Drives
     * {@link shouldAnnounceMode} so a standing state is not restated every turn.
     */
    announcedMode(sessionId: string): SearchMode | undefined;
    /** Record that this session's transcript now carries the mode's notice. */
    markAnnounced(sessionId: string, mode: SearchMode): void;
    /**
     * Forget what was announced so the next turn restates the policy. Called when
     * the transcript is rebuilt (`clear` / `compact`): the earlier notice may no
     * longer be in the model's context.
     */
    resetAnnouncement(sessionId: string): void;
    /** True when this session has web search switched OFF. */
    isOff(sessionId: string): boolean;
    /** Whether a usable search provider currently exists (drives `available`). */
    available(): boolean;
    /**
     * Begin (or re-read) a turn. The `required` flag is frozen when a NEW turn
     * begins; mid-turn mode flips only affect the NEXT turn (no race).
     */
    beginTurn(sessionId: string, turn: number): TurnState;
    /**
     * Record that a web_search call COMPLETED. Completion (even a total provider
     * failure) satisfies "must research first"; success additionally records that
     * fresh web data was available.
     */
    markSearchResult(sessionId: string, succeeded: boolean): void;
    /**
     * Record that a web_fetch call COMPLETED. A fetch also satisfies the
     * "must research first" requirement — a user-supplied URL is a valid
     * research action and must not be gated behind a pointless search.
     */
    markFetchResult(sessionId: string, succeeded: boolean): void;
    getTurn(sessionId: string): TurnState | undefined;
    /** Drop every state for a disposed agent/session. */
    clear(sessionId: string): void;
    view(sessionId: string): SearchModeView;
}
/** Deps for wiring the runtime into the host context. */
export interface SearchModeRuntimeDeps {
    /** True when a usable search provider exists (from the plugin's provider). */
    searchAvailable: () => boolean;
}
/**
 * The UserMessages the runtime injects. Constructed with the OFFICIAL
 * `@deepseek-ai/dsh-llm` `createUserMessage` ({ content, source }) — never an
 * ad-hoc shape. THREE messages exist:
 *  - required(): the one-shot step-1 policy snapshot.
 *  - disabled(): the one-shot step-1 "web search is OFF" notice.
 *  - correction(): the one-shot turn-stopping steer (form: "notice").
 * Later-step reminder/grounding/failure re-injection is intentionally gone:
 * tool results already become the freshest context of the next model request.
 */
export interface SearchModeMessages {
    /** Step 1 (once per turn): the compact research policy. */
    required(): unknown;
    /** Step 1 (once per turn): search is allowed on demand (default mode). */
    auto(): unknown;
    /** Step 1 (once per turn): web search is switched off for this session. */
    disabled(): unknown;
    /** turn-stopping steer (one-shot notice). */
    correction(): unknown;
}
/** One-shot notice injected on step 1 of an `off` turn. */
export declare const SEARCH_DISABLED_TEXT = "Web search is switched OFF for this session. Do not call web_search or web_fetch; answer from the context you already have. If a question truly requires fresh web data, say what could not be verified.";
/**
 * One-shot policy injected on step 1 of an `auto` turn.
 *
 * Auto used to inject NOTHING, and the observed result was that the model never
 * reached for the tools: DSH's own tool-web guidance only covers how to treat a
 * result once you have one, not when to search. One sentence of criterion is
 * enough — and it stays a permission, not a requirement.
 */
export declare const SEARCH_AUTO_TEXT = "Web search is available but not required. Call web_search (or web_fetch for a specific URL) when the answer needs current, external, or verifiable information; otherwise answer directly from the context you already have.";
/**
 * Build the injected messages with the official `createUserMessage`
 * ({ content, source }). Extracted so tests can assert the exact wire shape
 * without booting the host.
 * @param createUserMessage - the official `@deepseek-ai/dsh-llm` factory.
 * @param platformsEnabled - live predicate for the platform-routing lines. Read
 *   on every `required()` call so toggling a platform source in settings takes
 *   effect on the NEXT turn without re-wiring the runtime. Omitted keeps the
 *   full text.
 */
export declare function createSearchModeMessages(createUserMessage: (input: unknown) => unknown, platformsEnabled?: () => boolean): SearchModeMessages;
/**
 * Decide which pre-step Search Mode message (if any) to inject for one step.
 * Pure and one-shot: ONLY step 1 injects — the research policy (required
 * turns), the optional-use criterion (auto turns), or the "switched off" notice
 * (off turns). Later steps inject NOTHING: the web tool result(s) are the
 * freshest context, and enforcement happens at the tool gate, not by
 * re-reminding the model every step.
 * @returns undefined (no injection) outside step 1 or without a turn state.
 */
export declare function searchModeStepMessage(state: TurnState | undefined, step: number, messages: SearchModeMessages): unknown | undefined;
/**
 * Whether this turn must restate the mode.
 *
 * `required` is a per-turn obligation — "this turn must research" is true of
 * the CURRENT turn only, so the previous turn's copy is stale and must be
 * superseded. `auto` and `off` are standing states: the criterion or the
 * "switched off" notice describes how the session behaves, not what this turn
 * must do, so stating it once is enough until the mode changes or the
 * transcript is rebuilt.
 *
 * Restating a standing state every turn is what issue #17 reported: the
 * injected message is a real UserMessage that stays in the transcript, so a
 * 30-turn session used to carry 30 copies and re-sent every one of them on
 * every request.
 * @param mode - the mode frozen for this turn.
 * @param announced - the mode already announced in this session, if any.
 */
export declare function shouldAnnounceMode(mode: SearchMode, announced: SearchMode | undefined): boolean;
/** The message to inject plus the mode it announces. */
export interface SearchModeAnnouncement {
    message: unknown;
    mode: SearchMode;
}
/**
 * Decide the pre-step injection for one step under the announcement policy.
 * Combines {@link searchModeStepMessage} (which text) with
 * {@link shouldAnnounceMode} (whether to say it again) so the host can record
 * exactly what it injected.
 * @returns undefined when this step injects nothing.
 */
export declare function searchModeAnnouncement(state: TurnState | undefined, step: number, messages: SearchModeMessages, announced: SearchMode | undefined): SearchModeAnnouncement | undefined;
/**
 * Why a session lifecycle began; mirrors DSH's `SessionStartSource`
 * (`agent/created` payload). `clear` and `compact` rebuild the transcript, so
 * a notice injected earlier is no longer guaranteed to be in context.
 */
export type SessionStartSource = "startup" | "resume" | "clear" | "compact";
/** The two model-facing web tools this plugin owns the policy for. */
export declare const WEB_TOOL_NAMES: readonly string[];
/** Denial reason shown to the model when it calls a web tool while OFF. */
export declare const WEB_DISABLED_DENIAL = "Web search is switched OFF for this session, so this tool call was denied. Answer from the existing context and state what could not be verified.";
/**
 * Wire the Search Mode runtime into a host context. All agent-scoped listeners
 * register per created agent (the scope-filtered dispatch seam), and every
 * contribution is effect-scoped so stop/update/undefine removes it cleanly.
 * @param messages - pre-built official UserMessage factories ({ content, source }).
 */
export declare function installSearchModeRuntime(ctx: WebToolsContext, _deps: SearchModeRuntimeDeps, runtime: SearchModeRuntime, messages: SearchModeMessages): () => void;
/** Register the slash command, toggling the SAME mode. */
export declare function registerSearchCommands(ctx: WebToolsContext, runtime: SearchModeRuntime): (() => void) | undefined;
