import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CircleAlert, CloudUpload, FileText, Loader2, Search, CheckCircle2, Link2, PlusCircle, Pencil, Save, X, Check, AlertTriangle, Trash2, HelpCircle } from "lucide-react"
import { useDocuments, useBills, useAttachDocumentToBill, useCreateBillFromDocument, useUpdateExtractedData, useDeleteDocument } from "../../lib/hooks"
import api from "../../lib/api"
import { cn, formatDate } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import type { Bill } from "../../types"

const statusIconMap = { processed: FileText, processing: Loader2, failed: CircleAlert, uploaded: FileText, done: CheckCircle2, unrecognized: HelpCircle } as const

type UploadItem = {
  id: string
  file: File
  status: "pending" | "uploading" | "done" | "failed"
  error?: string
}

export default function DocumentsPage() {
  const [tab, setTab] = useState("processed")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const processingRef = useRef(false)
  const { data: documents = [], isLoading } = useDocuments()
  const { data: bills = [] } = useBills()
  const attachMutation = useAttachDocumentToBill()
  const createBillMutation = useCreateBillFromDocument()
  const updateExtractedMutation = useUpdateExtractedData()
  const deleteMutation = useDeleteDocument()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { t } = useTheme()
  const { toast } = useToast()

  const statusTabs = [
    { label: t("documents.preview"), value: "processed" },
    { label: t("documents.done"), value: "done" },
  ]

  const queueDesc: Record<string, string> = {
    processed: t("documents.readyForReview"),
    done: t("documents.doneQueue"),
  }

  const rows = useMemo(() => {
    if (tab === "done") return documents.filter(d => d.status === "done")
    return documents.filter(d => d.status !== "done")
  }, [documents, tab])

  const selected = rows.find(r => r.id === selectedId) ?? null

  // Reset edit state when selection changes
  useEffect(() => {
    setEditing(false)
    setEditData(null)
  }, [selectedId])

  // Ref mirror of uploadQueue so the async loop always reads fresh data
  const queueRef = useRef<UploadItem[]>([])
  useEffect(() => { queueRef.current = uploadQueue }, [uploadQueue])

  // Process upload queue sequentially, yielding between items so React can re-render
  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true

    const processNext = async (): Promise<void> => {
      const pending = queueRef.current.find(i => i.status === "pending")
      if (!pending) {
        processingRef.current = false
        return
      }

      const item = pending
      // Mark as uploading
      setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: "uploading" as const } : i))

      try {
        const formData = new FormData()
        formData.append("file", item.file)
        const { data } = await api.post("/documents", formData, {
          headers: { "Content-Type": undefined },
          timeout: 120000,
        })
        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: "done" as const } : i))
        qc.invalidateQueries({ queryKey: ["documents"] })
        setTab("processed")
        setSelectedId(data.id)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: "failed" as const, error: msg } : i))
      }

      // Yield to let React re-render before processing the next item
      await new Promise(r => setTimeout(r, 50))
      await processNext()
    }

    await processNext()
  }, [qc])

  // Start processing when queue gets new items
  useEffect(() => {
    if (uploadQueue.some(i => i.status === "pending") && !processingRef.current) {
      processQueue()
    }
  }, [uploadQueue, processQueue])

  // Auto-dismiss completed queue after 5s
  const queueDone = uploadQueue.length > 0 && uploadQueue.every(i => i.status === "done" || i.status === "failed")
  useEffect(() => {
    if (!queueDone) return
    const allDone = uploadQueue.filter(i => i.status === "done").length
    const allFailed = uploadQueue.filter(i => i.status === "failed").length
    if (allDone > 0) toast(`${allDone} file${allDone > 1 ? "s" : ""} uploaded successfully${allFailed > 0 ? `, ${allFailed} failed` : ""}`, allFailed > 0 ? "warning" : "success")
    const timer = setTimeout(() => setUploadQueue([]), 4000)
    return () => clearTimeout(timer)
  }, [queueDone, uploadQueue, toast])

  const handleUpload = () => fileRef.current?.click()
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const selected = Array.from(files).slice(0, 10)
    if (files.length > 10) {
      toast("Maximum 10 files at a time. Only the first 10 will be uploaded.", "warning")
    }

    const newItems: UploadItem[] = selected.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      file,
      status: "pending" as const,
    }))

    setUploadQueue(prev => [...prev, ...newItems])
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleCreateBill = () => {
    if (!selected) return
    if (!selected.ai_extracted_data) {
      toast(t("documents.noBillData"), "warning")
      return
    }
    createBillMutation.mutate(selected.id, {
      onSuccess: () => {
        toast(t("documents.billCreated"), "success")
        setTab("done")
        setSelectedId(selected.id)
      },
      onError: () => toast("Failed to create bill", "warning"),
    })
  }

  const handleAttachToBill = (bill: Bill) => {
    if (!selected) return
    attachMutation.mutate({ documentId: selected.id, billId: bill.id }, {
      onSuccess: () => {
        toast(t("documents.attached"), "success")
        setAttachModalOpen(false)
        setTab("done")
        setSelectedId(selected.id)
      },
      onError: () => toast("Failed to attach document", "warning"),
    })
  }

  const handleStartEdit = () => {
    if (!selected?.ai_extracted_data) return
    setEditData({ ...selected.ai_extracted_data })
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditData(null)
  }

  const handleSaveEdit = () => {
    if (!selected || !editData) return
    updateExtractedMutation.mutate({ id: selected.id, data: editData }, {
      onSuccess: () => {
        toast("Extracted data updated", "success")
        setEditing(false)
        setEditData(null)
      },
      onError: () => toast("Failed to save changes", "warning"),
    })
  }

  const updateField = (key: string, value: unknown) => {
    if (!editData) return
    setEditData({ ...editData, [key]: value })
  }

  const updateLineItem = (index: number, field: string, value: unknown) => {
    if (!editData) return
    const items = [...(editData.line_items as Record<string, unknown>[] || [])]
    items[index] = { ...items[index], [field]: value }
    setEditData({ ...editData, line_items: items })
  }

  const handleDelete = () => {
    if (!selected) return
    deleteMutation.mutate(selected.id, {
      onSuccess: () => {
        toast("Document deleted", "success")
        setSelectedId(null)
      },
      onError: () => toast("Failed to delete document", "warning"),
    })
  }

  const statusLabel = (status: string) => {
    if (status === "processing") return t("documents.processing")
    if (status === "failed") return t("documents.failed")
    if (status === "uploaded") return t("documents.uploaded")
    if (status === "unrecognized") return "Not recognized"
    return null
  }

  const activeUploads = uploadQueue.length > 0
  const uploadProgress = uploadQueue.length > 0
    ? { total: uploadQueue.length, done: uploadQueue.filter(i => i.status === "done").length, failed: uploadQueue.filter(i => i.status === "failed").length }
    : null

  return (
    <div className="flex flex-col gap-4">
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx" multiple className="hidden" onChange={onFileChange} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-foreground">{t("documents.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("documents.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleUpload} disabled={activeUploads} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            {activeUploads ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-2 h-4 w-4" />}
            {activeUploads ? `Uploading ${uploadProgress!.done}/${uploadProgress!.total}` : t("documents.upload")}
          </Button>
        </div>
      </div>

      {/* Upload progress queue */}
      {uploadQueue.length > 0 && (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-foreground">
              Upload Queue
              <span className="ml-2 text-muted-foreground font-normal">
                {uploadProgress!.done + uploadProgress!.failed}/{uploadProgress!.total} complete
              </span>
            </div>
            {queueDone && (
              <button type="button" onClick={() => setUploadQueue([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Dismiss
              </button>
            )}
          </div>
          {/* Overall progress bar */}
          <div className="mb-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500",
                uploadProgress!.failed > 0 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${((uploadProgress!.done + uploadProgress!.failed) / uploadProgress!.total) * 100}%` }}
            />
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {uploadQueue.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-muted/50">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {item.status === "pending" && <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />}
                  {item.status === "uploading" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                  {item.status === "done" && <Check className="h-4 w-4 text-emerald-500" />}
                  {item.status === "failed" && <AlertTriangle className="h-4 w-4 text-rose-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">{item.file.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {item.status === "pending" && "Waiting..."}
                    {item.status === "uploading" && "Uploading & processing with AI..."}
                    {item.status === "done" && "Complete"}
                    {item.status === "failed" && (item.error || "Failed")}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {(item.file.size / 1024).toFixed(0)} KB
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedId(null) }}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
              {statusTabs.map(st => (<TabsTrigger key={st.value} value={st.value} className="rounded-lg px-3 py-1.5 text-xs">{st.label}</TabsTrigger>))}
            </TabsList>
          </Tabs>
          <div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder={t("documents.searchFileName")} className="h-10 rounded-xl pl-9 text-sm" /></div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border bg-muted px-4 py-3">
                <div className="text-xs font-semibold text-foreground">{t("documents.queue")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{queueDesc[tab]}</div>
              </div>
              {isLoading ? (<div className="px-4 py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><FileText className="h-5 w-5 text-muted-foreground" /></div>
                  <div className="mt-3 text-sm font-semibold text-foreground">{t("documents.allCaughtUp")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t("documents.uploadNew")}</div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {rows.map(r => {
                    const Icon = statusIconMap[r.status as keyof typeof statusIconMap] ?? FileText
                    const active = r.id === selectedId
                    const badge = statusLabel(r.status)
                    return (
                      <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", active ? "bg-muted" : "hover:bg-muted/50")}>
                        <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border", r.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-700" : r.status === "processing" ? "border-sky-200 bg-sky-50 text-sky-700" : r.status === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : r.status === "unrecognized" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground")}>
                          <Icon className={cn("h-4 w-4", r.status === "processing" ? "animate-spin" : "")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-foreground">{r.filename}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(r.uploaded_at)}</span>
                            {badge && (
                              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                r.status === "failed" ? "bg-rose-100 text-rose-700" :
                                r.status === "processing" ? "bg-sky-100 text-sky-700" :
                                r.status === "unrecognized" ? "bg-amber-100 text-amber-700" :
                                "bg-gray-100 text-gray-600"
                              )}>{badge}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="h-full rounded-2xl border border-border bg-card">
              {selected ? (
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">{t("documents.preview")}</div>
                    <div className="flex items-center gap-3">
                      {selected.linked_bill_id && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                          <Link2 className="h-3.5 w-3.5" />{t("documents.linkedToBill")}
                        </span>
                      )}
                      {selected.status === "unrecognized" && (
                        <div className="flex items-center gap-1.5 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">Not recognized</span>
                        </div>
                      )}
                      {selected.status === "processed" && (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">AI processed</span>
                        </div>
                      )}
                      {selected.status === "processing" && (
                        <div className="flex items-center gap-1.5 text-sky-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs font-medium">Processing</span>
                        </div>
                      )}
                      {selected.status === "failed" && (
                        <div className="flex items-center gap-1.5 text-rose-600">
                          <CircleAlert className="h-4 w-4" />
                          <span className="text-xs font-medium">Failed</span>
                        </div>
                      )}
                      {selected.status === "uploaded" && (
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <FileText className="h-4 w-4" />
                          <span className="text-xs font-medium">Uploaded</span>
                        </div>
                      )}
                      {selected.status === "done" && (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">{t("documents.done")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 rounded-2xl border border-border bg-muted p-6">
                    <div className="text-sm font-semibold text-foreground">{selected.filename}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(selected.uploaded_at)} | {selected.file_type} | {(selected.file_size / 1024).toFixed(1)} KB</div>

                    {/* Unrecognized document banner */}
                    {selected.status === "unrecognized" && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-amber-900">This doesn't look like an invoice or receipt</div>
                            <div className="mt-1 text-xs text-amber-700">
                              Our AI couldn't find financial data in this document (confidence: {((selected.ai_confidence ?? 0) * 100).toFixed(0)}%).
                              This might be a photo, screenshot, or non-financial document.
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <Button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} variant="secondary" className="h-8 rounded-lg px-3 text-xs font-medium border-amber-300 bg-white hover:bg-amber-100">
                                {deleteMutation.isPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1.5 h-3 w-3" />}
                                Delete
                              </Button>
                              <Button type="button" onClick={handleStartEdit} variant="secondary" className="h-8 rounded-lg px-3 text-xs font-medium border-amber-300 bg-white hover:bg-amber-100">
                                <Pencil className="mr-1.5 h-3 w-3" />
                                Enter data manually
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selected.ai_extracted_data && !editing && selected.status !== "unrecognized" && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-foreground">{t("documents.aiExtractedData")}</div>
                          {selected.status !== "done" && (
                            <button type="button" onClick={handleStartEdit} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {renderExtractedFields(selected.ai_extracted_data)}
                        </div>
                      </div>
                    )}

                    {editing && editData && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold text-foreground">Edit Extracted Data</div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={handleCancelEdit} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-card transition-colors">
                              <X className="h-3 w-3" /> Cancel
                            </button>
                            <button type="button" onClick={handleSaveEdit} disabled={updateExtractedMutation.isPending} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                              {updateExtractedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <EditField label="Vendor Name" value={editData.vendor_name as string ?? ""} onChange={v => updateField("vendor_name", v)} />
                            <EditField label="Invoice Number" value={editData.invoice_number as string ?? ""} onChange={v => updateField("invoice_number", v)} />
                            <EditField label="Invoice Date" value={editData.invoice_date as string ?? ""} onChange={v => updateField("invoice_date", v)} />
                            <EditField label="Due Date" value={editData.due_date as string ?? ""} onChange={v => updateField("due_date", v)} />
                            <EditField label="Subtotal" value={String(editData.subtotal ?? "")} onChange={v => updateField("subtotal", parseFloat(v) || 0)} type="number" />
                            <EditField label="Tax Amount" value={String(editData.tax_amount ?? "")} onChange={v => updateField("tax_amount", parseFloat(v) || 0)} type="number" />
                            <EditField label="Total" value={String(editData.total ?? "")} onChange={v => updateField("total", parseFloat(v) || 0)} type="number" />
                            <EditField label="Currency" value={editData.currency as string ?? "SGD"} onChange={v => updateField("currency", v)} />
                          </div>
                          <div className="col-span-2">
                            <EditField label="Vendor Address" value={editData.vendor_address as string ?? ""} onChange={v => updateField("vendor_address", v)} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-foreground mb-2">Line Items</div>
                            <div className="space-y-2">
                              {((editData.line_items as Record<string, unknown>[]) || []).map((item, i) => (
                                <div key={i} className="grid grid-cols-4 gap-2 rounded-xl bg-card p-2.5 border border-border">
                                  <div className="col-span-2">
                                    <EditField label="Description" value={item.description as string ?? ""} onChange={v => updateLineItem(i, "description", v)} />
                                  </div>
                                  <EditField label="Qty" value={String(item.quantity ?? "")} onChange={v => updateLineItem(i, "quantity", parseFloat(v) || 0)} type="number" />
                                  <EditField label="Amount" value={String(item.amount ?? "")} onChange={v => updateLineItem(i, "amount", parseFloat(v) || 0)} type="number" />
                                </div>
                              ))}
                            </div>
                          </div>
                          <EditField label="Notes" value={editData.notes as string ?? ""} onChange={v => updateField("notes", v)} />
                        </div>
                      </div>
                    )}

                    {/* Processing status */}
                    {selected.status === "processing" && (
                      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 text-sky-600 animate-spin shrink-0" />
                          <div>
                            <div className="text-sm font-semibold text-sky-900">Processing document...</div>
                            <div className="mt-0.5 text-xs text-sky-700">AI is extracting data from this document. This usually takes a few seconds.</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Failed status */}
                    {selected.status === "failed" && (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-rose-900">Processing failed</div>
                            <div className="mt-0.5 text-xs text-rose-700">
                              {(selected.ai_extracted_data as Record<string, unknown>)?.error_message as string || "An error occurred while processing this document."}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Uploaded (no AI scan) status */}
                    {selected.status === "uploaded" && (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start gap-3">
                          <FileText className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-semibold text-gray-900">Uploaded — no AI processing</div>
                            <div className="mt-0.5 text-xs text-gray-600">This document was uploaded but not processed by AI. You may have reached your scan limit.</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action buttons for processed docs */}
                    {selected.status === "processed" && !editing && (
                      <div className="mt-6 flex items-center gap-2">
                        <Button type="button" onClick={handleCreateBill} disabled={createBillMutation.isPending || !selected.ai_extracted_data} className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50">
                          {createBillMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="mr-1.5 h-3.5 w-3.5" />}
                          {t("documents.createBill")}
                        </Button>
                        <Button type="button" onClick={() => setAttachModalOpen(true)} variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold">
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />{t("documents.attachToBill")}
                        </Button>
                      </div>
                    )}

                    {/* Delete button for ALL non-done statuses */}
                    {selected.status !== "done" && selected.status !== "unrecognized" && !editing && (
                      <div className={selected.status === "processed" ? "mt-2" : "mt-6"}>
                        <Button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          {deleteMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
                  <button type="button" onClick={handleUpload} disabled={activeUploads} className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)] hover:bg-muted/70 transition-colors cursor-pointer">
                    {activeUploads ? <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /> : <CloudUpload className="h-6 w-6 text-muted-foreground" />}
                  </button>
                  <div className="mt-4 text-base font-semibold text-foreground">{t("documents.selectItem")}</div>
                  <div className="mt-1 max-w-md text-sm text-muted-foreground">{t("documents.selectItemDesc")}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Attach to Bill Modal */}
      {attachModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAttachModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-foreground">{t("documents.attachToBillTitle")}</div>
              <button type="button" onClick={() => setAttachModalOpen(false)} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="text-xs text-muted-foreground mb-3">{t("documents.selectBill")}</div>
            {bills.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("documents.noBillsAvailable")}</div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                {bills.map((bill: Bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    onClick={() => handleAttachToBill(bill)}
                    disabled={attachMutation.isPending}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-semibold text-foreground">{bill.bill_number}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(bill.issue_date)} &middot; {bill.currency} {bill.total.toFixed(2)}</div>
                    </div>
                    <span className={cn("rounded-lg px-2 py-0.5 text-[10px] font-medium",
                      bill.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                      bill.status === "draft" ? "bg-gray-100 text-gray-700" :
                      "bg-amber-100 text-amber-700"
                    )}>{bill.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helper components ── */

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#4D63FF] focus:ring-1 focus:ring-[#4D63FF]/20 transition-colors"
      />
    </div>
  )
}

function renderExtractedFields(data: Record<string, unknown>) {
  const fields = [
    { key: "vendor_name", label: "Vendor" },
    { key: "invoice_number", label: "Invoice #" },
    { key: "invoice_date", label: "Invoice Date" },
    { key: "due_date", label: "Due Date" },
    { key: "currency", label: "Currency" },
    { key: "subtotal", label: "Subtotal", format: (v: unknown) => Number(v).toFixed(2) },
    { key: "tax_amount", label: "Tax", format: (v: unknown) => Number(v).toFixed(2) },
    { key: "total", label: "Total", format: (v: unknown) => Number(v).toFixed(2) },
  ]

  const lineItems = (data.line_items as Record<string, unknown>[]) || []

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-card p-3 border border-border">
        {fields.map(f => {
          const val = data[f.key]
          if (val == null || val === "") return null
          return (
            <div key={f.key} className="flex items-baseline justify-between py-0.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{f.label}</span>
              <span className="text-xs font-medium text-foreground">{f.format ? f.format(val) : String(val)}</span>
            </div>
          )
        })}
      </div>
      {lineItems.length > 0 && (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-muted text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>
          {lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-t border-border">
              <div className="col-span-6 text-foreground">{String(item.description ?? "")}</div>
              <div className="col-span-2 text-right text-muted-foreground">{Number(item.quantity ?? 0)}</div>
              <div className="col-span-2 text-right text-muted-foreground">{Number(item.unit_price ?? 0).toFixed(2)}</div>
              <div className="col-span-2 text-right font-medium text-foreground">{Number(item.amount ?? 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
      {data.notes && (
        <div className="rounded-xl bg-card p-3 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notes</span>
          <div className="mt-1 text-xs text-muted-foreground">{String(data.notes)}</div>
        </div>
      )}
    </>
  )
}
