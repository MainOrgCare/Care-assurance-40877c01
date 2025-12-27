import { useState, useEffect, useRef, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Copy, FileText, Check, X, AlertTriangle, Loader2, TableIcon, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, UserPlus, Users, Sparkles, RefreshCw } from "lucide-react";
import UploadDisclaimer from "@/components/UploadDisclaimer";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
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
  medication: string;
  description: string;
  frequency: string;
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

interface EmarAnalysisResult {
  serviceUserName: string;
  serviceUserType: "prompt" | "administer" | "assist";
  medicationLevelEvidence?: string;
  codeConflictDetected?: boolean;
  codeConflictDetails?: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  warnings?: Warning[];
  hasDiscrepancies: boolean;
  discrepancies: Discrepancy[];
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
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <CopyButton text={value} label={label} />
      </div>
      <p className="text-foreground font-medium">{value}</p>
    </div>
  );
});

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
      
      const response = await fetch("/api/ai/analyze-emar", {
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
        serviceUserName: result.serviceUserName,
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

  const handleVerificationCheck = (idx: number, checked: boolean) => {
    setVerificationChecks(prev => ({ ...prev, [idx]: checked }));
    
    if (checked && result?.userVerificationItems?.[idx]) {
      const item = result.userVerificationItems[idx];
      const newDiscrepancy: Discrepancy = {
        careWorkerName: item.careWorkerName,
        date: item.date,
        medication: item.medication,
        issue: `${item.code} code used - ${item.note}`,
        actions: {
          performanceNote: true,
          meeting: "none",
          referToManager: false,
        },
      };
      setAddedDiscrepancies(prev => [...prev, newDiscrepancy]);
    }
  };

  const handleVerificationSubmit = () => {
    setVerificationSubmitted(true);
    const confirmedCount = Object.values(verificationChecks).filter(v => v).length;
    
    toast({
      title: "Verification Submitted",
      description: `${confirmedCount} discrepancies confirmed and added to the audit.`,
    });
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

  const getAllDiscrepancies = (): Discrepancy[] => {
    const baseDiscrepancies = result?.discrepancies || [];
    const allDisc = [...baseDiscrepancies, ...addedDiscrepancies];
    return allDisc.map(d => ({
      ...d,
      careWorkerName: getMappedCarerName(d.careWorkerName),
    }));
  };

  const getAllDiscrepanciesText = () => {
    const allDiscrepancies = getAllDiscrepancies();
    if (allDiscrepancies.length === 0) return "";
    return allDiscrepancies.map(d => 
      `${d.careWorkerName}\t${d.date}\t${d.medication}\t${d.issue}\t${getActionsText(d.actions)}`
    ).join('\n');
  };

  const getDiscrepanciesTableFormat = () => {
    const allDiscrepancies = getAllDiscrepancies();
    if (allDiscrepancies.length === 0) return "";
    const header = "Care Worker\tDate\tMedication\tIssue\tActions Required";
    const rows = allDiscrepancies.map(d => 
      `${d.careWorkerName}\t${d.date}\t${d.medication}\t${d.issue}\t${getActionsText(d.actions)}`
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

  const hasAnyDiscrepancies = () => {
    const allDiscrepancies = getAllDiscrepancies();
    return allDiscrepancies.length > 0;
  };

  const getRemainingVerificationItems = () => {
    if (!result?.userVerificationItems) return [];
    return result.userVerificationItems.filter((_, idx) => !verificationChecks[idx]);
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
  }, [result, addedDiscrepancies, mappingsConfirmed, carerMappings]);

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
      'FA': 'Failed Attempt (FA)',
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-heading font-bold text-foreground">EMAR Audit</h2>
        <p className="text-muted-foreground mt-2">
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
            <div className="bg-teal-950/30 border border-teal-900/50 rounded-lg p-4">
              <p className="text-sm text-teal-300">
                <strong>How it works:</strong> Upload your EMAR as a PDF file. Our AI reads the document images and extracts all medication entries, then automated checks validate the data for accuracy. The system will identify:
              </p>
              <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
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
              <div className="space-y-3 p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg" data-testid="progress-container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-blue-400" />
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
            <Card className="bg-blue-950/30 border-blue-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-400">
                  <Users className="h-5 w-5" />
                  Carer Identification Required
                </CardTitle>
                <CardDescription className="text-blue-300/70">
                  The following carer names appear as initials only. Please match them to existing carers or create new entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {carerMappings.map((mapping, idx) => {
                  const matchingCarers = getMatchingCarers(mapping.initials);
                  return (
                    <div key={idx} className="bg-card rounded-lg p-4 space-y-3" data-testid={`carer-mapping-${idx}`}>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded font-mono font-bold">
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
                              <SelectItem value="create_new" className="text-teal-400">
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

          {(result.warnings && result.warnings.length > 0) && (
            <Collapsible open={warningsOpen} onOpenChange={setWarningsOpen}>
              <Card className="bg-red-950/30 border-red-900/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-red-950/40 transition-colors">
                    <CardTitle className="flex items-center justify-between text-red-400">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Warnings ({result.warnings.length})
                      </div>
                      {warningsOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </CardTitle>
                    <CardDescription className="text-red-300/70">
                      Click to {warningsOpen ? 'hide' : 'view'} critical medication issues requiring attention
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    {result.warnings.map((warning, idx) => (
                      <div key={idx} className="bg-red-950/50 border border-red-900/30 rounded-lg p-4" data-testid={`warning-${idx}`}>
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs font-medium">
                                {warning.type.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              {warning.medication && (
                                <span className="text-foreground font-medium">{warning.medication}</span>
                              )}
                              {warning.frequency && (
                                <span className="text-red-300/70 text-sm">({warning.frequency})</span>
                              )}
                            </div>
                            <p className="text-red-200">{warning.description}</p>
                            <div className="mt-2 p-2 bg-card rounded">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recommended Action</p>
                              <p className="text-yellow-300 text-sm">{warning.recommendedAction}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {result.codeConflictDetected && (
            <Card className="bg-amber-950/30 border-amber-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  Code Conflict Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-amber-200 mb-4">{result.codeConflictDetails}</p>
                <div className="bg-card p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-3">What is the service user's medication level?</p>
                  <div className="flex gap-3">
                    {['administer', 'assist', 'prompt'].map((level) => (
                      <Button
                        key={level}
                        variant={medicationLevelOverride === level ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMedicationLevelOverride(level)}
                        data-testid={`button-level-${level}`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                <CopyableBox label="Service User" value={result.serviceUserName} />
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Main Discrepancies ({getAllDiscrepancies().length} total across {getGroupedDiscrepancies.length} staff)
                </CardTitle>
                <div className="flex items-center gap-2">
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
                        className="bg-red-950/30 p-4 cursor-pointer hover:bg-red-950/40 transition-colors"
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
                                <span className="text-red-300">{reasonsSummary}{hasMoreReasons ? ` (+${group.reasonsWithDates.length - 3} more)` : ""}</span>
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
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.discrepancies.map((disc, discIdx) => (
                                <TableRow key={discIdx} data-testid={`row-discrepancy-${idx}-${discIdx}`}>
                                  <TableCell className="text-muted-foreground">{disc.date}</TableCell>
                                  <TableCell className="text-foreground">{disc.medication}</TableCell>
                                  <TableCell className="text-red-300">{disc.issue}</TableCell>
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
                                </TableRow>
                              ))}
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

          {/* Reasons Not Administered - Unified Refusal Section */}
          {unifiedRefusals.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Reasons Not Administered ({totalRefusalCount} total)
                </CardTitle>
                <CardDescription>
                  Review all refusals grouped by code type. Mark each item as acceptable or escalate to discrepancies.
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
                      <p className="text-green-400 font-medium">Refusal Review Complete</p>
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

          {result.userVerificationItems && result.userVerificationItems.length > 0 && !verificationSubmitted && getRemainingVerificationItems().length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-400" />
                  User Verification Required
                </CardTitle>
                <CardDescription>
                  These items require manual verification. Is there a discrepancy? Check the box if yes - this will add it to the discrepancies list.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Carer Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Medication</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Verification Note</TableHead>
                      <TableHead className="text-center">Is there a discrepancy?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.userVerificationItems.map((item, idx) => {
                      if (verificationChecks[idx]) return null;
                      return (
                        <TableRow key={idx} data-testid={`row-verification-${idx}`}>
                          <TableCell className="text-foreground font-medium">{item.careWorkerName}</TableCell>
                          <TableCell className="text-muted-foreground">{item.date}</TableCell>
                          <TableCell className="text-foreground">{item.medication}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
                              {item.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.note}</TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={verificationChecks[idx] || false}
                              onCheckedChange={(checked) => handleVerificationCheck(idx, !!checked)}
                              data-testid={`checkbox-verification-${idx}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleVerificationSubmit} data-testid="button-submit-verification">
                    Submit Verification (All remaining items are not discrepancies)
                  </Button>
                </div>
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
