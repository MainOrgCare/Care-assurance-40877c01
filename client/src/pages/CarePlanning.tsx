import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { Loader2, Save, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  residentName: z.string().min(2, "Name must be at least 2 characters."),
  carePlanType: z.string(),
  issueIdentified: z.string().min(10, "Please describe the issue in detail."),
  actionRequired: z.string().min(10, "Action required must be detailed."),
  reviewDate: z.string(),
  assignedTo: z.string(),
});

export default function CarePlanning() {
  const [location] = useLocation();
  const { toast } = useToast();
  
  // Check if we came from analysis
  const searchParams = new URLSearchParams(window.location.search);
  const source = searchParams.get("source");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      residentName: "",
      carePlanType: "medication",
      issueIdentified: "",
      actionRequired: "",
      reviewDate: new Date().toISOString().split('T')[0],
      assignedTo: "",
    },
  });

  // Simulate auto-filling if source is present
  useEffect(() => {
    if (source) {
      toast({
        title: "Analysis Data Imported",
        description: "Form has been auto-filled with data from the recent MAR audit.",
      });
      
      form.reset({
        residentName: "Eleanor Rigby",
        carePlanType: "medication",
        issueIdentified: "Recurrent missed doses of Amlodipine 5mg at 08:00 AM. Pattern suggests resident is often asleep or refusing during morning rounds.",
        actionRequired: "1. Review medication timing with GP - consider moving to 10:00 AM.\n2. Staff to attempt administration twice if resident is asleep, with 30 min gap.\n3. Document specific refusal reasons.",
        reviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
        assignedTo: "Sarah Thompson",
      });
    }
  }, [source, form, toast]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    toast({
      title: "Care Plan Updated",
      description: "The care plan has been successfully saved and logged.",
    });
    // Reset or redirect
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-3xl font-heading font-bold text-foreground">Care Planning</h2>
           <p className="text-muted-foreground">Create or update care plans based on compliance findings.</p>
        </div>
        {source && (
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Wand2 size={14} />
            Auto-filled from Analysis
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Medication Management Plan</CardTitle>
          <CardDescription>Update the care plan to address identified compliance risks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="residentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resident Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carePlanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="medication">Medication Management</SelectItem>
                          <SelectItem value="mobility">Mobility & Falls</SelectItem>
                          <SelectItem value="nutrition">Nutrition & Hydration</SelectItem>
                          <SelectItem value="behavior">Behavioral Support</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="issueIdentified"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue / Risk Identified</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the compliance issue or risk factor..." 
                        className="min-h-[100px] bg-muted/20"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Derived from MAR analysis or observation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actionRequired"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Action Plan / Intervention</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="List specific actions to mitigate risk..." 
                        className="min-h-[120px] bg-muted/20"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid md:grid-cols-2 gap-6">
                 <FormField
                  control={form.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned To</FormLabel>
                      <FormControl>
                        <Input placeholder="Staff member name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="reviewDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
                <Button type="submit" className="w-32">
                  <Save className="mr-2 h-4 w-4" />
                  Save Plan
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
