import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Database, 
  Trash2, 
  RefreshCw, 
  Users, 
  Calendar, 
  Clipboard, 
  AlertCircle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DataStats {
  serviceUsersCount: number;
  careWorkersCount: number;
  serviceOrdersCount: number;
  templateAssignmentsCount: number;
  pendingRecommendationsCount: number;
  workbookUploadsCount: number;
}

interface CleanupResult {
  success: boolean;
  deleted: {
    serviceUsers: number;
    careWorkers: number;
    calls: number;
    orders: number;
    templates: number;
    recommendations: number;
  };
  message: string;
}

interface ResetResult {
  success: boolean;
  deleted: {
    careWorkerRotas: number;
    recommendedCallTimes: number;
    workerStartTimes: number;
    workerTemplates: number;
    workerConstraints: number;
    savedStates: number;
    analyzedServiceUsers: number;
    analyzedCareWorkers: number;
    analyzedCalls: number;
    serviceOrders: number;
    templateAssignments: number;
    callRecommendations: number;
    workbookUploads: number;
  };
  message: string;
}

interface WorkbookUploadSummary {
  id: string;
  fileName: string;
  totalRows: number;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export const AdminDatabasePanel: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DataStats>({
    queryKey: ["/api/admin/rostering/data-stats"],
  });

  const {
    data: uploads = [],
    isLoading: uploadsLoading,
    refetch: refetchUploads,
  } = useQuery<WorkbookUploadSummary[]>({
    queryKey: ["/api/admin/rostering/workbook-uploads"],
  });

  // Cleanup mutation
  const cleanupMutation = useMutation<CleanupResult, Error, void>({
    mutationFn: async () => {
      const response = await fetch("/api/admin/rostering/cleanup-expired", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to cleanup expired data");
      }
      return response.json() as Promise<CleanupResult>;
    },
    onSuccess: (data: CleanupResult) => {
      const totalDeleted = (Object.values(data.deleted) as number[]).reduce((sum, value) => sum + value, 0);
      toast({
        title: "Cleanup Complete",
        description: totalDeleted > 0 
          ? `Removed ${totalDeleted} expired records`
          : "No expired records found",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/data-stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Cleanup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation<ResetResult, Error, void>({
    mutationFn: async () => {
      const confirmed = window.confirm(
        "This will remove ALL rostering and care worker rota data. This cannot be undone. Continue?"
      );
      if (!confirmed) {
        throw new Error("Reset cancelled");
      }
      const response = await fetch("/api/admin/rostering/reset-data", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to reset rostering data");
      }
      return response.json() as Promise<ResetResult>;
    },
    onSuccess: (data: ResetResult) => {
      const totalDeleted = (Object.values(data.deleted) as number[]).reduce((sum, value) => sum + value, 0);
      toast({
        title: "Reset Complete",
        description: `Removed ${totalDeleted} records. Fresh start ready.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/data-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbook-uploads"] });
    },
    onError: (error: Error) => {
      if (error.message === "Reset cancelled") return;
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUploadMutation = useMutation<{ success: boolean }, Error, string>({
    mutationFn: async (uploadId: string) => {
      const confirmed = window.confirm("Delete this workbook upload? This cannot be undone.");
      if (!confirmed) {
        throw new Error("Delete cancelled");
      }
      const response = await fetch(`/api/admin/rostering/workbook-uploads/${uploadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to delete workbook upload");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workbook deleted",
        description: "The saved upload has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbook-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/data-stats"] });
    },
    onError: (error: Error) => {
      if (error.message === "Delete cancelled") return;
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const statItems = [
    { label: "Service Users", value: stats?.serviceUsersCount ?? 0, icon: Users, color: "bg-blue-500" },
    { label: "Care Workers", value: stats?.careWorkersCount ?? 0, icon: Users, color: "bg-green-500" },
    { label: "Service Orders", value: stats?.serviceOrdersCount ?? 0, icon: Clipboard, color: "bg-amber-500" },
    { label: "Template Assignments", value: stats?.templateAssignmentsCount ?? 0, icon: Calendar, color: "bg-violet-500" },
    { label: "Pending Recommendations", value: stats?.pendingRecommendationsCount ?? 0, icon: AlertCircle, color: "bg-orange-500" },
    { label: "Workbook Uploads", value: stats?.workbookUploadsCount ?? 0, icon: Database, color: "bg-zinc-500" },
  ];

  return (
    <Card className="border-border/70 bg-background/70 shadow-medium hover-elevate">
      <CardHeader className="border-b border-border/50 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Database Management</CardTitle>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetchStats()}
            disabled={statsLoading}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
        <CardDescription>
          View extracted rostering data statistics and manage data retention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-3 shadow-soft"
            >
              <div className={`p-2 rounded-md ${item.color} shadow-sm`}>
                <item.icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Data Retention Info */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-foreground">Data Retention Policy</h4>
              <p className="text-sm text-muted-foreground mt-1">
                All extracted data is automatically retained for <strong>3 months</strong> from the last update. 
                Overlapping data from multiple workbook uploads is deduplicated to prevent duplicates.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            className="gap-2"
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Cleanup Expired Data
          </Button>
          <Button
            variant="destructive"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="gap-2"
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Reset Rostering Data
          </Button>
        </div>

        <Separator />

        {/* Saved Workbooks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Saved Workbook Uploads</h4>
              <p className="text-xs text-muted-foreground">
                Delete individual uploads when they are no longer needed.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchUploads()} disabled={uploadsLoading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
          {uploadsLoading ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading uploads...
            </div>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved uploads found.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {uploads.map((upload: WorkbookUploadSummary) => {
                const dateLabel = upload.completedAt || upload.createdAt;
                const rangeLabel =
                  upload.dateRangeStart && upload.dateRangeEnd
                    ? `${upload.dateRangeStart} → ${upload.dateRangeEnd}`
                    : "Date range unavailable";
                return (
                  <div
                    key={upload.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{upload.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {rangeLabel} • {new Date(dateLabel).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteUploadMutation.mutate(upload.id)}
                      disabled={deleteUploadMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Last Cleanup Result */}
        {cleanupMutation.data && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-foreground">Last Cleanup Result</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(cleanupMutation.data.deleted as Record<string, number>).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminDatabasePanel;
