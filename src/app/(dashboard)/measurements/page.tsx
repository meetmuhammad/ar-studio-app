"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Ruler } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/data-table/data-table";
import { MeasurementForm } from "@/components/forms/measurement-form";
import { createMeasurementColumns } from "@/components/tables/measurement-columns";
import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableSkeleton } from "@/components/dashboard/table-skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/error-state";
import {
  SectionCard,
  SectionCardContent,
  SectionCardDescription,
  SectionCardHeader,
  SectionCardTitle,
} from "@/components/dashboard/section-card";
import { Measurement, MeasurementFormValues } from "@/types/measurements";
import { Customer } from "@/lib/supabase-client";

/**
 * The measurement form is a wide, multi-column sheet, so its dialog is sized in
 * viewport units rather than by the default max-width. Every step is a class,
 * not an inline style: the previous `style={{ width: '70vw' }}` outranked the
 * responsive classes beside it, so a 375px phone rendered the whole form into a
 * 262px column.
 */
const MEASUREMENT_DIALOG_CLASS =
  "w-[95vw] max-w-none sm:w-[90vw] md:w-[85vw] lg:w-[75vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[92vh] overflow-y-auto";

export default function MeasurementsPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);

  const fetchMeasurements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      const response = await fetch(`/api/measurements?${params}`);
      if (!response.ok) throw new Error("Failed to fetch measurements");

      const data = await response.json();
      setMeasurements(data.measurements || []);
    } catch (error) {
      console.error("Error fetching measurements:", error);
      // Kept in state, not only toasted: an empty table behind a vanished toast
      // is indistinguishable from a studio that has taken no measurements.
      setLoadError(error instanceof Error ? error.message : "Failed to load measurements");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch("/api/customers?pageSize=1000");
      if (!response.ok) throw new Error("Failed to fetch customers");

      const data = await response.json();
      setCustomers(data.data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load the customer list");
    }
  }, []);

  useEffect(() => {
    fetchMeasurements();
    fetchCustomers();
  }, [fetchMeasurements, fetchCustomers]);

  const handleCreateMeasurement = async (data: MeasurementFormValues) => {
    try {
      setSubmitting(true);
      const response = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create measurement");
      }

      setShowAddDialog(false);
      toast.success("Measurement saved");
      fetchMeasurements();
    } catch (error) {
      console.error("Error creating measurement:", error);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMeasurement = async (data: MeasurementFormValues) => {
    if (!selectedMeasurement) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/measurements/${selectedMeasurement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update measurement");
      }

      setShowEditDialog(false);
      setSelectedMeasurement(null);
      toast.success("Measurement updated");
      fetchMeasurements();
    } catch (error) {
      console.error("Error updating measurement:", error);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMeasurement = async () => {
    if (!selectedMeasurement) return;

    const response = await fetch(`/api/measurements/${selectedMeasurement.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to delete measurement");
      throw new Error(error.error || "Failed to delete measurement");
    }

    setShowDeleteDialog(false);
    setSelectedMeasurement(null);
    toast.success("Measurement deleted");
    fetchMeasurements();
  };

  const columns = createMeasurementColumns({
    onEdit: (measurement) => {
      setSelectedMeasurement(measurement);
      setShowEditDialog(true);
    },
    onDelete: (measurement) => {
      setSelectedMeasurement(measurement);
      setShowDeleteDialog(true);
    },
  });

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Measurements"
        description="Body measurements on file, by customer"
        actions={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New Measurement</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      {loadError ? (
        <ErrorState
          title="Couldn't load measurements"
          detail={loadError}
          onRetry={fetchMeasurements}
        />
      ) : loading ? (
        <TableSkeleton columns={5} />
      ) : (
        <SectionCard>
          <SectionCardHeader>
            <SectionCardTitle className="text-base">
              All Measurements{" "}
              <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                ({measurements.length})
              </span>
            </SectionCardTitle>
            <SectionCardDescription className="text-xs">
              Search by customer or measurement set name
            </SectionCardDescription>
          </SectionCardHeader>

          <SectionCardContent>
            {measurements.length === 0 ? (
              <EmptyState
                icon={Ruler}
                message="No measurements recorded yet"
                action={
                  <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                    <Plus className="size-4" aria-hidden="true" />
                    Record the first measurement
                  </Button>
                }
              />
            ) : (
              // Toolbar and footer stay on here: this route fetches the full set
              // in one request, so the table's own search and paging act on
              // everything there is.
              <DataTable
                columns={columns}
                data={measurements}
                searchPlaceholder="Search measurements…"
                emptyState={
                  <EmptyState icon={Ruler} message="No measurements match your search" />
                }
              />
            )}
          </SectionCardContent>
        </SectionCard>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent
          className={MEASUREMENT_DIALOG_CLASS}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add measurement</DialogTitle>
          </DialogHeader>
          <MeasurementForm
            customers={customers}
            onSubmit={handleCreateMeasurement}
            onCancel={() => setShowAddDialog(false)}
            isLoading={submitting}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent
          className={MEASUREMENT_DIALOG_CLASS}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit measurement</DialogTitle>
          </DialogHeader>
          {selectedMeasurement ? (
            <MeasurementForm
              measurement={selectedMeasurement}
              customers={customers}
              onSubmit={handleUpdateMeasurement}
              onCancel={() => {
                setShowEditDialog(false);
                setSelectedMeasurement(null);
              }}
              isLoading={submitting}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setSelectedMeasurement(null);
        }}
        title="Delete measurement"
        description={`Delete “${selectedMeasurement?.name ?? ""}” for ${
          selectedMeasurement?.customer?.name ?? "this customer"
        }? Orders that reference it may be affected. This cannot be undone.`}
        onConfirm={handleDeleteMeasurement}
      />
    </div>
  );
}
