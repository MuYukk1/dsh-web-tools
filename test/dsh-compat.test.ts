/**
 * dsh-web-tools — declared compatibility with the DSH host.
 *
 * DSH 0.2.1 changed how a plugin's requirements are judged
 * (`docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh`):
 *
 *  - an own `engines.dsh` range decides ALONE, and the `@deepseek-ai/dsh*`
 *    peer ranges are then ignored — so the range must cover every supported
 *    release itself;
 *  - the check matches prereleases (`includePrerelease`), which is why a range
 *    spelled for 0.2.0 used to keep working while npm's own resolver silently
 *    fell back to the oldest 0.1.0-rc.6 build for local installs.
 *
 * These assertions pin both readings: the DSH rule, and plain semver (what
 * npm/pnpm use when resolving the peers into a profile).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import semver from "semver";
import { HOST_INJECT } from "../src/host/inject.ts";

interface Manifest {
  name: string;
  version: string;
  engines?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Manifest;

/** Releases this plugin claims to run on, and releases it must refuse. */
const SUPPORTED = ["0.1.0-rc.6", "0.1.7", "0.2.0-rc.2", "0.2.1-rc.2", "0.2.1", "0.2.7"];
const UNSUPPORTED = ["0.0.9", "0.3.0-rc.1", "0.3.0", "1.0.0"];

/** DSH's own predicate: prereleases participate in ranges. */
const dshSatisfies = (version: string, range: string) => semver.satisfies(version, range, { includePrerelease: true });

test("engines.dsh is declared and covers the supported host releases", () => {
  const range = pkg.engines?.dsh;
  assert.equal(typeof range, "string", "package.json must declare engines.dsh for DSH 0.2.1+");
  assert.notEqual(semver.validRange(range!), null, "engines.dsh must be a valid SemVer range");
  assert.ok(!range!.includes("workspace:"), "workspace: ranges are incompatible in engines.dsh");

  for (const version of SUPPORTED) {
    assert.ok(dshSatisfies(version, range!), `engines.dsh "${range}" must accept dsh ${version}`);
  }
  for (const version of UNSUPPORTED) {
    assert.ok(!dshSatisfies(version, range!), `engines.dsh "${range}" must refuse dsh ${version}`);
  }
});

test("every dsh peer range accepts 0.2.1-rc.2 for DSH's own check", () => {
  const peers = pkg.peerDependencies ?? {};
  const dshPeers = Object.entries(peers).filter(([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"));
  assert.ok(dshPeers.length > 0, "the plugin must declare its DSH peers");

  for (const [name, range] of dshPeers) {
    assert.ok(dshSatisfies("0.2.1-rc.2", range), `${name} "${range}" must accept 0.2.1-rc.2`);
    assert.ok(dshSatisfies("0.2.0-rc.2", range), `${name} "${range}" must keep accepting 0.2.0-rc.2`);
  }
});

test("every dsh peer range resolves to a real release under plain semver", () => {
  // npm and pnpm resolve peers WITHOUT includePrerelease. A range that only
  // carries a 0.2.0 prerelease comparator silently resolves to the oldest
  // 0.1.0-rc.6 build, so local typecheck/tests would exercise a host two
  // minor releases behind the one users run.
  const peers = pkg.peerDependencies ?? {};
  for (const [name, range] of Object.entries(peers)) {
    if (name !== "@deepseek-ai/dsh" && !name.startsWith("@deepseek-ai/dsh-")) continue;
    assert.ok(
      semver.satisfies("0.2.1-rc.2", range),
      `${name} "${range}" must match 0.2.1-rc.2 without includePrerelease, or npm installs 0.1.0-rc.6`,
    );
  }
});

test("host inject never names a service DSH 0.2.1 removed", () => {
  // 0.2.1 replaced `webRuntime` with `webStartup`; a plugin that still lists it
  // stays pending forever and never registers its providers or routes.
  const removedIn021 = ["webRuntime"];
  for (const service of removedIn021) {
    assert.ok(!HOST_INJECT.includes(service), `inject must not require "${service}" (removed in DSH 0.2.1)`);
  }
  for (const required of ["webServer", "settings", "credentials", "web", "agents", "commands"]) {
    assert.ok(HOST_INJECT.includes(required), `inject must still require "${required}"`);
  }
});
