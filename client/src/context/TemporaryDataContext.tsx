import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { SAMPLE_CARE_PLAN_CONTENT, SAMPLE_SOCIAL_WORK_CONTENT } from "@/lib/sampleDemoData";

interface FileData {
  name: string;
  type: string;
  size: number;
  content: string; // Parsed text content from PDF
  timestamp: number;
  isParsing?: boolean;
  parseError?: string;
}

type UploadSection = "socialWork" | "initialAssessment" | "carePlan" | "movingHandling";

type ServiceUserDataState = {
  socialWork?: FileData;
  initialAssessment?: FileData;
  carePlan?: FileData;
  movingHandling?: FileData;
};

interface TemporaryDataContextType {
  serviceUserData: ServiceUserDataState;
  uploadFile: (section: UploadSection, file: File) => Promise<void>;
  clearServiceUserData: () => void;
  timeLeft: number | null; // Time left in seconds
  startTimer: () => void;
  resetTimer: () => void;
  getAllDocumentContent: () => string; // Combined content from all uploaded documents
  isAnyParsing: () => boolean;
  loadDemoData: () => void; // Load sample data for demo mode
}

const TemporaryDataContext = createContext<TemporaryDataContextType | undefined>(undefined);

export function TemporaryDataProvider({ children }: { children: ReactNode }) {
  const [serviceUserData, setServiceUserData] = useState<ServiceUserDataState>({});
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [location] = useLocation();
  const demoDataLoadedRef = useRef(false);
  const uploadTokensRef = useRef<Record<UploadSection, symbol>>({
    socialWork: Symbol("socialWork"),
    initialAssessment: Symbol("initialAssessment"),
    carePlan: Symbol("carePlan"),
    movingHandling: Symbol("movingHandling"),
  });
  const uploadAbortControllersRef = useRef<Record<UploadSection, AbortController | null>>({
    socialWork: null,
    initialAssessment: null,
    carePlan: null,
    movingHandling: null,
  });

  // Handle timer countdown
  // Demo mode: timer does not clear data - session persists for demo duration
  useEffect(() => {
    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      if (demoDataLoadedRef.current) {
        setTimeLeft(null);
        return;
      }
      clearServiceUserData();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Handle auto-wipe on navigation away from Service Users section
  // Exception: Demo mode keeps data across navigation
  useEffect(() => {
    if (demoDataLoadedRef.current) {
      return;
    }
    if (!location.startsWith('/service-users') && Object.keys(serviceUserData).length > 0) {
        clearServiceUserData();
    }
  }, [location]);

  const resetUploadTracking = () => {
    Object.values(uploadAbortControllersRef.current).forEach((controller) => controller?.abort());
    uploadAbortControllersRef.current = {
      socialWork: null,
      initialAssessment: null,
      carePlan: null,
      movingHandling: null,
    };
    uploadTokensRef.current = {
      socialWork: Symbol("socialWork"),
      initialAssessment: Symbol("initialAssessment"),
      carePlan: Symbol("carePlan"),
      movingHandling: Symbol("movingHandling"),
    };
  };

  const uploadFile = async (section: UploadSection, file: File) => {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to parse PDF");
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
  };

  const clearServiceUserData = () => {
    resetUploadTracking();
    setServiceUserData({});
    setTimeLeft(null);
    demoDataLoadedRef.current = false;
    console.log("Secure Wipe: Service User Data Cleared from Memory.");
  };

  const startTimer = () => {
    setTimeLeft(30 * 60); // 30 minutes in seconds
  };

  const resetTimer = () => {
    setTimeLeft(30 * 60);
  };

  const getAllDocumentContent = (): string => {
    const parts: string[] = [];
    
    if (serviceUserData.socialWork?.content) {
      parts.push(`=== SOCIAL WORK DOCUMENTS ===\n${serviceUserData.socialWork.content}`);
    }
    if (serviceUserData.initialAssessment?.content) {
      parts.push(`=== INITIAL ASSESSMENT ===\n${serviceUserData.initialAssessment.content}`);
    }
    if (serviceUserData.carePlan?.content) {
      parts.push(`=== CURRENT CARE PLAN ===\n${serviceUserData.carePlan.content}`);
    }
    if (serviceUserData.movingHandling?.content) {
      parts.push(`=== MOVING AND HANDLING PLAN ===\n${serviceUserData.movingHandling.content}`);
    }
    
    return parts.join("\n\n");
  };

  const isAnyParsing = (): boolean => {
    return Boolean(
      serviceUserData.socialWork?.isParsing ||
      serviceUserData.initialAssessment?.isParsing ||
      serviceUserData.carePlan?.isParsing ||
      serviceUserData.movingHandling?.isParsing
    );
  };

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
    });
    startTimer();
    console.log("Demo Mode: Sample data loaded.");
  }, []);

  return (
    <TemporaryDataContext.Provider value={{ 
      serviceUserData, 
      uploadFile, 
      clearServiceUserData, 
      timeLeft,
      startTimer,
      resetTimer,
      getAllDocumentContent,
      isAnyParsing,
      loadDemoData,
    }}>
      {children}
    </TemporaryDataContext.Provider>
  );
}

export function useTemporaryData() {
  const context = useContext(TemporaryDataContext);
  if (context === undefined) {
    throw new Error("useTemporaryData must be used within a TemporaryDataProvider");
  }
  return context;
}
