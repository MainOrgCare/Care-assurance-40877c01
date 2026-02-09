import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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
  isDemo?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  loginDemo: () => Promise<boolean>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  users: User[];
  approveUser: (id: string) => Promise<void>;
  rejectUser: (id: string) => Promise<void>;
  createUser: (username: string, password: string, role: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  refetchUser: () => Promise<void>;
  logAction: (action: string, target: string, status?: "Authorized" | "Flagged" | "Blocked" | "System", alert?: string, details?: Record<string, any>) => void;
  auditLogs: any[];
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const mapSystemLog = (log: any) => {
    const details = log?.details && typeof log.details === "object" ? log.details : {};
    return {
      id: log.id,
      user: log.username || "Unknown",
      action: details.action || log.eventType || "Action",
      target: details.target || details.serviceUserInitials || log.serviceUserInitials || "System",
      time: log.createdAt
        ? new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: details.status || "System",
      alert: details.alert,
      createdAt: log.createdAt,
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

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        setAllUsers([]);
        setAuditLogs([]);
        return;
      }

      const sessionData = await response.json();
      if (sessionData?.authenticated && sessionData?.user) {
        setUser(sessionData.user);
      } else {
        setUser(null);
        setAllUsers([]);
        setAuditLogs([]);
      }
    } catch (error) {
      console.error("Session check failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    const onFocus = () => {
      checkSession();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
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
        return;
      }

      const sessionData = await response.json();
      if (sessionData?.authenticated && sessionData?.user) {
        setUser(sessionData.user);
      } else {
        setUser(null);
        setAllUsers([]);
        setAuditLogs([]);
      }
    } catch (error) {
      console.error("Refetch user failed:", error);
    }
  }, []);

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

  const logAction = useCallback((action: string, target: string, status: "Authorized" | "Flagged" | "Blocked" | "System" = "Authorized", alert?: string, details?: Record<string, any>) => {
    const newLog = {
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
  }, [user?.username]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast({
            title: "Account Pending Approval",
            description: "Your account is awaiting administrator approval.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Account Pending");
        } else if (response.status === 401) {
          toast({
            title: "Invalid Credentials",
            description: data.message || "Please check your username and password.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Invalid Credentials");
        } else if (response.status === 429) {
          toast({
            title: "Too Many Attempts",
            description: data.message || "Please wait before trying again.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Rate Limited");
        } else if (response.status === 503) {
          toast({
            title: "Service Unavailable",
            description: data.message || "Authentication is temporarily unavailable.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "System", "Auth Unavailable");
        } else {
          toast({
            title: "Login Failed",
            description: data.message || "An error occurred during login. Please try again.",
            variant: "destructive"
          });
          logAction("Login Attempt", "System", "Blocked", "Login Failed");
        }
        return false;
      }

      setUser(data);
      logAction("Login", "System", "Authorized");

      if (data.role === "admin") {
        await fetchUsers();
        await fetchSystemLogs();
      }

      return true;
    } catch (error) {
      toast({
        title: "Login Failed",
        description: "An error occurred during login. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast, logAction, fetchUsers]);

  const loginDemo = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Demo Unavailable",
          description: data.message || "Could not start demo session.",
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
      setUser(null);
      setAllUsers([]);
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, [logAction, setLocation]);

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
  }), [user, login, loginDemo, signup, logout, allUsers, approveUser, rejectUser, createUser, fetchUsers, refetchUser, logAction, auditLogs, loading]);

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
