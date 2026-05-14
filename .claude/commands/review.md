---
description: Review recent changes for bugs, inconsistencies, and missing pieces before shipping
---

You are the **Reviewer**. You do not write features — you find problems. Check the diff against hard-coded criteria below.

## Step 1 — Get the diff

```bash
# What changed since last push
git diff HEAD~1 --stat
git diff HEAD~1 -- '*.tsx' '*.ts' '*.py'
```

## Step 2 — Backend checklist

For every modified `.py` file:

- [ ] Every `await db.execute(...)` that mutates data is followed by `await db.commit()`
- [ ] No raw string comparisons against `Decimal` columns (must use `float()`)
- [ ] Invoice status transitions use `outstanding/partially paid/paid` — NOT `sent/unpaid`
- [ ] Delete endpoints null out FK references before deleting parent rows
- [ ] New endpoints registered in the router (`app.include_router(...)` in `main.py`)
- [ ] No `except: pass` or silent error swallowing
- [ ] HTTP errors use `HTTPException(status_code=400, detail="specific message")` — the detail message surfaces in the frontend toast

## Step 3 — Frontend checklist

For every modified `.tsx`/`.ts` file:

- [ ] All mutations have both `onSuccess` toast AND `onError` toast
- [ ] Error messages use `e?.response?.data?.detail ?? "fallback"` pattern
- [ ] `queryClient.invalidateQueries` called after every mutation
- [ ] No `window.location.reload()` (use query invalidation instead)
- [ ] New list pages have: status tabs + date range + search + contact dropdown
- [ ] `disabled` conditions on action buttons are correct — check for type/field name mismatches
- [ ] New routes added to `App.tsx` AND imports added
- [ ] New nav items added to `nav-data.ts` if needed
- [ ] No naming conflicts (e.g., `cn` used as both CSS util and loop variable)
- [ ] TypeScript passes: `node_modules/.bin/tsc --noEmit`

## Step 4 — Consistency checklist

- [ ] New page matches the standard 3-column filter layout
- [ ] Status color scheme matches existing modules (draft=slate, complete=emerald, void=rose)
- [ ] Empty state has icon + title + subtitle + "New X" button
- [ ] All action labels consistent (e.g., "Mark as Sent" not "Set Sent")

## Step 5 — Report

Produce a table:

| File | Issue | Severity | Fixed? |
|---|---|---|---|
| `sales.py:1191` | Invoice status reverts to "sent" instead of "outstanding" | High | ✅ |
| `CreditNotesPage.tsx:174` | disabled checks credit_applied but not credit_applications.length | Medium | ✅ |

- **High**: Will cause data corruption, silent failures, or broken UI
- **Medium**: Wrong behaviour in edge cases
- **Low**: Style/consistency issues

## Step 6 — Fix and commit

Fix all High and Medium issues. For Low issues, list them for the user to decide.

```bash
git add <changed files>
git commit -m "fix(review): <summary of issues fixed>"
git push
```
