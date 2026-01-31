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

export const AdminDatabasePanel: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DataStats>({
    queryKey: ["/api/admin/rostering/data-stats"],
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
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
    onSuccess: (data) => {
      const totalDeleted = Object.values(data.deleted).reduce((a, b) => a + b, 0);
      toast({
        title: "Cleanup Complete",
        description: totalDeleted > 0 
          ? `Removed ${totalDeleted} expired records`
          : "No expired records found",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/data-stats"] });
    },
    onError: (error) => {
      toast({
        title: "Cleanup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
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
    onSuccess: (data) => {
      const totalDeleted = Object.values(data.deleted).reduce((a, b) => a + b, 0);
      toast({
        title: "Reset Complete",
        description: `Removed ${totalDeleted} records. Fresh start ready.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/data-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbook-uploads"] });
    },
    onError: (error) => {
      if (error.message === "Reset cancelled") return;
      toast({
        title: "Reset Failed",
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
    { label: "Workbook Uploads", value: stats?.workbookUploadsCount ?? 0, icon: Database, color: "bg-slate-500" },
  ];

  return (
    <Card>
      <CardHeader>
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
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
            >
              <div className={`p-2 rounded-md ${item.color}`}>
                <item.icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Data Retention Info */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Data Retention Policy</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
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
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Reset Rostering Data
          </Button>
        </div>

        {/* Last Cleanup Result */}
        {cleanupMutation.data && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100">Last Cleanup Result</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(cleanupMutation.data.deleted).map(([key, value]) => (
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
