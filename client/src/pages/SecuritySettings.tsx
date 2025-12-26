import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Shield, Lock, EyeOff, Clock, FileKey, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SecuritySettings() {
  const { toast } = useToast();
  const [retention, setRetention] = useState([24]);
  const [autoRedact, setAutoRedact] = useState(true);
  const [requirePassword, setRequirePassword] = useState(true);

  const handleSave = () => {
    toast({
      title: "Security Policy Updated",
      description: "Data retention and privacy protocols have been applied.",
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Security & Privacy Protocols</h2>
        <p className="text-muted-foreground">Configure automated data sealing, redaction policies, and access controls.</p>
      </div>

      <div className="grid gap-6">
        {/* Data Sealing Policy */}
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/10">
          <CardHeader>
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Lock className="h-5 w-5" />
              <CardTitle>Automatic Record Sealing</CardTitle>
            </div>
            <CardDescription>
              Completed assessments and analyses are automatically locked behind secondary authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Require Password for Historical Data</Label>
                <p className="text-sm text-muted-foreground">
                  Users must re-authenticate to view reports generated in the past.
                </p>
              </div>
              <Switch checked={requirePassword} onCheckedChange={setRequirePassword} />
            </div>
          </CardContent>
        </Card>

        {/* PII Redaction Policy */}
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <EyeOff className="h-5 w-5" />
              <CardTitle>PII Auto-Redaction (GDPR/HIPAA Mode)</CardTitle>
            </div>
            <CardDescription>
              Automatically convert full names to initials and redact sensitive identifiers after a set period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Auto-Redaction</Label>
                <p className="text-sm text-muted-foreground">
                  Convert "Eleanor Rigby" to "E. R." and hide DOB/Room numbers.
                </p>
              </div>
              <Switch checked={autoRedact} onCheckedChange={setAutoRedact} />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between">
                <Label>Time until redaction: <span className="font-bold text-primary">{retention[0]} Hours</span></Label>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <Slider 
                defaultValue={[24]} 
                max={72} 
                min={1} 
                step={1} 
                value={retention} 
                onValueChange={setRetention}
                disabled={!autoRedact}
              />
              <p className="text-xs text-muted-foreground">
                Data older than {retention[0]} hours will be anonymized in the frontend view. Original keys are encrypted in cold storage.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log */}
        <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2"><FileKey className="h-5 w-5" /> Access Audit Log</CardTitle>
             <CardDescription>Recent attempts to access sealed records.</CardDescription>
           </CardHeader>
           <CardContent>
             <div className="space-y-4 text-sm">
               <div className="flex justify-between items-center border-b pb-2">
                  <span>Accessed <strong>MAR Report #4921</strong> (Unsealed)</span>
                  <span className="text-muted-foreground">Today, 09:41 AM</span>
               </div>
               <div className="flex justify-between items-center border-b pb-2">
                  <span>Accessed <strong>Risk Assessment #1102</strong> (Redacted View)</span>
                  <span className="text-muted-foreground">Yesterday, 4:20 PM</span>
               </div>
               <div className="flex justify-between items-center text-muted-foreground">
                  <span>System Auto-Redacted 14 records</span>
                  <span>Yesterday, 12:00 AM</span>
               </div>
             </div>
           </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline">Reset to Defaults</Button>
        <Button onClick={handleSave} className="gap-2"><Shield size={16} /> Save Security Policies</Button>
      </div>
    </div>
  );
}