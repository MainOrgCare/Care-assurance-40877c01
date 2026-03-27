import { Clock, Shield } from "lucide-react";
import { useTemporaryDataTimer } from "@/context/TemporaryDataContext";

export default function UploadDisclaimer() {
  const { timeLeft } = useTemporaryDataTimer();
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-warning/[0.07] border border-warning/25 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Clock className="text-warning" size={18} />
            {timeLeft !== null && (
              <span className="px-2 py-1 bg-warning/15 text-warning rounded font-mono tabular-nums text-sm font-semibold">
                {formatTime(timeLeft)}
              </span>
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-foreground">Temporary Uploads</h4>
            <p className="text-xs text-foreground/80 leading-relaxed">
              Uploaded documents are processed in memory and <strong className="text-foreground">not stored</strong> as files in the database. They are <strong className="text-foreground">cleared automatically</strong> after 30 minutes of inactivity or when you log out.
              Some derived information (for example, audit results) may be saved if you choose to save it.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 border border-border p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <Shield className="text-primary shrink-0 mt-0.5" size={18} />
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-primary">Legal Authorization Notice</h4>
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
              Please only upload data you are authorised to handle. Unauthorised uploads or misuse of third-party data may breach your organisation's policies and applicable law.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
