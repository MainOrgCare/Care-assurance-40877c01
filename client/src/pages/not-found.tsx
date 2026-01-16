import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12" style={{ backgroundColor: '#f8fafc' }}>
      <Card className="w-full max-w-md mx-auto text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
        <CardContent className="pt-8 pb-7 space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', boxShadow: '0 0 0 1px rgba(239, 68, 68, 0.2)' }}>
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-semibold" style={{ color: '#0f172a' }}>Page not found</h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              The page you were looking for does not exist or has been moved.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/">
              <Button className="w-full text-white" style={{ backgroundColor: '#3b82f6' }}>Return to home</Button>
            </Link>
            <span className="text-xs" style={{ color: '#94a3b8' }}>Check the navigation or head back to the dashboard.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
