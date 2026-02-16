import { useState, useMemo, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Loader2,
  ShieldCheck,
  BookOpen,
  Star,
  Pencil,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";

type TrainingRecord = {
  id: string;
  staffId: string;
  staffName: string;
  courseName: string;
  category: string;
  provider: string | null;
  completedDate: string | null;
  expiryDate: string | null;
  status: string;
  certificateRef: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type User = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
};

const STATUS_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  completed: { bg: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: <CheckCircle2 size={10} /> },
  pending: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", icon: <Clock size={10} /> },
  expired: { bg: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: <AlertTriangle size={10} /> },
  expiring_soon: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: <AlertTriangle size={10} /> },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  mandatory: <ShieldCheck size={14} className="text-red-500" />,
  recommended: <BookOpen size={14} className="text-blue-500" />,
  specialist: <Star size={14} className="text-purple-500" />,
};

const MANDATORY_COURSES = [
  "Safeguarding Adults",
  "Safeguarding Children",
  "Moving & Handling",
  "Infection Prevention & Control",
  "Fire Safety",
  "Health & Safety",
  "Basic Life Support",
  "Mental Capacity Act / DoLS",
  "Food Hygiene",
  "Medication Administration",
  "Equality & Diversity",
  "GDPR / Data Protection",
];

function AddTrainingDialog({ users, onCreated }: { users: User[]; onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const activeUsers = users.filter((u) => u.status === "active");
  const [form, setForm] = useState({
    staffId: "",
    staffName: "",
    courseName: "",
    category: "mandatory",
    provider: "",
    completedDate: "",
    expiryDate: "",
    status: "pending",
    certificateRef: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/staff-training", form);
    },
    onSuccess: () => {
      toast({ title: "Training Added", description: "Training record has been saved." });
      setOpen(false);
      setForm({ staffId: "", staffName: "", courseName: "", category: "mandatory", provider: "", completedDate: "", expiryDate: "", status: "pending", certificateRef: "", notes: "" });
      onCreated();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add training record.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus size={14} /> Add Training
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Training Record</DialogTitle>
          <DialogDescription>Record a new training course for a staff member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Staff Member *</label>
            <Select
              value={form.staffId}
              onValueChange={(v) => {
                const u = activeUsers.find((u) => u.id === v);
                setForm({
                  ...form,
                  staffId: v,
                  staffName: u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username : "",
                });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select staff member..." /></SelectTrigger>
              <SelectContent>
                {activeUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Course Name *</label>
            <Select value={form.courseName} onValueChange={(v) => setForm({ ...form, courseName: v })}>
              <SelectTrigger><SelectValue placeholder="Select or type..." /></SelectTrigger>
              <SelectContent>
                {MANDATORY_COURSES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                  <SelectItem value="specialist">Specialist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Completed Date</label>
              <Input
                value={form.completedDate}
                onChange={(e) => setForm({ ...form, completedDate: e.target.value })}
                placeholder="DD/MM/YYYY"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Expiry Date</label>
              <Input
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                placeholder="DD/MM/YYYY"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Provider</label>
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="Training provider name..."
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Certificate Reference</label>
            <Input
              value={form.certificateRef}
              onChange={(e) => setForm({ ...form, certificateRef: e.target.value })}
              placeholder="e.g., CERT-2026-001"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.staffId || !form.courseName || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffTraining() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: records = [], isLoading } = useQuery<TrainingRecord[]>({
    queryKey: ["/api/staff-training"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/staff-training/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Training record removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-training"] });
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/staff-training/${id}`, {
        status: "completed",
        completedDate: new Date().toLocaleDateString("en-GB"),
      });
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Training marked complete." });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-training"] });
    },
  });

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterCategory !== "all" && r.category !== filterCategory) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return r.staffName.toLowerCase().includes(q) || r.courseName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [records, filterCategory, filterStatus, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const completed = records.filter((r) => r.status === "completed").length;
    const expired = records.filter((r) => r.status === "expired").length;
    const pending = records.filter((r) => r.status === "pending").length;
    const expiringSoon = records.filter((r) => r.status === "expiring_soon").length;
    const complianceRate = records.length > 0 ? Math.round((completed / records.length) * 100) : 0;
    return { completed, expired, pending, expiringSoon, complianceRate, total: records.length };
  }, [records]);

  return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Compliance Rate</p>
              <p className="text-2xl font-bold">{stats.complianceRate}%</p>
              <div className="mt-1 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${stats.complianceRate >= 90 ? "bg-green-500" : stats.complianceRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${stats.complianceRate}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Expiring Soon</p>
              <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold text-red-500">{stats.expired}</p>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or course..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="mandatory">Mandatory</SelectItem>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="specialist">Specialist</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <AddTrainingDialog users={users} onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/staff-training"] })} />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <GraduationCap size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No training records found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add training records to track staff compliance.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Staff</TableHead>
                    <TableHead className="text-xs">Course</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Completed</TableHead>
                    <TableHead className="text-xs">Expires</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{r.staffName}</TableCell>
                      <TableCell className="text-sm">{r.courseName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs capitalize">
                          {CATEGORY_ICONS[r.category]} {r.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 text-[10px] ${STATUS_STYLES[r.status]?.bg || ""}`}>
                          {STATUS_STYLES[r.status]?.icon} {r.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.completedDate || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.expiryDate || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status !== "completed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => markCompleteMutation.mutate(r.id)}
                            >
                              <CheckCircle2 size={12} /> Complete
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => deleteMutation.mutate(r.id)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Mandatory Training Matrix */}
        {records.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mandatory Training Matrix</CardTitle>
              <CardDescription className="text-xs">
                Overview of mandatory training compliance across all staff.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrainingMatrix records={records} users={users} />
            </CardContent>
          </Card>
        )}
      </div>
  );
}

/** Visual matrix showing staff vs. mandatory courses */
const TrainingMatrix = memo(function TrainingMatrix({
  records,
  users,
}: {
  records: TrainingRecord[];
  users: User[];
}) {
  const activeUsers = users.filter((u) => u.status === "active");
  // Build a lookup: staffId -> courseName -> status
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const r of records) {
      if (!map.has(r.staffId)) map.set(r.staffId, new Map());
      map.get(r.staffId)!.set(r.courseName, r.status);
    }
    return map;
  }, [records]);

  if (activeUsers.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr>
            <th className="text-left py-1 pr-3 font-medium text-muted-foreground whitespace-nowrap">Staff</th>
            {MANDATORY_COURSES.map((c) => (
              <th key={c} className="px-1 py-1 font-medium text-muted-foreground">
                <span className="writing-mode-vertical block -rotate-45 origin-bottom-left whitespace-nowrap text-[9px]">{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeUsers.slice(0, 15).map((u) => {
            const staffCourses = lookup.get(u.id);
            return (
              <tr key={u.id} className="border-t border-border/30">
                <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                  {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                </td>
                {MANDATORY_COURSES.map((course) => {
                  const status = staffCourses?.get(course);
                  const bg = !status
                    ? "bg-slate-100 dark:bg-slate-800"
                    : status === "completed"
                    ? "bg-green-500"
                    : status === "expired"
                    ? "bg-red-500"
                    : status === "expiring_soon"
                    ? "bg-amber-500"
                    : "bg-yellow-400";
                  return (
                    <td key={course} className="px-1 py-1.5">
                      <div className={`w-4 h-4 rounded-sm mx-auto ${bg}`} title={`${course}: ${status || "not assigned"}`} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Completed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" /> Pending</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Expiring</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Expired</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800 inline-block" /> Not Assigned</span>
      </div>
    </div>
  );
});

export default memo(StaffTraining);
