import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSearch, CheckCircle, AlertTriangle, ArrowRight, Loader2, FileInput, Globe, Link as LinkIcon } from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

// Mock data for "Analyzed" state
const analysisResults = {
  score: 82,
  issues: [
    { id: 1, type: "Missed Dose", resident: "Eleanor Rigby", med: "Amlodipine 5mg", time: "08:00 AM", status: "Critical" },
    { id: 2, type: "No Signature", resident: "Eleanor Rigby", med: "Metformin 500mg", time: "01:00 PM", status: "Warning" },
    { id: 3, type: "Stock Mismatch", resident: "Eleanor Rigby", med: "Paracetamol", time: "N/A", status: "Warning" },
  ],
  summary: "Patient missed morning hypertension medication. Afternoon diabetes medication administered but not signed. Stock count discrepancy noted for PRN pain relief."
};

export default function MARAnalysis() {
  const [step, setStep] = useState<"upload" | "analyzing" | "results">("upload");
  const [, setLocation] = useLocation();

  const handleAnalyze = () => {
    setStep("analyzing");
    // Simulate API delay
    setTimeout(() => {
      setStep("results");
    }, 2500);
  };

  const handleGeneratePlan = () => {
    // Navigate to care planning with data in URL state or context (mocked here by just navigating)
    setLocation("/care-planning?source=mar_analysis_123");
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">MAR Analysis Engine</h2>
        <p className="text-muted-foreground">Upload electronic MAR charts or connect to eMAR web portals to audit for CQC compliance gaps.</p>
      </div>

      {step === "upload" && (
        <Tabs defaultValue="file" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px] mx-auto mb-8">
            <TabsTrigger value="file">File Upload</TabsTrigger>
            <TabsTrigger value="web">Web Portal Integration</TabsTrigger>
          </TabsList>
          
          <TabsContent value="file">
            <Card className="border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-12 flex flex-col items-center justify-center text-center space-y-4 hover:bg-muted/10 transition-colors">
              <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                <Upload size={32} />
              </div>
              <h3 className="text-xl font-semibold">Upload eMAR Export</h3>
              <p className="text-muted-foreground max-w-md">Drag and drop your .CSV, .PDF or .XLSX file here, or click to browse. Our AI reads and extracts medication data from your document, then automated checks validate the results for accuracy.</p>
              <Button size="lg" className="mt-4" onClick={handleAnalyze}>
                Select File & Analyze
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="web">
             <Card className="p-8 flex flex-col items-center justify-center space-y-6">
                <div className="text-center space-y-2">
                   <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Globe size={32} />
                   </div>
                   <h3 className="text-xl font-semibold">Connect to External eMAR Portal</h3>
                   <p className="text-muted-foreground max-w-md mx-auto">
                     Enter the URL of the eMAR system page you want to analyze. Our system will securely read the visible table data.
                   </p>
                </div>
                
                <div className="flex w-full max-w-md items-center space-x-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input type="url" placeholder="https://portal.emar-system.com/reports/daily..." className="pl-9" />
                  </div>
                  <Button onClick={handleAnalyze}>Fetch & Analyze</Button>
                </div>
                
                <div className="p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground max-w-md text-left border">
                  <strong>Note:</strong> Requires browser extension or proxy configuration to access secure portals. This demo simulates a successful fetch from a secure eMAR dashboard.
                </div>
             </Card>
          </TabsContent>
        </Tabs>
      )}

      {step === "analyzing" && (
        <Card className="p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative">
             <div className="h-16 w-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-primary">
                <FileSearch size={24} />
             </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Analyzing Records...</h3>
            <p className="text-muted-foreground">Scanning for missed doses, signature gaps, and timing errors.</p>
          </div>
          <div className="w-full max-w-md bg-secondary h-2 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-progress origin-left" style={{ width: '70%' }}></div>
          </div>
        </Card>
      )}

      {step === "results" && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
               <CardHeader>
                 <CardTitle>Compliance Audit Report</CardTitle>
                 <CardDescription>Generated on {new Date().toLocaleDateString()}</CardDescription>
               </CardHeader>
               <CardContent>
                 <div className="mb-6 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 p-4 rounded-lg flex gap-3">
                    <AlertTriangle className="text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-yellow-900 dark:text-yellow-500">Compliance Issues Detected</h4>
                      <p className="text-sm text-yellow-800 dark:text-yellow-400 mt-1">{analysisResults.summary}</p>
                    </div>
                 </div>

                 <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue Type</TableHead>
                        <TableHead>Medication</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Severity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.issues.map((issue) => (
                        <TableRow key={issue.id}>
                          <TableCell className="font-medium">{issue.type}</TableCell>
                          <TableCell>{issue.med}</TableCell>
                          <TableCell>{issue.time}</TableCell>
                          <TableCell>
                            <Badge variant={issue.status === "Critical" ? "destructive" : "secondary"}>
                              {issue.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                 </Table>
               </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-center">Compliance Score</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative flex items-center justify-center">
                  <svg className="h-32 w-32 transform -rotate-90">
                    <circle
                      className="text-primary/10"
                      strokeWidth="10"
                      stroke="currentColor"
                      fill="transparent"
                      r="58"
                      cx="64"
                      cy="64"
                    />
                    <circle
                      className="text-primary"
                      strokeWidth="10"
                      strokeDasharray={365}
                      strokeDashoffset={365 - (365 * analysisResults.score) / 100}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r="58"
                      cx="64"
                      cy="64"
                    />
                  </svg>
                  <span className="absolute text-4xl font-bold text-primary">{analysisResults.score}%</span>
                </div>
                <p className="text-sm text-center text-muted-foreground mt-4">Requires Improvement</p>
              </CardContent>
              <CardFooter className="flex-col gap-3">
                <Button className="w-full" onClick={handleGeneratePlan}>
                  Generate Care Plan <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setStep("upload")}>
                  Upload New File
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
