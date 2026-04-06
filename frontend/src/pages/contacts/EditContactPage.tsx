import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useContact, useUpdateContact } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

export default function EditContactPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: contact, isLoading } = useContact(id)
  const updateContact = useUpdateContact()

  const [name, setName] = useState("")
  const [type, setType] = useState("customer")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [address, setAddress] = useState("")
  const [taxId, setTaxId] = useState("")
  const [populated, setPopulated] = useState(false)

  useEffect(() => {
    if (contact && !populated) {
      setName(contact.name ?? "")
      setType(contact.type ?? "customer")
      setEmail(contact.email ?? "")
      setPhone(contact.phone ?? "")
      setCompany(contact.company ?? "")
      setAddress(contact.address ?? "")
      setTaxId(contact.tax_number ?? "")
      setPopulated(true)
    }
  }, [contact, populated])

  const handleSave = async () => {
    await updateContact.mutateAsync({
      id: id!,
      name,
      type,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      address: address || undefined,
      tax_number: taxId || undefined,
    })
    navigate("/contacts")
  }

  if (isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">Edit Contact</h1>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Address</label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tax ID / SST No.</label>
            <Input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="Tax registration number" />
          </div>

        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/contacts")}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={!name.trim() || updateContact.isPending}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700"
        >
          {updateContact.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
