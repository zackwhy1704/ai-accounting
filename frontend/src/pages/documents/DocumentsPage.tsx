import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import {
  Upload,
  FileText,
  Image,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Bot,
  Sparkles,
  Eye,
  Trash2,
  MoreHorizontal,
} from 'lucide-react'

const statusConfig = {
  uploaded: { label: 'Uploaded', variant: 'secondary' as const, icon: Clock },
  processing: { label: 'AI Processing', variant: 'default' as const, icon: Bot },
  processed: { label: 'Processed', variant: 'success' as const, icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive' as const, icon: AlertCircle },
}

const mockDocuments = [
  { id: '1', filename: 'invoice_acme_mar2026.pdf', file_type: 'application/pdf', file_size: 245000, status: 'processed' as const, uploaded_at: '2026-03-22', ai_extracted_data: { vendor: 'Acme Corp', amount: 5400, type: 'Invoice' } },
  { id: '2', filename: 'receipt_aws_feb2026.png', file_type: 'image/png', file_size: 180000, status: 'processed' as const, uploaded_at: '2026-03-21', ai_extracted_data: { vendor: 'AWS', amount: 1250, type: 'Receipt' } },
  { id: '3', filename: 'utility_bill_march.pdf', file_type: 'application/pdf', file_size: 120000, status: 'processing' as const, uploaded_at: '2026-03-21', ai_extracted_data: null },
  { id: '4', filename: 'payroll_summary_q1.xlsx', file_type: 'application/xlsx', file_size: 890000, status: 'uploaded' as const, uploaded_at: '2026-03-20', ai_extracted_data: null },
  { id: '5', filename: 'vendor_contract_greentech.pdf', file_type: 'application/pdf', file_size: 1200000, status: 'processed' as const, uploaded_at: '2026-03-18', ai_extracted_data: { vendor: 'GreenTech', amount: null, type: 'Contract' } },
  { id: '6', filename: 'receipt_taxi_blurry.jpg', file_type: 'image/jpeg', file_size: 95000, status: 'failed' as const, uploaded_at: '2026-03-17', ai_extracted_data: null },
]

function getFileIcon(type: string) {
  if (type.includes('pdf')) return <FileText className="h-5 w-5 text-destructive" />
  if (type.includes('image')) return <Image className="h-5 w-5 text-blue-500" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsPage() {
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    // TODO: Handle file upload
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-muted-foreground">Upload and process documents with AI</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="default" className="gap-1">
            <Sparkles className="h-3 w-3" />
            73 AI scans remaining
          </Badge>
        </div>
      </div>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Drop files here or click to upload</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Supports PDF, images (JPG, PNG), and spreadsheets. Max 10MB per file.
            </p>
            <div className="mt-4 flex gap-3">
              <Button>
                <Upload className="h-4 w-4" />
                Upload Files
              </Button>
              <Button variant="outline">
                <Bot className="h-4 w-4" />
                Scan with AI
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              AI will automatically extract vendor, amount, date, and categorize the document
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Processing Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">AI Document Processing</p>
            <p className="text-xs text-muted-foreground">
              Powered by Azure Document Intelligence. Extracts vendor info, amounts, dates, and line items automatically.
            </p>
          </div>
          <Badge>1 processing</Badge>
        </CardContent>
      </Card>

      {/* Documents Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockDocuments.map((doc) => {
          const StatusIcon = statusConfig[doc.status].icon
          return (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getFileIcon(doc.file_type)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                    </div>
                  </div>
                  <button className="rounded p-1 hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Badge variant={statusConfig[doc.status].variant} className="gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig[doc.status].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.uploaded_at)}</span>
                </div>

                {doc.ai_extracted_data && (
                  <div className="mt-3 rounded-md bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">AI Extracted</p>
                    <div className="space-y-1">
                      {doc.ai_extracted_data.vendor && (
                        <p className="text-xs"><span className="text-muted-foreground">Vendor:</span> {doc.ai_extracted_data.vendor}</p>
                      )}
                      {doc.ai_extracted_data.amount && (
                        <p className="text-xs"><span className="text-muted-foreground">Amount:</span> ${doc.ai_extracted_data.amount.toLocaleString()}</p>
                      )}
                      {doc.ai_extracted_data.type && (
                        <p className="text-xs"><span className="text-muted-foreground">Type:</span> {doc.ai_extracted_data.type}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1">
                    <Eye className="h-3 w-3" />
                    View
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
