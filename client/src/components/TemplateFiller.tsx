import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit3, CheckCircle2, Copy, Download, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlaceholderInfo {
  placeholder: string;
  label: string;
  value: string;
  hint: string;
}

// Mapping of placeholder types to helpful hints
const PLACEHOLDER_HINTS: Record<string, string> = {
  "Name": "Service user's full name (e.g., John Smith)",
  "NHS Number": "10-digit NHS number (e.g., 123 456 7890)",
  "NI Number": "National Insurance number (e.g., AB123456C)",
  "Date of Birth": "Date in DD/MM/YYYY format (e.g., 15/03/1945)",
  "Age": "Current age in years (e.g., 80)",
  "Postcode": "Full UK postcode (e.g., SW1A 1AA)",
  "Address": "Full address including house number and street",
  "Phone": "Contact telephone number (e.g., 07700 900123)",
  "Email": "Email address (e.g., name@example.com)",
  "Staff Member": "Care worker name (e.g., Jane Doe)",
  "Healthcare Professional": "GP/Nurse/Therapist name (e.g., Dr. A. Brown)",
  "Contact Number": "Emergency contact number",
  "Date": "Relevant date in DD/MM/YYYY format",
  "Personal Field": "Relevant personal information",
  "Redacted": "Previously redacted information",
};

interface TemplateFillerProps {
  templateText: string;
  onComplete: (filledText: string) => void;
  title?: string;
  trigger?: React.ReactNode;
}

export function TemplateFiller({
  templateText,
  onComplete,
  title = "Complete Template",
  trigger,
}: TemplateFillerProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Extract all unique placeholders from the template
  const placeholders = useMemo(() => {
    const pattern = /\[([^\]]+)\]/g;
    const found: PlaceholderInfo[] = [];
    const seen = new Set<string>();
    let match;

    while ((match = pattern.exec(templateText)) !== null) {
      const placeholder = match[0];
      const label = match[1];
      
      if (!seen.has(placeholder)) {
        seen.add(placeholder);
        found.push({
          placeholder,
          label,
          value: "",
          hint: PLACEHOLDER_HINTS[label] || `Enter the ${label.toLowerCase()}`,
        });
      }
    }

    return found;
  }, [templateText]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    placeholders.forEach(p => {
      initial[p.placeholder] = "";
    });
    return initial;
  });

  // Reset values when template changes
  useMemo(() => {
    const newValues: Record<string, string> = {};
    placeholders.forEach(p => {
      newValues[p.placeholder] = values[p.placeholder] || "";
    });
    setValues(newValues);
  }, [templateText]);

  const updateValue = useCallback((placeholder: string, value: string) => {
    setValues(prev => ({
      ...prev,
      [placeholder]: value,
    }));
  }, []);

  // Generate the filled template
  const filledText = useMemo(() => {
    let result = templateText;
    Object.entries(values).forEach(([placeholder, value]) => {
      if (value.trim()) {
        // Replace all occurrences of this placeholder
        result = result.split(placeholder).join(value);
      }
    });
    return result;
  }, [templateText, values]);

  // Count completed vs total
  const completed = Object.values(values).filter(v => v.trim()).length;
  const total = placeholders.length;
  const allComplete = completed === total;

  const handleCopy = () => {
    navigator.clipboard.writeText(filledText);
    toast({
      title: "Copied to Clipboard",
      description: allComplete 
        ? "Completed template copied" 
        : `Template copied (${total - completed} fields still need filling)`,
    });
  };

  const handleComplete = () => {
    onComplete(filledText);
    setOpen(false);
    toast({
      title: "Template Completed",
      description: "The filled template is ready for use",
    });
  };

  if (placeholders.length === 0) {
    return null; // No placeholders to fill
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Edit3 size={16} />
            Fill Template ({total} fields)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 size={20} />
            {title}
          </DialogTitle>
          <DialogDescription>
            Fill in the placeholder fields below. The template will update automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium">Progress</span>
          <div className="flex items-center gap-2">
            <Badge 
              variant={allComplete ? "default" : "secondary"}
              className={allComplete ? "bg-success" : ""}
            >
              {completed} / {total} completed
            </Badge>
            {allComplete && <CheckCircle2 size={16} className="text-success" />}
          </div>
        </div>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {placeholders.map((p, idx) => (
              <div key={p.placeholder} className="space-y-1.5">
                <Label htmlFor={`field-${idx}`} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {p.placeholder}
                  </Badge>
                  {values[p.placeholder]?.trim() && (
                    <CheckCircle2 size={14} className="text-success" />
                  )}
                </Label>
                <Input
                  id={`field-${idx}`}
                  placeholder={p.hint}
                  value={values[p.placeholder] || ""}
                  onChange={(e) => updateValue(p.placeholder, e.target.value)}
                  className={values[p.placeholder]?.trim() ? "border-green-300 dark:border-green-700" : ""}
                />
                <p className="text-xs text-muted-foreground">{p.hint}</p>
              </div>
            ))}
          </div>
        </ScrollArea>

        {!allComplete && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 dark:border-warning/30 rounded-lg">
            <AlertCircle size={16} className="text-warning" />
            <span className="text-sm text-warning">
              {total - completed} field{total - completed !== 1 ? 's' : ''} still need{total - completed === 1 ? 's' : ''} to be filled
            </span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => {
              // Download as text file
              const blob = new Blob([filledText], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `care-plan-template-${new Date().toISOString().split('T')[0]}.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast({
                title: "Downloaded",
                description: "Template saved as text file",
              });
            }} 
            className="gap-2"
          >
            <Download size={16} />
            Download
          </Button>
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            <Copy size={16} />
            Copy {allComplete ? "Completed" : "Partial"}
          </Button>
          <Button 
            onClick={handleComplete} 
            disabled={!allComplete}
            className="gap-2"
          >
            <CheckCircle2 size={16} />
            Use Completed Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simple template preview with highlighted placeholders
 */
export function TemplatePreview({ 
  text, 
  maxLength = 200 
}: { 
  text: string; 
  maxLength?: number;
}) {
  const truncated = text.length > maxLength 
    ? text.slice(0, maxLength) + "..." 
    : text;

  const highlighted = useMemo(() => {
    const pattern = /\[([^\]]+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = pattern.exec(truncated)) !== null) {
      if (match.index > lastIndex) {
        parts.push(truncated.slice(lastIndex, match.index));
      }
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center px-1 py-0.5 mx-0.5 bg-warning/10 dark:bg-warning/30 text-warning rounded text-xs font-medium border border-warning/30"
        >
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < truncated.length) {
      parts.push(truncated.slice(lastIndex));
    }
    return parts.length > 0 ? parts : truncated;
  }, [truncated]);

  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      {highlighted}
    </p>
  );
}

export default TemplateFiller;
