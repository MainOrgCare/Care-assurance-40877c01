import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, Shield, AlertCircle, Loader2 } from "lucide-react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useToast } from "@/hooks/use-toast";
import UploadDisclaimer from "@/components/UploadDisclaimer";

export default function ServiceUserUpload() {
  const { uploadFile, serviceUserData } = useTemporaryData();
  const { toast } = useToast();

  const handleUpload = (section: "socialWork" | "initialAssessment" | "carePlan", e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(section, e.target.files[0]);
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded to ${section} section. Timer reset.`,
      });
    }
  };

  return (
    <div className="page-shell">
      <div>
        <h2 className="text-3xl font-heading font-bold text-foreground">Service User Data Upload</h2>
        <p className="text-muted-foreground mt-2">
          Securely upload critical documentation. Data is temporarily stored for 30 minutes before permanent deletion.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Box 1: Social Work */}
        <Card className={`border-dashed border-2 transition-all ${serviceUserData.socialWork ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-blue-500/50 hover:bg-muted'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {serviceUserData.socialWork ? <CheckCircle className="text-green-500" /> : <FileText className="text-blue-400" />}
              Social Work Docs
            </CardTitle>
            <CardDescription>Upload C2, C3, or Email correspondence (PDF or Word).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-4">
             {serviceUserData.socialWork ? (
               <div className="text-sm font-medium">
                 <span className={serviceUserData.socialWork.parseError ? "text-red-400" : "text-green-400"}>
                   {serviceUserData.socialWork.name}
                 </span>
                 {serviceUserData.socialWork.isParsing ? (
                   <p className="text-xs text-blue-400 mt-1 flex items-center justify-center gap-1">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </p>
                 ) : serviceUserData.socialWork.parseError ? (
                   <p className="text-xs text-red-400 mt-1">{serviceUserData.socialWork.parseError}</p>
                 ) : (
                   <p className="text-xs text-muted-foreground mt-1">Ready for processing</p>
                 )}
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-social" className="cursor-pointer flex flex-col items-center">
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to select file</span>
                 </label>
                 <input id="upload-social" type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => handleUpload("socialWork", e)} data-testid="input-upload-social" />
               </div>
             )}
          </CardContent>
        </Card>

        {/* Box 2: Initial Assessment */}
        <Card className={`border-dashed border-2 transition-all ${serviceUserData.initialAssessment ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-purple-500/50 hover:bg-muted'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {serviceUserData.initialAssessment ? <CheckCircle className="text-green-500" /> : <Shield className="text-purple-400" />}
              Initial Assessment
            </CardTitle>
            <CardDescription>Upload initial risk and needs assessment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-4">
             {serviceUserData.initialAssessment ? (
               <div className="text-sm font-medium">
                 <span className={serviceUserData.initialAssessment.parseError ? "text-red-400" : "text-green-400"}>
                   {serviceUserData.initialAssessment.name}
                 </span>
                 {serviceUserData.initialAssessment.isParsing ? (
                   <p className="text-xs text-blue-400 mt-1 flex items-center justify-center gap-1">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </p>
                 ) : serviceUserData.initialAssessment.parseError ? (
                   <p className="text-xs text-red-400 mt-1">{serviceUserData.initialAssessment.parseError}</p>
                 ) : (
                   <p className="text-xs text-muted-foreground mt-1">Ready for processing</p>
                 )}
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-assess" className="cursor-pointer flex flex-col items-center">
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to select file</span>
                 </label>
                 <input id="upload-assess" type="file" accept=".pdf" className="hidden" onChange={(e) => handleUpload("initialAssessment", e)} data-testid="input-upload-assessment" />
               </div>
             )}
          </CardContent>
        </Card>

        {/* Box 3: Care Plan */}
        <Card className={`border-dashed border-2 transition-all ${serviceUserData.carePlan ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-orange-500/50 hover:bg-muted'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {serviceUserData.carePlan ? <CheckCircle className="text-green-500" /> : <AlertCircle className="text-orange-400" />}
              Current Care Plan
            </CardTitle>
            <CardDescription>Upload existing care plan for enhancement.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-4">
             {serviceUserData.carePlan ? (
               <div className="text-sm font-medium">
                 <span className={serviceUserData.carePlan.parseError ? "text-red-400" : "text-green-400"}>
                   {serviceUserData.carePlan.name}
                 </span>
                 {serviceUserData.carePlan.isParsing ? (
                   <p className="text-xs text-blue-400 mt-1 flex items-center justify-center gap-1">
                     <Loader2 className="h-3 w-3 animate-spin" /> Parsing document...
                   </p>
                 ) : serviceUserData.carePlan.parseError ? (
                   <p className="text-xs text-red-400 mt-1">{serviceUserData.carePlan.parseError}</p>
                 ) : (
                   <p className="text-xs text-muted-foreground mt-1">Ready for processing</p>
                 )}
               </div>
             ) : (
               <div className="w-full">
                 <label htmlFor="upload-plan" className="cursor-pointer flex flex-col items-center">
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to select file</span>
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
