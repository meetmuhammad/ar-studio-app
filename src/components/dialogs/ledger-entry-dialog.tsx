"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LedgerEntryForm } from "@/components/forms/ledger-entry-form"
import { queryKeys } from "@/lib/query-client"
import type { GeneralLedger } from "@/lib/supabase-client"

interface LedgerEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: GeneralLedger | null
  onSuccess?: () => void
}

export function LedgerEntryDialog({
  open,
  onOpenChange,
  entry,
  onSuccess,
}: LedgerEntryDialogProps) {
  const queryClient = useQueryClient()

  const handleSubmit = async (data: any) => {
    const url = entry ? `/api/general-ledger/${entry.id}` : '/api/general-ledger'
    const method = entry ? 'PUT' : 'POST'
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create ledger entry')
    }

    // This dialog posts with a raw fetch rather than the useCreateLedgerEntry /
    // useUpdateLedgerEntry mutation hooks, so nothing else invalidates the
    // React Query cache on success. Without this, the stat cards (useLedgerStats,
    // staleTime 2 minutes) never learn a new/edited entry changed the totals --
    // only the entries table refreshes, via the parent's onSuccess -> fetchData().
    queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })

    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Ledger Entry" : "Add Ledger Entry"}</DialogTitle>
          <DialogDescription>
            {entry ? "Update the ledger entry details" : "Create a new entry in the general ledger"}
          </DialogDescription>
        </DialogHeader>
        <LedgerEntryForm
          entry={entry}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
