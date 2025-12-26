import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, Loader2, User, KeyRound } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 overflow-hidden bg-background">
      {/* Gradient Background - uses theme-aware colors */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/50 to-background" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
      </div>
      
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Glass Card */}
      <Card className="w-full max-w-md border border-white/10 bg-card backdrop-blur-xl shadow-2xl relative z-10 overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400" />
        
        {/* Header */}
        <div className="pt-8 pb-4 px-6 flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-3xl text-foreground">
            <span className="font-bold">Care</span><span className="font-normal">Assurance</span>
          </h2>
        </div>
        
        <CardContent className="pt-6 px-6 pb-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-muted-foreground text-sm font-medium">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="username" 
                  placeholder="Enter your username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-11 rounded-lg pl-10 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
                  data-testid="input-username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-sm font-medium">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Enter your password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-11 rounded-lg pl-10 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
                  data-testid="input-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 rounded-lg bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-semibold shadow-lg shadow-blue-900/30 transition-all duration-200 mt-2" 
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin h-4 w-4" /> Signing in...
                </span>
              ) : "Sign In"}
            </Button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Need access? Contact your administrator
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="flex-col justify-center border-t border-border bg-card py-4 gap-3 px-6">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-teal-500/70" />
              Encrypted
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-teal-500/70" />
              CQC Compliant
            </span>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">Terms</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">Privacy</Link>
          </div>
        </CardFooter>
      </Card>
      
      {/* Footer version text */}
      <div className="absolute bottom-3 text-muted-foreground text-[10px] font-mono">
        v2.5.0
      </div>
    </div>
  );
}
