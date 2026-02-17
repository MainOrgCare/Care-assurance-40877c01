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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck,
  CheckCircle2,
  Clock,
  Search,
  Loader2,
  ShieldCheck,
  PenTool,
  Eye,
  Users,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type PolicyDocument = {
  id: string;
  title: string;
  category: string;
  content: string;
  version: string;
  effectiveDate: string | null;
  createdAt: string;
};

type PolicyAck = {
  id: string;
  policyId: string;
  userId: string;
  userName: string;
  acknowledgedAt: string;
  signatureName: string;
};

function AcknowledgeDialog({
  policy,
  onClose,
  onAcknowledged,
}: {
  policy: PolicyDocument;
  onClose: () => void;
  onAcknowledged: () => void;
}) {
  const { toast } = useToast();
  const [signatureName, setSignatureName] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/policy-acknowledgements", {
        policyId: policy.id,
        signatureName,
      });
    },
    onSuccess: () => {
      toast({ title: "Acknowledged", description: `You have acknowledged "${policy.title}".` });
      onAcknowledged();
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit acknowledgement.", variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck size={18} className="text-primary" />
            Acknowledge Policy
          </DialogTitle>
          <DialogDescription>
            Read and acknowledge: <strong>{policy.title}</strong> (v{policy.version})
          </DialogDescription>
        </DialogHeader>

        {/* Policy content preview */}
        <div className="rounded-md border border-border/50 bg-muted/30 p-4 max-h-[200px] overflow-y-auto text-xs leading-relaxed">
          {policy.content || "Policy content not available. Please contact your administrator."}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="confirm-read"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <label htmlFor="confirm-read" className="text-xs cursor-pointer">
              I confirm that I have read and understood this policy document and agree to comply with its requirements.
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Type your full name as electronic signature *
            </label>
            <div className="relative">
              <PenTool size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Full legal name..."
                className="pl-8 italic"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!confirmed || !signatureName.trim() || mutation.isPending}
            className="gap-1.5"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Submit Acknowledgement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewAcksDialog({
  policy,
  acks,
  onClose,
}: {
  policy: PolicyDocument;
  acks: PolicyAck[];
  onClose: () => void;
}) {
  const policyAcks = acks.filter((a) => a.policyId === policy.id);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[60vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Acknowledgements: {policy.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {policyAcks.length} staff member{policyAcks.length !== 1 ? "s" : ""} acknowledged
          </DialogDescription>
        </DialogHeader>
        {policyAcks.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No acknowledgements yet.</p>
        ) : (
          <div className="space-y-2">
            {policyAcks.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm font-medium">{a.userName}</p>
                  <p className="text-[10px] text-muted-foreground italic">Signed as: {a.signatureName}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.acknowledgedAt).toLocaleDateString("en-GB")}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PolicyAcknowledgement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [ackDialog, setAckDialog] = useState<PolicyDocument | null>(null);
  const [viewAcksDialog, setViewAcksDialog] = useState<PolicyDocument | null>(null);

  const { data: policies = [], isLoading: loadingPolicies } = useQuery<PolicyDocument[]>({
    queryKey: ["/api/policies"],
  });

  const { data: allAcks = [], isLoading: loadingAcks } = useQuery<PolicyAck[]>({
    queryKey: ["/api/policy-acknowledgements"],
  });

  const userAcks = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAcks) {
      if (a.userId === user?.id) set.add(a.policyId);
    }
    return set;
  }, [allAcks, user]);

  const filtered = useMemo(() => {
    if (!searchTerm) return policies;
    const q = searchTerm.toLowerCase();
    return policies.filter(
      (p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [policies, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const total = policies.length;
    const acknowledged = policies.filter((p) => userAcks.has(p.id)).length;
    const pending = total - acknowledged;
    const completionPct = total > 0 ? Math.round((acknowledged / total) * 100) : 0;
    return { total, acknowledged, pending, completionPct };
  }, [policies, userAcks]);

  const isLoading = loadingPolicies || loadingAcks;

  return (
    <>
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Your Compliance</p>
              <p className="text-2xl font-bold">{stats.completionPct}%</p>
              <Progress value={stats.completionPct} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Total Policies</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Acknowledged</p>
              <p className="text-2xl font-bold text-green-600">{stats.acknowledged}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search policies..."
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Policies Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No policies found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Policies will appear here once created by administrators.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Policy</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Version</TableHead>
                    <TableHead className="text-xs">Your Status</TableHead>
                    <TableHead className="text-xs">Team</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((policy) => {
                    const isAcked = userAcks.has(policy.id);
                    const policyAckCount = allAcks.filter((a) => a.policyId === policy.id).length;
                    return (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium text-sm">{policy.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{policy.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">v{policy.version}</TableCell>
                        <TableCell>
                          {isAcked ? (
                            <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px]">
                              <CheckCircle2 size={10} /> Acknowledged
                            </Badge>
                          ) : (
                            <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
                              <Clock size={10} /> Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setViewAcksDialog(policy)}
                          >
                            <Users size={12} /> {policyAckCount}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {!isAcked && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setAckDialog(policy)}
                            >
                              <PenTool size={10} /> Acknowledge
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      {ackDialog && (
        <AcknowledgeDialog
          policy={ackDialog}
          onClose={() => setAckDialog(null)}
          onAcknowledged={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/policy-acknowledgements"] });
          }}
        />
      )}
      {viewAcksDialog && (
        <ViewAcksDialog
          policy={viewAcksDialog}
          acks={allAcks}
          onClose={() => setViewAcksDialog(null)}
        />
      )}
    </>
  );
}

export default memo(PolicyAcknowledgement);
