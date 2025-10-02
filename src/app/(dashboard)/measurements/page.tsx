"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { MeasurementForm } from "@/components/forms/measurement-form";
import { createMeasurementColumns } from "@/components/tables/measurement-columns";
import { Measurement, MeasurementFormValues } from "@/types/measurements";
import { Customer } from "@/lib/supabase-client";
import { Plus, Ruler } from "lucide-react";
import { toast } from "sonner";

interface MeasurementsResponse {
  measurements: Measurement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function MeasurementsPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Modal states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);

  // Fetch measurements
  const fetchMeasurements = async (pageNum = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      const response = await fetch(`/api/measurements?${params}`);
      if (!response.ok) throw new Error("Failed to fetch measurements");
      
      const data: MeasurementsResponse = await response.json();
      setMeasurements(data.measurements);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Error fetching measurements:", error);
      toast.error("Failed to load measurements");
    } finally {
      setLoading(false);
    }
  };

  // Fetch customers for the form
  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers?pageSize=1000");
      if (!response.ok) throw new Error("Failed to fetch customers");
      
      const data = await response.json();
      setCustomers(data.data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to load customers");
    }
  };

  useEffect(() => {
    fetchMeasurements();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchMeasurements(page);
  }, [page]);

  // Create measurement
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
      fetchMeasurements(page);
    } catch (error) {
      console.error("Error creating measurement:", error);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  // Update measurement
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
      fetchMeasurements(page);
    } catch (error) {
      console.error("Error updating measurement:", error);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete measurement
  const handleDeleteMeasurement = async () => {
    if (!selectedMeasurement) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/measurements/${selectedMeasurement.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete measurement");
      }

      setShowDeleteDialog(false);
      setSelectedMeasurement(null);
      fetchMeasurements(page);
      toast.success("Measurement deleted successfully");
    } catch (error) {
      console.error("Error deleting measurement:", error);
      toast.error("Failed to delete measurement");
    } finally {
      setSubmitting(false);
    }
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Ruler className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Measurements</h1>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Measurement
          </Button>
        </div>
        <p className="text-muted-foreground">
          Manage customer body measurements for accurate tailoring
        </p>
      </div>

      {/* Measurements Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Measurements</CardTitle>
          <CardDescription>
            View and manage customer body measurements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={measurements}
            searchPlaceholder="Search measurements by customer name or measurement set name..."
            loading={loading}
            pagination={{
              pageIndex: page - 1,
              pageSize: 10,
              pageCount: totalPages,
              onPageChange: (pageIndex) => setPage(pageIndex + 1),
            }}
          />
        </CardContent>
      </Card>

      {/* Add Measurement Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent 
          className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
          style={{ width: '70vw', maxWidth: 'none' }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add New Measurement</DialogTitle>
          </DialogHeader>
          <MeasurementForm
            customers={customers}
            onSubmit={handleCreateMeasurement}
            onCancel={() => setShowAddDialog(false)}
            isLoading={submitting}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Measurement Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent 
          className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
          style={{ width: '70vw', maxWidth: 'none' }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Measurement</DialogTitle>
          </DialogHeader>
          {selectedMeasurement && (
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
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Measurement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{selectedMeasurement?.name}&rdquo; for {selectedMeasurement?.customer?.name}?
              This action cannot be undone and may affect related orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMeasurement}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}