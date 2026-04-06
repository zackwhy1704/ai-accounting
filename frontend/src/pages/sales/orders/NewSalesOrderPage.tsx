import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, X, Search, ChevronDown, RotateCcw, FileText, Paperclip } from "lucide-react"
import { useContacts, useAccounts, useCreateSalesOrder, useCreateContact } from "../../../lib/hooks"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { cn } from "../../../lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface LineItem {
  id: string
  description: string
  account_id: string
  quantity: number
  unit_price: number
  discount: number
  tax_rate: number
}

interface PaymentTerm {
  id: string
  term: string
  due_on: string
  amount: number
  description: string
}

type EntityType = "Company" | "Individual" | "General Public" | "Foreign Company" | "Foreign Individual" | "Exempted Person"
type RegNoType = "None" | "BRN" | "NRIC" | "Passport" | "Army"
type StatusType = "draft" | "pending_approval" | "ready"

function genId() { return Math.random().toString(36).slice(2) }

// ─── Quick Add Contact Modal ──────────────────────────────────────────────────
function QuickAddContactModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string, name: string) => void
}) {
  const createContact = useCreateContact()
  const { data: accounts = [] } = useAccounts()
  const overlayRef = useRef<HTMLDivElement>(null)

  const [entityType, setEntityType] = useState<EntityType>("Company")
  const [legalName, setLegalName] = useState("")
  const [otherName, setOtherName] = useState("")
  const [regNoType, setRegNoType] = useState<RegNoType>("BRN")
  const [regNo, setRegNo] = useState("")
  const [oldRegNo, setOldRegNo] = useState("")
  const [tin, setTin] = useState("")
  const [sstRegNo, setSstRegNo] = useState("")
  const [isCustomer, setIsCustomer] = useState(true)
  const [isSupplier, setIsSupplier] = useState(false)
  const [isEmployee, setIsEmployee] = useState(false)
  const [receivableAccountId, setReceivableAccountId] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [remarks, setRemarks] = useState("")

  useEffect(() => {
    if (!open) {
      setEntityType("Company"); setLegalName(""); setOtherName(""); setRegNoType("BRN")
      setRegNo(""); setOldRegNo(""); setTin(""); setSstRegNo("")
      setIsCustomer(true); setIsSupplier(false); setIsEmployee(false)
      setPhone(""); setEmail(""); setRemarks("")
    }
  }, [open])

  if (!open) return null

  const entityRows: EntityType[][] = [
    ["Company", "Individual", "General Public"],
    ["Foreign Company", "Foreign Individual", "Exempted Person"],
  ]
  const regTypes: RegNoType[] = ["None", "BRN", "NRIC", "Passport", "Army"]

  const contactType = isCustomer && isSupplier ? "both" : isSupplier ? "vendor" : "customer"
  const receivableAccounts = accounts.filter(a =>
    a.type === "asset" || a.name?.toLowerCase().includes("receivable")
  )

  const handleSave = () => {
    if (!legalName.trim()) return
    createContact.mutate(
      {
        name: legalName.trim(),
        company: otherName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        type: contactType,
        tax_number: tin || undefined,
        address: undefined,
        entity_type: entityType,
        reg_no_type: regNoType,
        reg_no: regNo || undefined,
        old_reg_no: oldRegNo || undefined,
        sst_reg_no: sstRegNo || undefined,
        bank_account_id: receivableAccountId || undefined,
        remarks: remarks || undefined,
      },
      { onSuccess: (data: { id: string; name: string }) => { onCreated(data.id, data.name); onClose() } }
    )
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-card shadow-2xl border-l border-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            <span className="text-base font-semibold text-foreground">Quick Add Contact</span>
          </div>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6 overflow-y-auto">
          {/* Basic Information */}
          <div>
            <div className="mb-4 text-sm font-semibold text-foreground">Basic Information</div>

            {/* Entity Type */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-muted-foreground">Entity Type</label>
              <div className="space-y-1">
                {entityRows.map((row, ri) => (
                  <div key={ri} className="flex rounded-lg border border-border overflow-hidden">
                    {row.map((et, i) => (
                      <button
                        key={et} type="button"
                        onClick={() => setEntityType(et)}
                        className={cn(
                          "flex-1 py-2 text-xs font-medium transition-colors",
                          i > 0 && "border-l border-border",
                          entityType === et ? "bg-blue-500 text-white" : "bg-card text-foreground hover:bg-muted"
                        )}
                      >{et}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legal Name + Other Name */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Legal Name <span className="text-rose-500">*</span></label>
                <Input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Beta Marketing Sdn Bhd" className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Other Name</label>
                <Input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Beta Enterprise" className="h-9 rounded-lg text-sm" />
              </div>
            </div>

            {/* Reg No Type + Reg No */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Registration No. Type</label>
                <div className="space-y-1">
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    {regTypes.slice(0, 4).map((rt, i) => (
                      <button key={rt} type="button" onClick={() => setRegNoType(rt)}
                        className={cn("flex-1 py-1.5 text-xs font-medium transition-colors", i > 0 && "border-l border-border",
                          regNoType === rt ? "bg-blue-500 text-white" : "bg-card text-foreground hover:bg-muted")}>
                        {rt}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-lg border border-border overflow-hidden w-16">
                    <button type="button" onClick={() => setRegNoType("Army")}
                      className={cn("flex-1 py-1.5 text-xs font-medium transition-colors",
                        regNoType === "Army" ? "bg-blue-500 text-white" : "bg-card text-foreground hover:bg-muted")}>
                      Army
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Registration No.</label>
                <Input value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="201501026190" className="h-9 rounded-lg text-sm" />
              </div>
            </div>

            {/* Old Reg No + TIN */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Old Registration No.</label>
                <Input value={oldRegNo} onChange={e => setOldRegNo(e.target.value)} placeholder="1151520-P" className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">TIN</label>
                <Input value={tin} onChange={e => setTin(e.target.value)} placeholder="C20880050040" className="h-9 rounded-lg text-sm" />
              </div>
            </div>

            {/* SST Reg No */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">SST Registration No.</label>
              <Input value={sstRegNo} onChange={e => setSstRegNo(e.target.value)} placeholder="W10-2402-32000160" className="h-9 rounded-lg text-sm" />
            </div>
          </div>

          {/* Contact Persons */}
          <div>
            <div className="mb-3 text-sm font-semibold text-foreground">Contact Persons</div>
            <div className="flex justify-end">
              <button type="button" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                <Plus className="h-3.5 w-3.5" /> Contact Person
              </button>
            </div>
          </div>

          {/* Type & Grouping */}
          <div>
            <div className="mb-3 text-sm font-semibold text-foreground">Type &amp; Grouping</div>
            <div className="mb-3">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Types <span className="text-rose-500">*</span></label>
              <div className="space-y-2">
                {[{ label: "Customer", val: isCustomer, set: setIsCustomer },
                  { label: "Supplier", val: isSupplier, set: setIsSupplier },
                  { label: "Employee", val: isEmployee, set: setIsEmployee }].map(({ label, val, set }) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-blue-500" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Receivable Account <span className="text-rose-500">*</span></label>
              <Select value={receivableAccountId} onValueChange={setReceivableAccountId}>
                <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {receivableAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <div className="mb-3 text-sm font-semibold text-foreground">Contact Information</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact No.</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="321988888" className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Email Addresses</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="aisyah@beta-marketing.com" className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Contact Addresses */}
          <div>
            <div className="mb-3 text-sm font-semibold text-foreground">Contact Addresses</div>
            <div className="flex justify-end">
              <button type="button" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                <Plus className="h-3.5 w-3.5" /> Address
              </button>
            </div>
          </div>

          {/* Other Information */}
          <div>
            <div className="mb-3 text-sm font-semibold text-foreground">Other Information</div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Remarks</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border bg-card px-6 py-4 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="h-9 rounded-lg px-5 text-sm">Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!legalName.trim() || createContact.isPending}
            className="h-9 rounded-lg bg-blue-500 px-5 text-sm font-medium text-white hover:bg-blue-600">
            {createContact.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Customer Dropdown ────────────────────────────────────────────────────────
function CustomerDropdown({ contacts, value, onChange, onAddContact }: {
  contacts: Array<{ id: string; name: string; company: string | null; tax_number: string | null }>
  value: string
  onChange: (id: string) => void
  onAddContact: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = useMemo(() =>
    contacts.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(search.toLowerCase())
    ), [contacts, search])

  const selected = contacts.find(c => c.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.name : "Select Customer"}
        </span>
        <div className="flex items-center gap-1.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-full min-w-[300px] rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customer..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { setOpen(false); onAddContact() }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-500 hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Add Contact
            </button>
            <div className="mx-3 my-1 h-px bg-border" />
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">No contacts found</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id} type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch("") }}
                  className={cn("flex w-full flex-col items-start px-4 py-2.5 text-sm hover:bg-muted",
                    value === c.id && "bg-blue-50 dark:bg-blue-950")}
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.tax_number ? `TIN: ${c.tax_number}` : "No Reg / ID No."}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section Layout ───────────────────────────────────────────────────────────
function Section({ title, desc, children, id }: {
  title: string; desc: string; children: React.ReactNode; id: string
}) {
  return (
    <div id={id} className="grid grid-cols-1 gap-6 border-b border-border py-8 lg:grid-cols-[220px,1fr]">
      <div className="lg:pt-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "billing", label: "Billing & Shipping" },
  { id: "general", label: "General Info" },
  { id: "items", label: "Items" },
  { id: "payment-terms", label: "Payment Terms" },
  { id: "additional", label: "Additional Info" },
  { id: "attachments", label: "Attachments" },
  { id: "controls", label: "Controls" },
]

export default function NewSalesOrderPage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const createSalesOrder = useCreateSalesOrder()

  // Autosave
  const [autosaveOn] = useState(true)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Active tab for highlight
  const [activeTab, setActiveTab] = useState("billing")

  // Modals
  const [showAddContact, setShowAddContact] = useState(false)

  // ── Billing & Shipping ──
  const [contactId, setContactId] = useState("")
  const [showShipping, setShowShipping] = useState(false)
  const [billingAttention, setBillingAttention] = useState("")
  const [shippingAttention, setShippingAttention] = useState("")
  const [billingAddress, setBillingAddress] = useState("")
  const [shippingAddress, setShippingAddress] = useState("")

  // ── General Info ──
  const [orderNo] = useState("SO-[5DIGIT]")
  const [referenceNo, setReferenceNo] = useState("")
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [currency, setCurrency] = useState("MYR")
  const [exchangeRate, setExchangeRate] = useState("1")
  const [description, setDescription] = useState("")
  const [internalNote, setInternalNote] = useState("")
  const [title, setTitle] = useState("")

  // ── Items ──
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive")
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: genId(), description: "", account_id: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 0 },
  ])
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdj, setRoundingAdj] = useState(false)

  // ── Payment Terms ──
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([
    { id: genId(), term: "NET30", due_on: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), amount: 0, description: "-" },
  ])

  // ── Additional Info ──
  const [remarks, setRemarks] = useState("")

  // ── Controls ──
  const [status, setStatus] = useState<StatusType>("ready")

  // ── Footer ──
  const [quickShare, setQuickShare] = useState(true)

  // ── Autosave every 10s ──
  const formSnapshot = useCallback(() => ({
    contactId, billingAttention, billingAddress, shippingAttention, shippingAddress,
    referenceNo, orderDate, currency, description, internalNote, title,
    taxMode, lineItems, discountGiven, roundingAdj, paymentTerms, remarks, status,
  }), [contactId, billingAttention, billingAddress, shippingAttention, shippingAddress,
    referenceNo, orderDate, currency, description, internalNote, title,
    taxMode, lineItems, discountGiven, roundingAdj, paymentTerms, remarks, status])

  useEffect(() => {
    if (!autosaveOn) return
    const timer = setInterval(() => {
      try {
        localStorage.setItem("so_draft", JSON.stringify(formSnapshot()))
        setLastSaved(new Date())
      } catch { /* ignore */ }
    }, 10000)
    return () => clearInterval(timer)
  }, [autosaveOn, formSnapshot])

  // ── Scroll to section ──
  const scrollTo = (id: string) => {
    setActiveTab(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // ── Computations ──
  const updateLine = (idx: number, field: keyof LineItem, val: string | number) => {
    setLineItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      return next
    })
  }
  const addLine = () =>
    setLineItems(prev => [...prev, { id: genId(), description: "", account_id: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 0 }])
  const removeLine = (idx: number) =>
    setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))

  const subTotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const lineDiscounts = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price * i.discount) / 100, 0)
  const rawTotal = subTotal - lineDiscounts - discountGiven
  const roundedTotal = roundingAdj ? Math.round(rawTotal * 20) / 20 : rawTotal
  const roundingDiff = roundedTotal - rawTotal

  const revenueAccounts = accounts.filter(a => a.type === "revenue" || a.type === "income")
  const selectedContact = contacts.find(c => c.id === contactId)

  const handleSave = async () => {
    try {
      await createSalesOrder.mutateAsync({
        contact_id: contactId,
        issue_date: orderDate,
        reference: referenceNo || null,
        currency,
        notes: remarks || null,
        status,
        line_items: lineItems.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          discount: i.discount,
          account_id: i.account_id || null,
        })),
      })
      localStorage.removeItem("so_draft")
      navigate("/sales/orders")
    } catch { /* handled by mutation */ }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  }

  return (
    <>
      <QuickAddContactModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        onCreated={(id) => setContactId(id)}
      />

      <div className="flex flex-col min-h-screen">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between pb-2">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">
              <span className="cursor-pointer hover:underline" onClick={() => navigate("/")}>Home</span>
              <span className="mx-1.5">/</span>
              <span className="cursor-pointer hover:underline" onClick={() => navigate("/sales/orders")}>Sales</span>
              <span className="mx-1.5">/</span>
              <span>New Sales Order</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">New Sales Order</h1>
          </div>
          {autosaveOn && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Autosave On</span>
              {lastSaved && <span className="text-[11px]">· saved {lastSaved.toLocaleTimeString()}</span>}
            </div>
          )}
        </div>

        {/* ── Section Tabs (scroll anchors) ── */}
        <div className="sticky top-0 z-20 bg-background border-b border-border flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => scrollTo(tab.id)}
              className={cn(
                "whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 px-0 py-2">

          {/* ── BILLING & SHIPPING ── */}
          <Section id="billing" title="Billing & Shipping" desc="Billing & shipping parties for the transaction.">
            <div className="space-y-4">
              {/* Customer + Show Shipping toggle */}
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Customer <span className="text-rose-500">*</span>
                  </label>
                  <CustomerDropdown
                    contacts={contacts.filter(c => c.type === "customer" || c.type === "both")}
                    value={contactId}
                    onChange={setContactId}
                    onAddContact={() => setShowAddContact(true)}
                  />
                  {selectedContact && (
                    <p className="mt-1 text-xs text-muted-foreground">{selectedContact.email}</p>
                  )}
                </div>
                <div className="pt-6">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={showShipping} onChange={e => setShowShipping(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-blue-500" />
                    Show Shipping Info
                  </label>
                </div>
                {showShipping && (
                  <div className="w-full max-w-sm">
                    <Input value={shippingAttention} onChange={e => setShippingAttention(e.target.value)}
                      placeholder="Shipping instructions, tracking no & etc." className="h-9 rounded-lg text-sm" />
                  </div>
                )}
              </div>

              {/* Billing Attention / Shipping Attention */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Billing Attention</label>
                  <Input value={billingAttention} onChange={e => setBillingAttention(e.target.value)}
                    className="h-9 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Shipping Attention</label>
                  <Input value={shippingAttention} onChange={e => setShippingAttention(e.target.value)}
                    disabled={!showShipping}
                    className={cn("h-9 rounded-lg text-sm", !showShipping && "bg-muted opacity-50")} />
                </div>
              </div>

              {/* Addresses */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Billing Address</label>
                  <textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)} rows={4}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Shipping Address</label>
                  <textarea value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} rows={4}
                    disabled={!showShipping}
                    className={cn("w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                      !showShipping && "bg-muted opacity-50")} />
                </div>
              </div>
            </div>
          </Section>

          {/* ── GENERAL INFO ── */}
          <Section id="general" title="General Info" desc="General information such as number, date and more for the transaction.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">No. <span className="text-rose-500">*</span></label>
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground justify-between">
                  <span>{orderNo}</span>
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference No.</label>
                <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Date <span className="text-rose-500">*</span></label>
                <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Currency <span className="text-rose-500">*</span></label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[["MYR", "MYR - Malaysian Ringgit"], ["USD", "USD - US Dollar"], ["SGD", "SGD - Singapore Dollar"], ["EUR", "EUR - Euro"], ["GBP", "GBP - British Pound"]].map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Rate</label>
                  <Input value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} className="h-9 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 rounded-lg text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Internal Note</label>
                <Input value={internalNote} onChange={e => setInternalNote(e.target.value)} className="h-9 rounded-lg text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </Section>

          {/* ── ITEMS ── */}
          <Section id="items" title="Items" desc="Line items for goods or services in this transaction.">
            <div>
              {/* Tax mode toggle */}
              <div className="mb-4 flex justify-end">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {(["inclusive", "exclusive"] as const).map((m, i) => (
                    <button key={m} type="button" onClick={() => setTaxMode(m)}
                      className={cn("px-4 py-1.5 text-xs font-medium transition-colors", i > 0 && "border-l border-border",
                        taxMode === m ? "bg-blue-500 text-white" : "bg-card text-muted-foreground hover:bg-muted")}>
                      Tax {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["Item", "Account", "Quantity", "Unit Price", "Amount", "Discount", "Tax", ""].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length === 0 ? (
                      <tr><td colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileText className="h-8 w-8 opacity-30" />
                          <span className="text-sm">No data</span>
                        </div>
                      </td></tr>
                    ) : lineItems.map((item, idx) => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-2 py-1.5 min-w-[180px]">
                          <Input value={item.description} onChange={e => updateLine(idx, "description", e.target.value)}
                            placeholder="Description of goods / services"
                            className="h-8 rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-2 py-1.5 min-w-[150px]">
                          <Select value={item.account_id} onValueChange={v => updateLine(idx, "account_id", v)}>
                            <SelectTrigger className="h-8 rounded-md border-0 bg-transparent shadow-none text-xs">
                              <SelectValue placeholder="Account" />
                            </SelectTrigger>
                            <SelectContent>
                              {revenueAccounts.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 w-20">
                          <Input type="number" min={0} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))}
                            className="h-8 rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-2 py-1.5 w-24">
                          <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))}
                            className="h-8 rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-3 py-1.5 w-24 text-right font-medium text-foreground">
                          {(item.quantity * item.unit_price * (1 - item.discount / 100)).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 w-20">
                          <Input type="number" min={0} max={100} value={item.discount} onChange={e => updateLine(idx, "discount", Number(e.target.value))}
                            className="h-8 rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-2 py-1.5 w-16">
                          <Input type="number" min={0} value={item.tax_rate} onChange={e => updateLine(idx, "tax_rate", Number(e.target.value))}
                            className="h-8 rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-2 py-1.5 w-8 text-center">
                          <button type="button" onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-rose-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Item row */}
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={addLine}
                  className="h-8 rounded-lg bg-blue-500 px-3 text-xs font-medium text-white hover:bg-blue-600">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Item
                </Button>
              </div>

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="w-80 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sub Total</span>
                    <span className="font-medium">{currency} {subTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Discount Given</span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-xs">{currency}</span>
                      <Input type="number" min={0} step={0.01} value={discountGiven}
                        onChange={e => setDiscountGiven(Number(e.target.value))}
                        className="h-7 w-24 rounded-md text-right text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Rounding Adjustment</span>
                      <button type="button" onClick={() => setRoundingAdj(!roundingAdj)}
                        className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          roundingAdj ? "bg-blue-500" : "bg-muted-foreground/30")}>
                        <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                          roundingAdj ? "translate-x-4" : "translate-x-0.5")} />
                      </button>
                    </div>
                    <span className="text-muted-foreground">{currency} {roundingDiff.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex items-center justify-between text-base font-bold">
                      <span>TOTAL</span>
                      <span>{currency} {roundedTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── PAYMENT TERMS ── */}
          <Section id="payment-terms" title="Payment Terms" desc="Payment schedule for this transaction.">
            <div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["Term", "Due On", "", "Amount", "Description"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentTerms.map(pt => (
                      <tr key={pt.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{pt.term}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(pt.due_on)}</td>
                        <td className="px-4 py-2.5 w-8" />
                        <td className="px-4 py-2.5 text-sm text-right text-foreground">{pt.amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{pt.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPaymentTerms(p => [...p, { id: genId(), term: "NET30", due_on: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), amount: 0, description: "-" }])}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Term
                </button>
              </div>
            </div>
          </Section>

          {/* ── ADDITIONAL INFO ── */}
          <Section id="additional" title="Additional Info" desc="Additional information such as remarks and country specific fields.">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Remarks</label>
              </div>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={5}
                placeholder={"Remarks displayed on the form.\nSetup a default remarks in Control Panel -> Company Settings."}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </Section>

          {/* ── ATTACHMENTS ── */}
          <Section id="attachments" title="Attachments" desc="Supporting documents attached to the transaction.">
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background py-12 cursor-pointer hover:border-blue-400 hover:bg-muted/30 transition-colors">
              <input type="file" multiple className="hidden" />
              <Paperclip className="h-8 w-8 text-blue-400 mb-3" />
              <span className="text-sm font-medium text-foreground">Drop files to upload</span>
              <span className="mt-1 text-xs text-muted-foreground">
                or select files from <span className="text-blue-500 hover:underline">File Manager</span>
              </span>
            </label>
          </Section>

          {/* ── CONTROLS ── */}
          <Section id="controls" title="Controls" desc="Controls and statuses for the transaction.">
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Status</label>
              <div className="flex gap-0 rounded-lg border border-border overflow-hidden w-fit">
                {([["draft", "Draft"], ["pending_approval", "Pending Approval"], ["ready", "Ready"]] as const).map(([val, label], i) => (
                  <button key={val} type="button" onClick={() => setStatus(val)}
                    className={cn("px-5 py-2 text-sm font-medium transition-colors", i > 0 && "border-l border-border",
                      status === val ? "bg-blue-500 text-white" : "bg-card text-muted-foreground hover:bg-muted")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <div className="py-4" />
        </div>

        {/* ── Sticky Footer ── */}
        <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-border bg-card px-6 py-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mr-auto">
            <input type="checkbox" checked={quickShare} onChange={e => setQuickShare(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-blue-500" />
            QuickShare via Email
          </label>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
            <FileText className="h-4 w-4" />
          </button>
          <Button type="button" variant="outline" onClick={() => navigate("/sales/orders")} className="h-9 rounded-lg px-4 text-sm">Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!contactId || createSalesOrder.isPending}
            className="h-9 rounded-lg bg-blue-500 px-6 text-sm font-medium text-white hover:bg-blue-600">
            {createSalesOrder.isPending ? "Saving..." : "Save"}
          </Button>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
            <span className="text-base leading-none">···</span>
          </button>
        </div>
      </div>
    </>
  )
}
