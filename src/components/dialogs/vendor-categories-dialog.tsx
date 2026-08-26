"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useVendorCategories,
  useCreateVendorCategory,
  useUpdateVendorCategory,
  useDeleteVendorCategory,
} from "@/hooks/use-api"
import type { VendorCategory } from "@/lib/supabase-client"
import { Pencil, Check, X, Archive, ArchiveRestore, Trash2 } from "lucide-react"

/**
 * Manage the global accounting categories.
 *
 * Ported from feat/vendor-categories (commit d207f91), adapted to main's UI
 * primitives (main uses the same Dialog/Button/Input components, so this
 * needed no structural changes -- only the access-control note below).
 *
 * Deliberately small: view, create, rename, archive, and delete only when
 * nothing references the category. d207f91's version noted every endpoint
 * behind this was `withAdmin`-guarded; that helper doesn't exist on main, so
 * these routes are unguarded like every other API route in this app (access
 * control here is client-side only, via the <RoleGuard> wrapping the Vendors
 * page).
 *
 * Renaming does not touch history. Ledger entries store the category name as
 * it was when they were written, so past reports keep reading the way the
 * books read at the time.
 */
export function VendorCategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: categories = [], isPending } = useVendorCategories(true)
  const createCategory = useCreateVendorCategory()
  const updateCategory = useUpdateVendorCategory()
  const deleteCategory = useDeleteVendorCategory()

  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const startEdit = (c: VendorCategory) => {
    setEditingId(c.id)
    setEditingName(c.name)
  }

  const commitEdit = async () => {
    if (!editingId || !editingName.trim()) return
    await updateCategory.mutateAsync({ id: editingId, name: editingName.trim() })
    setEditingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Accounting Categories</DialogTitle>
          <DialogDescription>
            Used to classify vendors for accounting. Renaming a category does not change
            how past ledger entries are recorded.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newName.trim()) return
            await createCategory.mutateAsync(newName.trim())
            setNewName("")
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            maxLength={120}
          />
          <Button type="submit" disabled={!newName.trim() || createCategory.isPending}>
            Add
          </Button>
        </form>

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isPending && categories.length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              {editingId === c.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={120}
                    className="h-8"
                  />
                  <Button size="sm" variant="ghost" onClick={commitEdit} aria-label="Save">
                    <Check className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className={c.archived_at ? "flex-1 text-muted-foreground line-through" : "flex-1"}>
                    {c.name}
                  </span>
                  {c.archived_at && (
                    <span className="text-xs text-muted-foreground">archived</span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(c)} aria-label={`Rename ${c.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={c.archived_at ? `Restore ${c.name}` : `Archive ${c.name}`}
                    onClick={() =>
                      updateCategory.mutateAsync({ id: c.id, archived: !c.archived_at })
                    }
                  >
                    {c.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => deleteCategory.mutateAsync(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          A category that is in use cannot be deleted — archive it instead. Archived
          categories disappear from vendor pickers but stay readable on the entries they
          already classify.
        </p>
      </DialogContent>
    </Dialog>
  )
}
