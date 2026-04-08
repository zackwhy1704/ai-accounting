import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useCreateContact } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

export default function NewContactPage() {
  const navigate = useNavigate()
  const createContact = useCreateContact()

  const [name, setName] = useState("")
  const [type, setType] = useState("customer")
  const [entityType, setEntityType] = useState("company")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [address] = useState("")
  const [taxId, setTaxId] = useState("")
  const [notes, setNotes] = useState("")
  const [brn, setBrn] = useState("")
  const [icNumber, setIcNumber] = useState("")
  const [tin, setTin] = useState("")
  const [msicCode, setMsicCode] = useState("")

  // Structured billing address
  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")

  // Structured shipping address
  const [shippingLine1, setShippingLine1] = useState("")
  const [shippingLine2, setShippingLine2] = useState("")
  const [shippingCity, setShippingCity] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingPostcode, setShippingPostcode] = useState("")
  const [shippingCountry, setShippingCountry] = useState("")

  // Default preferences (payment terms stored on backend; currency/tax_inclusive cached per-contact in localStorage)
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState("")

  const copyBillingToShipping = () => {
    setShippingLine1(billingLine1)
    setShippingLine2(billingLine2)
    setShippingCity(billingCity)
    setShippingState(billingState)
    setShippingPostcode(billingPostcode)
    setShippingCountry(billingCountry)
  }

  const handleSave = async () => {
    await createContact.mutateAsync({
      name,
      type,
      entity_type: entityType,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      address: address || undefined,
      tax_number: taxId || undefined,
      notes: notes || undefined,
      brn: brn || undefined,
      ic_number: icNumber || undefined,
      tin: tin || undefined,
      msic_code: msicCode || undefined,
      billing_address_line1: billingLine1 || undefined,
      billing_address_line2: billingLine2 || undefined,
      billing_city: billingCity || undefined,
      billing_state: billingState || undefined,
      billing_postcode: billingPostcode || undefined,
      billing_country: billingCountry || undefined,
      shipping_address_line1: shippingLine1 || undefined,
      shipping_address_line2: shippingLine2 || undefined,
      shipping_city: shippingCity || undefined,
      shipping_state: shippingState || undefined,
      shipping_postcode: shippingPostcode || undefined,
      shipping_country: shippingCountry || undefined,
      default_payment_terms: defaultPaymentTerms || undefined,
    })
    navigate("/contacts")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">New Contact</h1>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Basic Info</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Contact name" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="vendor">Vendor / Supplier</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Entity Type</label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Company</label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Phone</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 12-345 6789" />
          </div>

          {entityType === "company" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">BRN (Business Registration No.)</label>
              <Input value={brn} onChange={e => setBrn(e.target.value)} placeholder="e.g. 202301012345" />
            </div>
          )}

          {entityType === "individual" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">IC Number</label>
              <Input value={icNumber} onChange={e => setIcNumber(e.target.value)} placeholder="e.g. 900101-14-1234" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">TIN (Tax Identification No.)</label>
            <Input value={tin} onChange={e => setTin(e.target.value)} placeholder="e.g. C12345678000" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">MSIC Code</label>
            <Input value={msicCode} onChange={e => setMsicCode(e.target.value)} placeholder="e.g. 46510" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tax ID / SST No.</label>
            <Input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="Tax registration number" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes" />
          </div>
        </div>
      </Card>

      {/* Billing Address */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Address Line 1</label>
            <Input value={billingLine1} onChange={e => setBillingLine1(e.target.value)} placeholder="Street / Unit" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Address Line 2</label>
            <Input value={billingLine2} onChange={e => setBillingLine2(e.target.value)} placeholder="Building / Area" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Input value={billingCity} onChange={e => setBillingCity(e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">State</label>
            <Input value={billingState} onChange={e => setBillingState(e.target.value)} placeholder="State" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Postcode</label>
            <Input value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} placeholder="Postcode" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Country</label>
            <Input value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="Country" />
          </div>
        </div>
      </Card>

      {/* Shipping Address */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Shipping Address</h2>
          <Button type="button" variant="outline" className="h-7 text-xs" onClick={copyBillingToShipping}>
            Same as billing
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Address Line 1</label>
            <Input value={shippingLine1} onChange={e => setShippingLine1(e.target.value)} placeholder="Street / Unit" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Address Line 2</label>
            <Input value={shippingLine2} onChange={e => setShippingLine2(e.target.value)} placeholder="Building / Area" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Input value={shippingCity} onChange={e => setShippingCity(e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">State</label>
            <Input value={shippingState} onChange={e => setShippingState(e.target.value)} placeholder="State" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Postcode</label>
            <Input value={shippingPostcode} onChange={e => setShippingPostcode(e.target.value)} placeholder="Postcode" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Country</label>
            <Input value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} placeholder="Country" />
          </div>
        </div>
      </Card>

      {/* Default Preferences */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Default Preferences</h2>
        <p className="mb-4 text-xs text-muted-foreground">Payment terms are saved here. Currency and tax preferences are remembered automatically per contact when you create documents.</p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Default Payment Terms</label>
            <Select value={defaultPaymentTerms} onValueChange={setDefaultPaymentTerms}>
              <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cbd">C.B.D.</SelectItem>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net7">Net 7</SelectItem>
                <SelectItem value="net15">Net 15</SelectItem>
                <SelectItem value="net30">Net 30</SelectItem>
                <SelectItem value="net60">Net 60</SelectItem>
                <SelectItem value="net90">Net 90</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/contacts")}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={!name.trim() || createContact.isPending}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700"
        >
          {createContact.isPending ? "Saving..." : "Save Contact"}
        </Button>
      </div>
    </div>
  )
}
