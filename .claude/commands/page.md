---
description: Build or upgrade a list page to the standard consistent layout
---

You are the **Page Builder**. Your single job is to produce or upgrade a list page that exactly matches the project standard.

## The standard layout (non-negotiable)

Read `PurchaseOrdersPage.tsx` as the canonical reference. Every list page must have:

1. **Header section**
   - Breadcrumb: `<module>` (muted) above title
   - Title (2xl semibold) + subtitle (sm muted)
   - "New X" button: gradient blue, top-right

2. **Status tabs** — inside a Card, above filters
   - Always include "All" as first tab
   - Tabs drive a `tab` state that is passed to the data hook as a filter

3. **3-column filter row** (12-column grid, each col-span-4)
   - Col 1: Date Range (two date inputs with "to" between)
   - Col 2: Search (with magnifier icon, searches number field AND contact name)
   - Col 3: Contact dropdown (Customer for sales, Supplier for purchases)
     - Sales contacts: `c.type === "customer" || c.type === "both"`
     - Purchase contacts: `c.type === "supplier" || c.type === "vendor" || c.type === "both"`

4. **Table** — inside `overflow-hidden rounded-2xl border`
   - Standard columns: No. | Date | Contact | [module-specific] | Total | Status | Actions
   - Status shown as `<Badge>` using per-page `statusColors` map

5. **Empty state** — centered card with icon, title, subtitle, "New X" button

6. **`<ViewDetailSheet>`** — slide-out panel on "View" action

7. **Row actions** (via `<RowActionsMenu>`) — always include:
   - View, Edit (disabled when void/applied/billed)
   - Status transitions with success+error toasts
   - Delete with precondition guard + confirm dialog

## useMemo filtering pattern

```tsx
const rows = useMemo(() => {
  let filtered = data
  if (tab !== "all") filtered = filtered.filter((r: any) => r.status === tab)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r: any) =>
      r.number_field.toLowerCase().includes(q) ||
      (contactMap.get(r.contact_id) ?? "").toLowerCase().includes(q)
    )
  }
  if (contactFilter !== "all") filtered = filtered.filter((r: any) => r.contact_id === contactFilter)
  if (dateFrom) filtered = filtered.filter((r: any) => (r.date_field || "") >= dateFrom)
  if (dateTo) filtered = filtered.filter((r: any) => (r.date_field || "") <= dateTo)
  return filtered
}, [data, tab, search, contactMap, contactFilter, dateFrom, dateTo])
```

## Toast pattern

```tsx
api.patch(url, null, { params: { status } })
  .then(() => { queryClient.invalidateQueries({ queryKey: ["key"] }); toast("Done", "success") })
  .catch((e: any) => toast(e?.response?.data?.detail ?? "Failed", "warning"))
```

## Checklist before finishing

- [ ] All state variables declared
- [ ] `useMemo` for contactMap and rows
- [ ] Vendor/customer contacts filtered correctly for module type
- [ ] All row actions have success AND error toasts
- [ ] Delete action has precondition guard (status check) then confirm()
- [ ] ViewDetailSheet renders correct fields
- [ ] No `cn` naming conflict (alias as `cx` if loop variable also named `cn`)
- [ ] TypeScript: `node_modules/.bin/tsc --noEmit` passes
- [ ] Commit + push
