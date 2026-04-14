---
description: Check frontend for TypeScript errors, unused imports, dead references; fix and verify
---

Run the full frontend type-check + lint pipeline, surface every error, and fix them.

## 1. TypeScript compilation

From the frontend directory, run the type-checker with no emit:

```bash
cd frontend && npx tsc --noEmit 2>&1 | tee /tmp/tsc.out
```

(If the project uses `tsc --build`, try that first; fall back to `tsc --noEmit`.)

Do NOT dismiss any error. Common patterns in this codebase:
- `TS2304 Cannot find name 'setFoo'` → state var removed but setter still called in useEffect/handler. Find and remove the call or re-add the state.
- `TS6133 'x' is declared but never used` → unused import or variable. Delete it.
- `TS2741 Property 'foo' is missing` → interface expanded but default/init object literal wasn't updated.
- `TS2339 Property 'foo' does not exist on type` → type widened/narrowed without updating consumers.
- `TS1005 '}' expected` → brace imbalance, often from a partial block deletion. Use `grep -n "handleCustomerChange\|useEffect"` to find where braces went missing, then read that region and insert the missing `}`.
- `TS2345 argument of type ... not assignable` → line-item default object doesn't satisfy interface after a field was added.

## 2. Run the build

```bash
cd frontend && npm run build 2>&1 | tee /tmp/build.out
```

If the build fails, fix the errors and re-run. Keep iterating until it passes cleanly.

## 3. Lint pass

```bash
cd frontend && npm run lint 2>&1 | tee /tmp/lint.out
```

(If no lint script exists, try `npx eslint src --ext .ts,.tsx`.)

Fix real issues — do not blanket-disable rules.

## 4. Backend sanity (quick)

Python imports should resolve cleanly:

```bash
cd backend && python -c "from app.main import app; print('OK')"
```

Any `ImportError` or `NameError` → read the trace, fix the offending module.

## 5. Report

Produce a summary with:
- Number of errors before / after per category (TS2304, TS6133, TS2741, etc.)
- The files touched to fix them
- Whether `tsc --noEmit`, `npm run build`, and lint now pass cleanly (✅ / ✗)

If any category cannot be fully cleaned (e.g., pre-existing errors in files unrelated to recent changes), list them explicitly with file:line so the user can decide. Do NOT silently skip them.

## 6. Commit

If fixes were applied and everything now passes, commit with a message like:
```
Fix TS/lint errors discovered via /compile: <short summary>
```
and push. Skip the commit if no changes were made.

## Heuristics for fixing

- Prefer deleting dead code over adding `@ts-ignore` / `eslint-disable`.
- If a state variable was removed but its setter is still called, delete the caller line — do not re-add the state just to silence the error.
- For "missing property in object literal" errors, check whether the field has a sensible default (`""` for strings, `0` for numbers, a literal like `"goods"` for enums) and add it to the initializer — don't loosen the type.
- When a brace mismatch appears at end-of-file, the real break is almost always a recently-edited function whose closing `}` was removed with surrounding code. Use the line numbers in the error alongside `grep -n "const [a-zA-Z]* = \|useEffect\|function "` to find the nearest function boundary.
