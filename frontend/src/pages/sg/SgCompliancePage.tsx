import { FileText, Info } from "lucide-react"
import { Card } from "../../components/ui/card"

export default function SgCompliancePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Compliance</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">IRAS E-Invoice</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Singapore InvoiceNow (PEPPOL) e-invoicing for IRAS compliance
        </div>
      </div>

      <Card className="rounded-2xl border border-border/60 bg-card shadow-sm p-8">
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">IRAS InvoiceNow</div>
            <div className="mt-1 text-sm text-muted-foreground max-w-sm">
              Singapore's nationwide e-invoicing network. Submit invoices directly to IRAS via the PEPPOL network.
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3 text-left max-w-sm">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              IRAS InvoiceNow integration is coming soon. Your invoices are being prepared to meet the
              GST InvoiceNow requirement for GST-registered businesses.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
