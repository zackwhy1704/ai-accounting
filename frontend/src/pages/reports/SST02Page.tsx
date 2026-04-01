import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface SSTTaxableItem {
  rate: string
  description: string
  taxable_amount: number
  tax_amount: number
}

interface SST02Report {
  registration_no: string | null
  period_from: string
  period_to: string
  due_date: string | null
  type_of_return: string
  taxable_items: SSTTaxableItem[]
  total_taxable_amount: number
  total_tax_payable: number
  total_input_tax: number
  net_tax_payable: number
}

function getQuarterDates(offset: 0 | -1): { from: string; to: string } {
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + offset
  const year = quarter < 0 ? now.getFullYear() - 1 : now.getFullYear()
  const q = ((quarter % 4) + 4) % 4
  const from = new Date(year, q * 3, 1)
  const to = new Date(year, q * 3 + 3, 0)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

type PeriodPreset = "current" | "previous" | "custom"

export default function SST02Page() {
  const [preset, setPreset] = useState<PeriodPreset>("current")
  const currentQ = getQuarterDates(0)
  const prevQ = getQuarterDates(-1)

  const [fromDate, setFromDate] = useState(currentQ.from)
  const [toDate, setToDate] = useState(currentQ.to)
  const [queryParams, setQueryParams] = useState({ fromDate: currentQ.from, toDate: currentQ.to })

  const handlePresetChange = (value: PeriodPreset) => {
    setPreset(value)
    if (value === "current") {
      setFromDate(currentQ.from); setToDate(currentQ.to)
    } else if (value === "previous") {
      setFromDate(prevQ.from); setToDate(prevQ.to)
    }
  }

  const { data, isLoading, isFetching } = useQuery<SST02Report>({
    queryKey: ["report-sst02", queryParams],
    queryFn: () => api.get(`/reports?type=sst_02&from_date=${queryParams.fromDate}&to_date=${queryParams.toDate}`).then(r => r.data),
  })

  const handleUpdate = () => {
    setQueryParams({ fromDate, toDate })
  }

  const Row = ({ label, value, bold = false }: { label: string; value: string | React.ReactNode; bold?: boolean }) => (
    <div className={`flex items-start justify-between border-b border-border py-2.5 last:border-0 ${bold ? "bg-muted/30" : ""}`}>
      <span className={`text-sm text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{label}</span>
      <span className={`text-sm text-right text-foreground max-w-xs ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Reports</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">SST-02</div>
          <div className="mt-1 text-sm text-muted-foreground">Sales & Service Tax Return</div>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Period</label>
            <Select value={preset} onValueChange={v => handlePresetChange(v as PeriodPreset)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Quarter</SelectItem>
                <SelectItem value="previous">Previous Quarter</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreset("custom") }} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreset("custom") }} className="h-9 text-sm" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleUpdate} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {/* SST-02 Form */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
        </div>
      ) : (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          {/* Form header */}
          <div className="mb-6 border-b border-border pb-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Kerajaan Malaysia / Government of Malaysia</div>
            <div className="mt-1.5 text-lg font-bold text-foreground">SST-02 / Sales &amp; Service Tax Report Malaysia</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Customs Act 1967 / Service Tax Act 2018</div>
          </div>

          <div className="space-y-0 divide-y divide-border rounded-xl border border-border px-4">
            <Row label="1. Type of Return" value={data?.type_of_return ?? "Service Tax"} />
            <Row label="2. SST Registration No." value={data?.registration_no ?? <span className="text-muted-foreground italic">Not configured</span>} />
            <Row
              label="3. Reporting Period"
              value={data ? `${formatDate(data.period_from)} — ${formatDate(data.period_to)}` : `${formatDate(fromDate)} — ${formatDate(toDate)}`}
            />
            <Row
              label="4. Return and Payment Due Date"
              value={data?.due_date ? formatDate(data.due_date) : <span className="text-muted-foreground italic">N/A</span>}
            />
          </div>

          {/* Taxable amounts section */}
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Taxable Amounts by Rate</div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Rate</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Taxable Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Tax Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data && data.taxable_items.length > 0 ? (
                    data.taxable_items.map((item, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{item.rate}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{item.description}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.taxable_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.tax_amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">No taxable transactions for this period</td>
                    </tr>
                  )}
                  {data && (
                    <>
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-foreground">Total Output Tax</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(data.total_taxable_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(data.total_tax_payable)}</td>
                      </tr>
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Less: Input Tax Credit</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground" />
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600">({formatCurrency(data.total_input_tax)})</td>
                      </tr>
                      <tr className="border-t-2 border-border bg-primary/5">
                        <td colSpan={2} className="px-4 py-3 text-sm font-bold text-foreground">Net Tax Payable</td>
                        <td className="px-4 py-3 text-right" />
                        <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-foreground">{formatCurrency(data.net_tax_payable)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            This SST-02 report is for reference only. Please verify all figures before submission to the Royal Malaysian Customs Department (RMCD).
          </div>
        </Card>
      )}
    </div>
  )
}
