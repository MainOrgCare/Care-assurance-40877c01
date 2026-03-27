import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Clock, Plus, Trash2, Edit2, Search, AlertCircle } from "lucide-react";

export interface RecommendedCallTime {
  id?: string;
  serviceUserKey: string;
  serviceUserName: string;
  callTypeLabel: string;
  recommendedStartMinutes: number;
  toleranceMinutes: number;
  priority: number;
  notes?: string;
}

interface CallTimeEditorProps {
  callTimes: RecommendedCallTime[];
  serviceUsers: { key: string; name: string }[];
  callTypes: string[];
  onSave: (callTime: Omit<RecommendedCallTime, "id">) => void;
  onDelete: (id: string) => void;
  isSaving?: boolean;
}

const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseTime = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const CallTimeEditor: React.FC<CallTimeEditorProps> = ({
  callTimes,
  serviceUsers,
  callTypes,
  onSave,
  onDelete,
  isSaving,
}) => {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCallTime, setEditingCallTime] = useState<RecommendedCallTime | null>(null);
  
  // Form state
  const [selectedServiceUser, setSelectedServiceUser] = useState<string>("");
  const [selectedCallType, setSelectedCallType] = useState<string>("");
  const [time, setTime] = useState<string>("08:00");
  const [tolerance, setTolerance] = useState<number>(30);
  const [priority, setPriority] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  const filteredCallTimes = useMemo(() => {
    if (!search.trim()) return callTimes;
    const term = search.toLowerCase();
    return callTimes.filter(
      (ct) =>
        ct.serviceUserName.toLowerCase().includes(term) ||
        ct.callTypeLabel.toLowerCase().includes(term)
    );
  }, [callTimes, search]);

  // Group call times by service user
  const groupedCallTimes = useMemo(() => {
    const groups = new Map<string, RecommendedCallTime[]>();
    for (const ct of filteredCallTimes) {
      const existing = groups.get(ct.serviceUserKey) || [];
      existing.push(ct);
      groups.set(ct.serviceUserKey, existing);
    }
    // Sort each group by recommended time
    for (const [, times] of groups) {
      times.sort((a, b) => a.recommendedStartMinutes - b.recommendedStartMinutes);
    }
    return groups;
  }, [filteredCallTimes]);

  const resetForm = () => {
    setSelectedServiceUser("");
    setSelectedCallType("");
    setTime("08:00");
    setTolerance(30);
    setPriority(1);
    setNotes("");
    setEditingCallTime(null);
  };

  const handleOpenDialog = (callTime?: RecommendedCallTime) => {
    if (callTime) {
      setEditingCallTime(callTime);
      setSelectedServiceUser(callTime.serviceUserKey);
      setSelectedCallType(callTime.callTypeLabel);
      setTime(formatTime(callTime.recommendedStartMinutes));
      setTolerance(callTime.toleranceMinutes);
      setPriority(callTime.priority);
      setNotes(callTime.notes || "");
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedServiceUser || !selectedCallType) return;
    
    const su = serviceUsers.find((s) => s.key === selectedServiceUser);
    if (!su) return;

    await onSave({
      serviceUserKey: selectedServiceUser,
      serviceUserName: su.name,
      callTypeLabel: selectedCallType,
      recommendedStartMinutes: parseTime(time),
      toleranceMinutes: tolerance,
      priority,
      notes: notes || undefined,
    });
    
    setDialogOpen(false);
    resetForm();
  };

  const callTypeColors: Record<string, string> = {
    morning: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-700/60",
    am: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-700/60",
    lunch: "bg-warning/10 text-warning border-warning/30",
    tea: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700/60",
    evening: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-700/60",
    pm: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-700/60",
    bed: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700/60",
    night: "bg-muted text-muted-foreground border-border",
  };

  const getCallTypeStyle = (label: string) => {
    const l = label.toLowerCase();
    for (const [key, style] of Object.entries(callTypeColors)) {
      if (l.includes(key)) return style;
    }
    return "bg-success/10 dark:bg-success-950/40 text-success dark:text-success-400 border-success/30 dark:border-success-700/60";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recommended Call Times
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Set preferred times for service user visits
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCallTime ? "Edit Call Time" : "Add Recommended Call Time"}
                </DialogTitle>
                <DialogDescription>
                  Set when a service user should ideally be visited for a specific call type.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="serviceUser">Service User</Label>
                  <Select value={selectedServiceUser} onValueChange={setSelectedServiceUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service user" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceUsers.map((su) => (
                        <SelectItem key={su.key} value={su.key}>
                          {su.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="callType">Call Type</Label>
                  <Select value={selectedCallType} onValueChange={setSelectedCallType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select call type" />
                    </SelectTrigger>
                    <SelectContent>
                      {callTypes.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="time">Recommended Time</Label>
                    <Input
                      id="time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tolerance">Tolerance (±mins)</Label>
                    <Select value={String(tolerance)} onValueChange={(v) => setTolerance(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">±15 min</SelectItem>
                        <SelectItem value="30">±30 min</SelectItem>
                        <SelectItem value="45">±45 min</SelectItem>
                        <SelectItem value="60">±1 hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Normal</SelectItem>
                      <SelectItem value="2">High</SelectItem>
                      <SelectItem value="3">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Needs medication at this time"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!selectedServiceUser || !selectedCallType || isSaving}>
                  {editingCallTime ? "Update" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search service users or call types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {groupedCallTimes.size === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recommended call times set</p>
            <p className="text-xs mt-1">Add times to help the optimizer schedule visits correctly</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-4">
              {Array.from(groupedCallTimes.entries()).map(([suKey, times]) => {
                const firstName = times[0]?.serviceUserName || suKey;
                return (
                  <div key={suKey} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{firstName}</p>
                    <div className="space-y-1">
                      {times.map((ct) => (
                        <div
                          key={ct.id || `${ct.serviceUserKey}-${ct.callTypeLabel}`}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${getCallTypeStyle(ct.callTypeLabel)}`}>
                              {ct.callTypeLabel}
                            </Badge>
                            <span className="font-mono text-xs">
                              {formatTime(ct.recommendedStartMinutes)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ±{ct.toleranceMinutes}m
                            </span>
                            {ct.priority > 1 && (
                              <Badge variant={ct.priority === 3 ? "destructive" : "secondary"} className="text-[9px]">
                                {ct.priority === 3 ? "Critical" : "High"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleOpenDialog(ct)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            {ct.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => onDelete(ct.id!)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default CallTimeEditor;
