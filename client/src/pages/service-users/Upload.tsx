import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, Shield, AlertCircle, Loader2, CloudUpload, File, Check } from "lucide-react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useToast } from "@/hooks/use-toast";
import UploadDisclaimer from "@/components/UploadDisclaimer";

export default function ServiceUserUpload() {
  const { uploadFile, serviceUserData } = useTemporaryData();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleUpload = (section: "socialWork" | "initialAssessment" | "carePlan", e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(section, e.target.files[0]);
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded to ${section} section. Timer reset.`,
      });
    }
  };

  const handleDrop = (section: "socialWork" | "initialAssessment" | "carePlan", e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(section, e.dataTransfer.files[0]);
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
    <div className="page-shell">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Service User Data Upload</h2>
        <p className="text-sm text-muted-foreground/80 mt-1.5">
          Securely upload critical documentation. Data is temporarily stored for 30 minutes before permanent deletion.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Box 1: Social Work */}
        <Card 
          className={`relative overflow-hidden transition-all duration-300 ${
            serviceUserData.socialWork 
              ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]' 
              : dragOver === 'socialWork'
                ? 'border-blue-500/50 bg-blue-500/5 border-dashed border-2 scale-[1.02]'
                : 'border-dashed border-2 border-border/60 hover:border-blue-500/40 hover:bg-muted/30'
          }`}
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
          className={`relative overflow-hidden transition-all duration-300 ${
            serviceUserData.initialAssessment 
              ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]' 
              : dragOver === 'initialAssessment'
                ? 'border-violet-500/50 bg-violet-500/5 border-dashed border-2 scale-[1.02]'
                : 'border-dashed border-2 border-border/60 hover:border-violet-500/40 hover:bg-muted/30'
          }`}
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
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-assess" className="cursor-pointer flex flex-col items-center group">
                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-violet-500/10 transition-colors">
                      <CloudUpload className="h-6 w-6 text-muted-foreground/50 group-hover:text-violet-400 transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 group-hover:text-foreground/70 transition-colors">Drop file here or click to browse</span>
                 </label>
                 <input id="upload-assess" type="file" accept=".pdf" className="hidden" onChange={(e) => handleUpload("initialAssessment", e)} data-testid="input-upload-assessment" />
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
      </div>

      <UploadDisclaimer />
    </div>
  );
}
