import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookTemplate, Copy, Download, Trash2, Star, Clock, Users, CheckCircle2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  category: "optimized" | "baseline" | "seasonal" | "custom";
  weekDay: string;
  weekNumber: string;
  createdAt: string;
  rating?: number; // 1-5 stars
  usageCount: number;
  metadata: {
    totalWorkers: number;
    totalCalls: number;
    avgCallsPerWorker: number;
    optimizationScore?: number;
  };
  scheduleState: Record<string, unknown>; // The actual roster state to restore
}

interface ScheduleTemplateLibraryProps {
  currentWeekDay: string;
  currentWeekNumber: string;
  workbookId: number;
  currentScheduleState: Record<string, unknown>;
  onLoadTemplate: (state: Record<string, unknown>) => void;
}

export default function ScheduleTemplateLibrary({
  currentWeekDay,
  currentWeekNumber,
  workbookId,
  currentScheduleState,
  onLoadTemplate,
}: ScheduleTemplateLibraryProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<{
    name: string;
    description: string;
    category: "optimized" | "baseline" | "seasonal" | "custom";
  }>({
    name: "",
    description: "",
    category: "custom",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<ScheduleTemplate[]>({
    queryKey: ["scheduleTemplates", workbookId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/rostering/workbooks/${workbookId}/template-library`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // Create template
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/rostering/workbooks/${workbookId}/template-library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...newTemplate,
          weekDay: currentWeekDay,
          weekNumber: currentWeekNumber,
          scheduleState: currentScheduleState,
        }),
      });
      if (!response.ok) throw new Error("Failed to create template");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduleTemplates", workbookId] });
      setIsCreateDialogOpen(false);
      setNewTemplate({ name: "", description: "", category: "custom" });
      toast({
        title: "Template Saved",
        description: "Schedule template has been saved to your library.",
      });
    },
  });

  // Delete template
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `/api/admin/rostering/workbooks/${workbookId}/template-library/${templateId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduleTemplates", workbookId] });
      toast({
        title: "Template Deleted",
        description: "Schedule template has been removed from your library.",
      });
    },
  });

  // Load template
  const handleLoadTemplate = (template: ScheduleTemplate) => {
    onLoadTemplate(template.scheduleState);
    toast({
      title: "Template Loaded",
      description: `Loading schedule: ${template.name}`,
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "optimized":
        return "bg-success/10 dark:bg-green-950/40 text-green-800 dark:text-green-400 border-green-300 dark:border-green-700/60";
      case "baseline":
        return "bg-primary/10 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border-blue-300 dark:border-blue-700/60";
      case "seasonal":
        return "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-400 border-purple-300 dark:border-purple-700/60";
      case "custom":
        return "bg-muted text-muted-foreground border-border";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const filteredTemplates = templates.filter(
    (t: ScheduleTemplate) => t.weekDay === currentWeekDay && t.weekNumber === currentWeekNumber
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookTemplate className="h-5 w-5 text-indigo-600" />
                Schedule Template Library
              </CardTitle>
              <CardDescription>
                Save and load optimized schedule patterns for {currentWeekNumber}, {currentWeekDay}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Download className="h-4 w-4" />
                  Save Current as Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Schedule Template</DialogTitle>
                  <DialogDescription>
                    Save the current schedule as a reusable template for future weeks
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., 'Optimal Monday Week 1'"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe this schedule pattern..."
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={newTemplate.category}
                      onValueChange={(value: "optimized" | "baseline" | "seasonal" | "custom") => setNewTemplate({ ...newTemplate, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="optimized">Optimized</SelectItem>
                        <SelectItem value="baseline">Baseline</SelectItem>
                        <SelectItem value="seasonal">Seasonal</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!newTemplate.name || createMutation.isPending}
                  >
                    {createMutation.isPending ? "Saving..." : "Save Template"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
          ) : filteredTemplates.length === 0 ? (
            <Alert>
              <AlertDescription>
                No templates saved for {currentWeekNumber}, {currentWeekDay}. Save your current schedule to
                create your first template!
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template: ScheduleTemplate) => (
                <Card key={template.id} className="hover:shadow-[var(--shadow-medium)] transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <div className="flex gap-1">
                          <Badge className={getCategoryColor(template.category)}>{template.category}</Badge>
                          {template.rating && (
                            <Badge variant="outline" className="gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {template.rating}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{template.metadata.totalWorkers} workers</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{template.metadata.totalCalls} calls</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                        <span>{template.metadata.avgCallsPerWorker.toFixed(1)} avg/worker</span>
                      </div>
                      {template.metadata.optimizationScore && (
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-muted-foreground" />
                          <span>Score: {template.metadata.optimizationScore}/100</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => handleLoadTemplate(template)}
                      >
                        <Copy className="h-3 w-3" />
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(template.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Created: {new Date(template.createdAt).toLocaleDateString()}</div>
                      <div>Used {template.usageCount} times</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
