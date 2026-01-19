import { useState, useEffect, useRef, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Copy, FileText, Check, X, AlertTriangle, Loader2, TableIcon, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, UserPlus, Users, Sparkles, RefreshCw, Pencil, Undo2, Save, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import UploadDisclaimer from "@/components/UploadDisclaimer";
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
}

interface Discrepancy {
  careWorkerName: string;
  date: string;
  medication: string;
  issue: string;
  actions: DiscrepancyAction;
}

interface Warning {
  type: string;
  severity?: "critical" | "high" | "medium" | "low";
  medication: string;
  description: string;
  frequency?: string;
  recommendedAction: string;
}

interface UserVerificationItem {
  careWorkerName: string;
  date: string;
  medication: string;
  code: string;
  note: string;
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

interface OfficeClosedEntry {
  medication: string;
  date: string;
  timeSlot: string;
  code: string;
  closedByStaff: string;
  closedTime: string;
}

interface SupportCodeEntry {
  careWorkerName: string;
  medication: string;
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

const TableCopyButton = memo(function TableCopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ 
      title: "Table Copied", 
      description: "Formatted for pasting into Access forms. Use Ctrl+V to paste." 
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="h-7 gap-1.5 text-xs bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20" 
      onClick={handleCopy} 
      data-testid={`button-copy-table-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}
    >
      {copied ? <Check size={12} /> : <TableIcon size={12} />}
      Copy as Table
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
  const { user } = useAuth();
  const { toast } = useToast();
  const { resetTimer } = useTemporaryData();
  const [file, setFile] = useState<File | null>(null);
  const [documentContent, setDocumentContent] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmarAnalysisResult | null>(null);
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
    if (result?.prnMedications?.hasPRN) {
      const meds = result.prnMedications.medications;
      const initialChecks: PRNProtocolCheck[] = meds.map((med) => ({
        medication: typeof med === 'string' ? med : med.name,
        isCompleted: false,
        isGoodStandard: false,
      }));
      setPrnProtocolChecks(initialChecks);
    }
  }, [result]);

  const sortedWarnings = useMemo(() => {
    const warnings = result?.warnings ? [...result.warnings] : [];
    return warnings.sort((a, b) => {
      const aRank = WARNING_SEVERITY_ORDER[a.severity ?? "low"];
      const bRank = WARNING_SEVERITY_ORDER[b.severity ?? "low"];
      if (aRank !== bRank) return aRank - bRank;
      return (a.medication || "").localeCompare(b.medication || "");
    });
  }, [result?.warnings]);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
      
      if (isPdf) {
        // For PDFs, just store the file - we'll send it directly for image-based analysis
        setDocumentContent("PDF file ready for image analysis");
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
          resetTimer();
        };
        reader.readAsText(selectedFile);
      }
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

      const response = await fetch(`/api/ai/analyze-emar`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      // Check for non-streaming error responses (auth failures, server errors)
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('event-stream')) {
        // Try to parse as JSON error
        try {
          const error = await response.json();
          throw new Error(error.message || `Server error: ${response.status}`);
        } catch {
          throw new Error(`Analysis failed with status ${response.status}`);
        }
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
              setProgress(data.percent);
              setProgressStatus(data.status);
            } else if (eventType === 'result') {
              setResult(data);
              setAnalyzed(true);
              receivedResult = true;
              toast({ title: "Analysis Complete", description: "EMAR analysis processed successfully." });
            } else if (eventType === 'warning') {
              const message = data.message || "Warning";
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
              receivedResult = true;
              toast({ title: "Analysis Complete", description: "EMAR analysis processed successfully." });
            } else if (eventType === 'warning') {
              const message = data.message || "Warning";
              const isHighSeverity = /alert|high[-\s]severity/i.test(message);
              toast({
                title: "Warning",
                description: message,
                variant: isHighSeverity ? "destructive" : "default",
              });
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
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze document",
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

      const auditData = {
        serviceUserName: serviceUserDisplay,
        auditor: user.username,
        auditType: "EMAR",
        periodStart: result.auditPeriodStart,
        periodEnd: result.auditPeriodEnd,
        results: {
          ...result,
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

      toast({ 
        title: "Audit Saved", 
        description: "Audit results have been recorded." 
      });

      setAnalyzed(false);
      setFile(null);
      setDocumentContent("");
      setResult(null);
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
  const getDiscrepancyKey = (careWorker: string, date: string, medication: string, timeSlot?: string) => 
    `${careWorker}|${date}|${medication}|${timeSlot || ''}`.toLowerCase();

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
      code: string
    ) => {
      const key = getDiscrepancyKey(careWorkerName, date, medication);
      if (processedDiscrepancyKeys.has(key)) return;
      processedDiscrepancyKeys.add(key);
      
      const codeDisplayName = code === 'AS' ? 'Assist' : 
                              code === 'AD' ? 'Administer' : 
                              code === 'P' ? 'Prompt' : code;
      const levelDisplayName = level.charAt(0).toUpperCase() + level.slice(1);
      
      derivedDiscrepancies.push({
        careWorkerName,
        date,
        medication,
        issue: `${codeDisplayName} code (${code}) used but service user is ${levelDisplayName} level`,
        actions: {
          performanceNote: true,
          meeting: "none",
          referToManager: false,
        },
      });
    };
    
    // Process entries - track ALL code entries for filtering, but only create discrepancies for INVALID codes
    const processEntry = (
      careWorkerName: string,
      date: string,
      medication: string,
      code?: string
    ) => {
      const entryCode = (code || '').toUpperCase();
      if (supportCodes.includes(entryCode)) {
        // Track ALL code entries (valid or invalid) so we can filter out AI discrepancies about them
        const key = getDiscrepancyKey(careWorkerName, date, medication);
        allCodeEntryKeys.add(key);
        
        // Only create discrepancies for INVALID codes
        if (mapping.invalidCodes.includes(entryCode)) {
          addCodeDiscrepancy(careWorkerName, date, medication, entryCode);
        }
      }
    };
    
    // Process groupedMainRefusals
    analysisResult.groupedMainRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        processEntry(refusal.careWorkerName, dateItem.date, refusal.medication, dateItem.code || refusal.code);
      });
    });
    
    // Process groupedPrnRefusals
    analysisResult.groupedPrnRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        processEntry(refusal.careWorkerName, dateItem.date, refusal.medication, dateItem.code || refusal.code);
      });
    });
    
    // Process officeClosedEntries
    analysisResult.officeClosedEntries?.forEach(entry => {
      processEntry(entry.closedByStaff, entry.date, entry.medication, entry.code);
    });
    
    // Process userVerificationItems
    analysisResult.userVerificationItems?.forEach(item => {
      processEntry(item.careWorkerName, item.date, item.medication, item.code);
    });
    
    // Process supportCodeEntries - this is the primary source for AS/AD/P code entries
    // This data comes from the backend and contains ALL entries with support level codes
    analysisResult.supportCodeEntries?.forEach(entry => {
      processEntry(entry.careWorkerName, entry.date, entry.medication, entry.code);
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
        const key = getDiscrepancyKey(d.careWorkerName, d.date, d.medication);
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
  const serviceUserDisplay = useMemo(() => {
    if (!result) return "N.N.";
    return formatServiceUserInitials(result.serviceUserInitials || result.serviceUserName);
  }, [result]);

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
      
      const prnList = result.prnMedications.medications.map((m: any) => 
        typeof m === 'string' ? m : m.name
      ).join(', ');
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
        // Collect unique actions
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
      'FA': 'Family Administered (FA)',
      'SA': 'Self-Administered (SA)',
      'PRN-R': 'PRN Refused (PRN-R)',
      'PRN-NA': 'PRN Not Administered (PRN-NA)',
    };

    result?.groupedMainRefusals?.forEach(refusal => {
      refusal.dates.forEach(dateItem => {
        const code = dateItem.code || refusal.code || 'R';
        const key = `main|${refusal.careWorkerName}|${refusal.medication}|${dateItem.date}|${dateItem.timeSlot || ''}`;
        const item: UnifiedRefusalItem = {
          careWorkerName: getMappedCarerName(refusal.careWorkerName),
          medication: refusal.medication,
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
        const key = `prn|${refusal.careWorkerName}|${refusal.medication}|${dateItem.date}|${dateItem.timeSlot || ''}`;
        const item: UnifiedRefusalItem = {
          careWorkerName: getMappedCarerName(refusal.careWorkerName),
          medication: refusal.medication,
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

  const EMAR_CODES = ['AD', 'AS', 'R', 'MU', 'NH', 'FA', 'SA', 'PRN', 'PRN-R'];

  const generateEntryKey = (careWorkerName: string, date: string, medication: string, timeSlot?: string): string => {
    return `${careWorkerName}|${date}|${medication}|${timeSlot || ''}`;
  };

  const startEditing = (entry: { careWorkerName: string; date: string; medication: string; issue: string; timeSlot?: string; code?: string }) => {
    const key = generateEntryKey(entry.careWorkerName, entry.date, entry.medication, entry.timeSlot);
    const existingCorrection = corrections.get(key);
    
    setEditingEntry({
      key,
      careWorkerName: existingCorrection?.careWorkerName || entry.careWorkerName,
      date: existingCorrection?.date || entry.date,
      timeSlot: existingCorrection?.timeSlot || entry.timeSlot || '',
      medication: existingCorrection?.medication || entry.medication,
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

  const isEntryCorrected = (careWorkerName: string, date: string, medication: string, timeSlot?: string): boolean => {
    const key = generateEntryKey(careWorkerName, date, medication, timeSlot);
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
      <div className="space-y-2">
        <h2 className="page-title">EMAR Audit</h2>
        <p className="page-subtitle max-w-prose">
          Upload your EMAR PDF and our AI will read and extract medication data from the document. Automated validation checks then verify the results for accuracy before generating your compliance report.
        </p>
      </div>

      {!analyzed ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Upload EMAR Document (PDF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="glass-panel border border-border rounded-xl p-5">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-semibold">How it works:</span> Upload your EMAR as a PDF file. The system extracts medication entries, then runs validation checks before generating your compliance report. It will identify:
              </p>
              <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Service user name and medication level</li>
                <li>Date range covered by the audit</li>
                <li>ALL medication records and discrepancies</li>
                <li>Warnings about medication issues</li>
                <li>Items requiring your verification</li>
              </ul>
            </div>

            {file && (
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Selected file:</p>
                <p className="text-foreground font-medium">{file.name}</p>
              </div>
            )}

            <div className="flex items-center gap-4">
              <Input 
                type="file" 
                onChange={handleFileChange} 
                accept=".pdf"
                className="max-w-xs bg-background" 
                data-testid="input-file-upload"
              />
              <Button onClick={processAudit} disabled={loading || !file} data-testid="button-analyze">
                {loading ? (
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
        <div className="space-y-6">
          {detectedInitials.length > 0 && !mappingsConfirmed && (
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Users className="h-5 w-5" />
                  Carer Identification Required
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  The following carer names appear as initials only. Please match them to existing carers or create new entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {carerMappings.map((mapping, idx) => {
                  const matchingCarers = getMatchingCarers(mapping.initials);
                  return (
                    <div key={idx} className="bg-card rounded-lg p-4 space-y-3" data-testid={`carer-mapping-${idx}`}>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded font-mono font-bold">
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
                              Will be saved as: <span className="font-bold">{mapping.fullName}</span>
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
                                  <span className="text-foreground font-medium">{warning.medication}</span>
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

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-lg font-semibold">Audit Summary</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadPDF}
                  className="gap-1.5"
                  data-testid="button-download-pdf"
                >
                  <Download size={14} />
                  Download PDF
                </Button>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                <CopyableBox label="Service User" value={serviceUserDisplay} />
                <CopyableBox label="Type" value={getServiceUserTypeDisplay()} />
                <CopyableBox label="Auditor" value={auditorDisplay} />
                <CopyableBox label="First Day of Audit" value={result.auditPeriodStart} />
                <CopyableBox label="Last Day of Audit" value={result.auditPeriodEnd} />
              </div>
              {result.medicationLevelEvidence && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Medication Level Evidence</p>
                  <p className="text-sm text-muted-foreground">{result.medicationLevelEvidence}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Were there any discrepancies in the EMAR?</p>
                  <div className="flex items-center gap-2">
                    {hasAnyDiscrepancies() ? (
                      <span className="flex items-center gap-2 text-red-400 font-bold text-xl">
                        <X className="h-6 w-6" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-green-400 font-bold text-xl">
                        <Check className="h-6 w-6" /> No
                      </span>
                    )}
                  </div>
                </div>
                <CopyButton text={hasAnyDiscrepancies() ? "Yes" : "No"} label="discrepancies-answer" />
              </div>
            </CardContent>
          </Card>

          {hasAnyDiscrepancies() && (
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Main Discrepancies ({getAllDiscrepancies().length} total across {getGroupedDiscrepancies.length} staff)
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {user?.role === 'admin' && (
                    <Button
                      size="sm"
                      variant={editMode ? "default" : "outline"}
                      onClick={() => setEditMode(!editMode)}
                      className={`gap-1.5 ${editMode ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
                      data-testid="button-toggle-edit-mode"
                    >
                      <Pencil size={14} />
                      {editMode ? "Exit Edit Mode" : "Edit Mode"}
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
              <CardContent className="space-y-4">
                {getGroupedDiscrepancies.map((group, idx) => {
                  const isExpanded = expandedCareWorkers.has(group.careWorkerName);
                  const shortDates = group.dates.map(formatShortDate).join(", ");
                  const reasonsSummary = group.reasonsWithDates
                    .slice(0, 3)
                    .map(r => `${formatShortDate(r.date)} (${r.issue.length > 30 ? r.issue.slice(0, 30) + "..." : r.issue})`)
                    .join("; ");
                  const hasMoreReasons = group.reasonsWithDates.length > 3;
                  
                  return (
                    <div 
                      key={idx} 
                      className="border border-red-500/30 rounded-lg overflow-hidden bg-red-500/10"
                      data-testid={`grouped-discrepancy-${idx}`}
                    >
                      {/* Summary Header - Always Visible */}
                      <div 
                        className="bg-destructive/5 p-4 cursor-pointer hover:bg-destructive/10 transition-colors"
                        onClick={() => toggleCareWorkerExpand(group.careWorkerName)}
                        data-testid={`toggle-careworker-${idx}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              )}
                              <h4 className="text-lg font-semibold text-foreground">{group.careWorkerName}</h4>
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                                {group.totalCount} discrepanc{group.totalCount === 1 ? "y" : "ies"}
                              </span>
                            </div>
                            
                            <div className="ml-8 space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Dates: </span>
                                <span className="text-foreground font-medium">{shortDates}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Issues: </span>
                                <span className="text-destructive">{reasonsSummary}{hasMoreReasons ? ` (+${group.reasonsWithDates.length - 3} more)` : ""}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Actions: </span>
                                <span className="text-amber-400">{group.overallActions.join(", ") || "None"}</span>
                              </div>
                            </div>
                            
                            {/* Individual Copy Buttons */}
                            <div className="ml-8 mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs gap-1 bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(group.careWorkerName);
                                  toast({ title: "Copied", description: "Name copied" });
                                }}
                                data-testid={`copy-name-${idx}`}
                              >
                                <Copy size={10} /> Name
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs gap-1 bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(shortDates);
                                  toast({ title: "Copied", description: "Dates copied" });
                                }}
                                data-testid={`copy-dates-${idx}`}
                              >
                                <Copy size={10} /> Dates
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs gap-1 bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(group.totalCount.toString());
                                  toast({ title: "Copied", description: "Count copied" });
                                }}
                                data-testid={`copy-count-${idx}`}
                              >
                                <Copy size={10} /> Count
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs gap-1 bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allNotes = group.reasonsWithDates.map(r => `${formatShortDate(r.date)}: ${r.issue}`).join("\n");
                                  navigator.clipboard.writeText(allNotes);
                                  toast({ title: "Copied", description: "All notes copied" });
                                }}
                                data-testid={`copy-notes-${idx}`}
                              >
                                <Copy size={10} /> Notes
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/30 p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-24">Date</TableHead>
                                <TableHead>Medication</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Actions</TableHead>
                                {editMode && <TableHead className="w-20">Edit</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.discrepancies.map((disc, discIdx) => {
                                const entryKey = generateEntryKey(disc.careWorkerName, disc.date, disc.medication);
                                const isCorrected = isEntryCorrected(disc.careWorkerName, disc.date, disc.medication);
                                const correctedData = isCorrected ? getCorrectedValue(entryKey) : null;
                                
                                return (
                                  <TableRow 
                                    key={discIdx} 
                                    data-testid={`row-discrepancy-${idx}-${discIdx}`}
                                    className={isCorrected ? 'bg-yellow-500/10 border-l-2 border-l-yellow-500' : ''}
                                  >
                                    <TableCell className="text-muted-foreground">
                                      {correctedData?.date || disc.date}
                                      {isCorrected && correctedData?.date !== disc.date && (
                                        <span className="block text-xs text-yellow-400/70 line-through">{disc.date}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-foreground">
                                      {getMedicationDisplayName(correctedData?.medication || disc.medication)}
                                      {isCorrected && correctedData?.medication !== disc.medication && (
                                        <span className="block text-xs text-yellow-400/70 line-through">{getMedicationDisplayName(disc.medication)}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-destructive">
                                      {correctedData?.issue || disc.issue}
                                      {isCorrected && correctedData?.issue !== disc.issue && (
                                        <span className="block text-xs text-yellow-400/70 line-through">{disc.issue}</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-1">
                                        {disc.actions.performanceNote && (
                                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">Performance Note</span>
                                        )}
                                        {disc.actions.meeting === "phone" && (
                                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Phone Meeting</span>
                                        )}
                                        {disc.actions.meeting === "in_person" && (
                                          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">In-Person Meeting</span>
                                        )}
                                        {disc.actions.referToManager && (
                                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Refer to Manager</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    {editMode && (
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7"
                                            onClick={() => startEditing({
                                              careWorkerName: disc.careWorkerName,
                                              date: disc.date,
                                              medication: disc.medication,
                                              issue: disc.issue,
                                            })}
                                            data-testid={`button-edit-discrepancy-${idx}-${discIdx}`}
                                          >
                                            <Pencil size={14} />
                                          </Button>
                                          {isCorrected && (
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-yellow-400"
                                              onClick={() => undoCorrection(entryKey)}
                                              data-testid={`button-undo-discrepancy-${idx}-${discIdx}`}
                                            >
                                              <Undo2 size={14} />
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
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
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Reasons Not Administered ({totalRefusalCount} total)
                </CardTitle>
                <CardDescription>
                  Review medications not administered (refused, not home, self/family administered, unavailable). Mark each item as acceptable or escalate.
                  {!refusalReviewSubmitted && (
                    <span className="block mt-1 text-muted-foreground">
                      Progress: {getRefusalReviewStats.reviewed}/{getRefusalReviewStats.total} reviewed
                      {getRefusalReviewStats.toEscalate > 0 && (
                        <span className="text-red-400 ml-2">({getRefusalReviewStats.toEscalate} to escalate)</span>
                      )}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {refusalReviewSubmitted ? (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="text-green-400 font-medium">Reason Review Complete</p>
                      <p className="text-sm text-muted-foreground">
                        {getRefusalReviewStats.acceptable} marked acceptable, {getRefusalReviewStats.toEscalate} escalated to discrepancies
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Accordion type="multiple" value={reasonsNotAdministeredOpen} onValueChange={setReasonsNotAdministeredOpen}>
                      {unifiedRefusals.map((codeGroup) => {
                        const codeReviewedCount = codeGroup.items.filter(item => refusalDecisions[item.key] !== undefined && refusalDecisions[item.key] !== null).length;
                        const codeEscalateCount = codeGroup.items.filter(item => refusalDecisions[item.key] === 'escalate').length;
                        const codeAcceptableCount = codeGroup.items.filter(item => refusalDecisions[item.key] === 'acceptable').length;
                        const allCodeReviewed = codeReviewedCount === codeGroup.count;
                        
                        return (
                          <AccordionItem 
                            key={codeGroup.code} 
                            value={codeGroup.code}
                            className="border border-amber-500/30 rounded-lg mb-3 overflow-hidden bg-amber-500/10"
                            data-testid={`refusal-code-group-${codeGroup.code}`}
                          >
                            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-amber-500/15">
                              <div className="flex items-center gap-3 flex-1">
                                <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-sm font-medium">
                                  {codeGroup.code}
                                </span>
                                <span className="text-foreground font-medium">{codeGroup.displayName}</span>
                                <span className="px-2 py-0.5 bg-muted rounded-full text-xs text-muted-foreground">
                                  {codeGroup.count} item{codeGroup.count !== 1 ? 's' : ''}
                                </span>
                                {allCodeReviewed ? (
                                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs flex items-center gap-1">
                                    <Check size={10} /> Reviewed
                                  </span>
                                ) : codeReviewedCount > 0 && (
                                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">
                                    {codeReviewedCount}/{codeGroup.count} reviewed
                                  </span>
                                )}
                                {codeEscalateCount > 0 && (
                                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
                                    {codeEscalateCount} to escalate
                                  </span>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2 mt-2">
                                {codeGroup.items.map((item, itemIdx) => {
                                  const decision = refusalDecisions[item.key];
                                  const isAcceptable = decision === 'acceptable';
                                  const isEscalate = decision === 'escalate';
                                  const isReviewed = decision !== undefined && decision !== null;
                                  
                                  return (
                                    <div 
                                      key={item.key}
                                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                                        isEscalate 
                                          ? 'bg-red-500/10 border border-red-500/30' 
                                          : isAcceptable 
                                            ? 'bg-green-500/10 border border-green-500/30'
                                            : 'bg-muted border border-transparent'
                                      }`}
                                      data-testid={`refusal-item-${codeGroup.code}-${itemIdx}`}
                                    >
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-foreground font-medium">{item.careWorkerName}</span>
                                        <span className="text-muted-foreground">{item.date}</span>
                                        {item.timeSlot && (
                                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                                            {item.timeSlot}
                                          </span>
                                        )}
                                        <span className="text-sm text-muted-foreground">{item.medication}</span>
                                        {isReviewed && (
                                          <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                                            isAcceptable 
                                              ? 'bg-green-500/20 text-green-400' 
                                              : 'bg-red-500/20 text-red-400'
                                          }`}>
                                            {isAcceptable ? <Check size={10} /> : <X size={10} />}
                                            {isAcceptable ? 'Acceptable' : 'To Escalate'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant={isAcceptable ? "default" : "outline"}
                                          className={`h-8 ${isAcceptable ? 'bg-green-600 hover:bg-green-700' : 'border-green-500/50 text-green-400 hover:bg-green-500/10'}`}
                                          onClick={() => handleRefusalDecision(item.key, 'acceptable')}
                                          data-testid={`button-acceptable-${codeGroup.code}-${itemIdx}`}
                                        >
                                          <Check size={14} className="mr-1" />
                                          Acceptable
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={isEscalate ? "destructive" : "outline"}
                                          className={`h-8 ${!isEscalate ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : ''}`}
                                          onClick={() => handleRefusalDecision(item.key, 'escalate')}
                                          data-testid={`button-escalate-${codeGroup.code}-${itemIdx}`}
                                        >
                                          <X size={14} className="mr-1" />
                                          Escalate
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
                    
                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <div className="text-sm text-muted-foreground">
                        {getRefusalReviewStats.pending > 0 ? (
                          <span className="text-amber-400">{getRefusalReviewStats.pending} items pending review</span>
                        ) : (
                          <span className="text-green-400 flex items-center gap-1">
                            <Check size={14} /> All items reviewed
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={handleSubmitRefusalReview}
                        disabled={getRefusalReviewStats.reviewed === 0}
                        data-testid="button-submit-refusal-review"
                      >
                        {getRefusalReviewStats.toEscalate > 0 && (
                          <AlertTriangle className="h-4 w-4 mr-2" />
                        )}
                        Submit Review
                        {getRefusalReviewStats.toEscalate > 0 && ` (${getRefusalReviewStats.toEscalate} escalations)`}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>PRN Medications</CardTitle>
              <CopyButton 
                text={result.prnMedications.hasPRN 
                  ? `PRN Medications: ${result.prnMedications.medications.map(m => typeof m === 'string' ? m : m.name).join(', ')}` 
                  : 'No PRN medications'} 
                label="prn-section" 
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <p className="text-muted-foreground">Are any medications PRN?</p>
                {result.prnMedications.hasPRN ? (
                  <span className="text-yellow-400 font-bold">Yes</span>
                ) : (
                  <span className="text-green-400 font-bold">No</span>
                )}
              </div>

              {result.prnMedications.hasPRN && (
                <>
                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">PRN Medications List</p>
                    <div className="flex flex-wrap gap-2">
                      {result.prnMedications.medications.map((med, idx) => (
                        <span key={idx} className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">
                          {typeof med === 'string' ? med : med.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {prnProtocolsSubmitted ? (
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-4">Are the PRN protocols completed?</p>
                      {prnProtocolChecks.every(p => p.isCompleted && p.isGoodStandard) ? (
                        <div className="flex items-center gap-2 text-green-400 font-bold">
                          <Check className="h-5 w-5" /> Yes - All PRN protocols are completed and to a good standard
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-red-400 font-bold">
                            <X className="h-5 w-5" /> No - The following protocols need attention:
                          </div>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            {prnProtocolChecks.map((check, idx) => {
                              if (check.isCompleted && check.isGoodStandard) return null;
                              const issues = [];
                              if (!check.isCompleted) issues.push("not completed");
                              if (!check.isGoodStandard) issues.push("not to a good standard");
                              return (
                                <li key={idx}>
                                  <span className="text-foreground font-medium">{check.medication}</span> - {issues.join(" and ")}
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
                            const protocol = typeof med === 'string' ? 'Standard PRN protocol required' : med.protocol;
                            const isCompleted = prnProtocolChecks[idx]?.isCompleted || false;
                            const isGoodStandard = prnProtocolChecks[idx]?.isGoodStandard || false;
                            const needsProtocol = !isCompleted || !isGoodStandard;
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-foreground font-medium">{medName}</TableCell>
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
                </>
              )}
            </CardContent>
          </Card>

          {result.officeClosedEntries && result.officeClosedEntries.length > 0 && (
            <Card className="bg-card border-border" data-testid="card-office-closed-entries">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2" data-testid="title-office-closed">
                  <Users className="h-5 w-5 text-blue-400" />
                  Office Staff Manual Entries
                  <Badge variant="outline" className="ml-2 text-blue-400 border-blue-400/30" data-testid="badge-office-closed-count">
                    {result.officeClosedEntries.length}
                  </Badge>
                </CardTitle>
                <CopyButton 
                  text={result.officeClosedEntries.map(e => `${e.medication} - ${e.date} ${e.timeSlot} (${e.code}) closed by ${e.closedByStaff}`).join('\n')} 
                  label="office-closed" 
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground" data-testid="text-office-closed-description">
                  These entries were manually closed by office staff (codes without initials in red boxes). 
                  They are excluded from time gap violations but still validated for correct codes and required notes.
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table data-testid="table-office-closed">
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="header-medication">Medication</TableHead>
                        <TableHead data-testid="header-date">Date</TableHead>
                        <TableHead data-testid="header-timeslot">Time Slot</TableHead>
                        <TableHead data-testid="header-code">Code</TableHead>
                        <TableHead data-testid="header-closedby">Closed By</TableHead>
                        <TableHead data-testid="header-closedtime">Time Closed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.officeClosedEntries.map((entry, idx) => (
                        <TableRow key={idx} data-testid={`row-office-closed-${idx}`}>
                          <TableCell className="font-medium" data-testid={`cell-medication-${idx}`}>{entry.medication}</TableCell>
                          <TableCell data-testid={`cell-date-${idx}`}>{entry.date}</TableCell>
                          <TableCell data-testid={`cell-timeslot-${idx}`}>{entry.timeSlot}</TableCell>
                          <TableCell data-testid={`cell-code-${idx}`}>
                            <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                              {entry.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-blue-400" data-testid={`cell-closedby-${idx}`}>{entry.closedByStaff || 'Office Staff'}</TableCell>
                          <TableCell className="text-muted-foreground" data-testid={`cell-closedtime-${idx}`}>{entry.closedTime || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Themes & Trends</CardTitle>
                <CopyButton text={result.themesAndTrends} label="themes" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.themesAndTrends}</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Gaps in Knowledge</CardTitle>
                <CopyButton text={result.gapsInKnowledge} label="gaps" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.gapsInKnowledge}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <CopyableBox label="Date of Audit" value={formatDate(new Date())} />
            </CardContent>
          </Card>
          
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setAnalyzed(false); setResult(null); }} data-testid="button-start-new-emar">
              Start New Audit
            </Button>
            <Button 
              onClick={saveAudit} 
              disabled={loading}
              data-testid="button-save-emar-audit"
            >
              {loading ? "Saving..." : "Save Audit"}
            </Button>
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
