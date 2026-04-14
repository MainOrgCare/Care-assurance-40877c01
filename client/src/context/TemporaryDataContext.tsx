import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { SAMPLE_CARE_PLAN_CONTENT, SAMPLE_SOCIAL_WORK_CONTENT } from "@/lib/sampleDemoData";

interface FileData {
  id?: string;
  name: string;
  type: string;
  size: number;
  content: string; // Parsed text content from PDF
  timestamp: number;
  isParsing?: boolean;
  parseError?: string;
}

type UploadSection = "socialWork" | "initialAssessment" | "carePlan" | "movingHandling" | "additionalDocuments";

interface ExtensionUploadItem {
  section: UploadSection;
  name: string;
  type?: string;
  size?: number;
  lastModified?: number;
  base64Data: string;
}

type ServiceUserDataState = {
  socialWork?: FileData;
  initialAssessment?: FileData;
  carePlan?: FileData;
  movingHandling?: FileData;
  additionalDocuments?: FileData[];
  additionalNotes?: string;
};

interface TemporaryDataContextType {
  serviceUserData: ServiceUserDataState;
  uploadFile: (section: UploadSection, file: File) => Promise<void>;
  importExtensionUploads: (payload: { uploads: ExtensionUploadItem[]; additionalNotes?: string }) => Promise<{ imported: number; failed: number }>;
  removeAdditionalDocument: (id: string) => void;
  clearServiceUserData: () => void;
  startTimer: () => void;
  resetTimer: () => void;
  getAllDocumentContent: (options?: { includeCarePlan?: boolean }) => string; // Combined content from all uploaded documents
  isAnyParsing: () => boolean;
  loadDemoData: () => void; // Load sample data for demo mode
  setAdditionalNotes: (notes: string) => void;
}

interface TemporaryDataTimerContextType {
  timeLeft: number | null;
  startTimer: () => void;
  resetTimer: () => void;
}

const TemporaryDataContext = createContext<TemporaryDataContextType | undefined>(undefined);
const TemporaryDataTimerContext = createContext<TemporaryDataTimerContextType | undefined>(undefined);

export function TemporaryDataProvider({ children }: { children: ReactNode }) {
  const [serviceUserData, setServiceUserData] = useState<ServiceUserDataState>({});
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const isTimerActive = timeLeft !== null;
  const [location, setLocation] = useLocation();
  const demoDataLoadedRef = useRef(false);
  const uploadTokensRef = useRef<Record<UploadSection, symbol>>({
    socialWork: Symbol("socialWork"),
    initialAssessment: Symbol("initialAssessment"),
    carePlan: Symbol("carePlan"),
    movingHandling: Symbol("movingHandling"),
    additionalDocuments: Symbol("additionalDocuments"),
  });
  const uploadAbortControllersRef = useRef<Record<UploadSection, AbortController | null>>({
    socialWork: null,
    initialAssessment: null,
    carePlan: null,
    movingHandling: null,
    additionalDocuments: null,
  });

  const startTimer = useCallback(() => {
    setTimeLeft(30 * 60); // 30 minutes in seconds
  }, []);

  const resetTimer = useCallback(() => {
    setTimeLeft(30 * 60);
  }, []);

  const resetUploadTracking = useCallback(() => {
    Object.values(uploadAbortControllersRef.current).forEach((controller) => controller?.abort());
    uploadAbortControllersRef.current = {
      socialWork: null,
      initialAssessment: null,
      carePlan: null,
      movingHandling: null,
      additionalDocuments: null,
    };
    uploadTokensRef.current = {
      socialWork: Symbol("socialWork"),
      initialAssessment: Symbol("initialAssessment"),
      carePlan: Symbol("carePlan"),
      movingHandling: Symbol("movingHandling"),
      additionalDocuments: Symbol("additionalDocuments"),
    };
  }, []);

  const clearServiceUserData = useCallback(() => {
    resetUploadTracking();
    setServiceUserData({});
    setTimeLeft(null);
    demoDataLoadedRef.current = false;
  }, [resetUploadTracking]);

  const readServerErrorMessage = useCallback(async (response: Response): Promise<string | null> => {
    try {
      const contentType = (response.headers.get("content-type") || "").toLowerCase();

      // Prefer JSON when the server indicates it.
      if (contentType.includes("json")) {
        const data: any = await response
          .clone()
          .json()
          .catch(() => null);
        const message = typeof data?.message === "string" ? data.message.trim() : "";
        if (message) return message;
      }

      // Otherwise read as text, and opportunistically parse JSON bodies even if the
      // content-type isn't set correctly.
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      const trimmed = text.trim();
      if (!trimmed) return null;

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const data: any = JSON.parse(trimmed);
          const message = typeof data?.message === "string" ? data.message.trim() : "";
          if (message) return message;
        } catch {
          // Fall back to returning the raw text.
        }
      }

      return trimmed;
    } catch {
      return null;
    }
  }, []);

  // Run a single ticking interval only while the session timer is active.
  useEffect(() => {
    if (!isTimerActive) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerActive]);

  // Demo mode: timer expiration does not wipe data.
  useEffect(() => {
    if (timeLeft !== 0) return;

    if (demoDataLoadedRef.current) {
      setTimeLeft(null);
      return;
    }

    clearServiceUserData();
  }, [timeLeft, clearServiceUserData]);

  // Handle auto-wipe on navigation away from Service Users section
  // Exception: Demo mode keeps data across navigation
  useEffect(() => {
    if (demoDataLoadedRef.current) {
      return;
    }
    if (!location.startsWith("/service-users") && Object.keys(serviceUserData).length > 0) {
      clearServiceUserData();
    }
  }, [location, serviceUserData, clearServiceUserData]);

  const uploadFile = useCallback(async (section: UploadSection, file: File) => {
    if (section === "additionalDocuments") {
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newFile: FileData = {
        id: entryId,
        name: file.name,
        type: file.type,
        size: file.size,
        content: "",
        timestamp: Date.now(),
        isParsing: true,
      };
      setServiceUserData(prev => ({
        ...prev,
        additionalDocuments: [...(prev.additionalDocuments || []), newFile],
      }));
      resetTimer();

      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          const serverMessage = await readServerErrorMessage(response);
          throw new Error(serverMessage || `Failed to parse document (HTTP ${response.status})`);
        }
        const data = await response.json();
        setServiceUserData(prev => ({
          ...prev,
          additionalDocuments: (prev.additionalDocuments || []).map(doc =>
            doc.id === entryId ? { ...doc, content: data.text || "", isParsing: false } : doc
          ),
        }));
      } catch (error: any) {
        console.error("PDF parsing error:", error);
        setServiceUserData(prev => ({
          ...prev,
          additionalDocuments: (prev.additionalDocuments || []).map(doc =>
            doc.id === entryId ? { ...doc, content: "", isParsing: false, parseError: error.message || "Failed to parse PDF" } : doc
          ),
        }));
      }
      return;
    }

    const token = Symbol(section);
    uploadTokensRef.current[section] = token;

    const existingController = uploadAbortControllersRef.current[section];
    if (existingController) {
      existingController.abort();
    }
    const controller = new AbortController();
    uploadAbortControllersRef.current[section] = controller;

    // Create initial entry with parsing status
    const newFile: FileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      content: "",
      timestamp: Date.now(),
      isParsing: true,
    };

    setServiceUserData(prev => ({ ...prev, [section]: newFile }));
    resetTimer();

    // Parse the PDF file
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const serverMessage = await readServerErrorMessage(response);
        throw new Error(serverMessage || `Failed to parse document (HTTP ${response.status})`);
      }

      const data = await response.json();

      if (uploadTokensRef.current[section] !== token) {
        return;
      }
      
      setServiceUserData(prev => ({
        ...prev,
        [section]: {
          ...prev[section]!,
          content: data.text || "",
          isParsing: false,
        },
      }));
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return;
      }
      if (uploadTokensRef.current[section] !== token) {
        return;
      }
      console.error("PDF parsing error:", error);
      setServiceUserData(prev => ({
        ...prev,
        [section]: {
          ...prev[section]!,
          content: "",
          isParsing: false,
          parseError: error.message || "Failed to parse PDF",
        },
      }));
    }
  }, [readServerErrorMessage, resetTimer]);

  const decodeExtensionUploadFile = useCallback((item: ExtensionUploadItem): File => {
    const raw = String(item?.base64Data || "").replace(/^data:[^,]*,/, "");
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], item.name || `extension-upload-${Date.now()}`, {
      type: item.type || "application/octet-stream",
      lastModified: item.lastModified || Date.now(),
    });
  }, []);

  const importExtensionUploads = useCallback(async (payload: { uploads: ExtensionUploadItem[]; additionalNotes?: string }) => {
    const uploads = Array.isArray(payload?.uploads) ? payload.uploads : [];
    if (uploads.length === 0) {
      return { imported: 0, failed: 0 };
    }

    let imported = 0;
    let failed = 0;

    for (const item of uploads) {
      if (!item || !item.section || !item.base64Data) {
        failed += 1;
        continue;
      }

      try {
        const file = decodeExtensionUploadFile(item);
        await uploadFile(item.section, file);
        imported += 1;
      } catch {
        failed += 1;
      }
    }

    if (typeof payload.additionalNotes === "string") {
      const notes = payload.additionalNotes.trim();
      if (notes.length > 0) {
        setServiceUserData((prev) => ({
          ...prev,
          additionalNotes: notes,
        }));
        resetTimer();
      }
    }

    return { imported, failed };
  }, [decodeExtensionUploadFile, resetTimer, uploadFile]);

  useEffect(() => {
    const handleExtensionUploadSync = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "CA_EXTENSION_SEND_TO_APP") return;

      const payload = event.data.payload as { uploads?: ExtensionUploadItem[]; additionalNotes?: string } | undefined;
      if (!payload || !Array.isArray(payload.uploads) || payload.uploads.length === 0) return;

      void (async () => {
        if (!location.startsWith("/service-users")) {
          setLocation("/service-users/upload");
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        await importExtensionUploads({
          uploads: payload.uploads,
          additionalNotes: payload.additionalNotes,
        });
      })();
    };

    window.addEventListener("message", handleExtensionUploadSync);
    return () => window.removeEventListener("message", handleExtensionUploadSync);
  }, [importExtensionUploads, location, setLocation]);

  const removeAdditionalDocument = useCallback((id: string) => {
    setServiceUserData(prev => ({
      ...prev,
      additionalDocuments: (prev.additionalDocuments || []).filter(doc => doc.id !== id),
    }));
  }, []);

  const getAllDocumentContent = useCallback((options?: { includeCarePlan?: boolean }): string => {
    const includeCarePlan = options?.includeCarePlan !== false;
    const parts: string[] = [];
    
    if (serviceUserData.socialWork?.content) {
      parts.push(`=== SOCIAL WORK DOCUMENTS ===\n${serviceUserData.socialWork.content}`);
    }
    if (serviceUserData.initialAssessment?.content) {
      parts.push(`=== INITIAL ASSESSMENT ===\n${serviceUserData.initialAssessment.content}`);
    }
    if (includeCarePlan && serviceUserData.carePlan?.content) {
      parts.push(`=== CURRENT CARE PLAN ===\n${serviceUserData.carePlan.content}`);
    }
    if (serviceUserData.movingHandling?.content) {
      parts.push(`=== MOVING AND HANDLING PLAN ===\n${serviceUserData.movingHandling.content}`);
    }
    if (serviceUserData.additionalDocuments && serviceUserData.additionalDocuments.length > 0) {
      serviceUserData.additionalDocuments.forEach((doc, index) => {
        if (!doc.content) return;
        const label = doc.name ? doc.name : `Additional Document ${index + 1}`;
        parts.push(`=== ADDITIONAL DOCUMENT: ${label} ===\n${doc.content}`);
      });
    }
    if (serviceUserData.additionalNotes && serviceUserData.additionalNotes.trim()) {
      parts.push(`=== ADDITIONAL CONTEXT (USER ENTERED) ===\n${serviceUserData.additionalNotes.trim()}`);
    }
    
    return parts.join("\n\n");
  }, [serviceUserData]);

  const isAnyParsing = useCallback((): boolean => {
    return Boolean(
      serviceUserData.socialWork?.isParsing ||
      serviceUserData.initialAssessment?.isParsing ||
      serviceUserData.carePlan?.isParsing ||
      serviceUserData.movingHandling?.isParsing ||
      serviceUserData.additionalDocuments?.some(doc => doc.isParsing)
    );
  }, [serviceUserData]);

  const loadDemoData = useCallback(() => {
    if (demoDataLoadedRef.current) {
      return;
    }
    demoDataLoadedRef.current = true;

    resetUploadTracking();
    
    setServiceUserData({
      socialWork: {
        name: "Demo_Social_Work_Assessment.pdf",
        type: "application/pdf",
        size: 45678,
        content: SAMPLE_SOCIAL_WORK_CONTENT,
        timestamp: Date.now(),
        isParsing: false,
      },
      carePlan: {
        name: "Demo_Care_Plan.pdf",
        type: "application/pdf",
        size: 62345,
        content: SAMPLE_CARE_PLAN_CONTENT,
        timestamp: Date.now(),
        isParsing: false,
      },
      additionalDocuments: [],
      additionalNotes: "",
    });
    startTimer();
  }, [startTimer, resetUploadTracking]);

  const setAdditionalNotes = useCallback((notes: string) => {
    setServiceUserData(prev => ({
      ...prev,
      additionalNotes: notes,
    }));
    resetTimer();
  }, [resetTimer]);

  const contextValue = useMemo(() => ({
    serviceUserData,
    uploadFile,
    importExtensionUploads,
    removeAdditionalDocument,
    clearServiceUserData,
    startTimer,
    resetTimer,
    getAllDocumentContent,
    isAnyParsing,
    loadDemoData,
    setAdditionalNotes,
  }), [serviceUserData, uploadFile, importExtensionUploads, removeAdditionalDocument, clearServiceUserData, startTimer, resetTimer, getAllDocumentContent, isAnyParsing, loadDemoData, setAdditionalNotes]);

  const timerContextValue = useMemo(() => ({
    timeLeft,
    startTimer,
    resetTimer,
  }), [timeLeft, startTimer, resetTimer]);

  return (
    <TemporaryDataTimerContext.Provider value={timerContextValue}>
      <TemporaryDataContext.Provider value={contextValue}>
        {children}
      </TemporaryDataContext.Provider>
    </TemporaryDataTimerContext.Provider>
  );
}

export function useTemporaryData() {
  const context = useContext(TemporaryDataContext);
  if (context === undefined) {
    throw new Error("useTemporaryData must be used within a TemporaryDataProvider");
  }
  return context;
}

export function useTemporaryDataTimer() {
  const context = useContext(TemporaryDataTimerContext);
  if (context === undefined) {
    throw new Error("useTemporaryDataTimer must be used within a TemporaryDataProvider");
  }
  return context;
}
