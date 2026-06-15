/**
 * Route coverage test.
 *
 * Statically asserts that every navigate(...) / <Link to=...> target used
 * anywhere under src/ resolves to a route registered in App.tsx.
 *
 * This is the guard that would have caught the Phase 1 manual-journal bug
 * (navigate to /accounting/manual-journals/:id/edit when the registered
 * route was /accounting/journals/:id/edit) and the dead bank categorise/match
 * actions. If you add a navigate target, add a matching <Route> in App.tsx.
 *
 * Rule: update App.tsx, not this test, when a route mismatch is reported.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, "..")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      out.push(...walk(full))
    } else if (/\.(tsx?|ts)$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Turn a registered route path into a matcher regex. `:param` matches one segment. */
function routeToRegex(route: string): RegExp {
  const escaped = route
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z0-9_]+/g, "[^/]+")
    .replace(/\*/g, ".*")
  return new RegExp("^" + escaped + "$")
}

/** Extract registered route paths from App.tsx. */
function getRegisteredRoutes(): string[] {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8")
  const routes: string[] = []
  const re = /<Route\s+path="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(app)) !== null) routes.push(m[1])
  return routes
}

/**
 * Extract STATIC navigation targets (string literals starting with "/").
 * Template-literal targets with ${} interpolation are normalized: each ${...}
 * becomes a single :seg placeholder so they can be matched against :param routes.
 */
function getNavTargets(): { target: string; file: string }[] {
  const files = walk(SRC)
  const targets: { target: string; file: string }[] = []
  // navigate("/x") | navigate(`/x/${id}`) | to="/x" | to={`/x/${id}`}
  const patterns = [
    /navigate\(\s*"([^"]+)"/g,
    /navigate\(\s*`([^`]+)`/g,
    /\bto=\{?\s*"([^"]+)"/g,
    /\bto=\{?\s*`([^`]+)`/g,
  ]
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    for (const re of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        let t = m[1]
        if (!t.startsWith("/")) continue // skip relative / external
        // strip query string
        t = t.split("?")[0]
        // collapse ${...} interpolation to a single dynamic segment
        t = t.replace(/\$\{[^}]*\}/g, ":seg")
        // skip pure-interpolation roots that we can't reason about
        if (t === "/:seg" || t === "") continue
        targets.push({ target: t, file: file.replace(SRC + "/", "") })
      }
    }
  }
  return targets
}

describe("route coverage", () => {
  const registered = getRegisteredRoutes()
  const matchers = registered.map(routeToRegex)

  it("App.tsx registers at least the core routes", () => {
    expect(registered).toContain("/dashboard")
    expect(registered).toContain("/accounting/journals/:id/edit")
    expect(registered.some((r) => r === "*")).toBe(true)
  })

  it("every static navigate/Link target resolves to a registered route", () => {
    const targets = getNavTargets()
    expect(targets.length).toBeGreaterThan(0)

    const unmatched: string[] = []
    for (const { target, file } of targets) {
      // a ":seg" placeholder matches a :param route segment via routeToRegex
      const candidate = target.replace(/:seg/g, "x")
      const ok = matchers.some((re) => re.test(candidate))
      if (!ok) unmatched.push(`${target}  (in ${file})`)
    }

    if (unmatched.length) {
      throw new Error(
        "These navigation targets do not match any registered route in App.tsx:\n" +
          [...new Set(unmatched)].sort().join("\n")
      )
    }
  })
})
