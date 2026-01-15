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
    <div className="min-h-screen flex items-center justify-center relative p-4 overflow-hidden" style={{ backgroundColor: '#f8fafc' }}>
      {/* Ambient Background Effects */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom right, #f8fafc, #f1f5f9, #f8fafc)' }} />
        <div className="absolute top-[-10%] left-[15%] w-[500px] h-[500px] rounded-full blur-[120px]" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }} />
        <div className="absolute bottom-[-15%] right-[10%] w-[400px] h-[400px] rounded-full blur-[100px]" style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)' }} />
        <div className="absolute top-[40%] right-[30%] w-[300px] h-[300px] rounded-full blur-[80px]" style={{ backgroundColor: 'rgba(59, 130, 246, 0.04)' }} />
      </div>
      
      {/* Subtle dot pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%230f172a' fill-opacity='0.3'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Login Card */}
      <Card className="w-full max-w-[420px] backdrop-blur-2xl relative z-10 overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 25px 80px -15px rgba(0,0,0,0.1)' }}>
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
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(to right, #3b82f6, #2563eb, #1d4ed8)' }} />
        
        {/* Subtle corner glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }} />
        
        {/* Header */}
        <div className="pt-10 pb-2 px-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 8px 30px rgba(59, 130, 246, 0.25)' }}>
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 0 2px #ffffff' }}>
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-heading" style={{ color: '#0f172a' }}>
              <span className="font-bold">Care</span><span className="font-normal" style={{ color: '#64748b' }}>Assurance</span>
            </h2>
            <p className="text-xs mt-1 uppercase tracking-[0.15em]" style={{ color: '#94a3b8' }}>Operations Platform</p>
          </div>
        </div>
        
        <CardContent className="pt-6 px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Username</Label>
              <div className="relative group">
                <div 
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ backgroundColor: focusedField === 'username' ? 'rgba(59, 130, 246, 0.15)' : '#f1f5f9' }}
                >
                  <User className="h-4 w-4 transition-colors" style={{ color: focusedField === 'username' ? '#3b82f6' : '#94a3b8' }} />
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
                  className="h-12 rounded-xl pl-14 transition-all"
                  style={{ 
                    backgroundColor: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    color: '#0f172a'
                  }}
                  data-testid="input-username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Password</Label>
              <div className="relative group">
                <div 
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ backgroundColor: focusedField === 'password' ? 'rgba(59, 130, 246, 0.15)' : '#f1f5f9' }}
                >
                  <KeyRound className="h-4 w-4 transition-colors" style={{ color: focusedField === 'password' ? '#3b82f6' : '#94a3b8' }} />
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
                  className="h-12 rounded-xl pl-14 transition-all"
                  style={{ 
                    backgroundColor: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    color: '#0f172a'
                  }}
                  data-testid="input-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-white font-semibold transition-all duration-200 mt-3 hover:opacity-90" 
              style={{ 
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
                boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)' 
              }}
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
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>
              Need access? Contact your administrator
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="flex-col justify-center py-4 gap-3 px-8" style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <div className="flex items-center justify-center gap-5 text-[11px]" style={{ color: '#64748b' }}>
            <span className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                <Lock className="w-2.5 h-2.5" style={{ color: '#3b82f6' }} />
              </div>
              <span>Encrypted</span>
            </span>
            <span className="h-3 w-px" style={{ backgroundColor: '#e2e8f0' }} />
            <span className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-md flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                <ShieldCheck className="w-2.5 h-2.5" style={{ color: '#22c55e' }} />
              </div>
              <span>CQC Compliant</span>
            </span>
          </div>
          <div className="flex gap-4 text-[11px]" style={{ color: '#94a3b8' }}>
            <Link href="/terms" className="transition-colors hover:text-gray-700" data-testid="link-terms">Terms</Link>
            <span style={{ color: '#e2e8f0' }}>•</span>
            <Link href="/privacy" className="transition-colors hover:text-gray-700" data-testid="link-privacy">Privacy</Link>
          </div>
        </CardFooter>
      </Card>
      
      {/* Footer version text */}
      <div className="absolute bottom-4 text-[10px] font-mono tracking-wider" style={{ color: '#94a3b8' }}>
        v2.5.0
      </div>
    </div>
  );
}
