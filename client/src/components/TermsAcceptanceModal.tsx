import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Shield, AlertTriangle, LogOut, User, Calendar } from "lucide-react";
import { CURRENT_TERMS_VERSION } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";

interface TermsAcceptanceModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TermsAcceptanceModal({ open, onAccept, onDecline }: TermsAcceptanceModalProps) {
  const [hasRead, setHasRead] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const { toast } = useToast();

  // Get today's date in DD/MM/YYYY format for validation
  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const acceptTermsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/accept-terms", { 
        version: CURRENT_TERMS_VERSION,
        signatureName: signatureName.trim(),
        signatureDate: signatureDate.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      toast({
        title: "Terms Accepted",
        description: "Thank you for accepting the Terms and Conditions.",
      });
      onAccept();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept terms. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = () => {
    acceptTermsMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Terms and Conditions Agreement
            </DialogTitle>
            <Badge variant="secondary" className="font-mono">Version {CURRENT_TERMS_VERSION}</Badge>
          </div>
          <DialogDescription>
            Please read and accept the Terms and Conditions to continue using CareAssurance.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-warning/[0.08] border border-warning/25 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/85">
              Please review the key points below. The platform is assistive; keep data safe, respect IP, and verify outputs before acting.
            </p>
          </div>
        </div>

        <div 
          className="flex-1 border rounded-lg p-4 max-h-[400px] overflow-y-auto" 
          onScroll={handleScroll}
        >
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="font-semibold text-foreground mb-2">1. Software Ownership and Rights</h3>
              <p className="text-muted-foreground">
                CareAssurance is proprietary software wholly owned by Lewis Barron. All intellectual property rights, including copyright, trademarks, trade secrets, patents, and all other proprietary rights are exclusively owned by Lewis Barron. All rights not expressly granted herein are reserved.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">2. Confidentiality and Non-Disclosure</h3>
              <p className="text-muted-foreground">
                By accessing this Software, you enter into a legally binding confidentiality agreement. All aspects of CareAssurance, including its functionality, features, user interface, workflows, algorithms, methods, processes, and business model constitute Confidential Information. You agree to keep all Confidential Information strictly confidential and not disclose it to any third party.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">3. Non-Copying and Non-Replication</h3>
              <div className="bg-destructive/[0.08] border border-destructive/25 rounded p-3 mb-2">
                <p className="text-destructive text-xs">
                  You are strictly prohibited from copying, replicating, reproducing, or creating derivative works based on any aspect of CareAssurance. This prohibition applies regardless of whether you have been granted access, viewed a demonstration, or been presented with the concept in any form.
                </p>
              </div>
              <p className="text-muted-foreground">
                Prohibited activities include developing similar software, using knowledge gained to create competing products, sharing information for the purpose of enabling others to create similar software, or assisting any third party in such activities. This prohibition continues indefinitely.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">4. Non-Circumvention</h3>
              <p className="text-muted-foreground">
                You agree not to circumvent Lewis Barron's relationships with users, customers, or partners. This includes not approaching contacts to offer competing services, not using information to divert business opportunities, and not soliciting employees or contractors for competing projects.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">5. Consequences of Violation</h3>
              <p className="text-muted-foreground">
                Serious breaches (for example, misuse of data, unauthorised copying, or security risks) may lead to suspension and, if required, proportionate legal action. If you think an action was taken in error, please contact the Owner to review.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">6. Assistive Tool Disclaimer</h3>
              <p className="text-muted-foreground">
                CareAssurance is an assistive tool only. It provides AI-generated suggestions that must be verified by qualified professionals. It is NOT medical advice, legal advice, or a substitute for professional judgment. All outputs require human review before implementation.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">7. Termination Rights</h3>
              <p className="text-muted-foreground">
                Access may be suspended or revoked for breach, security, or compliance risks. Where possible, notice will be given and issues can be discussed; urgent risks may require immediate action.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">8. Governing Law</h3>
              <p className="text-muted-foreground">
                These Terms shall be governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
              </p>
            </section>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                This is a summary. The full Terms and Conditions are available on the Terms page.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Checkbox 
              id="terms-accept" 
              checked={hasRead} 
              onCheckedChange={(checked) => setHasRead(checked === true)}
              disabled={!hasScrolledToBottom}
              data-testid="checkbox-accept-terms"
            />
            <label 
              htmlFor="terms-accept" 
              className={`text-sm cursor-pointer ${!hasScrolledToBottom ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              I have read, understood, and agree to be legally bound by the Terms and Conditions, including the confidentiality, non-disclosure, non-copying, and intellectual property protection clauses.
              {!hasScrolledToBottom && (
                <span className="block text-xs text-muted-foreground mt-1">
                  (Please scroll to the bottom to enable this checkbox)
                </span>
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="space-y-2">
              <Label htmlFor="signature-name" className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Full Name (as signature)
              </Label>
              <Input
                id="signature-name"
                placeholder="Type your full name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                disabled={!hasRead}
                className="bg-background"
                data-testid="input-signature-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signature-date" className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Today's Date (DD/MM/YYYY)
              </Label>
              <Input
                id="signature-date"
                placeholder={todayFormatted}
                value={signatureDate}
                onChange={(e) => setSignatureDate(e.target.value)}
                disabled={!hasRead}
                className="bg-background"
                data-testid="input-signature-date"
              />
              {signatureDate && signatureDate !== todayFormatted && (
                <p className="text-xs text-warning">Expected: {todayFormatted}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button 
              variant="outline" 
              onClick={onDecline}
              className="gap-2"
              data-testid="button-decline-terms"
            >
              <LogOut className="h-4 w-4" />
              Decline & Logout
            </Button>
            <Button 
              onClick={handleAccept}
              disabled={!hasRead || !signatureName.trim() || signatureDate !== todayFormatted || acceptTermsMutation.isPending}
              className="gap-2"
              data-testid="button-accept-terms"
            >
              <Shield className="h-4 w-4" />
              {acceptTermsMutation.isPending ? "Accepting..." : "Accept Terms"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
