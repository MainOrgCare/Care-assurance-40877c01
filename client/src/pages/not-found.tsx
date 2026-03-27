import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function NotFound() {
  const [location] = useLocation();

  useEffect(() => {
    document.title = "Page Not Found — CareAssurance";
    return () => { document.title = "CareAssurance"; };
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-md mx-auto text-center">
        <Card className="bg-card/95 border-border/50 shadow-[var(--shadow-xs)]">
          <CardContent className="pt-8 pb-7 px-8 space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/8 text-destructive ring-1 ring-destructive/15 shadow-[var(--shadow-xs)]">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-destructive/60">Error 404</p>
              <h1 className="text-[1.5rem] font-heading font-bold text-foreground tracking-[-0.02em]">Page not found</h1>
              <p className="text-[13px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
                The page you were looking for does not exist or has been moved.
              </p>
              {location !== "/" && (
                <p className="text-xs text-muted-foreground/50 font-mono break-all bg-muted/30 rounded-lg px-3 py-1.5 mt-2">
                  {location}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <Button
                variant="outline"
                className="flex-1 gap-2 transition-all duration-150"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              <Link href="/dashboard">
                <Button className="w-full gap-2">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            </div>
            <p className="text-[11px] text-muted-foreground/50">
              If this page should exist, please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
