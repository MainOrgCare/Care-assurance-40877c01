import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, Loader2, User, KeyRound, Sparkles } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loginDemo } = useAuth();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) {
      setLocation("/dashboard");
    }
  };

  const handleDevDemoLogin = async () => {
    if (!import.meta.env.DEV) return;
    if (loading) return;
    setLoading(true);
    const success = await loginDemo();
    setLoading(false);
    if (success) {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 overflow-hidden bg-background">
      {/* Ambient Background Effects */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background" />
        <div className="absolute top-[-10%] left-[15%] w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[10%] w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] right-[30%] w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px]" />
      </div>
      
      {/* Subtle dot pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.5'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Login Card */}
      <Card className="w-full max-w-[420px] border border-white/[0.06] bg-card/95 backdrop-blur-2xl shadow-[0_25px_80px_-15px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden rounded-2xl">
        {import.meta.env.DEV && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={handleDevDemoLogin}
            className="absolute top-2 left-2 h-3 w-3 opacity-0"
            data-testid="button-dev-demo-login"
          />
        )}
        
        {/* Top accent gradient */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-secondary via-primary to-primary/50" />
        
        {/* Subtle corner glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header */}
        <div className="pt-10 pb-2 px-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center shadow-[0_8px_30px_rgba(59,180,200,0.25)] ring-1 ring-white/10">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-card flex items-center justify-center">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl text-foreground font-heading">
              <span className="font-bold">Care</span><span className="font-normal text-foreground/80">Assurance</span>
            </h2>
            <p className="text-xs text-muted-foreground/60 mt-1 uppercase tracking-[0.15em]">Operations Platform</p>
          </div>
        </div>
        
        <CardContent className="pt-6 px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-muted-foreground/80 text-xs font-medium uppercase tracking-wide">Username</Label>
              <div className="relative group">
                <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'username' ? 'bg-primary/15' : 'bg-muted/50'}`}>
                  <User className={`h-4 w-4 transition-colors ${focusedField === 'username' ? 'text-primary' : 'text-muted-foreground/60'}`} />
                </div>
                <Input 
                  id="username" 
                  placeholder="Enter your username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  required
                  autoComplete="username"
                  className="bg-muted/40 border-border/50 text-foreground placeholder:text-muted-foreground/40 h-12 rounded-xl pl-14 focus:border-primary/50 focus:bg-muted/60 focus:ring-2 focus:ring-primary/10 transition-all"
                  data-testid="input-username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground/80 text-xs font-medium uppercase tracking-wide">Password</Label>
              <div className="relative group">
                <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'password' ? 'bg-primary/15' : 'bg-muted/50'}`}>
                  <KeyRound className={`h-4 w-4 transition-colors ${focusedField === 'password' ? 'text-primary' : 'text-muted-foreground/60'}`} />
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Enter your password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  required
                  autoComplete="current-password"
                  className="bg-muted/40 border-border/50 text-foreground placeholder:text-muted-foreground/40 h-12 rounded-xl pl-14 focus:border-primary/50 focus:bg-muted/60 focus:ring-2 focus:ring-primary/10 transition-all"
                  data-testid="input-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl bg-gradient-to-r from-secondary via-primary to-primary hover:opacity-90 text-white font-semibold shadow-[0_4px_20px_rgba(59,180,200,0.3)] transition-all duration-200 mt-3" 
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
            <p className="text-[11px] text-muted-foreground/50">
              Need access? Contact your administrator
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="flex-col justify-center border-t border-border/30 bg-muted/20 py-4 gap-3 px-8">
          <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
                <Lock className="w-2.5 h-2.5 text-primary" />
              </div>
              <span>Encrypted</span>
            </span>
            <span className="h-3 w-px bg-border/50" />
            <span className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />
              </div>
              <span>CQC Compliant</span>
            </span>
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground/50">
            <Link href="/terms" className="hover:text-foreground/70 transition-colors" data-testid="link-terms">Terms</Link>
            <span className="text-border/50">•</span>
            <Link href="/privacy" className="hover:text-foreground/70 transition-colors" data-testid="link-privacy">Privacy</Link>
          </div>
        </CardFooter>
      </Card>
      
      {/* Footer version text */}
      <div className="absolute bottom-4 text-muted-foreground/40 text-[10px] font-mono tracking-wider">
        v2.5.0
      </div>
    </div>
  );
}
