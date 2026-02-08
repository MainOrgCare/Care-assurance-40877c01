import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Table as TableIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Shared button component for copying tabular data to clipboard.
 * Used across EMAR Audit and Visit Audit pages.
 */
const TableCopyButton = memo(function TableCopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ 
      title: "Table Copied", 
      description: "Formatted for pasting into Access forms. Use Ctrl+V to paste." 
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="h-7 gap-1.5 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20" 
      onClick={handleCopy} 
      data-testid={`button-copy-table-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}
    >
      {copied ? <Check size={12} /> : <TableIcon size={12} />}
      Copy as Table
    </Button>
  );
});

export default TableCopyButton;
