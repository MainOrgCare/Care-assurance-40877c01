import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CURRENT_TERMS_VERSION } from "@shared/schema";
import { TermsAcceptanceModal } from "./TermsAcceptanceModal";

interface TermsGuardProps {
  children: React.ReactNode;
}

export function TermsGuard({ children }: TermsGuardProps) {
  const { user, logout, loading } = useAuth();
  const [justAccepted, setJustAccepted] = useState(false);
  
  if (loading) {
    return null;
  }

  if (!user) {
    return <>{children}</>;
  }

  const needsTermsAcceptance = !justAccepted && (
    !user.termsVersion || 
    user.termsVersion !== CURRENT_TERMS_VERSION
  );

  const handleAccept = () => {
    setJustAccepted(true);
  };

  const handleDecline = () => {
    logout();
  };

  if (needsTermsAcceptance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <TermsAcceptanceModal 
          open={true}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      </div>
    );
  }

  return <>{children}</>;
}
