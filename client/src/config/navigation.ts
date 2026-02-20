/**
 * Navigation Configuration
 *
 * Centralised data definitions for the sidebar navigation, page metadata,
 * and breadcrumb generation.  Separating route metadata from the Layout
 * component keeps the UI code focused on rendering.
 *
 * @module client/src/config/navigation
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  Mail,
  CheckCircle,
  ShieldCheck,
  FileText,
  Users,
  Upload,
  ShieldAlert,
  Sparkles,
  UserCog,
  Activity,
  ClipboardList,
  BarChart,
  ArrowRightLeft,
  GraduationCap,
  Lock,
  Calculator,
  FlaskConical,
  Terminal,
  FileSpreadsheet,
} from "lucide-react";

/* ── Page metadata ────────────────────────────────────────────────── */

export interface PageMeta {
  section: string;
  title: string;
  subtitle: string;
}

interface PageMetaRule {
  match: (path: string) => boolean;
  meta: PageMeta;
}

export const PAGE_META_RULES: PageMetaRule[] = [
  {
    match: (p) => p === "/dashboard",
    meta: {
      section: "Overview",
      title: "Operations Dashboard",
      subtitle:
        "Live visibility of compliance, workforce, and service delivery performance.",
    },
  },
  {
    match: (p) => p === "/messages",
    meta: {
      section: "Communication",
      title: "Team Messages",
      subtitle:
        "Track updates, handovers, and operational communications in one place.",
    },
  },
  {
    match: (p) => p === "/email-assistant",
    meta: {
      section: "Communication",
      title: "Email Assistant",
      subtitle:
        "Create structured, professional communications quickly with standardized workflows.",
    },
  },
  {
    match: (p) => p.startsWith("/service-users"),
    meta: {
      section: "Service Users",
      title: "Service User Management",
      subtitle:
        "Upload records, produce care planning outputs, and maintain person-centred documentation.",
    },
  },
  {
    match: (p) => p.startsWith("/care-workers"),
    meta: {
      section: "Care Workers",
      title: "Care Worker Operations",
      subtitle:
        "Review EMAR, visit audits, and workforce performance from a unified workspace.",
    },
  },
  {
    match: (p) => p.startsWith("/rostering"),
    meta: {
      section: "Rostering",
      title: "Rostering Studio",
      subtitle:
        "Plan, optimize, and compare schedules with clear workload and quality signals.",
    },
  },
  {
    match: (p) => p === "/call-reconciliation",
    meta: {
      section: "Assurance",
      title: "Call Reconciliation",
      subtitle:
        "Validate call evidence and reconcile completed visits against expected delivery.",
    },
  },
  {
    match: (p) => p === "/compliance",
    meta: {
      section: "Assurance",
      title: "Compliance Hub",
      subtitle:
        "Monitor regulatory posture and track outstanding compliance actions.",
    },
  },
  {
    match: (p) => p === "/cqc-assessment",
    meta: {
      section: "Assurance",
      title: "CQC Self-Assessment",
      subtitle:
        "Rate your service against CQC Key Lines of Enquiry with evidence-based scoring.",
    },
  },
  {
    match: (p) => p === "/policy-acknowledgement",
    meta: {
      section: "Assurance",
      title: "Policy Acknowledgement",
      subtitle:
        "Read and electronically sign policy documents to maintain compliance records.",
    },
  },
  {
    match: (p) => p === "/settings",
    meta: {
      section: "Administration",
      title: "System Settings",
      subtitle: "Configure security, user preferences, and operating defaults.",
    },
  },
  {
    match: (p) =>
      p.startsWith("/shadow-admin-portal") ||
      p.startsWith("/system-logs") ||
      p.startsWith("/testing-features") ||
      p.startsWith("/billing-tool") ||
      p.startsWith("/roi-calculator"),
    meta: {
      section: "Administration",
      title: "Administrative Controls",
      subtitle:
        "Platform configuration, diagnostics, and management controls for authorized users.",
    },
  },
];

export const DEFAULT_PAGE_META: PageMeta = {
  section: "Workspace",
  title: "CareAssurance",
  subtitle: "Operational tooling for high-trust, compliant care delivery.",
};

export function resolvePageMeta(path: string): PageMeta {
  const matched = PAGE_META_RULES.find((rule) => rule.match(path));
  return matched?.meta ?? DEFAULT_PAGE_META;
}

/* ── Breadcrumb generation ────────────────────────────────────────── */

export interface BreadcrumbEntry {
  label: string;
  href?: string;
}

export function buildBreadcrumbs(location: string): BreadcrumbEntry[] {
  const crumbs: BreadcrumbEntry[] = [];

  if (location === "/dashboard") {
    crumbs.push({ label: "Dashboard" });
  } else if (location === "/messages") {
    crumbs.push({ label: "Messages" });
  } else if (location === "/email-assistant") {
    crumbs.push({ label: "Email Assistant" });
  } else if (location === "/compliance") {
    crumbs.push({ label: "Compliance" });
  } else if (location === "/settings") {
    crumbs.push({ label: "Settings" });
  } else if (location.startsWith("/service-users")) {
    crumbs.push({ label: "Service Users", href: "/service-users/upload" });
    if (location === "/service-users/upload") crumbs.push({ label: "Data Upload" });
    else if (location === "/service-users/care-planning") crumbs.push({ label: "Care Planning" });
    else if (location === "/service-users/risk-assessment") crumbs.push({ label: "Risk Assessment" });
    else if (location === "/service-users/plan-enhancer") crumbs.push({ label: "Plan Enhancer" });
  } else if (location.startsWith("/care-workers")) {
    crumbs.push({ label: "Care Workers", href: "/care-workers/list" });
    if (location === "/care-workers/list") crumbs.push({ label: "Carers" });
    else if (location === "/care-workers/emar-audit") crumbs.push({ label: "EMAR Audit" });
    else if (location === "/care-workers/visit-audit") crumbs.push({ label: "Visit Audit" });
    else if (location === "/care-workers/performance") crumbs.push({ label: "Performance" });
    else if (location === "/care-workers/handovers") crumbs.push({ label: "Shift Handovers" });
    else if (location === "/care-workers/training") crumbs.push({ label: "Training" });
  } else if (location.startsWith("/rostering")) {
    crumbs.push({ label: "Rostering Studio" });
  } else if (location === "/call-reconciliation") {
    crumbs.push({ label: "Call Reconciliation" });
  } else if (location === "/shadow-admin-portal") {
    crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
    crumbs.push({ label: "Administrator Controls" });
  } else if (location === "/system-logs") {
    crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
    crumbs.push({ label: "System Logs" });
  } else if (location === "/billing-tool") {
    crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
    crumbs.push({ label: "Billing Tool" });
  } else if (location === "/roi-calculator") {
    crumbs.push({ label: "Features & Benefits" });
  } else if (location === "/cqc-assessment") {
    crumbs.push({ label: "CQC Self-Assessment" });
  } else if (location === "/policy-acknowledgement") {
    crumbs.push({ label: "Policy Acknowledgement" });
  } else if (location === "/testing-features") {
    crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
    crumbs.push({ label: "Testing Features" });
  }

  return crumbs;
}

/* ── Sidebar navigation items ─────────────────────────────────────── */

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlight when location matches (defaults to exact href match) */
  isActive?: (location: string) => boolean;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  isActive: (location: string) => boolean;
  children: NavLink[];
  /** Only visible to admin users */
  adminOnly?: boolean;
}

/** Top-level links (always visible) */
export const TOP_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/messages", label: "Messages", icon: Inbox },
  { href: "/email-assistant", label: "Email Assistant", icon: Mail },
  { href: "/compliance", label: "Compliance", icon: CheckCircle },
  { href: "/cqc-assessment", label: "CQC Assessment", icon: ShieldCheck },
  { href: "/policy-acknowledgement", label: "Policies", icon: FileText },
];

/** Collapsible groups in the "Modules" section */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Service Users",
    icon: Users,
    isActive: (loc) => loc.startsWith("/service-users"),
    children: [
      { href: "/service-users/upload", label: "Data Upload", icon: Upload },
      { href: "/service-users/care-planning", label: "Care Planning", icon: FileText },
      { href: "/service-users/risk-assessment", label: "Risk Assessment", icon: ShieldAlert },
      { href: "/service-users/plan-enhancer", label: "Plan Enhancer", icon: Sparkles },
    ],
  },
  {
    label: "Care Workers",
    icon: UserCog,
    isActive: (loc) => loc.startsWith("/care-workers"),
    children: [
      { href: "/care-workers/list", label: "Carers", icon: Users },
      { href: "/care-workers/emar-audit", label: "EMAR Audit", icon: Activity },
      { href: "/care-workers/visit-audit", label: "Visit Audit", icon: ClipboardList },
      { href: "/care-workers/performance", label: "Performance", icon: BarChart },
      { href: "/care-workers/handovers", label: "Shift Handovers", icon: ArrowRightLeft },
      { href: "/care-workers/training", label: "Training", icon: GraduationCap },
    ],
  },
  {
    label: "Admin",
    icon: Lock,
    isActive: (loc) =>
      loc.startsWith("/admin") ||
      loc === "/shadow-admin-portal" ||
      loc === "/testing-features" ||
      loc === "/care-worker-rotas" ||
      loc === "/rostering-unified" ||
      loc === "/billing-tool" ||
      loc === "/system-logs",
    adminOnly: true,
    children: [
      { href: "/shadow-admin-portal", label: "Administrator Controls", icon: ShieldCheck },
      { href: "/roi-calculator", label: "Features & Benefits", icon: Calculator },
      { href: "/testing-features", label: "Testing Features", icon: FlaskConical },
      { href: "/system-logs", label: "System Logs", icon: Terminal },
      { href: "/rostering-unified", label: "Rostering Studio", icon: ClipboardList },
      { href: "/billing-tool", label: "Billing Tool", icon: FileSpreadsheet },
    ],
  },
];
