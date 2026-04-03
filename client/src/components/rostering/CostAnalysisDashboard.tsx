import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoundSterling, Car, Clock, TrendingUp, Users, Calculator } from "lucide-react";

interface CostSettings {
  hourlyRate: number;
  overtimeRate: number;
  overtimeThreshold: number; // hours per day
  mileageRate: number; // per mile
  fuelCostPerMile: number;
}

interface WorkerCostData {
  name: string;
  regularHours: number;
  overtimeHours: number;
  travelMiles: number;
  regularPay: number;
  overtimePay: number;
  travelCost: number;
  totalCost: number;
}

interface CostAnalysisProp {
  workers: Array<{
    name: string;
    totalMinutes: number;
    travelDistanceMeters?: number;
  }>;
}

const DEFAULT_SETTINGS: CostSettings = {
  hourlyRate: 12.50,
  overtimeRate: 18.75,
  overtimeThreshold: 8,
  mileageRate: 0.45,
  fuelCostPerMile: 0.18,
};

export default function CostAnalysisDashboard({ workers }: CostAnalysisProp) {
  const [settings, setSettings] = useState<CostSettings>(DEFAULT_SETTINGS);

  const costData = useMemo((): WorkerCostData[] => {
    return workers.map(worker => {
      const totalHours = worker.totalMinutes / 60;
      const regularHours = Math.min(totalHours, settings.overtimeThreshold);
      const overtimeHours = Math.max(0, totalHours - settings.overtimeThreshold);
      const travelMiles = (worker.travelDistanceMeters || 0) / 1609.34; // meters to miles

      const regularPay = regularHours * settings.hourlyRate;
      const overtimePay = overtimeHours * settings.overtimeRate;
      const travelCost = travelMiles * settings.mileageRate;
      const totalCost = regularPay + overtimePay + travelCost;

      return {
        name: worker.name,
        regularHours,
        overtimeHours,
        travelMiles,
        regularPay,
        overtimePay,
        travelCost,
        totalCost,
      };
    });
  }, [workers, settings]);

  const totals = useMemo(() => {
    return costData.reduce(
      (acc, worker) => ({
        regularHours: acc.regularHours + worker.regularHours,
        overtimeHours: acc.overtimeHours + worker.overtimeHours,
        travelMiles: acc.travelMiles + worker.travelMiles,
        regularPay: acc.regularPay + worker.regularPay,
        overtimePay: acc.overtimePay + worker.overtimePay,
        travelCost: acc.travelCost + worker.travelCost,
        totalCost: acc.totalCost + worker.totalCost,
      }),
      {
        regularHours: 0,
        overtimeHours: 0,
        travelMiles: 0,
        regularPay: 0,
        overtimePay: 0,
        travelCost: 0,
        totalCost: 0,
      }
    );
  }, [costData]);

  const formatCurrency = (value: number) => `£${value.toFixed(2)}`;
  const formatHours = (value: number) => `${value.toFixed(1)}h`;
  const formatMiles = (value: number) => `${value.toFixed(1)} mi`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-success" />
            Cost Analysis
          </CardTitle>
          <CardDescription>
            Track staffing and travel expenses for roster schedule
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="breakdown">By Worker</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <PoundSterling className="h-4 w-4" />
                      Total Cost
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-success">
                      {formatCurrency(totals.totalCost)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      For {workers.length} workers
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Labor Cost
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {formatCurrency(totals.regularPay + totals.overtimePay)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>Regular: {formatCurrency(totals.regularPay)}</div>
                      <div className="text-warning">Overtime: {formatCurrency(totals.overtimePay)}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      Travel Cost
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {formatCurrency(totals.travelCost)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatMiles(totals.travelMiles)} total
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Avg Cost/Worker
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {formatCurrency(totals.totalCost / workers.length)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatHours((totals.regularHours + totals.overtimeHours) / workers.length)} avg hours
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Cost Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-primary/100" />
                        <span className="text-sm">Regular Pay</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(totals.regularPay)}</div>
                        <div className="text-xs text-muted-foreground">
                          {((totals.regularPay / totals.totalCost) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-warning" />
                        <span className="text-sm">Overtime Pay</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(totals.overtimePay)}</div>
                        <div className="text-xs text-muted-foreground">
                          {((totals.overtimePay / totals.totalCost) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-success/100" />
                        <span className="text-sm">Travel Costs</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(totals.travelCost)}</div>
                        <div className="text-xs text-muted-foreground">
                          {((totals.travelCost / totals.totalCost) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {totals.overtimeHours > 0 && (
                <Card className="border-warning">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-warning" />
                      Overtime Alert
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {formatHours(totals.overtimeHours)} of overtime scheduled across{" "}
                      {costData.filter(w => w.overtimeHours > 0).length} workers,
                      adding {formatCurrency(totals.overtimePay)} to costs.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="breakdown" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead className="text-right">Regular Hours</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Travel Miles</TableHead>
                    <TableHead className="text-right">Labor Cost</TableHead>
                    <TableHead className="text-right">Travel Cost</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costData
                    .sort((a, b) => b.totalCost - a.totalCost)
                    .map((worker, idx) => (
                      <TableRow key={worker.name}>
                        <TableCell className="font-medium">{worker.name}</TableCell>
                        <TableCell className="text-right">{formatHours(worker.regularHours)}</TableCell>
                        <TableCell className="text-right">
                          {worker.overtimeHours > 0 ? (
                            <span className="text-warning font-semibold">
                              {formatHours(worker.overtimeHours)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatMiles(worker.travelMiles)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(worker.regularPay + worker.overtimePay)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(worker.travelCost)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(worker.totalCost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>TOTALS</TableCell>
                    <TableCell className="text-right">{formatHours(totals.regularHours)}</TableCell>
                    <TableCell className="text-right">{formatHours(totals.overtimeHours)}</TableCell>
                    <TableCell className="text-right">{formatMiles(totals.travelMiles)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.regularPay + totals.overtimePay)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.travelCost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalCost)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Cost Calculation Settings</CardTitle>
                  <CardDescription>
                    Adjust rates to match your organization's costs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyRate">Regular Hourly Rate (£)</Label>
                      <Input
                        id="hourlyRate"
                        type="number"
                        step="0.01"
                        value={settings.hourlyRate}
                        onChange={(e) =>
                          setSettings({ ...settings, hourlyRate: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overtimeRate">Overtime Hourly Rate (£)</Label>
                      <Input
                        id="overtimeRate"
                        type="number"
                        step="0.01"
                        value={settings.overtimeRate}
                        onChange={(e) =>
                          setSettings({ ...settings, overtimeRate: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overtimeThreshold">Overtime Threshold (hours/day)</Label>
                      <Input
                        id="overtimeThreshold"
                        type="number"
                        step="0.5"
                        value={settings.overtimeThreshold}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            overtimeThreshold: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mileageRate">Mileage Rate (£/mile)</Label>
                      <Input
                        id="mileageRate"
                        type="number"
                        step="0.01"
                        value={settings.mileageRate}
                        onChange={(e) =>
                          setSettings({ ...settings, mileageRate: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quick Presets</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSettings({
                        hourlyRate: 12.50,
                        overtimeRate: 18.75,
                        overtimeThreshold: 8,
                        mileageRate: 0.45,
                        fuelCostPerMile: 0.18,
                      })
                    }
                  >
                    Standard UK Care
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSettings({
                        hourlyRate: 15.00,
                        overtimeRate: 22.50,
                        overtimeThreshold: 8,
                        mileageRate: 0.45,
                        fuelCostPerMile: 0.18,
                      })
                    }
                  >
                    Senior Care Worker
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSettings({
                        hourlyRate: 11.00,
                        overtimeRate: 16.50,
                        overtimeThreshold: 8,
                        mileageRate: 0.45,
                        fuelCostPerMile: 0.18,
                      })
                    }
                  >
                    National Living Wage
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
