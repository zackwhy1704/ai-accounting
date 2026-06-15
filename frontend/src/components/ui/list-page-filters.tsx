import { Search, X } from "lucide-react"
import { Input } from "./input"
import { SearchableSelect } from "./searchable-select"
import { Tabs, TabsList, TabsTrigger } from "./tabs"
import { cn } from "../../lib/utils"

export interface StatusTab {
  label: string
  value: string
}

export interface ContactOption {
  id: string
  name: string
}

interface ListPageFiltersProps {
  /** Status tab strip. Omit to hide. */
  statusTabs?: StatusTab[]
  activeTab?: string
  onTabChange?: (value: string) => void
  /** Free-text search */
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  /** Date range filter */
  dateFrom?: string
  onDateFromChange?: (v: string) => void
  dateTo?: string
  onDateToChange?: (v: string) => void
  /** Contact filter */
  contacts?: ContactOption[]
  contactFilter?: string
  onContactFilterChange?: (v: string) => void
  contactLabel?: string
  /** Any extra filter slot (e.g. currency, bank account) */
  extraFilters?: React.ReactNode
  className?: string
}

export function ListPageFilters({
  statusTabs,
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  contacts,
  contactFilter,
  onContactFilterChange,
  contactLabel = "Contact",
  extraFilters,
  className,
}: ListPageFiltersProps) {
  const hasDateRange = onDateFromChange && onDateToChange
  const hasContactFilter = contacts && onContactFilterChange

  return (
    <div className={cn("space-y-3", className)}>
      {statusTabs && statusTabs.length > 0 && (
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList>
            {statusTabs.map(t => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 pr-8"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {hasDateRange && (
          <>
            <Input
              type="date"
              value={dateFrom ?? ""}
              onChange={e => onDateFromChange!(e.target.value)}
              className="w-36"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo ?? ""}
              onChange={e => onDateToChange!(e.target.value)}
              className="w-36"
              placeholder="To"
            />
          </>
        )}
        {hasContactFilter && (
          <div className="w-52">
            <SearchableSelect
              options={[
                { value: "all", label: `All ${contactLabel}s` },
                ...contacts.map(c => ({ value: c.id, label: c.name })),
              ]}
              value={contactFilter ?? "all"}
              onChange={(v: string) => onContactFilterChange!(v)}
              placeholder={`Filter by ${contactLabel}`}
            />
          </div>
        )}
        {extraFilters}
      </div>
    </div>
  )
}
