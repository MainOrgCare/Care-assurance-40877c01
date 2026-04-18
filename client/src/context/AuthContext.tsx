import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AUTH_EXPIRED_EVENT, normalizeApiPayload } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: "admin" | "staff";
  status: "active" | "pending";
  jobTitle?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  termsSignatureName?: string;
  termsSignatureDate?: string;
  twoFactorEnabled?: boolean;
  isDemo?: boolean;
}

type LoginResult =
  | {
      status: "success";
    }
  | {
      status: "requiresTwoFactor";
      challengeId: string;
      expiresInSeconds: number;
    }
  | {
      status: "error";
    };

interface AuditLogEntry {
  id: number | string;
  user: string;
  action: string;
  target: string;
  time: string;
  status: string;
  alert?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyTwoFactorLogin: (challengeId: string, code: string) => Promise<LoginResult>;
  loginDemo: () => Promise<boolean>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  users: User[];
  approveUser: (id: string) => Promise<void>;
  rejectUser: (id: string) => Promise<void>;
  createUser: (username: string, password: string, role: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  refetchUser: () => Promise<void>;
  logAction: (action: string, target: string, status?: "Authorized" | "Flagged" | "Blocked" | "System", alert?: string, details?: Record<string, unknown>) => void;
  auditLogs: AuditLogEntry[];
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const activeUserRef = useRef<User | null>(null);
  const authExpiryHandledRef = useRef(false);

  useEffect(() => {
    activeUserRef.current = user;
  }, [user]);

  const clearAuthState = useCallback(() => {
    setUser(null);
    setAllUsers([]);
    setAuditLogs([]);
  }, []);

  const mapSystemLog = (log: Record<string, unknown>): AuditLogEntry => {
    const details = log?.details && typeof log.details === "object" ? (log.details as Record<string, unknown>) : {};
    return {
      id: log.id as string | number,
      user: (log.username as string) || "Unknown",
      action: (details.action as string) || (log.eventType as string) || "Action",
      target: (details.target as string) || (details.serviceUserInitials as string) || (log.serviceUserInitials as string) || "System",
      time: log.createdAt
        ? new Date(log.createdAt as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: (details.status as string) || "System",
      alert: details.alert as string | undefined,
      createdAt: log.createdAt as string | undefined,
    };
  };

  const fetchSystemLogs = useCallback(async () => {
    // Only fetch if we know user is admin — avoids 401 noise in the console
    // when sessions have expired or for non-admin users.
    if (!user || user.role !== "admin") return;
    try {
      const response = await fetch("/api/system-logs", {
        credentials: "include",
      });
      if (response.ok) {
        const payload = await response.json();
        const logs = Array.isArray(payload) ? payload : Array.isArray(payload?.logs) ? payload.logs : [];
        setAuditLogs(logs.map(mapSystemLog));
      }
      // Silently ignore 401/403 — session may have expired
    } catch (error) {
      // Network errors only — suppress expected auth failures
      console.error("Failed to fetch system logs:", error);
    }
  }, [user]);

  const handleSessionInvalidation = useCallback(async () => {
    if (authExpiryHandledRef.current) {
      return;
    }

    const hadActiveUser = Boolean(activeUserRef.current);
    if (!hadActiveUser) {
      clearAuthState();
      return;
    }

    authExpiryHandledRef.current = true;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore failures; the current session is already invalid.
    } finally {
      clearAuthState();
      setLocation("/");
      toast({
        title: "Session expired",
        description: "You were signed out because your session is no longer valid. Please sign in again.",
        variant: "destructive",
      });
      authExpiryHandledRef.current = false;
    }
  }, [clearAuthState, setLocation, toast]);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await handleSessionInvalidation();
        } else {
          console.error("Session check failed with status:", response.status);
        }
        return;
      }

      const sessionData = await response.json();
      if (sessionData?.authenticated && sessionData?.user) {
        setUser(sessionData.user);
      } else {
        await handleSessionInvalidation();
      }
    } catch (error) {
      console.error("Session check failed:", error);
    } finally {
      setLoading(false);
    }
  }, [handleSessionInvalidation]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Debounce session checks on focus/visibility change — at most once per 30 seconds.
  // This prevents excessive API calls when users rapidly switch tabs.
  const lastSessionCheck = useRef<number>(Date.now());
  const SESSION_CHECK_DEBOUNCE_MS = 30_000;

  useEffect(() => {
    const debouncedCheck = () => {
      const now = Date.now();
      if (now - lastSessionCheck.current >= SESSION_CHECK_DEBOUNCE_MS) {
        lastSessionCheck.current = now;
        checkSession();
      }
    };

    const onFocus = () => debouncedCheck();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        debouncedCheck();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkSession]);

  const refetchUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await handleSessionInvalidation();
        }
        return;
      }

      const sessionData = await response.json();
      if (sessionData?.authenticated && sessionData?.user) {
        setUser(sessionData.user);
      } else {
        await handleSessionInvalidation();
      }
    } catch (error) {
      console.error("Refetch user failed:", error);
    }
  }, [handleSessionInvalidation]);

  useEffect(() => {
    const onAuthExpired = () => {
      void handleSessionInvalidation();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired as EventListener);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired as EventListener);
    };
  }, [handleSessionInvalidation]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/users", {
        credentials: "include",
      });
      
      if (response.ok) {
        const users = await response.json();
        setAllUsers(users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchSystemLogs();
      return;
    }
    setAllUsers([]);
  }, [user?.role, fetchUsers, fetchSystemLogs]);

  const logAction = useCallback((action: string, target: string, status: "Authorized" | "Flagged" | "Blocked" | "System" = "Authorized", alert?: string, details?: Record<string, unknown>) => {
    const newLog: AuditLogEntry = {
      id: Date.now(),
      user: user?.username || "Unknown",
      action,
      target,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status,
      alert
    };
    const enqueueLogUpdate = () => setAuditLogs(prev => [newLog, ...prev]);
    if (typeof queueMicrotask === "function") {
      queueMicrotask(enqueueLogUpdate);
    } else {
      Promise.resolve().then(enqueueLogUpdate);
    }
    if (user?.role !== "admin") {
      return;
    }

    fetch("/api/system-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        eventType: "action",
        action,
        target,
        status,
        alert,
        serviceUserInitials: details?.serviceUserInitials,
        details,
      }),
    }).catch((error) => {
      console.error("Failed to record system log:", error);
    });
  }, [user?.role, user?.username]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const payload = await response.json();
      const data = normalizeApiPayload<
        User & {
          requiresTwoFactor?: boolean;
          challengeId?: string;
          expiresInSeconds?: number;
        }
      >(payload);

      if (!response.ok) {
        if (response.status === 403) {
          toast({
            title: "Account Pending Approval",
            description: payload?.message || "Your account is awaiting administrator approval.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Account Pending");
        } else if (response.status === 401) {
          toast({
            title: "Invalid Credentials",
            description: payload?.message || "Please check your username and password.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Invalid Credentials");
        } else if (response.status === 429) {
          toast({
            title: "Too Many Attempts",
            description: payload?.message || "Please wait before trying again.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Rate Limited");
        } else if (response.status === 503) {
          toast({
            title: "Service Unavailable",
            description: payload?.message || "Authentication is temporarily unavailable.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "System", "Auth Unavailable");
        } else {
          toast({
            title: "Login Failed",
            description: payload?.message || "An error occurred during login. Please try again.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Login Failed");
        }
        return { status: "error" };
      }

      if (data?.requiresTwoFactor) {
        const challengeId = typeof data.challengeId === "string" ? data.challengeId : "";
        if (!challengeId) {
          toast({
            title: "Login Failed",
            description: "Two-factor challenge could not be started. Please try again.",
            variant: "destructive",
          });
          return { status: "error" };
        }

        toast({
          title: "Verification Required",
          description: "Enter the 6-digit code from your authenticator app to continue.",
        });

        return {
          status: "requiresTwoFactor",
          challengeId,
          expiresInSeconds: Number(data.expiresInSeconds) || 300,
        };
      }

      setUser(data);
      logAction("Login", "System", "Authorized");

      if (data.role === "admin") {
        await fetchUsers();
        // fetchSystemLogs runs automatically via the useEffect on user.role change
      }

      return { status: "success" };
    } catch (error) {
      toast({
        title: "Login Failed",
        description: "An error occurred during login. Please try again.",
        variant: "destructive"
      });
      return { status: "error" };
    }
  }, [toast, logAction, fetchUsers]);

  const verifyTwoFactorLogin = useCallback(async (challengeId: string, code: string): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ challengeId, code }),
        credentials: "include",
      });

      const payload = await response.json();
      const data = normalizeApiPayload<User>(payload);

      if (!response.ok) {
        const isBadCode = response.status === 401 || response.status === 400;
        toast({
          title: isBadCode ? "Invalid Code" : "Verification Failed",
          description:
            payload?.message ||
            (isBadCode
              ? "Please check your verification code and try again."
              : "Two-factor verification failed. Please sign in again."),
          variant: "destructive",
        });
        return { status: "error" };
      }

      setUser(data);
      logAction("Login", "System", "Authorized");

      if (data.role === "admin") {
        await fetchUsers();
      }

      return { status: "success" };
    } catch {
      toast({
        title: "Verification Failed",
        description: "An error occurred during two-factor verification. Please try again.",
        variant: "destructive",
      });
      return { status: "error" };
    }
  }, [toast, logAction, fetchUsers]);

  const loginDemo = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        credentials: "include",
      });

      const payload = await response.json();
      const data = normalizeApiPayload<User>(payload);

      if (!response.ok) {
        toast({
          title: "Demo Unavailable",
          description: payload?.message || "Could not start demo session.",
          variant: "destructive"
        });
        return false;
      }

      setUser({ ...data, isDemo: true });
      logAction("Demo Login", "System", "Authorized");

      return true;
    } catch (error) {
      toast({
        title: "Demo Failed",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast, logAction]);

  const signup = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, role: "staff" }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Registration Failed",
          description: data.message || "Username may already be taken.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Account Created",
        description: "Your account has been created and is pending administrator approval.",
      });
      logAction("Registration", "System", "System", "New User Pending");
    } catch (error) {
      toast({
        title: "Registration Failed",
        description: "An error occurred during registration. Please try again.",
        variant: "destructive"
      });
    }
  }, [toast, logAction]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      
      logAction("Logout", "System", "Authorized");
      clearAuthState();
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, [clearAuthState, logAction, setLocation]);

  const approveUser = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/users/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        logAction("Approved User", `User ID: ${id}`, "Authorized");
        toast({ title: "User Approved", description: "Access granted successfully." });
      } else {
        const data = await response.json();
        toast({
          title: "Approval Failed",
          description: data.message || "Could not approve user.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve user.",
        variant: "destructive"
      });
    }
  }, [fetchUsers, logAction, toast]);

  const rejectUser = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        logAction("Rejected User", `User ID: ${id}`, "Authorized");
        toast({ title: "User Rejected", description: "Account removed." });
      } else {
        const data = await response.json();
        toast({
          title: "Rejection Failed",
          description: data.message || "Could not reject user.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject user.",
        variant: "destructive"
      });
    }
  }, [fetchUsers, logAction, toast]);

  const createUser = useCallback(async (username: string, password: string, role: string) => {
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, role }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "User Creation Failed",
          description: data.message || "Could not create user.",
          variant: "destructive"
        });
        return;
      }

      await fetchUsers();
      toast({
        title: "User Account Created",
        description: "New staff account has been added to the registry.",
      });
      logAction("Created User", username, "Authorized");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create user.",
        variant: "destructive"
      });
    }
  }, [fetchUsers, logAction, toast]);

  const contextValue = useMemo(() => ({
    user,
    login,
    verifyTwoFactorLogin,
    loginDemo,
    signup,
    logout,
    users: allUsers,
    approveUser,
    rejectUser,
    createUser,
    fetchUsers,
    refetchUser,
    logAction,
    auditLogs,
    loading,
  }), [user, login, verifyTwoFactorLogin, loginDemo, signup, logout, allUsers, approveUser, rejectUser, createUser, fetchUsers, refetchUser, logAction, auditLogs, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
