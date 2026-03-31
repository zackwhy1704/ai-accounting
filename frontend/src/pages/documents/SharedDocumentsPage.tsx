import { useQuery } from "@tanstack/react-query"
import { FileText, Download } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import api from "../../lib/api"
import { formatDate } from "../../lib/utils"

interface SharedDoc {
  share_id: string
  document_id: string
  filename: string
  file_type: string
  file_url: string
  category: string | null
  shared_at: string
  note: string | null
}

export default function SharedDocumentsPage() {
  const { data: docs = [], isLoading } = useQuery<SharedDoc[]>({
    queryKey: ["shared-with-me"],
    queryFn: () => api.get("/sharing/shared-with-me").then(r => r.data),
  })

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Documents</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Shared with Me</div>
          <div className="mt-1 text-sm text-muted-foreground">Documents your clients have shared with you</div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {docs.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <div className="text-base font-semibold text-foreground">No shared documents</div>
            <div className="mt-1 text-sm text-muted-foreground">When a client shares documents with you, they will appear here</div>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {docs.map(doc => (
              <div key={doc.share_id} className="flex items-center gap-4 px-5 py-3.5">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{doc.filename}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {doc.category ?? doc.file_type} · Shared {formatDate(doc.shared_at)}
                  </div>
                  {doc.note && <div className="text-xs text-muted-foreground italic mt-0.5">"{doc.note}"</div>}
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
