import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface ProgressIndicatorProps {
  progress: number;
  status: string;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressIndicator({ 
  progress, 
  status, 
  showPercentage = true,
  className = "" 
}: ProgressIndicatorProps) {
  return (
    <div className={`space-y-3 ${className}`} data-testid="progress-indicator">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-blue-400" />
          <span className="text-sm text-muted-foreground" data-testid="progress-status">{status}</span>
        </div>
        {showPercentage && (
          <span className="text-sm font-medium text-foreground" data-testid="progress-percentage">
            {Math.round(progress)}%
          </span>
        )}
      </div>
      <Progress value={progress} className="h-2" data-testid="progress-bar" />
    </div>
  );
}

interface MultiStepProgressProps {
  steps: { name: string; status: "pending" | "in_progress" | "completed" }[];
  className?: string;
}

export function MultiStepProgress({ steps, className = "" }: MultiStepProgressProps) {
  const completedCount = steps.filter(s => s.status === "completed").length;
  const inProgressIndex = steps.findIndex(s => s.status === "in_progress");
  const currentStep = inProgressIndex >= 0 ? steps[inProgressIndex].name : steps[completedCount]?.name || "Processing...";
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className={`space-y-3 ${className}`} data-testid="multi-step-progress">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-blue-400" />
          <span className="text-sm text-muted-foreground" data-testid="progress-current-step">
            {currentStep}
          </span>
        </div>
        <span className="text-sm font-medium text-foreground" data-testid="progress-step-count">
          {completedCount}/{steps.length}
        </span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex flex-wrap gap-2">
        {steps.map((step, idx) => (
          <span
            key={idx}
            className={`text-xs px-2 py-1 rounded-full ${
              step.status === "completed"
                ? "bg-emerald-500/40 text-emerald-400"
                : step.status === "in_progress"
                ? "bg-blue-500/40 text-blue-400 animate-pulse"
                : "bg-muted text-muted-foreground"
            }`}
            data-testid={`step-${idx}`}
          >
            {step.name}
          </span>
        ))}
      </div>
    </div>
  );
}
