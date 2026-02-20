// Components Integration & Migration Guide
// ============================================

/**
 * NEW COMPONENTS AVAILABLE:
 * 
 * 1. PageLayout - Unified page structure component
 *    Location: client/src/components/layout/PageLayout.tsx
 *    Use for: Consistent headers, tab navigation, responsive design
 * 
 * 2. DarkMode - Complete dark mode infrastructure
 *    Location: client/src/components/theme/DarkMode.tsx
 *    Use for: Theme management, dark mode toggle, CSS variables
 * 
 * 3. ResponsiveDialog - Mobile-friendly dialog component
 *    Location: client/src/components/dialog/ResponsiveDialog.tsx
 *    Use for: Replacing old Dialog imports, mobile-responsive modals
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION GUIDE - Step by Step
// ═══════════════════════════════════════════════════════════════════════════

/**
 * STEP 1: Set up Dark Mode Provider (App.tsx or main.tsx)
 */

// Before:
// export default function App() {
//   return (
//     <ErrorBoundary>
//       <YourApp />
//     </ErrorBoundary>
//   );
// }

// After:
import { ThemeProvider } from "@/components/theme/DarkMode";

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <YourApp />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * STEP 2: Add Dark Mode Toggle to Header
 */

// In your main header/navigation component:
import { DarkModeToggle, useTheme } from "@/components/theme/DarkMode";

export function MainHeader() {
  const { isDark, theme, toggleDarkMode } = useTheme();
  
  return (
    <header className="border-b">
      <div className="flex items-center justify-between p-4">
        <h1>My App</h1>
        <div className="flex items-center gap-2">
          {/* Other controls */}
          <DarkModeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * STEP 3: Refactor Page to Use PageLayout
 */

// BEFORE - Traditional structure:
// export function MyPage() {
//   const [activeTab, setActiveTab] = useState("overview");
//   
//   return (
//     <div className="space-y-8 p-8">
//       <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
//         <div>
//           <h2 className="text-2xl font-bold">Page Title</h2>
//           <p className="text-muted-foreground">Page description</p>
//         </div>
//         <Button>Action</Button>
//       </div>
//       
//       <Tabs value={activeTab} onValueChange={setActiveTab}>
//         <TabsList>
//           <TabsTrigger value="overview">Overview</TabsTrigger>
//           <TabsTrigger value="details">Details</TabsTrigger>
//         </TabsList>
//         <TabsContent value="overview">...</TabsContent>
//         <TabsContent value="details">...</TabsContent>
//       </Tabs>
//     </div>
//   );
// }

// AFTER - Using PageLayout:
import PageLayout from "@/components/layout/PageLayout";
import { Overview, Details } from "@/components/MyPageSections";

export function MyPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = [
    { value: "overview", label: "Overview", icon: Activity },
    { value: "details", label: "Details", icon: FileText },
  ];

  return (
    <PageLayout
      title="Page Title"
      description="Page description"
      actions={<Button>Action</Button>}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "overview" && <Overview />}
      {activeTab === "details" && <Details />}
    </PageLayout>
  );
}

/**
 * STEP 4: Replace Dialog Imports
 */

// BEFORE:
// import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// After:
import { ResponsiveDialog } from "@/components/dialog/ResponsiveDialog";

// Usage:
export function MyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>
      
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Dialog Title"
        description="Optional description"
        maxWidth="md"
      >
        <div>Dialog content here</div>
        
        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => setOpen(false)}>Save</Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

/**
 * STEP 5: Dark Mode CSS Variables
 */

// The theme provider automatically sets CSS variables:
// --theme-background, --theme-foreground, --theme-primary, etc.
// 
// Use in tailwind with dark: prefix:
// <div className="bg-background dark:bg-slate-900 text-foreground dark:text-slate-50">

// Or use directly in CSS:
// .my-component {
//   background-color: var(--theme-background);
//   color: var(--theme-foreground);
// }

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION PRIORITY LIST
// ═══════════════════════════════════════════════════════════════════════════

const migrationPriority = [
  {
    phase: "Phase 1: Core Infrastructure (Week 1)",
    tasks: [
      "1. Add ThemeProvider wrapper in App.tsx ⭐ HIGH PRIORITY",
      "2. Move DarkModeToggle to main header/navigation",
      "3. Test dark mode toggle localStorage persistence",
      "4. Test system preference detection",
    ]
  },
  {
    phase: "Phase 2: Admin Portal Refactoring (Week 1-2)",
    tasks: [
      "1. Update SecretAdminPortal.tsx to use PageLayout component",
      "2. Replace 10+ Dialog instances with ResponsiveDialog",
      "3. Test responsive behavior at 320px, 768px, 1024px breakpoints",
      "4. Verify dark mode works across all admin tabs",
    ]
  },
  {
    phase: "Phase 3: Other Pages (Week 2-3)",
    tasks: [
      "1. Update Dashboard to use PageLayout",
      "2. Update User Management to use PageLayout",
      "3. Update Presence page with PageLayout",
      "4. Update Messages page with PageLayout",
    ]
  },
  {
    phase: "Phase 4: Dialog Migration (Week 3-4)",
    tasks: [
      "1. Audit all Dialog imports in codebase",
      "2. Replace all Dialog with ResponsiveDialog component",
      "3. Test on mobile (iPhone 12, iPad)",
      "4. Test keyboard navigation and focus management",
    ]
  },
  {
    phase: "Phase 5: Testing & Validation (Week 4-5)",
    tasks: [
      "1. Full responsive testing (320px to 1920px)",
      "2. Dark mode toggle testing (localStorage, system pref, cross-tab)",
      "3. Accessibility testing (keyboard nav, ARIA labels, color contrast)",
      "4. Performance profiling (no layout shifts, smooth transitions)",
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT PROP REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PageLayout Props
 */
interface PageLayoutProps {
  title: string;                              // Page title
  description?: string;                       // Optional subtitle/description
  children?: React.ReactNode;                 // Main content
  actions?: React.ReactNode;                  // Action buttons (top right)
  tabs?: Array<{                              // Tab configuration
    value: string;
    label: string;
    icon?: React.ComponentType<any>;
  }>;
  activeTab?: string;                         // Currently active tab
  onTabChange?: (value: string) => void;     // Tab change handler
  headerAction?: React.ReactNode;             // Alternative to actions
  fullWidth?: boolean;                        // Remove max-width constraint
  showDivider?: boolean;                      // Show line between header and content
  className?: string;                         // Additional container classes
}

/**
 * UseTheme Hook
 */
interface UseThemeReturn {
  theme: "light" | "dark" | "auto";          // Current theme setting
  isDark: boolean;                            // Is currently in dark mode
  toggleDarkMode: () => void;                 // Toggle between light/dark
  setTheme: (t: "light" | "dark" | "auto") => void;  // Set specific theme
}

// Usage:
// const { isDark, toggleDarkMode } = useTheme();

/**
 * ResponsiveDialog Props
 */
interface ResponsiveDialogProps {
  open: boolean;                              // Dialog visibility
  onOpenChange: (open: boolean) => void;     // Change handler
  title: string;                              // Dialog title
  description?: string;                       // Optional description
  children: React.ReactNode;                  // Dialog content
  footer?: React.ReactNode;                   // Footer content (buttons)
  maxWidth?: "sm" | "md" | "lg" | "xl";      // Max width (default: md)
  closeOnBackdropClick?: boolean;             // Close when clicking backdrop
  className?: string;                         // Additional classes
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE: Full Page Refactoring
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import { useTheme } from "@/components/theme/DarkMode";
import { ResponsiveDialog } from "@/components/dialog/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Activity, Settings, Users, BarChart3 } from "lucide-react";

export function ExampleRefactoredPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isDark } = useTheme();

  const tabs = [
    { value: "overview", label: "Overview", icon: Activity },
    { value: "users", label: "Users", icon: Users },
    { value: "analytics", label: "Analytics", icon: BarChart3 },
    { value: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      <PageLayout
        title="Dashboard"
        description="View system health and statistics"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            Add New
          </Button>
        }
      >
        <div className="space-y-6 p-4 md:p-6">
          {activeTab === "overview" && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Overview</h3>
              <p>Welcome! You're in {isDark ? "dark" : "light"} mode.</p>
            </div>
          )}
          
          {activeTab === "users" && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Users</h3>
              <p>User management content here</p>
            </div>
          )}
          
          {activeTab === "analytics" && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Analytics</h3>
              <p>Analytics content here</p>
            </div>
          )}
          
          {activeTab === "settings" && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Settings</h3>
              <p>Settings content here</p>
            </div>
          )}
        </div>
      </PageLayout>

      <ResponsiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add New Item"
        description="Enter the details below"
        maxWidth="md"
      >
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input 
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Enter name..."
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setDialogOpen(false)}>
            Create
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CHECKLIST FOR EACH PAGE
// ═══════════════════════════════════════════════════════════════════════════

const pageRefactoringChecklist = `
For each page refactored with PageLayout:

RESPONSIVE DESIGN (✓ = passed)
  [ ] Header stacks on mobile (<640px)
  [ ] Title remains readable at 320px
  [ ] Action buttons stack vertically on mobile
  [ ] Tabs are horizontally scrollable on mobile
  [ ] Content scrolls properly on small screens

DARK MODE
  [ ] Toggle dark mode - all content visible
  [ ] Text contrast meets WCAG AA
  [ ] No white text on light backgrounds
  [ ] Icons render correctly in both modes
  [ ] Cards and panels visible in both modes

ACCESSIBILITY
  [ ] Tab navigation works with keyboard (Tab key)
  [ ] Focus indicators clearly visible
  [ ] Aria-labels on all interactive elements
  [ ] Heading hierarchy correct (h1 → h2 → h3)
  [ ] Form labels associated with inputs

DIALOGS
  [ ] Dialog opens and closes smoothly
  [ ] Mobile: appears as bottom drawer
  [ ] Desktop: appears as centered modal
  [ ] Keyboard: Escape key closes dialog
  [ ] Backdrop click closes dialog (if enabled)
  [ ] Focus trapped inside dialog when open
  [ ] Buttons fully visible on small screens

PERFORMANCE
  [ ] No layout shifts on theme toggle
  [ ] Animations run smoothly (60fps)
  [ ] No console errors or warnings
  [ ] Page loads within 3 seconds
  [ ] Icons load properly (no missing assets)
`;

console.log("✅ Components Integration Guide loaded");
