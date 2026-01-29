import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, Shield, AlertCircle, Loader2, CloudUpload, File, Check } from "lucide-react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useToast } from "@/hooks/use-toast";
import UploadDisclaimer from "@/components/UploadDisclaimer";
import { cn } from "@/lib/utils";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const formatTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ServiceUserUpload() {
  const { uploadFile, serviceUserData, removeAdditionalDocument } = useTemporaryData();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const initialAssessmentInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = (section: "socialWork" | "initialAssessment" | "carePlan" | "movingHandling" | "additionalDocuments", e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach((file) => uploadFile(section, file));
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded to ${section} section. Timer reset.`,
      });
    }
  };

  const handleDrop = (section: "socialWork" | "initialAssessment" | "carePlan" | "movingHandling" | "additionalDocuments", e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      Array.from(e.dataTransfer.files).forEach((file) => uploadFile(section, file));
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded to ${section} section. Timer reset.`,
      });
    }
  };

  const handleDragOver = (section: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(section);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  return (
    <div className="page-shell max-w-6xl mx-auto">
      <div className="animate-slide-up stagger-1">
        <h1 className="page-title text-3xl">Secure Intake Portal</h1>
        <p className="page-subtitle max-w-2xl">
          Establishing a temporal data link for clinical documentation. Ingested payloads are volatile and will self-terminate after 30 minutes of inactivity.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-slide-up stagger-2">
        {/* Box 1: Social Work */}
        <Card 
          className={cn(
            "relative overflow-hidden transition-all duration-500 group",
            serviceUserData.socialWork 
              ? 'border-success/40 bg-success/5 shadow-glow'
              : dragOver === 'socialWork'
                ? 'border-primary/50 bg-primary/5 border-dashed border-2 scale-[1.03]'
                : 'border-dashed border-2 border-border/60 hover:border-primary/40 hover:bg-muted/30'
          )}
          onDrop={(e) => handleDrop("socialWork", e)}
          onDragOver={(e) => handleDragOver("socialWork", e)}
          onDragLeave={handleDragLeave}
        >
          {serviceUserData.socialWork && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          )}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                serviceUserData.socialWork 
                  ? 'bg-emerald-500/15' 
                  : 'bg-blue-500/10'
              }`}>
                {serviceUserData.socialWork 
                  ? <Check className="h-4 w-4 text-emerald-500" /> 
                  : <FileText className="h-4 w-4 text-blue-400" />
                }
              </div>
              Social Work Docs
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/70">Upload C2, C3, or Email correspondence (PDF or Word).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
             {serviceUserData.socialWork ? (
               <div className="text-sm w-full">
                 <div className="flex items-center justify-center gap-2 mb-2">
                   <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                     <File className="h-4 w-4 text-emerald-500" />
                   </div>
                   <span className={`font-medium truncate max-w-[150px] ${serviceUserData.socialWork.parseError ? "text-rose-400" : "text-emerald-400"}`}>
                     {serviceUserData.socialWork.name}
                   </span>
                 </div>
                 {serviceUserData.socialWork.isParsing ? (
                   <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </div>
                 ) : serviceUserData.socialWork.parseError ? (
                   <p className="text-xs text-rose-400 bg-rose-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">{serviceUserData.socialWork.parseError}</p>
                 ) : (
                   <p className="text-[11px] text-emerald-500/70">Ready for processing</p>
                 )}
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-social" className="cursor-pointer flex flex-col items-center group">
                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-blue-500/10 transition-colors">
                      <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">Drop file here or click to browse</span>
                 </label>
                 <input id="upload-social" type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => handleUpload("socialWork", e)} data-testid="input-upload-social" />
               </div>
             )}
          </CardContent>
        </Card>

        {/* Box 2: Initial Assessment */}
        <Card 
          className={cn(
            "relative overflow-hidden transition-all duration-500 group",
            serviceUserData.initialAssessment 
              ? 'border-success/40 bg-success/5 shadow-glow'
              : dragOver === 'initialAssessment'
                ? 'border-violet-500/50 bg-violet-500/5 border-dashed border-2 scale-[1.03]'
                : 'border-dashed border-2 border-border/60 hover:border-violet-500/40 hover:bg-muted/30'
          )}
          onDrop={(e) => handleDrop("initialAssessment", e)}
          onDragOver={(e) => handleDragOver("initialAssessment", e)}
          onDragLeave={handleDragLeave}
        >
          {serviceUserData.initialAssessment && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          )}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                serviceUserData.initialAssessment 
                  ? 'bg-emerald-500/15' 
                  : 'bg-violet-500/10'
              }`}>
                {serviceUserData.initialAssessment 
                  ? <Check className="h-4 w-4 text-emerald-500" /> 
                  : <Shield className="h-4 w-4 text-violet-400" />
                }
              </div>
              Initial Assessment
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/70">Upload initial risk and needs assessment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
             <input
               ref={initialAssessmentInputRef}
               id="upload-assess"
               type="file"
               accept=".pdf,.docx"
               className="hidden"
               onChange={(e) => handleUpload("initialAssessment", e)}
               data-testid="input-upload-assessment"
             />
             {serviceUserData.initialAssessment ? (
               <div className="text-sm w-full">
                 <div className="flex items-center justify-center gap-2 mb-2">
                   <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                     <File className="h-4 w-4 text-emerald-500" />
                   </div>
                   <span className={`font-medium truncate max-w-[150px] ${serviceUserData.initialAssessment.parseError ? "text-rose-400" : "text-emerald-400"}`}>
                     {serviceUserData.initialAssessment.name}
                   </span>
                 </div>
                 {serviceUserData.initialAssessment.isParsing ? (
                   <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </div>
                 ) : serviceUserData.initialAssessment.parseError ? (
                   <p className="text-xs text-rose-400 bg-rose-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">{serviceUserData.initialAssessment.parseError}</p>
                 ) : (
                   <p className="text-[11px] text-emerald-500/70">Ready for processing</p>
                 )}
                 <div className="mt-3 space-y-1 text-[11px] text-muted-foreground/70">
                   <div className="flex items-center justify-between">
                     <span>File size</span>
                     <span className="text-foreground/80">{formatBytes(serviceUserData.initialAssessment.size)}</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span>Uploaded</span>
                     <span className="text-foreground/80">{formatTimestamp(serviceUserData.initialAssessment.timestamp)}</span>
                   </div>
                   {serviceUserData.initialAssessment.content && !serviceUserData.initialAssessment.isParsing && !serviceUserData.initialAssessment.parseError && (
                     <div className="flex items-center justify-between">
                       <span>Extracted text</span>
                       <span className="text-foreground/80">{serviceUserData.initialAssessment.content.length.toLocaleString()} chars</span>
                     </div>
                   )}
                 </div>
                 <Button
                   variant="outline"
                   size="sm"
                   className="mt-3 w-full"
                   onClick={() => initialAssessmentInputRef.current?.click()}
                   data-testid="button-replace-initial-assessment"
                 >
                   Replace Initial Assessment
                 </Button>
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-assess" className="cursor-pointer flex flex-col items-center group">
                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-violet-500/10 transition-colors">
                      <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-violet-400 transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">Drop file here or click to browse</span>
                 </label>
                 <div className="mt-4 rounded-lg border border-border/60 bg-muted/40 p-3 text-left text-[11px] text-muted-foreground/80">
                   <p className="text-foreground text-xs font-medium">What to include</p>
                   <ul className="mt-2 space-y-1">
                     <li>- Mobility, transfers, falls history</li>
                     <li>- Nutrition, allergies, swallowing risks</li>
                     <li>- Cognition, communication, capacity</li>
                   </ul>
                   <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                     Formats: PDF or DOCX
                   </p>
                 </div>
               </div>
             )}
          </CardContent>
        </Card>

        {/* Box 3: Care Plan */}
        <Card 
          className={`relative overflow-hidden transition-all duration-300 ${
            serviceUserData.carePlan 
              ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]' 
              : dragOver === 'carePlan'
                ? 'border-amber-500/50 bg-amber-500/5 border-dashed border-2 scale-[1.02]'
                : 'border-dashed border-2 border-border/60 hover:border-amber-500/40 hover:bg-muted/30'
          }`}
          onDrop={(e) => handleDrop("carePlan", e)}
          onDragOver={(e) => handleDragOver("carePlan", e)}
          onDragLeave={handleDragLeave}
        >
          {serviceUserData.carePlan && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          )}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                serviceUserData.carePlan 
                  ? 'bg-emerald-500/15' 
                  : 'bg-amber-500/10'
              }`}>
                {serviceUserData.carePlan 
                  ? <Check className="h-4 w-4 text-emerald-500" /> 
                  : <AlertCircle className="h-4 w-4 text-amber-400" />
                }
              </div>
              Current Care Plan
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/70">Upload existing care plan for enhancement.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
             {serviceUserData.carePlan ? (
               <div className="text-sm w-full">
                 <div className="flex items-center justify-center gap-2 mb-2">
                   <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                     <File className="h-4 w-4 text-emerald-500" />
                   </div>
                   <span className={`font-medium truncate max-w-[150px] ${serviceUserData.carePlan.parseError ? "text-rose-400" : "text-emerald-400"}`}>
                     {serviceUserData.carePlan.name}
                   </span>
                 </div>
                 {serviceUserData.carePlan.isParsing ? (
                   <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </div>
                 ) : serviceUserData.carePlan.parseError ? (
                   <p className="text-xs text-rose-400 bg-rose-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">{serviceUserData.carePlan.parseError}</p>
                 ) : (
                   <p className="text-[11px] text-emerald-500/70">Ready for processing</p>
                 )}
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-plan" className="cursor-pointer flex flex-col items-center group">
                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-amber-500/10 transition-colors">
                      <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">Drop file here or click to browse</span>
                 </label>
                 <input id="upload-plan" type="file" accept=".pdf" className="hidden" onChange={(e) => handleUpload("carePlan", e)} data-testid="input-upload-careplan" />
               </div>
             )}
          </CardContent>
        </Card>

        {/* Box 4: Moving & Handling */}
        <Card
          className={`relative overflow-hidden transition-all duration-300 ${
            serviceUserData.movingHandling
              ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              : dragOver === "movingHandling"
                ? "border-sky-500/50 bg-sky-500/5 border-dashed border-2 scale-[1.02]"
                : "border-dashed border-2 border-border/60 hover:border-sky-500/40 hover:bg-muted/30"
          }`}
          onDrop={(e) => handleDrop("movingHandling", e)}
          onDragOver={(e) => handleDragOver("movingHandling", e)}
          onDragLeave={handleDragLeave}
        >
          {serviceUserData.movingHandling && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          )}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                  serviceUserData.movingHandling ? "bg-emerald-500/15" : "bg-sky-500/10"
                }`}
              >
                {serviceUserData.movingHandling ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Upload className="h-4 w-4 text-sky-400" />
                )}
              </div>
              Moving & Handling Plan
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/70">
              Upload moving & handling plans or mobility guidance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
            {serviceUserData.movingHandling ? (
              <div className="text-sm w-full">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <File className="h-4 w-4 text-emerald-500" />
                  </div>
                  <span
                    className={`font-medium truncate max-w-[150px] ${
                      serviceUserData.movingHandling.parseError ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {serviceUserData.movingHandling.name}
                  </span>
                </div>
                {serviceUserData.movingHandling.isParsing ? (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">
                    <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                  </div>
                ) : serviceUserData.movingHandling.parseError ? (
                  <p className="text-xs text-rose-400 bg-rose-500/10 py-1.5 px-3 rounded-full mx-auto w-fit">
                    {serviceUserData.movingHandling.parseError}
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-500/70">Ready for processing</p>
                )}
              </div>
            ) : (
              <div className="w-full">
                <label htmlFor="upload-moving-handling" className="cursor-pointer flex flex-col items-center group">
                  <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-sky-500/10 transition-colors">
                    <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-sky-400 transition-colors" />
                  </div>
                  <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">
                    Drop file here or click to browse
                  </span>
                </label>
                <input
                  id="upload-moving-handling"
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => handleUpload("movingHandling", e)}
                  data-testid="input-upload-moving-handling"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Box 5: Additional Documents */}
        <Card
          className={`relative overflow-hidden transition-all duration-300 ${
            (serviceUserData.additionalDocuments || []).length > 0
              ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              : dragOver === "additionalDocuments"
                ? "border-indigo-500/50 bg-indigo-500/5 border-dashed border-2 scale-[1.02]"
                : "border-dashed border-2 border-border/60 hover:border-indigo-500/40 hover:bg-muted/30"
          }`}
          onDrop={(e) => handleDrop("additionalDocuments", e)}
          onDragOver={(e) => handleDragOver("additionalDocuments", e)}
          onDragLeave={handleDragLeave}
        >
          {(serviceUserData.additionalDocuments || []).length > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          )}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-indigo-500/10">
                <Upload className="h-4 w-4 text-indigo-400" />
              </div>
              Additional Documents
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/70">
              Upload extra care-related docs (multiple allowed).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
            <div className="w-full">
              <label htmlFor="upload-additional" className="cursor-pointer flex flex-col items-center group">
                <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-indigo-500/10 transition-colors">
                  <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-indigo-400 transition-colors" />
                </div>
                <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">
                  Drop files here or click to browse
                </span>
              </label>
              <input
                id="upload-additional"
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={(e) => handleUpload("additionalDocuments", e)}
                data-testid="input-upload-additional-docs"
              />
            </div>
            {(serviceUserData.additionalDocuments || []).length > 0 && (
              <div className="mt-2 w-full space-y-2 text-left text-xs text-muted-foreground/80">
                {(serviceUserData.additionalDocuments || []).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-2 py-2">
                    <div className="min-w-0">
                      <p className={`truncate text-[11px] ${doc.parseError ? "text-rose-400" : "text-foreground/80"}`}>
                        {doc.name}
                      </p>
                      {doc.isParsing ? (
                        <span className="text-[10px] text-blue-400">Parsing...</span>
                      ) : doc.parseError ? (
                        <span className="text-[10px] text-rose-400">{doc.parseError}</span>
                      ) : (
                        <span className="text-[10px] text-emerald-500/70">Ready</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => doc.id && removeAdditionalDocument(doc.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <UploadDisclaimer />
    </div>
  );
}
