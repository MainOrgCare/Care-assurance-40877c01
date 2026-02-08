import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Copy, FileText, Check, X, AlertTriangle, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, UserPlus, Users, Sparkles, RefreshCw, Pencil, Undo2, Save, Download, Brain, Activity, Clock, Pill } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import UploadDisclaimer from "@/components/UploadDisclaimer";
import TableCopyButton from "@/components/TableCopyButton";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface CareWorker {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface CarerMapping {
  initials: string;
  fullName: string;
  isNew: boolean;
  newFirstName?: string;
  newLastName?: string;
}

interface DiscrepancyAction {
  performanceNote: boolean;
  meeting: "none" | "phone" | "in_person";
  referToManager: boolean;
  // New action flags
  notesRecorded?: boolean;      // Recorded in care workers notes
  discussedWithStaff?: boolean; // Discussed with care worker
  escalatedToManager?: boolean; // Escalated to manager
}

interface Discrepancy {
  careWorkerName: string;
  date: string;
  medication: string;
  medicationId?: number;
  issue: string;
  actions: DiscrepancyAction;
}

interface Warning {
  type: string;
  severity?: "critical" | "high" | "medium" | "low";
  medication: string;
  medicationId?: number;
  description: string;
  frequency?: string;
  recommendedAction: string;
}

interface UserVerificationItem {
  careWorkerName: string;
  date: string;
  medication: string;
  medicationId?: number;
  code: string;
  note: string;
  timeSlot?: string;
}

interface PRNMedication {
  name: string;
  protocol: string;
}

interface PRNProtocolCheck {
  medication: string;
  isCompleted: boolean;
  isGoodStandard: boolean;
}

interface GeneratedPRNProtocol {
  medicationName: string;
  dose: string;
  route: string;
  frequency: string;
  maxDoseIn24Hours: string;
  minimumTimeBetweenDoses: string;
  specialInstructions: string;
  reasonsForAdministration: string;
  predictableSideEffects: string;
  additionalComments: string;
}

interface GroupedRefusal {
  careWorkerName: string;
  medication: string;
  medicationId?: number;
  code?: string;
  dates: { date: string; timeSlot: string; code?: string }[];
  count: number;
}

interface RefusalReviewState {
  [key: string]: boolean;
}

const MEDICATION_DISPLAY_STOP_WORDS = new Set([
  "tablet",
  "tablets",
  "tab",
  "tabs",
  "capsule",
  "capsules",
  "cap",
  "caps",
  "patch",
  "patches",
  "cream",
  "ointment",
  "gel",
  "lotion",
  "spray",
  "drops",
  "drop",
  "solution",
  "syrup",
  "suspension",
  "inhaler",
  "injection",
  "ampoule",
  "ampoules",
  "nebule",
  "nebules",
  "puff",
  "puffs",
  "sachet",
  "sachets",
  "powder",
  "granules",
  "suppository",
  "suppositories",
  "take",
  "apply",
  "administer",
  "give",
  "insert",
  "inhale",
  "use",
  "instill",
  "every",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "when",
  "required",
  "needed",
  "prn",
]);

const getMedicationDisplayName = (medication: string): string => {
  const cleaned = String(medication || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const tokens = cleaned.split(" ").filter(Boolean);
  const nameTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    const prevLower = i > 0 ? tokens[i - 1].toLowerCase() : "";

    const isLetterDigitToken = /^[a-z]+[0-9]+[a-z0-9]*$/i.test(token);
    const isDigitsOnlyToken = /^\d+$/.test(token);
    const startsWithDigit = /^\d/.test(token);

    if (isDigitsOnlyToken && (prevLower === "omega" || prevLower === "vitamin")) {
      nameTokens.push(token);
      continue;
    }

    if (isLetterDigitToken) {
      nameTokens.push(token);
      continue;
    }

    if (startsWithDigit || MEDICATION_DISPLAY_STOP_WORDS.has(lower)) break;
    nameTokens.push(token);
  }

  return nameTokens.join(" ").trim() || cleaned;
};

interface CorrectedEntry {
  originalKey: string;
  careWorkerName: string;
  date: string;
  timeSlot: string;
  medication: string;
  code: string;
  issue: string;
}

interface EditingEntry {
  key: string;
  careWorkerName: string;
  date: string;
  timeSlot: string;
  medication: string;
  code: string;
  issue: string;
}

interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "high" | "moderate" | "low";
  description: string;
}

interface EmarPreflightResult {
  fileName: string;
  fileSizeMb: number;
  pageCount: number;
  medicationCount: number;
  dateCount: number;
  timeSlotCount: number;
  cellCount: number;
  warnings: string[];
}

interface AiStatusResponse {
  available?: boolean;
  aiEnabled?: boolean;
  message?: string;
  provider?: string;
  providerConfigured?: boolean;
}

interface EmarRecord {
  id: string;
  file: File;
  documentContent: string;
  preflightResult: EmarPreflightResult | null;
  preflightError: string | null;
  analyzed: boolean;
  result: EmarAnalysisResult | null;
  state: EmarRecordState;
}

interface EmarRecordState {
  verificationChecks: { [key: number]: boolean };
  prnProtocolChecks: PRNProtocolCheck[];
  medicationLevelOverride: string | null;
  pendingLevelOverride: string | null;
  discrepanciesUpdated: boolean;
  verificationSubmitted: boolean;
  warningsOpen: boolean;
  prnProtocolsSubmitted: boolean;
  addedDiscrepancies: Discrepancy[];
  detectedInitials: string[];
  carerMappings: CarerMapping[];
  mappingsConfirmed: boolean;
  refusalReviews: RefusalReviewState;
  expandedRefusals: Set<string>;
  selectedForEscalation: Set<string>;
  refusalDecisions: { [key: string]: 'acceptable' | 'escalate' | null };
  refusalReviewSubmitted: boolean;
  reasonsNotAdministeredOpen: string[];
  generatingProtocol: string | null;
  generatedProtocol: GeneratedPRNProtocol | null;
  protocolDialogOpen: boolean;
  editMode: boolean;
  corrections: Map<string, CorrectedEntry>;
  editingEntry: EditingEntry | null;
  editDialogOpen: boolean;
  correctionsApplied: boolean;
  fileReady: boolean;
}

const MAX_EMAR_UPLOAD_MB = 40;
const MAX_EMAR_UPLOAD_BYTES = MAX_EMAR_UPLOAD_MB * 1024 * 1024;
const LARGE_FILE_WARNING_MB = 25;
const MANUAL_AUDIT_CHECKLIST = [
  "1. Run Quick Check to validate pages, dates, and medication cells.",
  "2. Confirm care worker initials and map any unknown initials.",
  "3. Review all non-administration/refusal codes and supporting notes.",
  "4. Verify PRN protocol completion for each PRN medication.",
  "5. Record discrepancies and escalate repeated refusals to a manager.",
  "6. Save findings in your audit trail once AI services are restored.",
].join("\n");

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

interface OfficeClosedEntry {
  medication: string;
  medicationId?: number;
  date: string;
  timeSlot: string;
  code: string;
  closedByStaff: string;
  closedTime: string;
}

interface SupportCodeEntry {
  careWorkerName: string;
  medication: string;
  medicationId?: number;
  date: string;
  timeSlot: string;
  code: string;
}

interface EmarAnalysisResult {
  serviceUserName: string;
  serviceUserInitials?: string;
  serviceUserType: "prompt" | "administer" | "assist";
  medicationLevelEvidence?: string;
  codeConflictDetected?: boolean;
  codeConflictDetails?: string;
  extractionMethod?: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  warnings?: Warning[];
  hasDiscrepancies: boolean;
  discrepancies: Discrepancy[];
  drugInteractions?: DrugInteraction[];
  groupedRefusals?: GroupedRefusal[];
  groupedMainRefusals?: GroupedRefusal[];
  groupedPrnRefusals?: GroupedRefusal[];
  totalRefusalCount?: number;
  totalMainRefusalCount?: number;
  totalPrnRefusalCount?: number;
  totalOtherDiscrepancyCount?: number;
  userVerificationItems?: UserVerificationItem[];
  prnMedications: {
    hasPRN: boolean;
    medications: PRNMedication[] | string[];
    protocolsCompleted?: boolean;
    requiredProtocols?: { medication: string; protocol: string }[];
  };
  officeClosedEntries?: OfficeClosedEntry[];
  supportCodeEntries?: SupportCodeEntry[];
  themesAndTrends: string;
  gapsInKnowledge: string;
}

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatServiceUserInitials(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "N.N.";
  const upper = trimmed.toUpperCase();

  if (/^[A-Z]\.[A-Z]\.?$/.test(upper)) {
    return upper.endsWith(".") ? upper : `${upper}.`;
  }
  if (/^[A-Z]{2,3}$/.test(upper)) {
    return upper.split("").map(ch => `${ch}.`).join("");
  }
  if (/^[A-Z]\.?$/.test(upper)) {
    return `${upper[0]}.N.`;
  }

  const parts = trimmed.split(/[\s.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0].toUpperCase()}.${parts[parts.length - 1][0].toUpperCase()}.`;
  }
  return "N.N.";
}

const CopyButton = memo(function CopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied", description: label ? `${label} copied to clipboard` : "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} data-testid={`button-copy-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}>
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </Button>
  );
});

const CopyableBox = memo(function CopyableBox({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-muted rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <CopyButton text={value} label={label} />
      </div>
      <p className="text-foreground font-medium">{value}</p>
    </div>
  );
});

const WARNING_SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const WARNING_SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const WARNING_SEVERITY_STYLES: Record<string, { card: string; badge: string; accent: string }> = {
  critical: {
    card: "bg-destructive/10 border-destructive/30",
    badge: "bg-destructive/15 text-destructive",
    accent: "text-destructive",
  },
  high: {
    card: "bg-destructive/5 border-destructive/20",
    badge: "bg-destructive/10 text-destructive",
    accent: "text-destructive",
  },
  medium: {
    card: "bg-amber-500/10 border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    accent: "text-amber-600 dark:text-amber-300",
  },
  low: {
    card: "bg-primary/5 border-primary/20",
    badge: "bg-primary/10 text-primary",
    accent: "text-primary",
  },
};

export default function EMARAudit() {
  const { user, logAction } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const { resetTimer } = useTemporaryData();
  const [file, setFile] = useState<File | null>(null);
  const [documentContent, setDocumentContent] = useState("");
  const [emarRecords, setEmarRecords] = useState<EmarRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<EmarPreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmarAnalysisResult | null>(null);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [fileReady, setFileReady] = useState(false);
  const prevContentRef = useRef("");
  
  const [verificationChecks, setVerificationChecks] = useState<{ [key: number]: boolean }>({});
  const [prnProtocolChecks, setPrnProtocolChecks] = useState<PRNProtocolCheck[]>([]);
  const [medicationLevelOverride, setMedicationLevelOverride] = useState<string | null>(null);
  const [pendingLevelOverride, setPendingLevelOverride] = useState<string | null>(null);
  const [discrepanciesUpdated, setDiscrepanciesUpdated] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [prnProtocolsSubmitted, setPrnProtocolsSubmitted] = useState(false);
  const [addedDiscrepancies, setAddedDiscrepancies] = useState<Discrepancy[]>([]);
  
  const [existingCarers, setExistingCarers] = useState<CareWorker[]>([]);
  const [detectedInitials, setDetectedInitials] = useState<string[]>([]);
  const [carerMappings, setCarerMappings] = useState<CarerMapping[]>([]);
  const [mappingsConfirmed, setMappingsConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  
  // Throttle progress updates to reduce re-renders during SSE streaming
  const lastProgressUpdateRef = useRef<number>(0);
  const throttledSetProgress = useCallback((percent: number, status: string) => {
    const now = Date.now();
    if (percent === 0 || percent >= 100 || now - lastProgressUpdateRef.current >= 100) {
      lastProgressUpdateRef.current = now;
      setProgress(percent);
      setProgressStatus(status);
    }
  }, []);

  const refreshAiStatus = useCallback(async () => {
    setAiStatusLoading(true);
    try {
      const response = await fetch("/api/ai/status", {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fallbackMessage =
          response.status === 401
            ? "Your session has expired. Please sign in again."
            : response.status === 503
              ? "AI analysis is currently unavailable in this environment."
              : "Unable to verify AI availability right now.";
        setAiAvailable(false);
        setAiStatusMessage(errorData?.message || fallbackMessage);
        return;
      }

      const statusData = (await response.json()) as AiStatusResponse;
      setAiAvailable(Boolean(statusData.available));
      setAiStatusMessage(statusData.message || null);
    } catch {
      setAiAvailable(false);
      setAiStatusMessage("Unable to verify AI availability right now. Please try again.");
    } finally {
      setAiStatusLoading(false);
    }
  }, []);
  
  const [refusalReviews, setRefusalReviews] = useState<RefusalReviewState>({});
  const [expandedRefusals, setExpandedRefusals] = useState<Set<string>>(new Set());
  const [selectedForEscalation, setSelectedForEscalation] = useState<Set<string>>(new Set());
  const [refusalDecisions, setRefusalDecisions] = useState<{ [key: string]: 'acceptable' | 'escalate' | null }>({});
  const [refusalReviewSubmitted, setRefusalReviewSubmitted] = useState(false);
  const [reasonsNotAdministeredOpen, setReasonsNotAdministeredOpen] = useState<string[]>([]);
  const [generatingProtocol, setGeneratingProtocol] = useState<string | null>(null);
  const [generatedProtocol, setGeneratedProtocol] = useState<GeneratedPRNProtocol | null>(null);
  const [protocolDialogOpen, setProtocolDialogOpen] = useState(false);
  
  const [editMode, setEditMode] = useState(false);
  const [corrections, setCorrections] = useState<Map<string, CorrectedEntry>>(new Map());
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [correctionsApplied, setCorrectionsApplied] = useState(false);

  useEffect(() => {
    if (documentContent && !prevContentRef.current) {
      resetTimer();
    }
    prevContentRef.current = documentContent;
  }, [documentContent, resetTimer]);

  useEffect(() => {
    refreshAiStatus();
  }, [refreshAiStatus]);

  useEffect(() => {
    if (result?.prnMedications?.hasPRN && prnProtocolChecks.length === 0) {
      const meds = result.prnMedications.medications;
      const initialChecks: PRNProtocolCheck[] = meds.map((med) => ({
        medication: typeof med === 'string' ? med : med.name,
        isCompleted: false,
        isGoodStandard: false,
      }));
      setPrnProtocolChecks(initialChecks);
    }
  }, [result, prnProtocolChecks.length]);

  const sortedWarnings = useMemo(() => {
    const warnings = result?.warnings ? [...result.warnings] : [];
    return warnings.sort((a, b) => {
      const aRank = WARNING_SEVERITY_ORDER[a.severity ?? "low"];
      const bRank = WARNING_SEVERITY_ORDER[b.severity ?? "low"];
      if (aRank !== bRank) return aRank - bRank;
      return (a.medication || "").localeCompare(b.medication || "");
    });
  }, [result?.warnings]);
  const analyzedRecords = useMemo(() => emarRecords.filter(record => record.analyzed), [emarRecords]);

  const highestWarningSeverity = sortedWarnings.length > 0
    ? sortedWarnings[0].severity ?? "low"
    : null;
  const warningCardClass = highestWarningSeverity
    ? WARNING_SEVERITY_STYLES[highestWarningSeverity].card
    : "bg-destructive/5 border-destructive/20";
  const warningHeaderTextClass = highestWarningSeverity
    ? WARNING_SEVERITY_STYLES[highestWarningSeverity].accent
    : "text-destructive";

  useEffect(() => {
    if (!result?.warnings?.length) {
      setWarningsOpen(false);
      return;
    }
    const shouldOpen = result.warnings.some(
      warning => (warning.severity ?? "low") === "critical" || (warning.severity ?? "low") === "high"
    );
    setWarningsOpen(shouldOpen);
  }, [result?.warnings]);


  useEffect(() => {
    const fetchCarers = async () => {
      try {
        const res = await fetch("/api/care-workers", { credentials: "include" });
        if (res.ok) {
          const carers = await res.json();
          setExistingCarers(carers);
        }
      } catch (error) {
        console.error("Failed to fetch carers:", error);
      }
    };
    fetchCarers();
  }, []);

  const isInitialsOnly = (name: string): boolean => {
    if (!name) return false;
    const normalized = name.trim();
    const initialsPatterns = [
      /^[A-Z]\.[A-Z]\.?$/i,
      /^[A-Z][A-Z]$/i,
      /^[A-Z]\. ?[A-Z]\.?$/i,
      /^[A-Z]\.[A-Z]\.[A-Z]?\.?$/i,
    ];
    return initialsPatterns.some(pattern => pattern.test(normalized));
  };

  const extractInitials = (name: string): string => {
    return name.replace(/\./g, '').toUpperCase();
  };

  const getCarerInitials = (carerName: string): string => {
    const parts = carerName.split('.');
    if (parts.length === 2 && parts[0].length === 1) {
      return (parts[0] + parts[1].charAt(0)).toUpperCase();
    }
    const nameParts = carerName.split(/[\s.]+/).filter(p => p.length > 0);
    return nameParts.map(p => p.charAt(0).toUpperCase()).join('');
  };

  const getMatchingCarers = (initials: string): CareWorker[] => {
    const normalizedInitials = extractInitials(initials);
    return existingCarers.filter(carer => {
      const carerInitials = getCarerInitials(carer.name);
      return carerInitials === normalizedInitials;
    });
  };

  useEffect(() => {
    if (result) {
      const allNames = new Set<string>();
      result.discrepancies?.forEach(d => allNames.add(d.careWorkerName));
      result.userVerificationItems?.forEach(item => allNames.add(item.careWorkerName));
      
      const initialsFound = Array.from(allNames).filter(name => 
        isInitialsOnly(name) && name !== "Code Conflict"
      );
      
      setDetectedInitials(initialsFound);
      
      if (initialsFound.length > 0) {
        const initialMappings: CarerMapping[] = initialsFound.map(initials => ({
          initials,
          fullName: "",
          isNew: false,
        }));
        setCarerMappings(initialMappings);
        setMappingsConfirmed(false);
      } else {
        setMappingsConfirmed(true);
      }
    }
  }, [result]);

  const handleCarerMappingChange = (initials: string, selectedValue: string) => {
    setCarerMappings(prev => prev.map(m => {
      if (m.initials === initials) {
        if (selectedValue === "create_new") {
          return { ...m, fullName: "", isNew: true, newFirstName: "", newLastName: "" };
        } else {
          return { ...m, fullName: selectedValue, isNew: false, newFirstName: undefined, newLastName: undefined };
        }
      }
      return m;
    }));
  };

  const handleNewCarerNameChange = (initials: string, firstName: string, lastName: string) => {
    setCarerMappings(prev => prev.map(m => {
      if (m.initials === initials && m.isNew) {
        const formattedName = firstName && lastName 
          ? `${firstName.charAt(0).toUpperCase()}.${lastName.charAt(0).toUpperCase()}${lastName.slice(1).toLowerCase()}`
          : "";
        return { ...m, newFirstName: firstName, newLastName: lastName, fullName: formattedName };
      }
      return m;
    }));
  };

  const confirmMappings = async () => {
    const allMapped = carerMappings.every(m => m.fullName && m.fullName.trim() !== "");
    if (!allMapped) {
      toast({
        title: "Incomplete Mappings",
        description: "Please select or create a name for all initials.",
        variant: "destructive",
      });
      return;
    }

    for (const mapping of carerMappings) {
      if (mapping.isNew && mapping.newFirstName && mapping.newLastName) {
        try {
          await fetch("/api/care-workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: mapping.fullName,
              role: "Carer",
              status: "active",
            }),
          });
        } catch (error) {
          console.error("Failed to create carer:", error);
        }
      }
    }

    setMappingsConfirmed(true);
    toast({
      title: "Carers Identified",
      description: "Carer names have been matched successfully.",
    });
  };

  const getMappedCarerName = (originalName: string): string => {
    if (!mappingsConfirmed) return originalName;
    const mapping = carerMappings.find(m => m.initials === originalName);
    return mapping?.fullName || originalName;
  };

  const resetAuditState = () => {
    setVerificationChecks({});
    setPrnProtocolChecks([]);
    setMedicationLevelOverride(null);
    setPendingLevelOverride(null);
    setDiscrepanciesUpdated(false);
    setVerificationSubmitted(false);
    setWarningsOpen(false);
    setPrnProtocolsSubmitted(false);
    setAddedDiscrepancies([]);
    setDetectedInitials([]);
    setCarerMappings([]);
    setMappingsConfirmed(false);
    setRefusalReviews({});
    setExpandedRefusals(new Set());
    setSelectedForEscalation(new Set());
    setRefusalDecisions({});
    setRefusalReviewSubmitted(false);
    setReasonsNotAdministeredOpen([]);
    if (file) {
      logAction("EMAR Audit Started", file.name, "Authorized", undefined, { event: "emar_audit_started", fileName: file.name });
    }
    setGeneratingProtocol(null);
    setGeneratedProtocol(null);
    setProtocolDialogOpen(false);
    setEditMode(false);
    setCorrections(new Map());
    setEditingEntry(null);
    setEditDialogOpen(false);
    setCorrectionsApplied(false);
    setFileReady(false);
  };

  const buildRecordState = (): EmarRecordState => ({
    verificationChecks,
    prnProtocolChecks,
    medicationLevelOverride,
    pendingLevelOverride,
    discrepanciesUpdated,
    verificationSubmitted,
    warningsOpen,
    prnProtocolsSubmitted,
    addedDiscrepancies,
    detectedInitials,
    carerMappings,
    mappingsConfirmed,
    refusalReviews,
    expandedRefusals,
    selectedForEscalation,
    refusalDecisions,
    refusalReviewSubmitted,
    reasonsNotAdministeredOpen,
    generatingProtocol,
    generatedProtocol,
    protocolDialogOpen,
    editMode,
    corrections,
    editingEntry,
    editDialogOpen,
    correctionsApplied,
    fileReady,
  });

  const applyRecordState = (state: EmarRecordState) => {
    setVerificationChecks(state.verificationChecks);
    setPrnProtocolChecks(state.prnProtocolChecks);
    setMedicationLevelOverride(state.medicationLevelOverride);
    setPendingLevelOverride(state.pendingLevelOverride);
    setDiscrepanciesUpdated(state.discrepanciesUpdated);
    setVerificationSubmitted(state.verificationSubmitted);
    setWarningsOpen(state.warningsOpen);
    setPrnProtocolsSubmitted(state.prnProtocolsSubmitted);
    setAddedDiscrepancies(state.addedDiscrepancies);
    setDetectedInitials(state.detectedInitials);
    setCarerMappings(state.carerMappings);
    setMappingsConfirmed(state.mappingsConfirmed);
    setRefusalReviews(state.refusalReviews);
    setExpandedRefusals(state.expandedRefusals);
    setSelectedForEscalation(state.selectedForEscalation);
    setRefusalDecisions(state.refusalDecisions);
    setRefusalReviewSubmitted(state.refusalReviewSubmitted);
    setReasonsNotAdministeredOpen(state.reasonsNotAdministeredOpen);
    setGeneratingProtocol(state.generatingProtocol);
    setGeneratedProtocol(state.generatedProtocol);
    setProtocolDialogOpen(state.protocolDialogOpen);
    setEditMode(state.editMode);
    setCorrections(state.corrections);
    setEditingEntry(state.editingEntry);
    setEditDialogOpen(state.editDialogOpen);
    setCorrectionsApplied(state.correctionsApplied);
    setFileReady(state.fileReady);
  };

  const buildRecordId = (selectedFile: File) =>
    `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const selectRecord = (record: EmarRecord) => {
    setActiveRecordId(record.id);
    setFile(record.file);
    setDocumentContent(record.documentContent);
    setPreflightResult(record.preflightResult);
    setPreflightError(record.preflightError);
    setAnalyzed(record.analyzed);
    setResult(record.result);
    applyRecordState(record.state);
  };

  const updateActiveRecord = (updater: (record: EmarRecord) => EmarRecord) => {
    setEmarRecords(prev =>
      prev.map(record => (record.id === activeRecordId ? updater(record) : record))
    );
  };

  const persistActiveState = () => {
    if (!activeRecordId) return;
    updateActiveRecord(record => ({ ...record, state: buildRecordState() }));
  };

  const loadRecordById = (recordId: string) => {
    persistActiveState();
    const record = emarRecords.find(item => item.id === recordId);
    if (record) {
      selectRecord(record);
    }
  };

  const removeActiveRecord = () => {
    persistActiveState();
    setEmarRecords(prev => {
      const next = prev.filter(record => record.id !== activeRecordId);
      const nextActive = next[0] || null;
      setActiveRecordId(nextActive?.id ?? null);
      if (nextActive) {
        setFile(nextActive.file);
        setDocumentContent(nextActive.documentContent);
        setPreflightResult(nextActive.preflightResult);
        setPreflightError(nextActive.preflightError);
        setAnalyzed(nextActive.analyzed);
        setResult(nextActive.result);
      } else {
        setFile(null);
        setDocumentContent("");
        setPreflightResult(null);
        setPreflightError(null);
        setAnalyzed(false);
        setResult(null);
      }
      resetAuditState();
      return next;
    });
  };

  const handleSelectedFile = async (selectedFile: File) => {
    setPreflightResult(null);
    setPreflightError(null);

    if (selectedFile.size > MAX_EMAR_UPLOAD_BYTES) {
      toast({
        title: "File Too Large",
        description: `Maximum file size is ${MAX_EMAR_UPLOAD_MB} MB. Selected file is ${formatFileSize(selectedFile.size)}.`,
        variant: "destructive",
      });
      setFile(null);
      return;
    }

    if (selectedFile.size >= LARGE_FILE_WARNING_MB * 1024 * 1024) {
      toast({
        title: "Large File Detected",
        description: "Analysis may take longer for large PDFs. We’ll keep you updated with progress.",
      });
    }

    const recordId = buildRecordId(selectedFile);
    const newRecord: EmarRecord = {
      id: recordId,
      file: selectedFile,
      documentContent: "",
      preflightResult: null,
      preflightError: null,
      analyzed: false,
      result: null,
      state: {
        verificationChecks: {},
        prnProtocolChecks: [],
        medicationLevelOverride: null,
        pendingLevelOverride: null,
        discrepanciesUpdated: false,
        verificationSubmitted: false,
        warningsOpen: false,
        prnProtocolsSubmitted: false,
        addedDiscrepancies: [],
        detectedInitials: [],
        carerMappings: [],
        mappingsConfirmed: false,
        refusalReviews: {},
        expandedRefusals: new Set(),
        selectedForEscalation: new Set(),
        refusalDecisions: {},
        refusalReviewSubmitted: false,
        reasonsNotAdministeredOpen: [],
        generatingProtocol: null,
        generatedProtocol: null,
        protocolDialogOpen: false,
        editMode: false,
        corrections: new Map(),
        editingEntry: null,
        editDialogOpen: false,
        correctionsApplied: false,
        fileReady: false,
      },
    };

    setEmarRecords(prev => [...prev, newRecord]);
    setActiveRecordId(recordId);
    setFile(selectedFile);
    setAnalyzed(false);
    setResult(null);
    setFileReady(false);
    resetAuditState();

    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      // For PDFs, just store the file - we'll send it directly for image-based analysis
      const content = "PDF file ready for image analysis";
      setDocumentContent(content);
      setEmarRecords(prev =>
        prev.map(record =>
          record.id === recordId ? { ...record, documentContent: content } : record
        )
      );
      setTimeout(() => {
        setFileReady(true);
        setEmarRecords(prev =>
          prev.map(record =>
            record.id === recordId ? { ...record, state: { ...record.state, fileReady: true } } : record
          )
        );
      }, 500);
      resetTimer();
      toast({ title: "PDF Selected", description: "Click 'Analyze EMAR' to process with image recognition." });
    } else if (selectedFile.name.toLowerCase().endsWith(".docx")) {
      // For Word docs, still extract text first
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Failed to parse document");
        }

        const data = await res.json();
        setDocumentContent(data.text);
        setEmarRecords(prev =>
          prev.map(record =>
            record.id === recordId ? { ...record, documentContent: data.text } : record
          )
        );
        setFileReady(true);
        setEmarRecords(prev =>
          prev.map(record =>
            record.id === recordId ? { ...record, state: { ...record.state, fileReady: true } } : record
          )
        );
        resetTimer();
        toast({ title: "Document Loaded", description: "Content extracted successfully." });
      } catch (error: any) {
        toast({
          title: "Document Error",
          description: error.message || "Failed to read document",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setDocumentContent(content);
        setEmarRecords(prev =>
          prev.map(record =>
            record.id === recordId ? { ...record, documentContent: content } : record
          )
        );
        setFileReady(true);
        setEmarRecords(prev =>
          prev.map(record =>
            record.id === recordId ? { ...record, state: { ...record.state, fileReady: true } } : record
          )
        );
        resetTimer();
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleSelectedFiles = async (files: File[]) => {
    for (const selectedFile of files) {
      await handleSelectedFile(selectedFile);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleSelectedFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      await handleSelectedFiles(Array.from(droppedFiles));
    }
  };

  const runPreflightCheck = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please choose a PDF file first.",
        variant: "destructive",
      });
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast({
        title: "PDF Required",
        description: "Preflight checks are only available for PDF EMAR files.",
        variant: "destructive",
      });
      return;
    }

    setPreflightLoading(true);
    setPreflightError(null);
    setPreflightResult(null);
    updateActiveRecord(record => ({ ...record, preflightError: null, preflightResult: null }));
    logAction("EMAR Preflight Started", file.name, "Authorized", undefined, { event: "emar_preflight_start" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/analyze-emar/preflight", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Preflight check failed");
      }

      const data = await res.json();
      setPreflightResult(data);
      updateActiveRecord(record => ({ ...record, preflightResult: data, preflightError: null }));
      logAction("EMAR Preflight Completed", file.name, "Authorized", undefined, {
        event: "emar_preflight_complete",
        fileName: file.name,
        pageCount: data.pageCount,
        medicationCount: data.medicationCount,
        dateCount: data.dateCount,
        timeSlotCount: data.timeSlotCount,
      });
      toast({
        title: "Preflight Complete",
        description: "Quick checks finished. Review the results below.",
      });
    } catch (error: any) {
      setPreflightError(error.message || "Preflight check failed");
      updateActiveRecord(record => ({ ...record, preflightError: error.message || "Preflight check failed" }));
      logAction("EMAR Preflight Failed", file.name, "Flagged", error.message || "Preflight check failed", {
        event: "emar_preflight_failed",
        fileName: file.name,
      });
      toast({
        title: "Preflight Failed",
        description: error.message || "Unable to complete preflight checks.",
        variant: "destructive",
      });
    } finally {
      setPreflightLoading(false);
    }
  };

  const copyManualChecklist = async () => {
    try {
      await navigator.clipboard.writeText(MANUAL_AUDIT_CHECKLIST);
      toast({
        title: "Checklist Copied",
        description: "Manual audit checklist copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Unable to copy checklist. Please try again.",
        variant: "destructive",
      });
    }
  };

  const processAudit = async () => {
    const isPdf = file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    
    if (!isPdf && !documentContent) {
      toast({ 
        title: "Missing Information", 
        description: "Please upload a PDF or paste EMAR document content",
        variant: "destructive"
      });
      return;
    }

    if (aiStatusLoading) {
      toast({
        title: "Checking AI Availability",
        description: "Please wait a moment and try again.",
      });
      return;
    }

    if (!aiAvailable) {
      toast({
        title: "AI Unavailable",
        description: aiStatusMessage || "AI analysis is currently unavailable in this environment.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressStatus("Preparing document...");
    setVerificationChecks({});
    setMedicationLevelOverride(null);
    setVerificationSubmitted(false);
    setWarningsOpen(false);
    setPrnProtocolsSubmitted(false);
    setAddedDiscrepancies([]);
    setDetectedInitials([]);
    setCarerMappings([]);
    setMappingsConfirmed(false);
    setRefusalDecisions({});
    setRefusalReviewSubmitted(false);
    setReasonsNotAdministeredOpen([]);
    
    try {
      if (!isPdf || !file) {
        toast({
          title: "PDF Required",
          description: "Image-based analysis requires a PDF file. Please upload a PDF document.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("allowSensitive", isAdmin && allowSensitive ? "true" : "false");

      const response = await fetch(`/api/ai/analyze-emar`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      // Check for non-streaming error responses (auth failures, server errors)
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('event-stream')) {
        let message = `Analysis failed with status ${response.status}`;
        let parsedMessage: string | null = null;

        try {
          const error = await response.json();
          if (error && typeof error.message === "string" && error.message.trim()) {
            parsedMessage = error.message.trim();
          }
        } catch {
          // Ignore JSON parse failures; keep status-based fallback message.
        }

        if (parsedMessage) {
          message = parsedMessage;
        } else if (response.status === 401) {
          message = "Your session has expired. Please sign in again.";
        } else if (response.status === 503) {
          message = "AI analysis is currently unavailable in this environment. Please contact your administrator.";
        }

        if (response.status === 503) {
          setAiAvailable(false);
          setAiStatusMessage(message);
        }
        if (response.status === 401) {
          setAiAvailable(false);
          setAiStatusMessage("Your session has expired. Please sign in again.");
        }
        const statusError = new Error(message) as Error & { status?: number };
        statusError.status = response.status;
        throw statusError;
      }

      if (!response.body) {
        throw new Error("No response body - streaming not supported");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedResult = false;
      let currentEventType = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // SSE format: "event: type\ndata: {...}\n\n"
        const events = buffer.split('\n\n');
        buffer = events.pop() || "";
        
        for (const event of events) {
          if (!event.trim()) continue;
          
          const lines = event.split('\n');
          let eventType = "";
          let eventData = "";
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }
          
          if (!eventData) continue;
          
          try {
            const data = JSON.parse(eventData);
            
            if (eventType === 'progress') {
              throttledSetProgress(data.percent, data.status);
            } else if (eventType === 'result') {
              setResult(data);
              setAnalyzed(true);
              updateActiveRecord(record => ({ ...record, result: data, analyzed: true }));
              const logName = formatServiceUserInitials(data?.serviceUserInitials || data?.serviceUserName);
              logAction("EMAR Audit Completed", logName || file?.name || "EMAR", "Authorized", undefined, {
                event: "emar_audit_completed",
                fileName: file?.name,
                serviceUserInitials: data?.serviceUserInitials,
                auditPeriodStart: data?.auditPeriodStart,
                auditPeriodEnd: data?.auditPeriodEnd,
              });
              receivedResult = true;
              toast({ title: "Analysis Complete", description: "EMAR analysis processed successfully." });
            } else if (eventType === 'warning') {
              const message = data.message || "Warning";
              const warningKind = String((data as any)?.kind || "");
              const userFacing = (data as any)?.userFacing;
              const isAgentFallback =
                warningKind === "agent_fallback" ||
                userFacing === false ||
                /agent extraction failed/i.test(message);

              if (isAgentFallback) {
                // Internal/expected fallback; avoid user-visible noise.
                console.info("[EMAR] Agent fallback:", message);
                continue;
              }
              const isHighSeverity = /alert|high[-\s]severity/i.test(message);
              toast({
                title: "Warning",
                description: message,
                variant: isHighSeverity ? "destructive" : "default",
              });
            } else if (eventType === 'error') {
              throw new Error(data.message || "Analysis failed");
            }
          } catch (parseError: any) {
            if (parseError.message && !parseError.message.includes("Unexpected token")) {
              throw parseError;
            }
            console.warn("Skipping malformed SSE event:", event);
          }
        }
      }
      
      // Handle any remaining buffer content
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        let eventType = "";
        let eventData = "";
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }
        
        if (eventData) {
          try {
            const data = JSON.parse(eventData);
            if (eventType === 'result') {
              setResult(data);
              setAnalyzed(true);
              updateActiveRecord(record => ({ ...record, result: data, analyzed: true }));
              const logName = formatServiceUserInitials(data?.serviceUserInitials || data?.serviceUserName);
              logAction("EMAR Audit Completed", logName || file?.name || "EMAR", "Authorized", undefined, {
                event: "emar_audit_completed",
                fileName: file?.name,
                serviceUserInitials: data?.serviceUserInitials,
                auditPeriodStart: data?.auditPeriodStart,
                auditPeriodEnd: data?.auditPeriodEnd,
              });
              receivedResult = true;
              toast({ title: "Analysis Complete", description: "EMAR analysis processed successfully." });
            } else if (eventType === 'warning') {
              const message = data.message || "Warning";
              const warningKind = String((data as any)?.kind || "");
              const userFacing = (data as any)?.userFacing;
              const isAgentFallback =
                warningKind === "agent_fallback" ||
                userFacing === false ||
                /agent extraction failed/i.test(message);

              if (isAgentFallback) {
                console.info("[EMAR] Agent fallback:", message);
              } else {
              const isHighSeverity = /alert|high[-\s]severity/i.test(message);
              toast({
                title: "Warning",
                description: message,
                variant: isHighSeverity ? "destructive" : "default",
              });
              }
            } else if (eventType === 'error') {
              throw new Error(data.message || "Analysis failed");
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) {
              throw e;
            }
          }
        }
      }
      
      if (!receivedResult) {
        throw new Error("Analysis completed but no result was received");
      }
    } catch (error: any) {
      const statusCode = Number(error?.status || 0);
      const errorMessage = error?.message || "Failed to analyze document";
      const normalizedMessage = String(errorMessage).toLowerCase();
      const isServiceUnavailable =
        statusCode === 503 ||
        normalizedMessage.includes("unavailable") ||
        normalizedMessage.includes("disabled");

      if (statusCode === 401) {
        setAiAvailable(false);
        setAiStatusMessage("Your session has expired. Please sign in again.");
      } else if (isServiceUnavailable) {
        setAiAvailable(false);
        setAiStatusMessage(
          "AI analysis is currently unavailable. You can continue with Quick Check and the manual checklist below."
        );
      }

      logAction("EMAR Audit Failed", file?.name || "EMAR", "Flagged", error.message || "Failed to analyze document", {
        event: "emar_audit_failed",
        fileName: file?.name,
      });
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressStatus("");
    }
  };

  const saveAudit = async () => {
    if (!user || !result) return;
    
    try {
      setLoading(true);

      const resultForSave = (result as any)?.scrubbedResult || result;
      const auditData = {
        serviceUserName: serviceUserDisplayScrubbed,
        auditor: user.username,
        auditType: "EMAR",
        periodStart: resultForSave.auditPeriodStart,
        periodEnd: resultForSave.auditPeriodEnd,
        results: {
          ...resultForSave,
          verificationResults: verificationChecks,
          prnProtocolResults: prnProtocolChecks,
          medicationLevelOverride,
          addedDiscrepancies,
          refusalReviewDecisions: refusalDecisions,
          refusalReviewSubmitted,
        },
      };

      const auditRes = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(auditData),
      });

      if (!auditRes.ok) throw new Error("Failed to save audit");

      logAction("EMAR Audit Saved", serviceUserDisplayScrubbed || "N.N.", "Authorized", undefined, {
        event: "emar_audit_saved",
        serviceUserInitials: serviceUserDisplayScrubbed || "N.N.",
        auditPeriodStart: result?.auditPeriodStart,
        auditPeriodEnd: result?.auditPeriodEnd,
      });
      toast({ 
        title: "Audit Saved", 
        description: "Audit results have been recorded." 
      });

      removeActiveRecord();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save audit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePRNProtocolSubmit = () => {
    setPrnProtocolsSubmitted(true);
    const incomplete = prnProtocolChecks.filter(p => !p.isCompleted || !p.isGoodStandard);
    if (incomplete.length > 0) {
      toast({
        title: "PRN Protocols Reviewed",
        description: `${incomplete.length} PRN medication(s) need protocol attention.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "PRN Protocols Complete",
        description: "All PRN protocols are completed and to a good standard.",
      });
    }
  };

  const generatePRNProtocol = async (medicationName: string) => {
    setGeneratingProtocol(medicationName);
    setGeneratedProtocol(null);
    
    try {
      const response = await fetch("/api/ai/generate-prn-protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ medicationName }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate protocol");
      }
      
      const data = await response.json();
      setGeneratedProtocol(data.protocol);
      setProtocolDialogOpen(true);
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate PRN protocol",
        variant: "destructive",
      });
    } finally {
      setGeneratingProtocol(null);
    }
  };

  const copyProtocolToClipboard = () => {
    if (!generatedProtocol) return;
    
    const protocolText = `PRN PROTOCOL - ${generatedProtocol.medicationName}
=====================================

Medication Name: ${generatedProtocol.medicationName}
Dose: ${generatedProtocol.dose}
Route: ${generatedProtocol.route}
Frequency: ${generatedProtocol.frequency}
Maximum Dose in 24 Hours: ${generatedProtocol.maxDoseIn24Hours}
Minimum Time Between Doses: ${generatedProtocol.minimumTimeBetweenDoses}

Special Instructions:
${generatedProtocol.specialInstructions}

Reasons for Administration:
${generatedProtocol.reasonsForAdministration}

Predictable Side Effects:
${generatedProtocol.predictableSideEffects}

Additional Comments:
${generatedProtocol.additionalComments}`;
    
    navigator.clipboard.writeText(protocolText);
    toast({
      title: "Copied",
      description: "PRN protocol copied to clipboard",
    });
  };

  const getActionsText = (actions: DiscrepancyAction): string => {
    const parts: string[] = [];
    if (actions.performanceNote) parts.push("Performance Note");
    if (actions.meeting === "phone") parts.push("Phone Meeting");
    if (actions.meeting === "in_person") parts.push("In-Person Meeting");
    if (actions.referToManager) parts.push("Refer to Registered Manager");
    return parts.join(", ") || "None";
  };

  // Helper to generate stable key for discrepancy deduplication
  const getDiscrepancyKey = (
    careWorker: string,
    date: string,
    medication: string,
    medicationId?: number,
    timeSlot?: string
  ) => `${careWorker}|${date}|${medicationId || medication}|${timeSlot || ''}`.toLowerCase();

  // Derive code discrepancies from structured data based on current medication level
  const deriveCodeDiscrepancies = (
    analysisResult: EmarAnalysisResult,
    level: string
  ): { discrepancies: Discrepancy[]; allCodeEntryKeys: Set<string> } => {
    const supportCodes = ['AS', 'AD', 'P'];
    
    const codeMapping: Record<string, { validCodes: string[]; invalidCodes: string[] }> = {
      'assist': { validCodes: ['AS'], invalidCodes: ['AD', 'P'] },
      'prompt': { validCodes: ['P'], invalidCodes: ['AS', 'AD'] },
      'administer': { validCodes: ['AD'], invalidCodes: ['AS', 'P'] },
    };
    
    const mapping = codeMapping[level];
    const derivedDiscrepancies: Discrepancy[] = [];
    const allCodeEntryKeys = new Set<string>(); // Track ALL code-related entries (both valid and invalid)
    const processedDiscrepancyKeys = new Set<string>(); // For deduplication within derived discrepancies
    
    if (!mapping) return { discrepancies: [], allCodeEntryKeys };
    
    const addCodeDiscrepancy = (
      careWorkerName: string,
      date: string,
      medication: string,
      medicationId: number | undefined,
      code: string
    ) => {
      const key = getDiscrepancyKey(careWorkerName, date, medication, medicationId);
      if (processedDiscrepancyKeys.has(key)) return;
      processedDiscrepancyKeys.add(key);
      
      const codeDisplayName = code === 'AS' ? 'Assist' : 
                              code === 'AD' ? 'Administer' : 
                              code === 'P' ? 'Prompt' : code;
      const levelDisplayName = level.charAt(0).toUpperCase() + level.slice(1);
      
      // Format date as (DD/MM)
      const dateParts = date.match(/(\d{1,2})[^\d]+(\d{1,2}|\w+)/);
      let formattedDate = date;
      if (dateParts) {
        const day = dateParts[1].padStart(2, '0');
        const monthNames: { [key: string]: string } = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const monthPart = dateParts[2];
        const month = monthNames[monthPart.toLowerCase().slice(0, 3)] || monthPart.padStart(2, '0');
        formattedDate = `(${day}/${month})`;
      }
      
      const medDisplayName = getMedicationDisplayName(medication);
      
      derivedDiscrepancies.push({
        careWorkerName,
        date,
        medication,
        medicationId,
        issue: `${formattedDate} Used incorrect medication code on ${medDisplayName}, Code used was ${code} when medication level is ${levelDisplayName.toLowerCase()}`,
        actions: {
          performanceNote: false,
          meeting: "none",
          referToManager: false,
          notesRecorded: false,
          discussedWithStaff: false,
          escalatedToManager: false,
        },
      });
    };
    
    // Process entries - track ALL code entries for filtering, but only create discrepancies for INVALID codes
    const processEntry = (
      careWorkerName: string,
      date: string,
      medication: string,
      medicationId: number | undefined,
      code?: string
    ) => {
      const entryCode = (code || '').toUpperCase();
      if (supportCodes.includes(entryCode)) {
        // Track ALL code entries (valid or invalid) so we can filter out AI discrepancies about them
        const key = getDiscrepancyKey(careWorkerName, date, medication, medicationId);
        allCodeEntryKeys.add(key);
        
        // Only create discrepancies for INVALID codes
        if (mapping.invalidCodes.includes(entryCode)) {
          addCodeDiscrepancy(careWorkerName, date, medication, medicationId, entryCode);
        }
      }
    };
    
    // Process groupedMainRefusals
    analysisResult.groupedMainRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        processEntry(refusal.careWorkerName, dateItem.date, refusal.medication, refusal.medicationId, dateItem.code || refusal.code);
      });
    });
    
    // Process groupedPrnRefusals
    analysisResult.groupedPrnRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        processEntry(refusal.careWorkerName, dateItem.date, refusal.medication, refusal.medicationId, dateItem.code || refusal.code);
      });
    });
    
    // Process officeClosedEntries
    analysisResult.officeClosedEntries?.forEach(entry => {
      processEntry(entry.closedByStaff, entry.date, entry.medication, entry.medicationId, entry.code);
    });
    
    // Process userVerificationItems
    analysisResult.userVerificationItems?.forEach(item => {
      processEntry(item.careWorkerName, item.date, item.medication, item.medicationId, item.code);
    });
    
    // Process supportCodeEntries - this is the primary source for AS/AD/P code entries
    // This data comes from the backend and contains ALL entries with support level codes
    analysisResult.supportCodeEntries?.forEach(entry => {
      processEntry(entry.careWorkerName, entry.date, entry.medication, entry.medicationId, entry.code);
    });
    
    return { discrepancies: derivedDiscrepancies, allCodeEntryKeys };
  };

  const getAllDiscrepancies = (): Discrepancy[] => {
    const baseDiscrepancies = result?.discrepancies || [];
    let allDisc = [...baseDiscrepancies, ...addedDiscrepancies];
    
    // When medication level override is set, use derived code discrepancies
    if (medicationLevelOverride && result) {
      const { discrepancies: codeDiscrepancies, allCodeEntryKeys } = deriveCodeDiscrepancies(result, medicationLevelOverride);
      
      // Filter out ALL AI discrepancies that mention AS/AD/P code conflicts
      // These patterns match discrepancies like:
      // - "Invalid code 'AS' used on administered medication"
      // - "AS code used but service user is Administer level"
      // - "Assist code (AS) used but service user is..."
      const codeConflictPatterns = [
        /invalid\s+code\s+['"]?(AS|AD|P)['"]?/i,  // "Invalid code 'AS'"
        /\b(AS|AD|P)\b\s+(code\s+)?used/i,         // "AS used" or "AS code used"
        /\b(assist|administer|prompt)\s+code/i,   // "Assist code", "Administer code"
        /code\s+['"]?(AS|AD|P)['"]?\s+used/i,     // "code 'AS' used"
        /\b(AS|AD|P)\b.*\b(level|medication)\b/i, // "AS...level" or "AS...medication"
        /administered\s+medication.*valid\s+codes/i, // "administered medication - valid codes"
      ];
      
      allDisc = allDisc.filter(d => {
        const key = getDiscrepancyKey(d.careWorkerName, d.date, d.medication, d.medicationId);
        // Remove if it matches a code entry
        if (allCodeEntryKeys.has(key)) return false;
        // Remove if the issue text matches any code conflict pattern
        for (const pattern of codeConflictPatterns) {
          if (pattern.test(d.issue)) return false;
        }
        return true;
      });
      
      // Add our derived code discrepancies for conflicting codes only
      allDisc = [...allDisc, ...codeDiscrepancies];
    }
    
    return allDisc.map(d => ({
      ...d,
      careWorkerName: getMappedCarerName(d.careWorkerName),
    }));
  };

  const getAllDiscrepanciesText = () => {
    const allDiscrepancies = getAllDiscrepancies();
    if (allDiscrepancies.length === 0) return "";
    return allDiscrepancies.map(d => 
      `${d.careWorkerName}\t${d.date}\t${getMedicationDisplayName(d.medication)}\t${d.issue}\t${getActionsText(d.actions)}`
    ).join('\n');
  };

  const getDiscrepanciesTableFormat = () => {
    const allDiscrepancies = getAllDiscrepancies();
    if (allDiscrepancies.length === 0) return "";
    const header = "Care Worker\tDate\tMedication\tIssue\tActions Required";
    const rows = allDiscrepancies.map(d => 
      `${d.careWorkerName}\t${d.date}\t${getMedicationDisplayName(d.medication)}\t${d.issue}\t${getActionsText(d.actions)}`
    );
    return [header, ...rows].join('\n');
  };

  const getServiceUserTypeDisplay = () => {
    if (medicationLevelOverride) return medicationLevelOverride.charAt(0).toUpperCase() + medicationLevelOverride.slice(1);
    if (!result) return "";
    return result.serviceUserType.charAt(0).toUpperCase() + result.serviceUserType.slice(1);
  };

  const getAuditorDisplay = () => {
    if (!user) return "";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || user.username;
    const jobRole = user.jobTitle || (user.role === 'admin' ? 'Admin' : 'Staff');
    return `${fullName} (${jobRole})`;
  };

  const auditorDisplay = getAuditorDisplay();
  const serviceUserDisplayScrubbed = useMemo(() => {
    if (!result) return "N.N.";
    return formatServiceUserInitials(result.serviceUserInitials || result.serviceUserName);
  }, [result]);
  const serviceUserDisplay = useMemo(() => {
    if (!result) return "N.N.";
    if (isAdmin && allowSensitive) {
      return result.serviceUserName || serviceUserDisplayScrubbed;
    }
    return serviceUserDisplayScrubbed;
  }, [result, isAdmin, allowSensitive, serviceUserDisplayScrubbed]);

  const hasAnyDiscrepancies = () => {
    const allDiscrepancies = getAllDiscrepancies();
    return allDiscrepancies.length > 0;
  };

  const downloadPDF = () => {
    if (!result) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    
    doc.setFontSize(18);
    doc.setTextColor(33, 33, 33);
    doc.text("EMAR Audit Report", pageWidth / 2, yPos, { align: "center" });
    yPos += 15;
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: "center" });
    yPos += 15;
    
    doc.setFontSize(12);
    doc.setTextColor(33, 33, 33);
    doc.text("Service User Information", 14, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.text(`Service User: ${serviceUserDisplay}`, 14, yPos);
    yPos += 6;
    doc.text(`Medication Level: ${getServiceUserTypeDisplay()}`, 14, yPos);
    yPos += 6;
    doc.text(`Auditor: ${auditorDisplay}`, 14, yPos);
    yPos += 6;
    doc.text(`Audit Period: ${result.auditPeriodStart} - ${result.auditPeriodEnd}`, 14, yPos);
    yPos += 6;
    doc.text(`Allergies: ${(result as any).allergies || 'None recorded'}`, 14, yPos);
    yPos += 12;
    
    doc.setFontSize(12);
    doc.text(`Discrepancies Found: ${hasAnyDiscrepancies() ? 'Yes' : 'No'}`, 14, yPos);
    yPos += 10;
    
    if (result.warnings && result.warnings.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(200, 0, 0);
      doc.text(`Warnings (${result.warnings.length})`, 14, yPos);
      yPos += 8;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Type', 'Medication', 'Description', 'Recommended Action']],
        body: result.warnings.map((w: Warning) => [
          w.type.replace(/_/g, ' '),
          w.medication ? getMedicationDisplayName(w.medication) : '-',
          w.description,
          w.recommendedAction
        ]),
        theme: 'striped',
        headStyles: { fillColor: [200, 50, 50] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 2: { cellWidth: 50 }, 3: { cellWidth: 50 } }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    if (result.drugInteractions && result.drugInteractions.length > 0) {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setTextColor(255, 140, 0);
      doc.text(`Drug Interactions (${result.drugInteractions.length})`, 14, yPos);
      yPos += 8;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Drug 1', 'Drug 2', 'Severity', 'Description']],
        body: result.drugInteractions.map((i: DrugInteraction) => [
          i.drug1,
          i.drug2,
          i.severity,
          i.description
        ]),
        theme: 'striped',
        headStyles: { fillColor: [255, 140, 0] },
        styles: { fontSize: 8, cellPadding: 2 }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    const allDiscrepancies = getAllDiscrepancies();
    if (allDiscrepancies.length > 0) {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setTextColor(200, 0, 0);
      doc.text(`Discrepancies (${allDiscrepancies.length})`, 14, yPos);
      yPos += 8;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Care Worker', 'Date', 'Medication', 'Issue', 'Actions Required']],
        body: allDiscrepancies.map(d => [
          d.careWorkerName,
          d.date,
          getMedicationDisplayName(d.medication),
          d.issue,
          getActionsText(d.actions)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [200, 50, 50] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 3: { cellWidth: 50 }, 4: { cellWidth: 35 } }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    if (result.prnMedications?.hasPRN && result.prnMedications.medications.length > 0) {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setTextColor(200, 150, 0);
      doc.text(`PRN Medications (${result.prnMedications.medications.length})`, 14, yPos);
      yPos += 8;
	      
	      const prnList = result.prnMedications.medications
	        .map((m: any) => getMedicationDisplayName(typeof m === 'string' ? m : m.name))
	        .join(', ');
      doc.setFontSize(10);
      doc.setTextColor(33, 33, 33);
      doc.text(prnList, 14, yPos, { maxWidth: pageWidth - 28 });
      yPos += 10;
    }
    
    if (result.officeClosedEntries && result.officeClosedEntries.length > 0) {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setTextColor(50, 100, 200);
      doc.text(`Office Staff Manual Entries (${result.officeClosedEntries.length})`, 14, yPos);
      yPos += 8;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Medication', 'Date', 'Time Slot', 'Code', 'Closed By', 'Time Closed']],
        body: result.officeClosedEntries.map(e => [
          getMedicationDisplayName(e.medication),
          e.date,
          e.timeSlot,
          e.code,
          e.closedByStaff || 'Office Staff',
          e.closedTime || '-'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [50, 100, 200] },
        styles: { fontSize: 8, cellPadding: 2 }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    const fileName = `EMAR_Audit_${serviceUserDisplay.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    toast({
      title: "PDF Downloaded",
      description: `Report saved as ${fileName}`,
    });
  };

  const buildEmarExtensionPayload = () => {
    if (!result) return null;
    const discrepancies = getAllDiscrepancies();
    const medicationLevel = medicationLevelOverride || result.serviceUserType;
    const levelMap: Record<string, string> = {
      prompt: "Level 1 (Prompt)",
      assist: "Level 2 (Assist)",
      administer: "Level 3 (Administer)",
    };
    const prnInfo = result.prnMedications;
    const prnProtocolCompleted = prnInfo?.hasPRN
      ? prnInfo?.protocolsCompleted ? "Yes" : "No"
      : "N/A";
    const actionsInLine = discrepancies.length > 0 ? "No" : "Yes";

    const nonConformance = discrepancies.map((item) => ({
      careWorkerName: item.careWorkerName,
      dates: item.date,
      details: item.issue,
      occasions: "1",
      actions: getActionsText(item.actions),
    }));

    const staffIdentified = Array.from(new Set(discrepancies.map((item) => item.careWorkerName)))
      .filter(Boolean)
      .map((name) => ({
        name,
        comments: "Identified in audit discrepancies.",
      }));

    // Detect time-critical medications from warnings or discrepancies
    const timeCriticalKeywords = [
      'insulin', 'levodopa', 'sinemet', 'madopar', 'parkinson', 
      'epilepsy', 'seizure', 'carbamazepine', 'phenytoin', 'valproate',
      'warfarin', 'anticoagulant', 'heparin', 'digoxin',
      'levothyroxine', 'prednisolone', 'steroid',
      'time critical', 'time-critical', 'strict timing'
    ];
    const allMedNames = result.prnMedications?.medications?.map((m) => 
      typeof m === 'string' ? m : m.name
    ).filter(Boolean) || [];
    const timeCriticalMeds = allMedNames.filter((med) => 
      timeCriticalKeywords.some(keyword => med.toLowerCase().includes(keyword))
    );
    const hasTimeCritical = timeCriticalMeds.length > 0 || 
      (result.warnings?.some(w => w.description?.toLowerCase().includes('time') && w.description?.toLowerCase().includes('gap')));

    // Build themes from warnings and discrepancies
    const themesList: string[] = [];
    if (discrepancies.some(d => d.issue.toLowerCase().includes('time gap'))) {
      themesList.push('Insufficient gap between medication doses');
    }
    if (discrepancies.some(d => d.issue.toLowerCase().includes('refused'))) {
      themesList.push('Medication refusals documented');
    }
    if (discrepancies.some(d => d.issue.toLowerCase().includes('unavailable') || d.issue.toLowerCase().includes('mu'))) {
      themesList.push('Medication unavailability issues');
    }
    if (discrepancies.some(d => d.issue.toLowerCase().includes('code') && d.issue.toLowerCase().includes('invalid'))) {
      themesList.push('Incorrect EMAR codes used');
    }
    if (result.warnings?.some(w => w.type === 'code_conflict')) {
      themesList.push('Mixed medication codes detected - review support level');
    }
    if (result.codeConflictDetected) {
      themesList.push(`${result.codeConflictDetails || 'Medication code inconsistencies noted'}`);
    }
    const themesText = themesList.length > 0 
      ? themesList.join('. ') + '.'
      : result.themesAndTrends || 'No significant themes identified in this audit period.';

    return {
      formType: "emar",
      version: 1,
      createdAt: new Date().toISOString(),
      serviceUserName: serviceUserDisplay,
      auditor: auditorDisplay,
      auditPeriodStart: result.auditPeriodStart,
      auditPeriodEnd: result.auditPeriodEnd,
      purposeOfAudit: discrepancies.length > 0 ? "Following a medication incident" : "Quality Assurance",
      medicationSupportLevel: levelMap[medicationLevel] || "",
      prnProtocolCompleted,
      actionsInLine,
      nonConformance,
      timeCritical: hasTimeCritical ? "Yes" : "No",
      timeCriticalMedications: timeCriticalMeds.join(", "),
      timeCriticalAdministered: hasTimeCritical && discrepancies.some(d => d.issue.toLowerCase().includes('time gap')) ? "No" : (hasTimeCritical ? "Yes" : ""),
      timeCriticalActions: hasTimeCritical && discrepancies.some(d => d.issue.toLowerCase().includes('time gap')) 
        ? "Time gap violations identified - discussed with care workers and recorded in performance notes."
        : "",
      themesAndTrends: themesText,
      staffIdentified,
      furtherActions: result.gapsInKnowledge || (discrepancies.length > 0 ? "Review outstanding discrepancies with care workers and update training as needed." : "No further actions required."),
      auditDate: formatDate(new Date()),
    };
  };

  const sendEmarToExtension = async () => {
    if (typeof window === "undefined") return;
    const payload = buildEmarExtensionPayload();
    if (!payload) return;

    const requestId =
      typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : String(Date.now());

    try {
      const response = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        let handler: ((event: MessageEvent) => void) | null = null;
        const timeoutId = window.setTimeout(() => {
          if (handler) window.removeEventListener("message", handler);
          reject(new Error("Edge extension not detected."));
        }, 1500);

        handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          if (!event.data || event.data.type !== "CA_EXTENSION_ACK") return;
          if (event.data.requestId !== requestId) return;
          window.clearTimeout(timeoutId);
          window.removeEventListener("message", handler!);
          resolve({ ok: Boolean(event.data.ok), error: event.data.error });
        };

        window.addEventListener("message", handler);
        window.postMessage(
          {
            type: "CA_SEND_TO_EMAR_EXTENSION",
            requestId,
            payload,
          },
          window.location.origin
        );
      });

      if (response.ok) {
        toast({
          title: "Sent to extension",
          description: "EMAR audit queued for autofill.",
        });
      } else {
        toast({
          title: "Extension error",
          description: response.error || "Failed to send to extension.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Extension not detected",
        description: error?.message || "Could not reach the Edge extension.",
        variant: "destructive",
      });
    }
  };

  // State for expanded care worker cards
  const [expandedCareWorkers, setExpandedCareWorkers] = useState<Set<string>>(new Set());

  // Group discrepancies by care worker
  interface GroupedCareWorker {
    careWorkerName: string;
    dates: string[];
    reasonsWithDates: { date: string; issue: string; medication: string }[];
    totalCount: number;
    discrepancies: Discrepancy[];
    overallActions: string[];
  }

  const getGroupedDiscrepancies = useMemo((): GroupedCareWorker[] => {
    const allDiscrepancies = getAllDiscrepancies();
    const grouped = new Map<string, GroupedCareWorker>();

    allDiscrepancies.forEach(d => {
      const existing = grouped.get(d.careWorkerName);
      if (existing) {
        if (!existing.dates.includes(d.date)) {
          existing.dates.push(d.date);
        }
        existing.reasonsWithDates.push({ date: d.date, issue: d.issue, medication: d.medication });
        existing.totalCount++;
        existing.discrepancies.push(d);
        // Collect unique actions (using new action names)
        if (d.actions.notesRecorded && !existing.overallActions.includes("Recorded in Care Workers Notes")) {
          existing.overallActions.push("Recorded in Care Workers Notes");
        }
        if (d.actions.discussedWithStaff && !existing.overallActions.includes("Discussed with Care Worker")) {
          existing.overallActions.push("Discussed with Care Worker");
        }
        if (d.actions.escalatedToManager && !existing.overallActions.includes("Escalated to Manager")) {
          existing.overallActions.push("Escalated to Manager");
        }
        // Legacy support for old action format
        if (d.actions.performanceNote && !existing.overallActions.includes("Performance Note")) {
          existing.overallActions.push("Performance Note");
        }
        if (d.actions.meeting === "phone" && !existing.overallActions.includes("Phone Meeting")) {
          existing.overallActions.push("Phone Meeting");
        }
        if (d.actions.meeting === "in_person" && !existing.overallActions.includes("In-Person Meeting")) {
          existing.overallActions.push("In-Person Meeting");
        }
        if (d.actions.referToManager && !existing.overallActions.includes("Refer to Manager")) {
          existing.overallActions.push("Refer to Manager");
        }
      } else {
        const actions: string[] = [];
        // New action names
        if (d.actions.notesRecorded) actions.push("Recorded in Care Workers Notes");
        if (d.actions.discussedWithStaff) actions.push("Discussed with Care Worker");
        if (d.actions.escalatedToManager) actions.push("Escalated to Manager");
        // Legacy support
        if (d.actions.performanceNote) actions.push("Performance Note");
        if (d.actions.meeting === "phone") actions.push("Phone Meeting");
        if (d.actions.meeting === "in_person") actions.push("In-Person Meeting");
        if (d.actions.referToManager) actions.push("Refer to Manager");
        
        grouped.set(d.careWorkerName, {
          careWorkerName: d.careWorkerName,
          dates: [d.date],
          reasonsWithDates: [{ date: d.date, issue: d.issue, medication: d.medication }],
          totalCount: 1,
          discrepancies: [d],
          overallActions: actions,
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.totalCount - a.totalCount);
  }, [result, addedDiscrepancies, mappingsConfirmed, carerMappings, medicationLevelOverride]);

  const formatShortDate = (dateStr: string): string => {
    // Convert from formats like "01/12/2024" or "1 Dec 2024" to "1/12"
    const parts = dateStr.match(/(\d{1,2})[\/\-\s](\d{1,2}|\w+)[\/\-\s]?(\d{2,4})?/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      let month = parts[2];
      // Convert month name to number if needed
      const monthNames: { [key: string]: number } = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const monthNum = monthNames[month.toLowerCase().slice(0, 3)] || parseInt(month, 10);
      return `${day}/${monthNum}`;
    }
    return dateStr;
  };

  const toggleCareWorkerExpand = (name: string) => {
    setExpandedCareWorkers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  interface UnifiedRefusalItem {
    careWorkerName: string;
    medication: string;
    medicationId?: number;
    date: string;
    timeSlot: string;
    code: string;
    key: string;
    source: 'main' | 'prn';
  }

  interface RefusalsByCode {
    code: string;
    displayName: string;
    items: UnifiedRefusalItem[];
    count: number;
  }

  const unifiedRefusals = useMemo((): RefusalsByCode[] => {
    const codeGroups = new Map<string, UnifiedRefusalItem[]>();

    const codeDisplayNames: { [key: string]: string } = {
      'R': 'Refused (R)',
      'NH': 'Not at Home (NH)',
      'MU': 'Medication Unavailable (MU)',
      'F': 'Family Administered (F)',
      'SA': 'Self-Administered (SA)',
      'PRN-R': 'PRN Refused (PRN-R)',
      'PRN-NA': 'PRN Not Administered (PRN-NA)',
    };

    result?.groupedMainRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        const code = dateItem.code || refusal.code || 'R';
        const medicationKey = refusal.medicationId ? `id:${refusal.medicationId}` : refusal.medication;
        const key = `main|${refusal.careWorkerName}|${medicationKey}|${dateItem.date}|${dateItem.timeSlot || ''}`;
        const item: UnifiedRefusalItem = {
          careWorkerName: getMappedCarerName(refusal.careWorkerName),
          medication: refusal.medication,
          medicationId: refusal.medicationId,
          date: dateItem.date,
          timeSlot: dateItem.timeSlot || '',
          code: code,
          key: key,
          source: 'main',
        };
        
        if (!codeGroups.has(code)) {
          codeGroups.set(code, []);
        }
        codeGroups.get(code)!.push(item);
      });
    });

    result?.groupedPrnRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        const code = dateItem.code || refusal.code || 'PRN-R';
        const medicationKey = refusal.medicationId ? `id:${refusal.medicationId}` : refusal.medication;
        const key = `prn|${refusal.careWorkerName}|${medicationKey}|${dateItem.date}|${dateItem.timeSlot || ''}`;
        const item: UnifiedRefusalItem = {
          careWorkerName: getMappedCarerName(refusal.careWorkerName),
          medication: refusal.medication,
          medicationId: refusal.medicationId,
          date: dateItem.date,
          timeSlot: dateItem.timeSlot || '',
          code: code,
          key: key,
          source: 'prn',
        };
        
        if (!codeGroups.has(code)) {
          codeGroups.set(code, []);
        }
        codeGroups.get(code)!.push(item);
      });
    });

    return Array.from(codeGroups.entries()).map(([code, items]) => ({
      code,
      displayName: codeDisplayNames[code] || code,
      items,
      count: items.length,
    })).sort((a, b) => b.count - a.count);
  }, [result?.groupedMainRefusals, result?.groupedPrnRefusals, mappingsConfirmed, carerMappings]);

  const totalRefusalCount = useMemo(() => {
    return unifiedRefusals.reduce((sum, group) => sum + group.count, 0);
  }, [unifiedRefusals]);

  const getRefusalReviewStats = useMemo(() => {
    const total = unifiedRefusals.reduce((sum, group) => sum + group.count, 0);
    const reviewed = Object.values(refusalDecisions).filter(d => d !== null).length;
    const acceptable = Object.values(refusalDecisions).filter(d => d === 'acceptable').length;
    const toEscalate = Object.values(refusalDecisions).filter(d => d === 'escalate').length;
    const pending = total - reviewed;
    return { total, reviewed, acceptable, toEscalate, pending };
  }, [unifiedRefusals, refusalDecisions]);

  const handleRefusalDecision = (key: string, decision: 'acceptable' | 'escalate') => {
    setRefusalDecisions(prev => {
      if (prev[key] === decision) {
        const newDecisions = { ...prev };
        delete newDecisions[key];
        return newDecisions;
      }
      return { ...prev, [key]: decision };
    });
  };

  const EMAR_CODES = ['AD', 'AS', 'R', 'MU', 'NH', 'F', 'SA', 'PRN', 'PRN-R'];

  const generateEntryKey = (
    careWorkerName: string,
    date: string,
    medication: string,
    timeSlot?: string,
    medicationId?: number
  ): string => {
    return `${careWorkerName}|${date}|${medicationId || medication}|${timeSlot || ''}`;
  };

  const startEditing = (entry: { careWorkerName: string; date: string; medication: string; medicationId?: number; issue: string; timeSlot?: string; code?: string }) => {
    const key = generateEntryKey(entry.careWorkerName, entry.date, entry.medication, entry.timeSlot, entry.medicationId);
    const existingCorrection = corrections.get(key);
    
	    setEditingEntry({
	      key,
	      careWorkerName: existingCorrection?.careWorkerName || entry.careWorkerName,
	      date: existingCorrection?.date || entry.date,
	      timeSlot: existingCorrection?.timeSlot || entry.timeSlot || '',
	      medication: getMedicationDisplayName(existingCorrection?.medication || entry.medication),
	      code: existingCorrection?.code || entry.code || '',
	      issue: existingCorrection?.issue || entry.issue,
	    });
    setEditDialogOpen(true);
  };

  const saveCorrection = () => {
    if (!editingEntry) return;
    
    const correctedEntry: CorrectedEntry = {
      originalKey: editingEntry.key,
      careWorkerName: editingEntry.careWorkerName,
      date: editingEntry.date,
      timeSlot: editingEntry.timeSlot,
      medication: editingEntry.medication,
      code: editingEntry.code,
      issue: editingEntry.issue,
    };
    
    setCorrections(prev => {
      const newCorrections = new Map(prev);
      newCorrections.set(editingEntry.key, correctedEntry);
      return newCorrections;
    });
    
    setEditDialogOpen(false);
    setEditingEntry(null);
    setCorrectionsApplied(false);
    
    toast({
      title: "Correction Saved",
      description: "The entry has been corrected. Click 'Apply Corrections' to update the audit.",
    });
  };

  const undoCorrection = (key: string) => {
    setCorrections(prev => {
      const newCorrections = new Map(prev);
      newCorrections.delete(key);
      return newCorrections;
    });
    setCorrectionsApplied(false);
    
    toast({
      title: "Correction Removed",
      description: "The entry has been reverted to its original value.",
    });
  };

  const applyAllCorrections = async () => {
    if (corrections.size === 0) {
      toast({
        title: "No Corrections",
        description: "There are no corrections to apply.",
        variant: "destructive",
      });
      return;
    }
    
    setCorrectionsApplied(true);
    
    toast({
      title: "Corrections Applied",
      description: `${corrections.size} correction(s) have been applied to the audit data.`,
    });

    if (user?.role === 'admin') {
      try {
        await apiRequest("POST", "/api/emar-corrections", {
          corrections: Array.from(corrections.values()),
          serviceUserInitials: result?.serviceUserInitials,
          auditId: null,
        });
        
        toast({
          title: "Corrections Saved",
          description: "Corrections have been persisted to the database.",
        });
      } catch (error: any) {
        toast({
          title: "Save Failed",
          description: error.message || "Failed to save corrections to database.",
          variant: "destructive",
        });
      }
    }
  };

  const getCorrectedValue = (key: string): CorrectedEntry | null => {
    return corrections.get(key) || null;
  };

  const isEntryCorrected = (careWorkerName: string, date: string, medication: string, timeSlot?: string, medicationId?: number): boolean => {
    const key = generateEntryKey(careWorkerName, date, medication, timeSlot, medicationId);
    return corrections.has(key);
  };

  const handleSubmitRefusalReview = async () => {
    const allItems = unifiedRefusals.flatMap(group => group.items);
    const reviewedItems = Object.entries(refusalDecisions)
      .filter(([_, decision]) => decision !== null)
      .map(([key, decision]) => {
        const item = allItems.find(i => i.key === key);
        return item ? { ...item, decision } : null;
      })
      .filter((item): item is UnifiedRefusalItem & { decision: 'acceptable' | 'escalate' } => item !== null);

    const escalatedItems = reviewedItems.filter(i => i.decision === 'escalate');

    if (escalatedItems.length > 0) {
      const newDiscrepancies: Discrepancy[] = escalatedItems.map(item => ({
        careWorkerName: item.careWorkerName,
        date: item.date,
        medication: item.medication,
        medicationId: item.medicationId,
        issue: `Inadequate refusal documentation - ${item.code} code used without acceptable reason`,
        actions: { performanceNote: true, meeting: "none", referToManager: false },
      }));

      setAddedDiscrepancies(prev => [...prev, ...newDiscrepancies]);
    }

    try {
      const reviews = reviewedItems.map(item => ({
        careWorkerName: item.careWorkerName,
        medication: item.medication,
        refusalDate: item.date,
        timeSlot: item.timeSlot || null,
        reasonAcceptable: item.decision === 'acceptable',
        reviewerNotes: item.decision === 'escalate' ? `Escalated: ${item.code} code - inadequate documentation` : null,
      }));

      if (reviews.length > 0) {
        const response = await fetch("/api/refusal-reviews/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reviews }),
        });

        if (!response.ok) {
          throw new Error("Failed to save refusal reviews");
        }
      }

      setRefusalReviewSubmitted(true);
      
      toast({
        title: "Refusal Review Submitted",
        description: `${getRefusalReviewStats.acceptable} marked acceptable, ${escalatedItems.length} escalated to discrepancies.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save refusal reviews",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="page-shell max-w-6xl mx-auto">
      <div className="space-y-2 animate-slide-up stagger-1">
        <h1 className="page-title">Autonomous EMAR Audit</h1>
        <p className="page-subtitle max-w-2xl">
          Deploying neural extraction to audit medication administration records. Our multi-pass consensus engine identifies discrepancies with clinical precision.
        </p>
      </div>

      {!analyzed ? (
        <Card className="glass-card shadow-medium animate-slide-up stagger-2">
          <CardHeader className="border-b border-border/40 pb-6 mb-2">
            <CardTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              Intake Channel
            </CardTitle>
            <CardDescription>Initialize audit by uploading structured PDF documentation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            <div className="bg-muted/30 border border-border/40 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Brain className="h-24 w-24" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-4 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Audit Protocol
              </p>
              <ul className="grid sm:grid-cols-2 gap-4">
                {[
                  "PII Scrubbing & Initials Normalization",
                  "Automated Medication Level Discovery",
                  "Temporal Gap Analysis (3-Pass)",
                  "Drug Interaction Cross-Reference",
                  "Consensus Discrepancy Verification"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-xs font-semibold text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success/70" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-6">
              <div
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 transition-all duration-300 group relative",
                  isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleFileDrop}
              >
                <Input
                  id="emar-upload"
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf"
                  multiple
                  className="sr-only"
                  data-testid="input-file-upload"
                />
                <Label htmlFor="emar-upload" className="flex flex-col items-center gap-4 text-center cursor-pointer">
                  <div className="h-16 w-16 rounded-2xl bg-background border border-border/60 flex items-center justify-center shadow-xs group-hover:scale-110 group-hover:text-primary transition-all">
                    <Upload className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-base font-semibold text-foreground block">
                      {isDragActive ? "Drop documentation now" : "Transmit EMAR Records"}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">
                      Drag & drop PDF files or click to browse secure local storage
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="outline" className="bg-background/50 border-border/40 font-semibold uppercase tracking-tighter text-[10px]">PDF Documents Only</Badge>
                    <Badge variant="outline" className="bg-background/50 border-border/40 font-semibold uppercase tracking-tighter text-[10px]">Max {MAX_EMAR_UPLOAD_MB}MB Per Stream</Badge>
                  </div>
                </Label>
              </div>

              {emarRecords.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Uploaded EMARs</span>
                    <span className="text-xs text-muted-foreground">{emarRecords.length} file{emarRecords.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid gap-2">
                    {emarRecords.map((record) => {
                      const isActive = record.id === activeRecordId;
                      const status = record.analyzed ? "Analyzed" : "Ready";
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => loadRecordById(record.id)}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                            isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{record.file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(record.file.size)}</p>
                          </div>
                          <Badge variant={record.analyzed ? "success" : "outline"}>{status}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {file && (
                <div className="bg-muted rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Selected file:</p>
                    <p className="text-foreground font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    {!fileReady && (
                      <p className="text-xs text-muted-foreground mt-1">Preparing file for analysis...</p>
                    )}
                  </div>
                  <Badge variant="outline">{fileReady ? "Ready" : "Preparing"}</Badge>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={processAudit}
                  disabled={loading || !file || !fileReady || aiStatusLoading || !aiAvailable}
                  data-testid="button-analyze"
                >
                  {aiStatusLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking AI Status...
                    </>
                  ) : loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing Images...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Analyze EMAR
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={runPreflightCheck}
                  disabled={!file || !fileReady || loading || preflightLoading}
                >
                  {preflightLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Quick Check...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Run Quick Check
                    </>
                  )}
                </Button>
                {file && (
                  <Button
                    variant="ghost"
                    onClick={removeActiveRecord}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {(aiStatusLoading || !aiAvailable || Boolean(aiStatusMessage)) && (
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                    aiAvailable
                      ? "border-border/60 bg-muted/40 text-muted-foreground"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>
                      {aiStatusLoading
                        ? "Checking AI availability..."
                        : aiStatusMessage || "AI analysis is currently unavailable in this environment."}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={refreshAiStatus}
                    disabled={aiStatusLoading}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", aiStatusLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              )}
              {!aiStatusLoading && !aiAvailable && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-200" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        Continue in Manual Assurance Mode
                      </p>
                      <p className="text-xs text-amber-800/90 dark:text-amber-100/80 mt-1">
                        AI analysis is paused, but you can still complete a defensible review using Quick Check and a structured manual checklist.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={runPreflightCheck}
                      disabled={!file || !fileReady || preflightLoading}
                      className="border-amber-600/30 bg-background/80 hover:bg-background"
                    >
                      {preflightLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running Quick Check...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Run Quick Check
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyManualChecklist()}
                      className="border-amber-600/30 bg-background/80 hover:bg-background"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Manual Checklist
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={refreshAiStatus}
                      disabled={aiStatusLoading}
                    >
                      <RefreshCw className={cn("mr-2 h-4 w-4", aiStatusLoading && "animate-spin")} />
                      Retry AI
                    </Button>
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
                  <span>Show full service user name (admin view). Saved audits use initials.</span>
                </div>
              )}

              {preflightError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{preflightError}</span>
                </div>
              )}

              {preflightResult && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Preflight results
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>Pages: <span className="text-foreground font-medium">{preflightResult.pageCount}</span></span>
                    <span>Medications: <span className="text-foreground font-medium">{preflightResult.medicationCount}</span></span>
                    <span>Dates: <span className="text-foreground font-medium">{preflightResult.dateCount}</span></span>
                    <span>Time slots: <span className="text-foreground font-medium">{preflightResult.timeSlotCount}</span></span>
                    <span>Grid cells: <span className="text-foreground font-medium">{preflightResult.cellCount}</span></span>
                    <span>File size: <span className="text-foreground font-medium">{preflightResult.fileSizeMb} MB</span></span>
                  </div>
                  {preflightResult.warnings?.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200 space-y-1">
                      {preflightResult.warnings.map((warning, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 mt-0.5" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {loading && (
              <div className="space-y-3 p-4 glass-panel border border-border rounded-xl" data-testid="progress-container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground" data-testid="progress-status">{progressStatus}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground" data-testid="progress-percentage">
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress value={progress} className="h-2" data-testid="progress-bar" />
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <UploadDisclaimer />
            </div>
          </CardContent>
        </Card>
      ) : result && (
        <div className="space-y-10 animate-fade-in">
          {analyzedRecords.length > 1 && (
            <div className="flex items-center gap-4 bg-muted/20 border border-border/40 p-4 rounded-2xl">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-2">Active Stream:</span>
              <Select value={activeRecordId ?? ""} onValueChange={(value) => loadRecordById(value)}>
                <SelectTrigger className="w-full sm:w-80 bg-background border-border/60 rounded-xl font-semibold">
                  <SelectValue placeholder="Select an EMAR file" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60">
                  {analyzedRecords.map((record) => (
                    <SelectItem key={record.id} value={record.id} className="font-medium">
                      {record.file.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {detectedInitials.length > 0 && !mappingsConfirmed && (
            <Card className="border-primary/30 bg-primary/5 shadow-soft animate-scale-in">
              <CardHeader className="border-b border-primary/10 pb-6 mb-2">
                <CardTitle className="flex items-center gap-3 text-primary">
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  Namespace Resolution
                </CardTitle>
                <CardDescription className="text-primary/70 font-medium">
                  The neural engine detected unreferenced initials. Map these to the personnel database to proceed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {carerMappings.map((mapping, idx) => {
                  const matchingCarers = getMatchingCarers(mapping.initials);
                  return (
                    <div key={idx} className="bg-card rounded-lg p-4 space-y-3" data-testid={`carer-mapping-${idx}`}>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded font-mono font-semibold">
                          {mapping.initials}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <div className="flex-1">
                          <Select
                            value={mapping.isNew ? "create_new" : mapping.fullName}
                            onValueChange={(value) => handleCarerMappingChange(mapping.initials, value)}
                          >
                            <SelectTrigger className="bg-muted border-border" data-testid={`select-carer-${idx}`}>
                              <SelectValue placeholder="Select carer or create new..." />
                            </SelectTrigger>
                            <SelectContent>
                              {matchingCarers.length > 0 && (
                                <>
                                  <SelectItem value="__header_matching" disabled className="text-xs text-muted-foreground font-semibold">
                                    Matching Carers
                                  </SelectItem>
                                  {matchingCarers.map(carer => (
                                    <SelectItem key={carer.id} value={carer.name}>
                                      {carer.name} ({carer.role})
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                              {existingCarers.filter(c => !matchingCarers.includes(c)).length > 0 && (
                                <>
                                  <SelectItem value="__header_other" disabled className="text-xs text-muted-foreground font-semibold">
                                    Other Carers
                                  </SelectItem>
                                  {existingCarers.filter(c => !matchingCarers.includes(c)).slice(0, 10).map(carer => (
                                    <SelectItem key={carer.id} value={carer.name}>
                                      {carer.name} ({carer.role})
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                              <SelectItem value="create_new" className="text-primary">
                                <span className="flex items-center gap-2">
                                  <UserPlus className="h-4 w-4" />
                                  Create New Carer
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {mapping.fullName && !mapping.isNew && (
                          <span className="text-green-400 font-medium">{mapping.fullName}</span>
                        )}
                      </div>
                      
                      {mapping.isNew && (
                        <div className="flex gap-3 items-end pl-20">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">First Name</Label>
                            <Input
                              placeholder="e.g., Laura"
                              value={mapping.newFirstName || ""}
                              onChange={(e) => handleNewCarerNameChange(mapping.initials, e.target.value, mapping.newLastName || "")}
                              className="bg-muted border-border"
                              data-testid={`input-firstname-${idx}`}
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Last Name</Label>
                            <Input
                              placeholder="e.g., Barron"
                              value={mapping.newLastName || ""}
                              onChange={(e) => handleNewCarerNameChange(mapping.initials, mapping.newFirstName || "", e.target.value)}
                              className="bg-muted border-border"
                              data-testid={`input-lastname-${idx}`}
                            />
                          </div>
                          {mapping.fullName && (
                            <div className="text-sm text-teal-400">
                              Will be saved as: <span className="font-semibold">{mapping.fullName}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={confirmMappings}
                    disabled={!carerMappings.every(m => m.fullName && m.fullName.trim() !== "")}
                    data-testid="button-confirm-mappings"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Confirm Carer Identifications
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {sortedWarnings.length > 0 && (
            <Collapsible open={warningsOpen} onOpenChange={setWarningsOpen}>
              <Card className={warningCardClass}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className={`flex items-center justify-between ${warningHeaderTextClass}`}>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Warnings ({sortedWarnings.length})
                      </div>
                      {warningsOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Click to {warningsOpen ? 'hide' : 'view'} medication issues requiring attention
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    {sortedWarnings.map((warning, idx) => {
                      const severity = warning.severity ?? "low";
                      const styles = WARNING_SEVERITY_STYLES[severity];
                      const severityLabel = WARNING_SEVERITY_LABELS[severity] || "Low";
                      return (
                        <div key={idx} className={`border rounded-lg p-4 ${styles.card}`} data-testid={`warning-${idx}`}>
                          <div className="flex items-start gap-3">
                            <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${styles.accent}`} />
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles.badge}`}>
                                  {severityLabel}
                                </span>
                                <span className="px-2 py-0.5 bg-muted/40 text-muted-foreground rounded text-xs font-medium">
                                  {warning.type.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                {warning.medication && (
                                  <span className="text-foreground font-medium">
                                    {getMedicationDisplayName(warning.medication)}
                                  </span>
                                )}
                                {warning.frequency && (
                                  <span className="text-muted-foreground text-sm">({warning.frequency})</span>
                                )}
                              </div>
                              <p className="text-sm text-foreground leading-relaxed">{warning.description}</p>
                              <div className="mt-2 p-3 bg-background/50 border border-border rounded-lg">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Recommended action</p>
                                <p className="text-sm text-foreground">{warning.recommendedAction}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {result.userVerificationItems && result.userVerificationItems.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Verification Required ({result.userVerificationItems.length})
                </CardTitle>
                <CardDescription>
                  These cells need manual review. Tick each item once verified.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.userVerificationItems.map((item, idx) => (
                  <div key={`${item.medication}-${item.date}-${idx}`} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    <Checkbox
                      checked={verificationChecks[idx] || false}
                      onCheckedChange={(checked) =>
                        setVerificationChecks((prev) => ({ ...prev, [idx]: Boolean(checked) }))
                      }
                      data-testid={`checkbox-verification-${idx}`}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{getMedicationDisplayName(item.medication)}</span>
                        <span className="text-muted-foreground">{item.date}</span>
                        {item.timeSlot && <span className="text-muted-foreground">({item.timeSlot})</span>}
                        {item.code && <Badge variant="outline">{item.code}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.note}</p>
                      <p className="text-xs text-muted-foreground">Care worker: {getMappedCarerName(item.careWorkerName || "Unknown")}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.codeConflictDetected && (
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                  Code Conflict Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground mb-4">{result.codeConflictDetails}</p>
                <div className="bg-card p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-3">What is the service user's medication level?</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {['administer', 'assist', 'prompt'].map((level) => (
                      <Button
                        key={level}
                        variant={(pendingLevelOverride || medicationLevelOverride) === level ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setPendingLevelOverride(level);
                          setDiscrepanciesUpdated(false);
                        }}
                        data-testid={`button-level-${level}`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </Button>
                    ))}
                    {pendingLevelOverride && !discrepanciesUpdated && (
                      <Button
                        variant="default"
                        size="sm"
                        className="ml-2 gap-1.5"
                        onClick={() => {
                          setMedicationLevelOverride(pendingLevelOverride);
                          setDiscrepanciesUpdated(true);
                          toast({
                            title: "Discrepancies Updated",
                            description: `Discrepancies have been recalculated for ${pendingLevelOverride.charAt(0).toUpperCase() + pendingLevelOverride.slice(1)} level.`,
                          });
                        }}
                        data-testid="button-update-discrepancies"
                      >
                        <RefreshCw size={14} />
                        Update Discrepancies
                      </Button>
                    )}
                    {discrepanciesUpdated && (
                      <Badge variant="outline" className="text-green-400 border-green-400/50">
                        <CheckCircle2 size={14} className="mr-1" />
                        Updated
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="glass-card shadow-medium animate-slide-up stagger-3">
            <CardContent className="p-8">
              <div className="flex items-center justify-between mb-8 border-b border-border/40 pb-6 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight text-foreground">Operational Audit Log</h3>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Metadata Vector: {result.extractionMethod || 'Neural'}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadPDF}
                  className="rounded-xl border-border/60 font-semibold bg-background/50 gap-2 shadow-xs hover:shadow-sm transition-all"
                  data-testid="button-download-pdf"
                >
                  <Download size={15} />
                  Export PDF Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendEmarToExtension}
                  className="rounded-xl border-border/60 font-semibold bg-background/50 gap-2 shadow-xs hover:shadow-sm transition-all"
                  data-testid="button-send-emar-extension"
                >
                  <Activity size={15} />
                  Send to EMAR Extension
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
                <CopyableBox label="Service User" value={serviceUserDisplay} className="bg-muted/40 border border-border/40" />
                <CopyableBox label="Care Intensity" value={getServiceUserTypeDisplay()} className="bg-muted/40 border border-border/40" />
                <CopyableBox label="Verified By" value={auditorDisplay} className="bg-muted/40 border border-border/40" />
                <CopyableBox label="Window Start" value={result.auditPeriodStart} className="bg-muted/40 border border-border/40" />
                <CopyableBox label="Window End" value={result.auditPeriodEnd} className="bg-muted/40 border border-border/40" />
              </div>
              {result.extractionMethod && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">Extraction Method:</span>
                  <Badge variant="outline">
                    {result.extractionMethod === "grid-parser" ? "Grid Parser" : result.extractionMethod}
                  </Badge>
                </div>
              )}
              {result.medicationLevelEvidence && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Medication Level Evidence</p>
                  <p className="text-sm text-muted-foreground">{result.medicationLevelEvidence}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn(
            "glass-card border-l-4 shadow-medium transition-all duration-500",
            hasAnyDiscrepancies() ? "border-l-destructive bg-destructive/5" : "border-l-success bg-success/5"
          )}>
            <CardContent className="p-8">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110",
                    hasAnyDiscrepancies() ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"
                  )}>
                    {hasAnyDiscrepancies() ? <X className="h-8 w-8" /> : <Check className="h-8 w-8" />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Audit Consensus Status</p>
                    <h4 className={cn(
                      "text-2xl font-black tracking-tighter",
                      hasAnyDiscrepancies() ? "text-destructive" : "text-success"
                    )}>
                      {hasAnyDiscrepancies() ? "Critical Discrepancies Detected" : "Full Compliance Confirmed"}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="h-8 px-4 rounded-xl border-border/40 font-semibold text-foreground bg-background/50">
                    {getAllDiscrepancies().length} Incidents
                  </Badge>
                  <CopyButton text={hasAnyDiscrepancies() ? "Yes" : "No"} label="discrepancies-answer" />
                </div>
              </div>
            </CardContent>
          </Card>

          {hasAnyDiscrepancies() && (
            <Card className="glass-card shadow-medium animate-slide-up stagger-4 overflow-hidden border-destructive/20">
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap bg-destructive/5 border-b border-border/40 py-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive shadow-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Incident Inventory</CardTitle>
                    <CardDescription className="font-semibold text-destructive/80 uppercase tracking-tighter text-xs">
                      {getAllDiscrepancies().length} TOTAL DISCREPANCIES · {getGroupedDiscrepancies.length} STAFF MEMBERS
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {user?.role === 'admin' && (
                    <Button
                      size="sm"
                      variant={editMode ? "default" : "outline"}
                      onClick={() => setEditMode(!editMode)}
                      className={cn(
                        "rounded-xl font-medium tracking-tight gap-2 transition-all",
                        editMode ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20" : "border-border/60"
                      )}
                      data-testid="button-toggle-edit-mode"
                    >
                      <Pencil size={14} />
                      {editMode ? "Lock Pipeline" : "Override Mode"}
                    </Button>
                  )}
                  {user?.role === 'admin' && corrections.size > 0 && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={applyAllCorrections}
                      className="gap-1.5 bg-teal-600 hover:bg-teal-700"
                      data-testid="button-apply-corrections"
                    >
                      <Save size={14} />
                      Apply {corrections.size} Correction{corrections.size !== 1 ? 's' : ''}
                    </Button>
                  )}
                  <TableCopyButton text={getDiscrepanciesTableFormat()} label="discrepancies-table" />
                  <CopyButton text={getAllDiscrepanciesText()} label="all-discrepancies" />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Non-Conformance Table - User Requested Format */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-destructive/5 border-b border-border/40">
                        <TableHead className="w-48 font-semibold text-foreground">Care Worker Name</TableHead>
                        <TableHead className="w-32 font-semibold text-foreground">Dates</TableHead>
                        <TableHead className="font-semibold text-foreground">Details of Non-Conformance</TableHead>
                        <TableHead className="w-24 text-center font-semibold text-foreground">No. of Occurrences</TableHead>
                        <TableHead className="w-56 font-semibold text-foreground">Actions Taken</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getGroupedDiscrepancies.map((group, idx) => {
                        // Get carer name with initials/full name format
                        const carerMapping = carerMappings.find(m => m.initials === group.careWorkerName);
                        let displayName = group.careWorkerName;
                        if (carerMapping?.fullName) {
                          displayName = `${carerMapping.initials} / ${carerMapping.fullName}`;
                        } else if (group.careWorkerName.length <= 3 && group.careWorkerName === group.careWorkerName.toUpperCase()) {
                          displayName = `${group.careWorkerName} (Initials)`;
                        }
                        
                        // Format: "(DD/MM) Used incorrect medication code on X, Code used was Y when medication level is Z"
                        const formattedIssues = group.reasonsWithDates.map(r => {
                          // Most issues from deriveCodeDiscrepancies should already have the date prefix
                          // For legacy issues without date prefix, add it
                          if (r.issue.startsWith('(')) {
                            return r.issue;
                          }
                          const shortDate = formatShortDate(r.date);
                          const parts = shortDate.split('/');
                          const day = parts[0]?.padStart(2, '0') || '00';
                          const month = parts[1]?.padStart(2, '0') || '00';
                          return `(${day}/${month}) ${r.issue}`;
                        });
                        
                        const shortDates = group.dates.map(formatShortDate).join(", ");
                        
                        return (
                          <TableRow 
                            key={idx} 
                            className="border-b border-border/20 hover:bg-destructive/5"
                            data-testid={`discrepancy-row-${idx}`}
                          >
                            {/* Care Worker Name */}
                            <TableCell className="align-top py-3">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-foreground">{displayName}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1 text-xs gap-1 text-muted-foreground hover:text-foreground w-fit"
                                  onClick={() => {
                                    navigator.clipboard.writeText(displayName);
                                    toast({ title: "Copied", description: "Name copied" });
                                  }}
                                >
                                  <Copy size={10} /> Copy
                                </Button>
                              </div>
                            </TableCell>
                            
                            {/* Dates of Non-Conformance */}
                            <TableCell className="align-top py-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-sm text-foreground">{shortDates}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1 text-xs gap-1 text-muted-foreground hover:text-foreground w-fit"
                                  onClick={() => {
                                    navigator.clipboard.writeText(shortDates);
                                    toast({ title: "Copied", description: "Dates copied" });
                                  }}
                                >
                                  <Copy size={10} /> Copy
                                </Button>
                              </div>
                            </TableCell>
                            
                            {/* Details of Non-Conformance */}
                            <TableCell className="align-top py-3">
                              <div className="flex flex-col gap-1.5">
                                {formattedIssues.map((issue, issueIdx) => (
                                  <div key={issueIdx} className="text-sm text-destructive">
                                    {issue}
                                  </div>
                                ))}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1 text-xs gap-1 text-muted-foreground hover:text-foreground w-fit mt-1"
                                  onClick={() => {
                                    navigator.clipboard.writeText(formattedIssues.join('\n'));
                                    toast({ title: "Copied", description: "Details copied" });
                                  }}
                                >
                                  <Copy size={10} /> Copy Details
                                </Button>
                              </div>
                            </TableCell>
                            
                            {/* Number of Occurrences */}
                            <TableCell className="align-top py-3 text-center">
                              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-red-500/20 text-red-400 font-semibold">
                                {group.totalCount}
                              </span>
                            </TableCell>
                            
                            {/* Actions Taken (Multiple Choice) */}
                            <TableCell className="align-top py-3">
                              <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                  <Checkbox 
                                    checked={group.discrepancies.some(d => d.actions.notesRecorded)}
                                    onCheckedChange={(checked) => {
                                      // Update all discrepancies in this group
                                      setAddedDiscrepancies(prev => 
                                        prev.map(d => 
                                          d.careWorkerName === group.careWorkerName 
                                            ? { ...d, actions: { ...d.actions, notesRecorded: !!checked } }
                                            : d
                                        )
                                      );
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-muted-foreground hover:text-foreground">Recorded in Care Workers Notes</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                  <Checkbox 
                                    checked={group.discrepancies.some(d => d.actions.discussedWithStaff)}
                                    onCheckedChange={(checked) => {
                                      setAddedDiscrepancies(prev => 
                                        prev.map(d => 
                                          d.careWorkerName === group.careWorkerName 
                                            ? { ...d, actions: { ...d.actions, discussedWithStaff: !!checked } }
                                            : d
                                        )
                                      );
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-muted-foreground hover:text-foreground">Discussed with Care Worker</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                  <Checkbox 
                                    checked={group.discrepancies.some(d => d.actions.escalatedToManager)}
                                    onCheckedChange={(checked) => {
                                      setAddedDiscrepancies(prev => 
                                        prev.map(d => 
                                          d.careWorkerName === group.careWorkerName 
                                            ? { ...d, actions: { ...d.actions, escalatedToManager: !!checked } }
                                            : d
                                        )
                                      );
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-muted-foreground hover:text-foreground">Escalated to Manager</span>
                                </label>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Drug Interactions Section */}
          {result?.drugInteractions && result.drugInteractions.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  Drug Interactions ({result.drugInteractions.length})
                </CardTitle>
                <CardDescription>
                  Potential drug interactions detected between medications in this EMAR.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.drugInteractions.map((interaction, idx) => {
                  const severityColors = {
                    high: 'border-red-500/50 bg-red-500/10 text-red-400',
                    moderate: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
                    low: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
                  };
                  const severityBadgeColors = {
                    high: 'bg-red-500/20 text-red-400',
                    moderate: 'bg-yellow-500/20 text-yellow-400',
                    low: 'bg-blue-500/20 text-blue-400',
                  };
                  
                  return (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 ${severityColors[interaction.severity]}`}
                      data-testid={`drug-interaction-${idx}`}
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-medium text-foreground">{interaction.drug1}</span>
                            <span className="text-muted-foreground">+</span>
                            <span className="font-medium text-foreground">{interaction.drug2}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityBadgeColors[interaction.severity]}`}>
                              {interaction.severity.charAt(0).toUpperCase() + interaction.severity.slice(1)} Severity
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{interaction.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Reasons Not Administered - Unified Refusal Section */}
          {unifiedRefusals.length > 0 && (
            <Card className="glass-card shadow-medium animate-slide-up stagger-5 border-amber-500/20 overflow-hidden">
              <CardHeader className="bg-amber-500/5 border-b border-border/40 py-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 shadow-sm">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Governance Review: Exceptions</CardTitle>
                      <CardDescription className="font-semibold text-amber-600/80 uppercase tracking-tighter text-xs">
                        {totalRefusalCount} ENTRIES REQUIRING OPERATIONAL JUSTIFICATION
                      </CardDescription>
                    </div>
                  </div>
                  {!refusalReviewSubmitted && (
                    <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-xl border border-border/60">
                       <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pipeline Progress:</p>
                       <span className="text-sm font-black text-amber-500">{getRefusalReviewStats.reviewed}/{getRefusalReviewStats.total}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {refusalReviewSubmitted ? (
                  <div className="bg-success/10 border border-success/20 rounded-2xl p-6 flex items-center gap-4 animate-scale-in">
                    <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center text-success shadow-sm">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-lg font-black tracking-tight text-success uppercase">EXCEPTION REVIEW FINALIZED</p>
                      <p className="text-sm font-medium text-muted-foreground">
                        {getRefusalReviewStats.acceptable} instances verified. {getRefusalReviewStats.toEscalate} instances migrated to Discrepancy Log.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Accordion type="multiple" value={reasonsNotAdministeredOpen} onValueChange={setReasonsNotAdministeredOpen} className="space-y-4">
                      {unifiedRefusals.map((codeGroup) => {
                        const codeReviewedCount = codeGroup.items.filter(item => refusalDecisions[item.key] !== undefined && refusalDecisions[item.key] !== null).length;
                        const allCodeReviewed = codeReviewedCount === codeGroup.count;
                        
                        return (
                          <AccordionItem 
                            key={codeGroup.code} 
                            value={codeGroup.code}
                            className="border border-border/40 rounded-2xl overflow-hidden bg-muted/20"
                            data-testid={`refusal-code-group-${codeGroup.code}`}
                          >
                            <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30 transition-all">
                              <div className="flex items-center gap-4 flex-1">
                                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-xs border border-amber-500/20">
                                  {codeGroup.code}
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-semibold text-foreground leading-none mb-1">{codeGroup.displayName}</p>
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{codeGroup.count} VECTORS</p>
                                </div>
                                {allCodeReviewed ? (
                                  <Badge className="bg-success/15 text-success border-success/20 rounded-lg font-black text-[10px] ml-auto mr-4">REVIEWED</Badge>
                                ) : codeReviewedCount > 0 && (
                                  <Badge variant="outline" className="text-amber-500 border-amber-500/30 rounded-lg font-black text-[10px] ml-auto mr-4">{codeReviewedCount}/{codeGroup.count} COMPLETE</Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-5 pb-5">
                              <div className="space-y-3 mt-2">
                                {codeGroup.items.map((item, itemIdx) => {
                                  const decision = refusalDecisions[item.key];
                                  const isAcceptable = decision === 'acceptable';
                                  const isEscalate = decision === 'escalate';
                                  
                                  return (
                                    <div 
                                      key={item.key}
                                      className={cn(
                                        "flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border transition-all duration-300",
                                        isEscalate ? "bg-destructive/10 border-destructive/30 shadow-lg shadow-destructive/5" :
                                        isAcceptable ? "bg-success/10 border-success/30 shadow-lg shadow-success/5" :
                                        "bg-background border-border/60"
                                      )}
                                      data-testid={`refusal-item-${codeGroup.code}-${itemIdx}`}
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className="space-y-1">
                                           <p className="text-sm font-black text-foreground leading-none">{item.careWorkerName}</p>
                                           <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tighter">{item.date}</span>
                                              {item.timeSlot && <span className="h-1 w-1 rounded-full bg-border" />}
                                              {item.timeSlot && <span className="text-[10px] font-semibold text-primary uppercase tracking-tighter">{item.timeSlot}</span>}
                                           </div>
                                        </div>
                                        <div className="h-8 w-[1px] bg-border/40 mx-2" />
                                        <p className="text-sm font-medium text-muted-foreground">{getMedicationDisplayName(item.medication)}</p>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <Button
                                          size="sm"
                                          variant={isAcceptable ? "default" : "outline"}
                                          className={cn(
                                            "h-9 px-4 rounded-lg font-semibold text-[10px] uppercase tracking-widest transition-all",
                                            isAcceptable ? "bg-success hover:bg-success/90 text-white" : "border-success/30 text-success hover:bg-success/10"
                                          )}
                                          onClick={() => handleRefusalDecision(item.key, 'acceptable')}
                                          data-testid={`button-acceptable-${codeGroup.code}-${itemIdx}`}
                                        >
                                          <Check size={14} className="mr-1.5" />
                                          VERIFY
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={isEscalate ? "destructive" : "outline"}
                                          className={cn(
                                            "h-9 px-4 rounded-lg font-semibold text-[10px] uppercase tracking-widest transition-all",
                                            isEscalate ? "bg-destructive hover:bg-destructive/90 text-white" : "border-destructive/30 text-destructive hover:bg-destructive/10"
                                          )}
                                          onClick={() => handleRefusalDecision(item.key, 'escalate')}
                                          data-testid={`button-escalate-${codeGroup.code}-${itemIdx}`}
                                        >
                                          <X size={14} className="mr-1.5" />
                                          ESCALATE
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-border/40">
                      <div className="flex items-center gap-3">
                        {getRefusalReviewStats.pending > 0 ? (
                          <div className="flex items-center gap-2 text-amber-500 animate-pulse">
                            <Clock size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">{getRefusalReviewStats.pending} PENDING DECISION</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle2 size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">READY FOR COMMIT</span>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleSubmitRefusalReview}
                        disabled={getRefusalReviewStats.reviewed === 0}
                        className="h-11 px-8 rounded-xl font-medium tracking-tight shadow-glow group"
                        data-testid="button-submit-refusal-review"
                      >
                        {getRefusalReviewStats.toEscalate > 0 && (
                          <AlertTriangle className="h-4 w-4 mr-2.5 group-hover:scale-110 transition-transform" />
                        )}
                        COMMIT REVIEW
                        {getRefusalReviewStats.toEscalate > 0 && ` (${getRefusalReviewStats.toEscalate} ESCALATIONS)`}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass-card shadow-medium animate-slide-up stagger-6 overflow-hidden border-amber-500/10">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 py-6 bg-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 shadow-sm">
                  <Pill size={20} />
                </div>
                <div>
                   <CardTitle className="text-lg">Clinical Governance: PRN Protocols</CardTitle>
                   <CardDescription className="text-xs font-semibold uppercase tracking-widest text-amber-600/70">PRN medication compliance verification</CardDescription>
                </div>
              </div>
	              <CopyButton 
	                text={result.prnMedications.hasPRN 
	                  ? `PRN Medications: ${result.prnMedications.medications
	                      .map((m) => getMedicationDisplayName(typeof m === 'string' ? m : m.name))
	                      .join(', ')}` 
	                  : 'No PRN medications'} 
	                label="prn-section" 
	              />
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center gap-6 p-4 rounded-2xl bg-muted/20 border border-border/40">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">PRN Vectors Detected:</p>
                {result.prnMedications.hasPRN ? (
                  <div className="flex items-center gap-2 text-amber-500 font-black text-xs uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" /> CONFIRMED
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-success font-black text-xs uppercase tracking-widest bg-success/10 px-3 py-1 rounded-full border border-success/20">
                    <CheckCircle2 className="h-3.5 w-3.5" /> NONE
                  </div>
                )}
              </div>

              {result.prnMedications.hasPRN && (
                <div className="space-y-6 animate-slide-up">
                  <div className="bg-muted/10 rounded-2xl p-5 border border-border/40">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">MAPPED ASSETS</p>
	                    <div className="flex flex-wrap gap-2.5">
	                      {result.prnMedications.medications.map((med, idx) => (
	                        <span key={idx} className="px-4 py-1.5 bg-background border border-border/60 text-foreground font-semibold rounded-xl text-[11px] shadow-xs">
	                          {getMedicationDisplayName(typeof med === 'string' ? med : med.name)}
	                        </span>
	                      ))}
	                    </div>
                  </div>

                  {prnProtocolsSubmitted ? (
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 animate-scale-in">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">PROTOCOL STATUS VERIFIED</p>
                      {prnProtocolChecks.every(p => p.isCompleted && p.isGoodStandard) ? (
                        <div className="flex items-center gap-3 text-success">
                          <div className="h-10 w-10 rounded-xl bg-success/20 flex items-center justify-center border border-success/20">
                             <Check className="h-6 w-6" />
                          </div>
                          <div>
                             <p className="text-base font-black tracking-tight uppercase">ALL PROTOCOLS OPTIMIZED</p>
                             <p className="text-xs font-medium text-muted-foreground">Compliance standard met across all identified PRN vectors.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 text-destructive">
                             <div className="h-10 w-10 rounded-xl bg-destructive/20 flex items-center justify-center border border-destructive/20">
                                <X className="h-6 w-6" />
                             </div>
                             <div>
                                <p className="text-base font-black tracking-tight uppercase">PROTOCOL DRIFT DETECTED</p>
                                <p className="text-xs font-medium text-muted-foreground">Immediate remedial action required for the following assets:</p>
                             </div>
                          </div>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            {prnProtocolChecks.map((check, idx) => {
                              if (check.isCompleted && check.isGoodStandard) return null;
                              const issues = [];
                              if (!check.isCompleted) issues.push("not completed");
                              if (!check.isGoodStandard) issues.push("not to a good standard");
	                              return (
	                                <li key={idx}>
	                                  <span className="text-foreground font-medium">
	                                    {getMedicationDisplayName(check.medication)}
	                                  </span>{" "}
	                                  - {issues.join(" and ")}
	                                </li>
	                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-4">Are the PRN protocols completed and to a good standard?</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Medication</TableHead>
                            <TableHead>Protocol</TableHead>
                            <TableHead className="text-center">Completed?</TableHead>
                            <TableHead className="text-center">Good Standard?</TableHead>
                            <TableHead className="text-center">Generate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
	                          {result.prnMedications.medications.map((med, idx) => {
	                            const medName = typeof med === 'string' ? med : med.name;
	                            const medDisplayName = getMedicationDisplayName(medName);
	                            const protocol = typeof med === 'string' ? 'Standard PRN protocol required' : med.protocol;
	                            const isCompleted = prnProtocolChecks[idx]?.isCompleted || false;
	                            const isGoodStandard = prnProtocolChecks[idx]?.isGoodStandard || false;
	                            const needsProtocol = !isCompleted || !isGoodStandard;
	                            return (
	                              <TableRow key={idx}>
	                                <TableCell className="text-foreground font-medium">{medDisplayName}</TableCell>
	                                <TableCell className="text-muted-foreground text-sm">{protocol}</TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={isCompleted}
                                    onCheckedChange={(checked) => {
                                      setPrnProtocolChecks(prev => {
                                        const updated = [...prev];
                                        if (updated[idx]) {
                                          updated[idx] = { 
                                            ...updated[idx], 
                                            isCompleted: !!checked,
                                            isGoodStandard: !checked ? false : updated[idx].isGoodStandard 
                                          };
                                        }
                                        return updated;
                                      });
                                    }}
                                    data-testid={`checkbox-prn-completed-${idx}`}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={isGoodStandard}
                                    disabled={!isCompleted}
                                    onCheckedChange={(checked) => {
                                      setPrnProtocolChecks(prev => {
                                        const updated = [...prev];
                                        if (updated[idx]) {
                                          updated[idx] = { ...updated[idx], isGoodStandard: !!checked };
                                        }
                                        return updated;
                                      });
                                    }}
                                    data-testid={`checkbox-prn-standard-${idx}`}
                                    className={!isCompleted ? "opacity-50 cursor-not-allowed" : ""}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  {needsProtocol && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => generatePRNProtocol(medName)}
                                      disabled={generatingProtocol !== null}
                                      data-testid={`button-generate-prn-${idx}`}
                                    >
                                      {generatingProtocol === medName ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="mt-4 flex justify-end">
                        <Button onClick={handlePRNProtocolSubmit} data-testid="button-submit-prn-protocols">
                          Submit PRN Review
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {result.officeClosedEntries && result.officeClosedEntries.length > 0 && (
            <Card className="glass-card shadow-medium animate-slide-up stagger-7 overflow-hidden border-blue-500/20" data-testid="card-office-closed-entries">
              <CardHeader className="bg-blue-500/5 flex flex-row items-center justify-between border-b border-border/40 py-6">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500 shadow-sm">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Back-Office Interventions</CardTitle>
                    <CardDescription className="font-semibold text-blue-600/80 uppercase tracking-tighter text-xs">
                      {result.officeClosedEntries.length} MANUAL ENTRIES DETECTED
                    </CardDescription>
                  </div>
                </div>
	                <CopyButton 
	                  text={result.officeClosedEntries
	                    .map(
	                      (e) =>
	                        `${getMedicationDisplayName(e.medication)} - ${e.date} ${e.timeSlot} (${e.code}) closed by ${e.closedByStaff}`
	                    )
	                    .join('\n')} 
	                  label="office-closed" 
	                />
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1" data-testid="text-office-closed-description">
                  Administrative overrides (red box codes without initials). These are excluded from temporal gap metrics.
                </p>
                <div className="rounded-2xl border border-border/40 overflow-hidden bg-muted/10">
                  <Table data-testid="table-office-closed">
                    <TableHeader className="bg-muted/30">
                      <TableRow className="border-border/40">
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">Medication</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">Date</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">Time Slot</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">Code</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">Staff</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest text-right">Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.officeClosedEntries.map((entry, idx) => (
                        <TableRow key={idx} data-testid={`row-office-closed-${idx}`} className="border-border/20 hover:bg-muted/20 transition-colors">
	                          <TableCell className="font-semibold text-xs" data-testid={`cell-medication-${idx}`}>{getMedicationDisplayName(entry.medication)}</TableCell>
                          <TableCell className="text-xs font-medium text-muted-foreground" data-testid={`cell-date-${idx}`}>{entry.date}</TableCell>
                          <TableCell className="text-xs font-medium text-muted-foreground" data-testid={`cell-timeslot-${idx}`}>{entry.timeSlot}</TableCell>
                          <TableCell data-testid={`cell-code-${idx}`}>
                            <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20 rounded-lg font-black text-[10px]">
                              {entry.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-blue-500 font-black text-[10px] uppercase tracking-tighter" data-testid={`cell-closedby-${idx}`}>{entry.closedByStaff || 'OFFICE'}</TableCell>
                          <TableCell className="text-muted-foreground text-xs font-medium text-right" data-testid={`cell-closedtime-${idx}`}>{entry.closedTime || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-6 animate-slide-up stagger-8">
            <Card className="glass-card overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-4 flex flex-row items-center justify-between bg-primary/5">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Consensus Intelligence</CardTitle>
                <CopyButton text={result.themesAndTrends} label="themes" />
              </CardHeader>
              <CardContent className="pt-5">
                <p className="text-sm font-medium text-foreground/80 leading-relaxed">{result.themesAndTrends}</p>
              </CardContent>
            </Card>

            <Card className="glass-card overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-4 flex flex-row items-center justify-between bg-primary/5">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Training Gaps identified</CardTitle>
                <CopyButton text={result.gapsInKnowledge} label="gaps" />
              </CardHeader>
              <CardContent className="pt-5">
                <p className="text-sm font-medium text-foreground/80 leading-relaxed">{result.gapsInKnowledge}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-10 border-t border-border/40 animate-slide-up stagger-9">
            <div className="flex-1 w-full max-w-sm">
              <CopyableBox label="Audit Finalization Sequence" value={formatDate(new Date())} className="glass-card border-border/40 bg-muted/10 shadow-xs" />
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <Button variant="outline" onClick={removeActiveRecord} className="flex-1 sm:flex-initial h-12 px-8 rounded-xl font-medium tracking-tight border-border/60 hover:bg-muted/40 transition-all" data-testid="button-start-new-emar">
                RESET PIPELINE
              </Button>
              <Button
                onClick={saveAudit}
                disabled={loading}
                className="flex-1 sm:flex-initial h-12 px-8 rounded-xl font-medium tracking-tight shadow-glow bg-gradient-to-r from-primary to-blue-600 border-0"
                data-testid="button-save-emar-audit"
              >
                {loading ? "SAVING..." : "COMMIT AUDIT"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Entry
            </DialogTitle>
            <DialogDescription>
              Fix AI extraction mistakes. Changes are saved locally until you apply corrections.
            </DialogDescription>
          </DialogHeader>
          
          {editingEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-careworker">Care Worker Initials</Label>
                  <Input
                    id="edit-careworker"
                    value={editingEntry.careWorkerName}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, careWorkerName: e.target.value } : null)}
                    data-testid="input-edit-careworker"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    value={editingEntry.date}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, date: e.target.value } : null)}
                    data-testid="input-edit-date"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-timeslot">Time Slot</Label>
                  <Input
                    id="edit-timeslot"
                    value={editingEntry.timeSlot}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, timeSlot: e.target.value } : null)}
                    placeholder="e.g., Morning, Lunch, Evening"
                    data-testid="input-edit-timeslot"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-code">Code</Label>
                  <Select
                    value={editingEntry.code}
                    onValueChange={(value) => setEditingEntry(prev => prev ? { ...prev, code: value } : null)}
                  >
                    <SelectTrigger id="edit-code" data-testid="select-edit-code">
                      <SelectValue placeholder="Select code..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EMAR_CODES.map(code => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-medication">Medication Name</Label>
                <Input
                  id="edit-medication"
                  value={editingEntry.medication}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, medication: e.target.value } : null)}
                  data-testid="input-edit-medication"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-issue">Issue/Note</Label>
                <Textarea
                  id="edit-issue"
                  value={editingEntry.issue}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, issue: e.target.value } : null)}
                  className="min-h-[80px]"
                  data-testid="input-edit-issue"
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingEntry(null); }} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={saveCorrection} data-testid="button-save-correction">
              <Save className="h-4 w-4 mr-2" />
              Save Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={protocolDialogOpen} onOpenChange={setProtocolDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generated PRN Protocol
            </DialogTitle>
            <DialogDescription>
              AI-generated protocol based on UK care standards. Please review and adjust as needed.
            </DialogDescription>
          </DialogHeader>
          
          {generatedProtocol && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Medication Name</Label>
                    <p className="text-sm font-medium">{generatedProtocol.medicationName}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Dose</Label>
                    <p className="text-sm">{generatedProtocol.dose}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Route</Label>
                    <p className="text-sm">{generatedProtocol.route}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Frequency</Label>
                    <p className="text-sm">{generatedProtocol.frequency}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Max Dose in 24 Hours</Label>
                    <p className="text-sm">{generatedProtocol.maxDoseIn24Hours}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Min Time Between Doses</Label>
                    <p className="text-sm">{generatedProtocol.minimumTimeBetweenDoses}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Special Instructions</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{generatedProtocol.specialInstructions}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Reasons for Administration</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{generatedProtocol.reasonsForAdministration}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Predictable Side Effects</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{generatedProtocol.predictableSideEffects}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Additional Comments</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{generatedProtocol.additionalComments}</p>
                </div>
              </div>
            </ScrollArea>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => generatedProtocol && generatePRNProtocol(generatedProtocol.medicationName)}
              disabled={generatingProtocol !== null}
              data-testid="button-regenerate-protocol"
            >
              {generatingProtocol ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
            <Button onClick={copyProtocolToClipboard} data-testid="button-copy-protocol">
              <Copy className="h-4 w-4 mr-2" />
              Copy Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
