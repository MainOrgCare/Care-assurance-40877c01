import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 bg-background">
      <Card className="w-full max-w-md mx-auto text-center bg-card/95 border-border/75">
        <CardContent className="pt-8 pb-7 space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/25">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-semibold text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground">
              The page you were looking for does not exist or has been moved.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/">
              <Button className="w-full">Return to home</Button>
            </Link>
            <span className="text-xs text-muted-foreground/80">Check the navigation or head back to the dashboard.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
