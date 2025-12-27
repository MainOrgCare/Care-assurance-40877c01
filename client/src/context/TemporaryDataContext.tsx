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

interface TemporaryDataContextType {
  serviceUserData: {
    socialWork?: FileData;
    initialAssessment?: FileData;
    carePlan?: FileData;
  };
  uploadFile: (section: "socialWork" | "initialAssessment" | "carePlan", file: File) => Promise<void>;
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
  const [serviceUserData, setServiceUserData] = useState<{
    socialWork?: FileData;
    initialAssessment?: FileData;
    carePlan?: FileData;
  }>({});
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [location] = useLocation();
  const demoDataLoadedRef = useRef(false);

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

  const uploadFile = async (section: "socialWork" | "initialAssessment" | "carePlan", file: File) => {
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
      });

      if (!response.ok) {
        throw new Error("Failed to parse PDF");
      }

      const data = await response.json();
      
      setServiceUserData(prev => ({
        ...prev,
        [section]: {
          ...prev[section]!,
          content: data.text || "",
          isParsing: false,
        },
      }));
    } catch (error: any) {
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
    
    return parts.join("\n\n");
  };

  const isAnyParsing = (): boolean => {
    return Boolean(
      serviceUserData.socialWork?.isParsing ||
      serviceUserData.initialAssessment?.isParsing ||
      serviceUserData.carePlan?.isParsing
    );
  };

  const loadDemoData = useCallback(() => {
    if (demoDataLoadedRef.current) {
      return;
    }
    demoDataLoadedRef.current = true;
    
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
