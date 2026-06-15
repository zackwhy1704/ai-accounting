import { Input } from "./input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { SearchableSelect } from "./searchable-select"
import { cn } from "../../lib/utils"

const CURRENCIES = ["SGD", "MYR", "USD", "EUR", "GBP", "AUD", "JPY", "CNY", "HKD", "THB", "IDR", "PHP", "VND"]

export interface ContactOption {
  id: string
  name: string
}

interface DocumentFormHeaderProps {
  /** Contact / vendor selector */
  contacts: ContactOption[]
  contactId: string
  onContactChange: (id: string) => void
  contactLabel?: string
  /** Document reference number (optional, auto-generated if blank) */
  docNumber?: string
  onDocNumberChange?: (v: string) => void
  docNumberLabel?: string
  docNumberPlaceholder?: string
  /** Issue date */
  issueDate: string
  onIssueDateChange: (v: string) => void
  issueDateLabel?: string
  /** Due date (optional — e.g. not on GRNs) */
  dueDate?: string
  onDueDateChange?: (v: string) => void
  dueDateLabel?: string
  /** Currency */
  currency?: string
  onCurrencyChange?: (v: string) => void
  /** Reference / PO number */
  reference?: string
  onReferenceChange?: (v: string) => void
  referenceLabel?: string
  /** Extra field slot (e.g. terms dropdown, exchange rate) */
  extraFields?: React.ReactNode
  className?: string
  disabled?: boolean
}

export function DocumentFormHeader({
  contacts,
  contactId,
  onContactChange,
  contactLabel = "Contact",
  docNumber,
  onDocNumberChange,
  docNumberLabel = "Number",
  docNumberPlaceholder = "Auto-generated",
  issueDate,
  onIssueDateChange,
  issueDateLabel = "Issue Date",
  dueDate,
  onDueDateChange,
  dueDateLabel = "Due Date",
  currency,
  onCurrencyChange,
  reference,
  onReferenceChange,
  referenceLabel = "Reference",
  extraFields,
  className,
  disabled = false,
}: DocumentFormHeaderProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {/* Contact */}
      <div className="lg:col-span-1">
        <label className="block text-sm font-medium text-slate-700 mb-1">{contactLabel} *</label>
        <SearchableSelect
          options={contacts.map(c => ({ value: c.id, label: c.name }))}
          value={contactId}
          onChange={onContactChange}
          placeholder={`Select ${contactLabel.toLowerCase()}…`}
        />
      </div>

      {/* Doc number */}
      {onDocNumberChange !== undefined && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{docNumberLabel}</label>
          <Input
            value={docNumber ?? ""}
            onChange={e => onDocNumberChange(e.target.value)}
            placeholder={docNumberPlaceholder}
            disabled={disabled}
          />
        </div>
      )}

      {/* Issue date */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{issueDateLabel} *</label>
        <Input
          type="date"
          value={issueDate}
          onChange={e => onIssueDateChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Due date */}
      {onDueDateChange !== undefined && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{dueDateLabel}</label>
          <Input
            type="date"
            value={dueDate ?? ""}
            onChange={e => onDueDateChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      {/* Currency */}
      {onCurrencyChange !== undefined && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
          <Select value={currency ?? "SGD"} onValueChange={onCurrencyChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Reference */}
      {onReferenceChange !== undefined && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{referenceLabel}</label>
          <Input
            value={reference ?? ""}
            onChange={e => onReferenceChange(e.target.value)}
            placeholder="Optional reference"
            disabled={disabled}
          />
        </div>
      )}

      {extraFields}
    </div>
  )
}
