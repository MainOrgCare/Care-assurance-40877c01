import { AlertTriangle, Clock, Shield, FileWarning } from "lucide-react";
import { useTemporaryData } from "@/context/TemporaryDataContext";

export default function UploadDisclaimer() {
  const { timeLeft } = useTemporaryData();
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-950/30 border border-amber-900/50 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Clock className="text-amber-400" size={18} />
            {timeLeft !== null && (
              <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded font-mono text-sm font-bold animate-pulse">
                {formatTime(timeLeft)}
              </span>
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-amber-400">Volatile Data Warning</h4>
            <p className="text-xs text-amber-300/70">
              All uploaded documents are held in temporary memory only. Your data will be <strong className="text-amber-200">permanently erased</strong> after 30 minutes of inactivity, 
              when navigating away from Service Users section, or when you log out. <strong className="text-amber-200">No data is saved to any database.</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 border border-border p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <Shield className="text-blue-400 shrink-0 mt-0.5" size={18} />
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-blue-400">Legal Authorization Notice</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              By uploading documents, you confirm that:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>You are authorized to access, export, and process these documents in your professional capacity</li>
              <li>If using data from third-party systems (including Access Group, Clece, or other care management software), you have the necessary permissions and are acting within your employment duties</li>
              <li>You accept full responsibility for the lawful handling of this data under UK GDPR and relevant care regulations</li>
              <li>You understand that AI analysis is provided as assistance only and should be verified by qualified professionals</li>
            </ul>
            <p className="text-xs text-muted-foreground/70 italic mt-2">
              The operator of this system accepts no liability for unauthorized document uploads or misuse of third-party data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
