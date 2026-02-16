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
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sun,
  Sunset,
  Moon,
  ArrowUpCircle,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ShiftHandover = {
  id: string;
  authorId: string;
  authorName: string;
  shiftDate: string;
  shiftType: string;
  summary: string;
  keyEvents: string | null;
  medicationNotes: string | null;
  clientConcerns: string | null;
  staffingNotes: string | null;
  followUpRequired: boolean;
  followUpDetails: string | null;
  priority: string;
  acknowledgedBy: string[];
  createdAt: string;
};

const SHIFT_ICONS: Record<string, React.ReactNode> = {
  morning: <Sun size={14} className="text-amber-500" />,
  afternoon: <Sunset size={14} className="text-orange-500" />,
  night: <Moon size={14} className="text-indigo-500" />,
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function CreateHandoverDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    shiftDate: new Date().toLocaleDateString("en-GB"),
    shiftType: "morning",
    summary: "",
    keyEvents: "",
    medicationNotes: "",
    clientConcerns: "",
    staffingNotes: "",
    followUpRequired: false,
    followUpDetails: "",
    priority: "normal",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/shift-handovers", form);
    },
    onSuccess: () => {
      toast({ title: "Handover Created", description: "Shift handover note has been saved." });
      setOpen(false);
      setForm({
        shiftDate: new Date().toLocaleDateString("en-GB"),
        shiftType: "morning",
        summary: "",
        keyEvents: "",
        medicationNotes: "",
        clientConcerns: "",
        staffingNotes: "",
        followUpRequired: false,
        followUpDetails: "",
        priority: "normal",
      });
      onCreated();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create handover note.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus size={14} /> New Handover
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shift Handover Note</DialogTitle>
          <DialogDescription>
            Record key information from your shift for the incoming team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Shift Date</label>
              <Input
                value={form.shiftDate}
                onChange={(e) => setForm({ ...form, shiftDate: e.target.value })}
                placeholder="DD/MM/YYYY"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Shift Type</label>
              <Select value={form.shiftType} onValueChange={(v) => setForm({ ...form, shiftType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Summary *</label>
            <Textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Brief overview of the shift. What does the incoming team need to know?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Key Events</label>
              <Textarea
                value={form.keyEvents}
                onChange={(e) => setForm({ ...form, keyEvents: e.target.value })}
                placeholder="Any notable incidents or events..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Medication Notes</label>
              <Textarea
                value={form.medicationNotes}
                onChange={(e) => setForm({ ...form, medicationNotes: e.target.value })}
                placeholder="Medication-related observations..."
                rows={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Client Concerns</label>
              <Textarea
                value={form.clientConcerns}
                onChange={(e) => setForm({ ...form, clientConcerns: e.target.value })}
                placeholder="Any service user concerns raised..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Staffing Notes</label>
              <Textarea
                value={form.staffingNotes}
                onChange={(e) => setForm({ ...form, staffingNotes: e.target.value })}
                placeholder="Absences, cover arrangements..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.followUpRequired}
              onCheckedChange={(checked) => setForm({ ...form, followUpRequired: !!checked })}
              id="followUp"
            />
            <label htmlFor="followUp" className="text-sm font-medium cursor-pointer">
              Follow-up action required
            </label>
          </div>

          {form.followUpRequired && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Follow-Up Details</label>
              <Textarea
                value={form.followUpDetails}
                onChange={(e) => setForm({ ...form, followUpDetails: e.target.value })}
                placeholder="Describe what needs to be done..."
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.summary.trim() || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HandoverCard = memo(function HandoverCard({
  handover,
  userId,
  onAcknowledge,
}: {
  handover: ShiftHandover;
  userId: string;
  onAcknowledge: (id: string) => void;
}) {
  const isAcknowledged = handover.acknowledgedBy?.includes(userId);
  const ackCount = handover.acknowledgedBy?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      layout
    >
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {SHIFT_ICONS[handover.shiftType]}
              <span className="text-sm font-semibold capitalize">{handover.shiftType} Shift</span>
              <span className="text-xs text-muted-foreground">{handover.shiftDate}</span>
              <Badge variant="outline" className={PRIORITY_STYLES[handover.priority]}>
                {handover.priority}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {handover.followUpRequired && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 gap-1">
                  <AlertTriangle size={10} /> Follow-up
                </Badge>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 size={12} className={ackCount > 0 ? "text-green-500" : "text-muted-foreground/40"} />
                {ackCount} acknowledged
              </span>
            </div>
          </div>
          <CardDescription className="text-xs">
            by {handover.authorName} · {new Date(handover.createdAt).toLocaleString("en-GB")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{handover.summary}</p>

          {(handover.keyEvents || handover.medicationNotes || handover.clientConcerns || handover.staffingNotes) && (
            <div className="grid grid-cols-2 gap-2">
              {handover.keyEvents && (
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Key Events</p>
                  <p className="text-xs">{handover.keyEvents}</p>
                </div>
              )}
              {handover.medicationNotes && (
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Medication</p>
                  <p className="text-xs">{handover.medicationNotes}</p>
                </div>
              )}
              {handover.clientConcerns && (
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Client Concerns</p>
                  <p className="text-xs">{handover.clientConcerns}</p>
                </div>
              )}
              {handover.staffingNotes && (
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Staffing</p>
                  <p className="text-xs">{handover.staffingNotes}</p>
                </div>
              )}
            </div>
          )}

          {handover.followUpRequired && handover.followUpDetails && (
            <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/20 p-2.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-600 dark:text-amber-400 mb-1">Action Required</p>
              <p className="text-xs">{handover.followUpDetails}</p>
            </div>
          )}

          {!isAcknowledged && handover.authorId !== userId && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onAcknowledge(handover.id)}
            >
              <CheckCircle2 size={12} /> Acknowledge
            </Button>
          )}
          {isAcknowledged && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 size={12} /> Acknowledged by you
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

function ShiftHandovers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterShift, setFilterShift] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const { data: handovers = [], isLoading } = useQuery<ShiftHandover[]>({
    queryKey: ["/api/shift-handovers"],
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/shift-handovers/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-handovers"] });
    },
  });

  const filtered = useMemo(() => {
    return handovers.filter((h) => {
      if (filterShift !== "all" && h.shiftType !== filterShift) return false;
      if (filterPriority !== "all" && h.priority !== filterPriority) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          h.summary.toLowerCase().includes(q) ||
          h.authorName.toLowerCase().includes(q) ||
          h.shiftDate.includes(q)
        );
      }
      return true;
    });
  }, [handovers, filterShift, filterPriority, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString("en-GB");
    const todayHandovers = handovers.filter((h) => h.shiftDate === today);
    const followUps = handovers.filter((h) => h.followUpRequired);
    const unacknowledged = handovers.filter(
      (h) => h.authorId !== user?.id && !(h.acknowledgedBy || []).includes(user?.id || "")
    );
    return { total: handovers.length, today: todayHandovers.length, followUps: followUps.length, unacknowledged: unacknowledged.length };
  }, [handovers, user]);

  return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Total Handovers</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Today</p>
              <p className="text-2xl font-bold text-blue-600">{stats.today}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Follow-ups Required</p>
              <p className="text-2xl font-bold text-amber-600">{stats.followUps}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Unacknowledged</p>
              <p className="text-2xl font-bold text-red-500">{stats.unacknowledged}</p>
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
              placeholder="Search handovers..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shifts</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="afternoon">Afternoon</SelectItem>
                <SelectItem value="night">Night</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <CreateHandoverDialog onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/shift-handovers"] })} />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Clock size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No handover notes found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Create one to get started with shift-to-shift communication.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((h) => (
                <HandoverCard
                  key={h.id}
                  handover={h}
                  userId={user?.id || ""}
                  onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
  );
}

export default memo(ShiftHandovers);
