import { useState } from "react"
import { Plus, Pencil, Trash2, Check, X, Loader2, Users } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"

interface ContactGroup {
  id: string
  name: string
  description: string | null
  contact_count: number
}

export default function ContactGroupsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")

  const { data: groups = [], isLoading } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups"],
    queryFn: () => api.get("/contact-groups").then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => api.post("/contact-groups", data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] })
      setShowAddForm(false)
      setNewName("")
      setNewDesc("")
      toast("Contact group created", "success")
    },
    onError: () => toast("Failed to create group", "warning"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; description: string } }) =>
      api.patch(`/contact-groups/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] })
      setEditingId(null)
      toast("Group updated", "success")
    },
    onError: () => toast("Failed to update group", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contact-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] })
      toast("Group deleted", "success")
    },
    onError: () => toast("Failed to delete group", "warning"),
  })

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() })
  }

  const startEdit = (group: ContactGroup) => {
    setEditingId(group.id)
    setEditName(group.name)
    setEditDesc(group.description ?? "")
  }

  const handleUpdate = (id: string) => {
    if (!editName.trim()) return
    updateMutation.mutate({ id, data: { name: editName.trim(), description: editDesc.trim() } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Contacts</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Contact Groups</div>
          <div className="mt-1 text-sm text-muted-foreground">Organise your contacts into groups</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowAddForm(v => !v)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> New Group
        </Button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold text-foreground mb-3">New Contact Group</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Group Name <span className="text-rose-500">*</span></label>
              <Input className="h-9 text-sm" placeholder="e.g. VIP Customers" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input className="h-9 text-sm" placeholder="Optional description" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => { setShowAddForm(false); setNewName(""); setNewDesc("") }}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-8 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-xs text-white"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
            >
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create Group"}
            </Button>
          </div>
        </Card>
      )}

      {/* Groups list */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground">No contact groups yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Create groups to organise your contacts</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map(group => (
            <Card key={group.id} className="rounded-xl border-border bg-card px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.04)]">
              {editingId === group.id ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                      className="h-8 text-sm"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleUpdate(group.id)}
                    />
                    <Input
                      className="h-8 text-sm"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="Description"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleUpdate(group.id)} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{group.name}</div>
                      {group.description && (
                        <div className="text-xs text-muted-foreground">{group.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {group.contact_count} contact{group.contact_count !== 1 ? "s" : ""}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(group)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => deleteMutation.mutate(group.id)} disabled={deleteMutation.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
