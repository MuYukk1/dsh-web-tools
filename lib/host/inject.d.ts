/**
 * dsh-web-tools — the host services this plugin requires.
 *
 * Kept in its own module so the list can be asserted without importing the
 * plugin body: `index.ts` pulls `@deepseek-ai/dsh-llm`, which drags the whole
 * host module graph and is not resolvable outside a running DSH install.
 *
 * `webRuntime` is deliberately ABSENT. DSH 0.2.1 removed that service and moved
 * listener/trust configuration to `webStartup`
 * (`docs/upgrade-guide/v0.2.1-alpha.1/web-listener-trust-config`); a plugin that
 * still lists a removed service never leaves the pending state, so its
 * providers, routes and settings namespace are never registered. This plugin
 * never read `webRuntime.trustedHosts` anyway — the `/web-tools/api` fence is
 * loopback-only and does not treat trusted hosts as authentication.
 * @module
 */
/** Services cordis must resolve before {@link apply} runs. */
export declare const HOST_INJECT: readonly string[];
