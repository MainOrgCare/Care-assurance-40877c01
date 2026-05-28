import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings2, Zap, Route, Users, Clock, Shield, Loader2, Lock, AlertTriangle } from "lucide-react";

/** Format minutes from midnight to HH:MM */
const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export interface OptimizationWeights {
  travel: number;      // 0-100: prioritize minimizing travel time
  balance: number;     // 0-100: prioritize even workload distribution
  continuity: number;  // 0-100: prioritize keeping same worker for service user
}

export interface OptimizationConstraints {
  respectTimeCritical: boolean;      // Don't move time-critical entries
  keepDoubleUpsTogether: boolean;    // Move linked double-up entries together
  allowCrossWorkerMoves: boolean;    // Allow reassigning entries to different workers
  maxTravelMinutes: number;          // Maximum acceptable travel time between visits
  minBufferMinutes: number;          // Minimum buffer between visits
  // New enforcement rules
  lockTemplatedCalls: boolean;            // Templated calls LOCKED to assigned worker
  timeCriticalToleranceMinutes: number;   // ±15min tolerance for time-critical (ENFORCED)
  workingHoursStart: number;              // 6am = 360 minutes from midnight
  workingHoursEnd: number;                // 10pm = 1320 minutes from midnight
}

export interface OptimizationSettingsProps {
  weights: OptimizationWeights;
  constraints: OptimizationConstraints;
  onWeightsChange: (weights: OptimizationWeights) => void;
  onConstraintsChange: (constraints: OptimizationConstraints) => void;
  onRunOptimization: () => void;
  isOptimizing?: boolean;
}

export const defaultWeights: OptimizationWeights = {
  travel: 60,
  balance: 30,
  continuity: 10,
};

export const defaultConstraints: OptimizationConstraints = {
  respectTimeCritical: true,
  keepDoubleUpsTogether: true,
  allowCrossWorkerMoves: true,
  maxTravelMinutes: 30,
  minBufferMinutes: 5,
  // New defaults - ENFORCED rules
  lockTemplatedCalls: true,                // Templated calls LOCKED
  timeCriticalToleranceMinutes: 15,        // ±15 minutes ENFORCED
  workingHoursStart: 6 * 60,               // 6:00 AM
  workingHoursEnd: 22 * 60,                // 10:00 PM
};

export const OptimizationSettings: React.FC<OptimizationSettingsProps> = ({
  weights,
  constraints,
  onWeightsChange,
  onConstraintsChange,
  onRunOptimization,
  isOptimizing = false,
}) => {
  const totalWeight = weights.travel + weights.balance + weights.continuity;
  const isBalanced = Math.abs(totalWeight - 100) <= 5;

  return (
    <Card className="border-border/60 bg-background/70 h-full min-h-0 flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          Optimization Settings
        </CardTitle>
        <CardDescription className="text-xs">
          Configure how the optimizer balances travel, workload, and continuity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 space-y-3.5 overflow-y-auto overscroll-contain pr-1">
        {/* Priority Weights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Priority Weights
            </p>
            <Badge
              variant={isBalanced ? "secondary" : "outline"}
              className={`text-[10px] ${!isBalanced ? "text-warning border-warning/40" : ""}`}
            >
              {totalWeight}% total
            </Badge>
          </div>

          {/* Travel Weight */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="h-3.5 w-3.5 text-sky-500" />
                <span className="text-xs font-medium">Minimize Travel</span>
              </div>
              <span className="text-xs text-muted-foreground">{weights.travel}%</span>
            </div>
            <Slider
              value={[weights.travel]}
              onValueChange={([value]) => onWeightsChange({ ...weights, travel: value })}
              max={100}
              step={5}
              className="h-1.5"
            />
            <p className="text-[10px] text-muted-foreground">
              Prioritize shorter distances between consecutive visits
            </p>
          </div>

          {/* Balance Weight */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium">Balance Workload</span>
              </div>
              <span className="text-xs text-muted-foreground">{weights.balance}%</span>
            </div>
            <Slider
              value={[weights.balance]}
              onValueChange={([value]) => onWeightsChange({ ...weights, balance: value })}
              max={100}
              step={5}
              className="h-1.5"
            />
            <p className="text-[10px] text-muted-foreground">
              Distribute work evenly across care workers
            </p>
          </div>

          {/* Continuity Weight */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-medium">Care Continuity</span>
              </div>
              <span className="text-xs text-muted-foreground">{weights.continuity}%</span>
            </div>
            <Slider
              value={[weights.continuity]}
              onValueChange={([value]) => onWeightsChange({ ...weights, continuity: value })}
              max={100}
              step={5}
              className="h-1.5"
            />
            <p className="text-[10px] text-muted-foreground">
              Prefer keeping the same worker for each service user
            </p>
          </div>
        </div>

        <Separator />

        {/* Constraints */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Constraints
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Respect time-critical windows</p>
                <p className="text-[10px] text-muted-foreground">
                  Always enforced (±15 minutes from service requirement)
                </p>
              </div>
              <Switch
                checked={true}
                disabled
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Keep double-ups together</p>
                <p className="text-[10px] text-muted-foreground">
                  Move linked visits as a group
                </p>
              </div>
              <Switch
                checked={constraints.keepDoubleUpsTogether}
                onCheckedChange={(checked) =>
                  onConstraintsChange({ ...constraints, keepDoubleUpsTogether: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Allow cross-worker moves</p>
                <p className="text-[10px] text-muted-foreground">
                  Reassign visits to different workers
                </p>
              </div>
              <Switch
                checked={constraints.allowCrossWorkerMoves}
                onCheckedChange={(checked) =>
                  onConstraintsChange({ ...constraints, allowCrossWorkerMoves: checked })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground">
                Max travel time
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[constraints.maxTravelMinutes]}
                  onValueChange={([value]) =>
                    onConstraintsChange({ ...constraints, maxTravelMinutes: value })
                  }
                  min={10}
                  max={60}
                  step={5}
                  className="flex-1 h-1.5"
                />
                <span className="text-xs w-10 text-right">{constraints.maxTravelMinutes}m</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground">
                Min buffer time
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[constraints.minBufferMinutes]}
                  onValueChange={([value]) =>
                    onConstraintsChange({ ...constraints, minBufferMinutes: value })
                  }
                  min={0}
                  max={30}
                  step={5}
                  className="flex-1 h-1.5"
                />
                <span className="text-xs w-10 text-right">{constraints.minBufferMinutes}m</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Enforced Rules */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-warning" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Enforced Rules
            </p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/10 dark:border-warning/30 dark:bg-warning/30 p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-warning" />
                <div>
                  <p className="text-xs font-medium">Lock templated calls</p>
                  <p className="text-[10px] text-muted-foreground">
                    Always enforced for templated calls
                  </p>
                </div>
              </div>
              <Switch
                checked={true}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <label className="text-xs font-medium">Time-critical tolerance</label>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  value={[15]}
                  disabled
                  min={5}
                  max={30}
                  step={5}
                  className="flex-1 h-1.5"
                />
                <span className="text-xs w-12 text-right">±15m</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Time-critical calls must stay within this window
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-warning" />
                <label className="text-xs font-medium">Working hours</label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {formatTime(constraints.workingHoursStart)} - {formatTime(constraints.workingHoursEnd)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                All calls must be scheduled within working hours
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Run Button */}
        <Button
          onClick={onRunOptimization}
          disabled={isOptimizing}
          className="w-full"
          size="sm"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2" />
              Optimizing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run Optimization
            </>
          )}
        </Button>
        
        {/* Progress phases when optimizing */}
        {isOptimizing && (
          <div className="mt-2.5 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: "60%" }} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Analyzing routes and balancing workload...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
