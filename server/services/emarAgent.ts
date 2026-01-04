// Stub for emarAgent - disabled functionality
// This module is not implemented; the standard extraction path is used instead

import type { AiUserContext } from "./aiClient";

interface EmarAgentResult {
  entries: any[];
  metadata: {
    serviceUserInitials: string;
    allergies: string;
    medications: any[];
    dates: string[];
    timeSlots: string[];
  };
  consensusStatus: string;
  validationPassed: boolean;
  model: string;
}

export const emarAgent = {
  async extract(
    _analysisText: string,
    _tableStructure: any,
    _correctionsContext: string,
    _aiUserContext: AiUserContext
  ): Promise<EmarAgentResult> {
    throw new Error("emarAgent is not implemented - use standard extraction");
  }
};
