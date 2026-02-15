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
      <Card className="w-full max-w-md mx-auto text-center bg-card/95 border-border/75">
        <CardContent className="pt-8 pb-7 space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/25">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-bold text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The page you were looking for does not exist or has been moved.
            </p>
            {location !== "/" && (
              <p className="text-xs text-muted-foreground/70 font-mono break-all">
                {location}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
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
          <p className="text-xs text-muted-foreground/60">
            If this page should exist, please contact your administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
