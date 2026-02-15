// Enhanced PageLayout Component with Dark Mode & Mobile Responsiveness
// This replaces scattered layout patterns with a unified, accessible container

import React from 'react';

export interface PageLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
  }>;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  headerAction?: 'back' | 'close' | 'none';
  onHeaderAction?: () => void;
  className?: string;
  fullWidth?: boolean;
  showDivider?: boolean;
}

/**
 * PageLayout Component
 * Provides consistent page structure with:
 * - Responsive header with title, description, and actions
 * - Tab support for multi-view pages
 * - Mobile-first design that works on 320px - 2560px screens
 * - Dark mode support via data attribute
 * - Accessibility features (semantic HTML, ARIA labels)
 * - Consistent spacing and alignment
 * 
 * Usage:
 * <PageLayout
 *   title="Admin Portal"
 *   description="Manage users, settings, and configurations"
 *   actions={<Button>Export</Button>}
 *   tabs={[
 *     { id: 'overview', label: 'Overview' },
 *     { id: 'settings', label: 'Settings' }
 *   ]}
 *   activeTab="overview"
 *   onTabChange={setActiveTab}
 * >
 *   {/* Page content */}
 * </PageLayout>
 */
export function PageLayout({
  title,
  description,
  children,
  actions,
  tabs,
  activeTab,
  onTabChange,
  headerAction = 'none',
  onHeaderAction,
  className = '',
  fullWidth = false,
  showDivider = true,
}: PageLayoutProps) {
  const [darkMode, setDarkMode] = React.useState(
    typeof document !== 'undefined' && document.documentElement.hasAttribute('data-theme-dark')
  );

  React.useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme-dark') {
          setDarkMode(document.documentElement.hasAttribute('data-theme-dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`page-layout ${fullWidth ? 'full-width' : 'contained'} ${darkMode ? 'dark' : ''} ${className}`}>
      {/* Page Header - Responsive */}
      <header className="page-header group">
        {/* Header Top: Title + Actions  */}
        <div className="header-top">
          {/* Left: Back/Close Action + Title */}
          <div className="header-left">
            {headerAction !== 'none' && onHeaderAction && (
              <button
                onClick={onHeaderAction}
                className="header-action-btn"
                aria-label={headerAction === 'back' ? 'Go back' : 'Close page'}
                title={headerAction === 'back' ? 'Go back' : 'Close'}
              >
                {headerAction === 'back' ? '← Back' : '✕'}
              </button>
            )}
            <div className="header-text">
              <h1 className="page-title">{title}</h1>
              {description && <p className="page-description">{description}</p>}
            </div>
          </div>

          {/* Right: Actions */}
          {actions && <div className="header-actions">{actions}</div>}
        </div>

        {/* Divider - Hidden on mobile */}
        {showDivider && <div className="header-divider" />}
      </header>

      {/* Tab Navigation - Responsive */}
      {tabs && tabs.length > 0 && (
        <nav className="page-tabs" role="tablist" aria-label="Page sections">
          <div className="tabs-container">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => onTabChange?.(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? 'active' : 'inactive'}`}
              >
                {tab.icon && <span className="tab-icon">{tab.icon}</span>}
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Page Content */}
      <main className="page-content" role="main">
        {children}
      </main>
    </div>
  );
}

// ============================================================================
// CSS for PageLayout Component with Dark Mode + Mobile Responsiveness
// ============================================================================

export const pageLayoutStyles = `
/* ===== PAGE LAYOUT CONTAINER ===== */
.page-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-foreground);
  transition: background-color 200ms ease, color 200ms ease;
}

.page-layout.full-width {
  max-width: 100%;
}

.page-layout:not(.full-width) {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* ===== PAGE HEADER ===== */
.page-header {
  padding: 1.5rem 1rem;
  /* Mobile: 1rem padding */
  background-color: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

@media (min-width: 640px) {
  .page-header {
    padding: 2rem 1.5rem;
  }
}

@media (min-width: 768px) {
  .page-header {
    padding: 2rem 2rem;
  }
}

@media (min-width: 1024px) {
  .page-header {
    padding: 2.5rem 2rem;
  }
}

.header-top {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.header-action-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 200ms ease;
  flex-shrink: 0;
}

.header-action-btn:hover {
  background: var(--color-muted);
  border-color: var(--color-muted-foreground);
}

.header-text {
  flex: 1;
  min-width: 0;
}

.page-title {
  font-size: 1.875rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  word-break: break-word;
}

@media (max-width: 639px) {
  .page-title {
    font-size: 1.5rem;
  }
}

.page-description {
  font-size: 0.95rem;
  color: var(--color-muted-foreground);
  margin: 0.5rem 0 0 0;
  line-height: 1.5;
  max-width: 600px;
}

/* ===== HEADER ACTIONS ===== */
.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 639px) {
  .header-actions {
    width: 100%;
    justify-content: stretch;
  }

  .header-actions button {
    flex: 1;
    min-width: 100px;
  }
}

.header-divider {
  height: 1px;
  background-color: var(--color-border);
  margin: 1.5rem 0 0 0;
  display: none;
}

@media (min-width: 768px) {
  .header-divider {
    display: block;
  }
}

/* ===== TAB NAVIGATION ===== */
.page-tabs {
  background-color: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  flex-shrink: 0;
}

.tabs-container {
  display: flex;
  gap: 0;
  padding: 0 1rem;
  min-width: min-content;
}

@media (min-width: 640px) {
  .tabs-container {
    padding: 0 1.5rem;
  }
}

@media (min-width: 1024px) {
  .tabs-container {
    padding: 0 2rem;
  }
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.125rem;
  border: none;
  background: transparent;
  color: var(--color-muted-foreground);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 200ms ease;
  position: relative;
}

.tab-btn:hover {
  color: var(--color-foreground);
  border-bottom-color: var(--color-border);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-icon {
  display: inline-flex;
  width: 1.125rem;
  height: 1.125rem;
  align-items: center;
  justify-content: center;
}

.tab-label {
  @media (max-width: 639px) {
    font-size: 0.875rem;
    padding: 0 0.25rem;
  }
}

/* ===== PAGE CONTENT ===== */
.page-content {
  flex: 1;
  padding: 1.5rem 1rem;
  overflow-y: auto;
}

@media (min-width: 640px) {
  .page-content {
    padding: 2rem 1.5rem;
  }
}

@media (min-width: 768px) {
  .page-content {
    padding: 2rem 2rem;
  }
}

@media (min-width: 1024px) {
  .page-content {
    padding: 2.5rem 2rem;
  }
}

/* ===== DARK MODE ===== */
.page-layout.dark {
  background-color: hsl(222, 47%, 11%);
  color: hsl(210, 40%, 98%);
}

.page-layout.dark .page-header {
  background-color: hsl(222, 50%, 15%);
  border-bottom-color: hsl(222, 50%, 25%);
}

.page-layout.dark .page-tabs {
  background-color: hsl(222, 50%, 15%);
  border-bottom-color: hsl(222, 50%, 25%);
}

.page-layout.dark .header-action-btn {
  background: hsl(222, 50%, 20%);
  border-color: hsl(222, 50%, 30%);
  color: hsl(210, 40%, 98%);
}

.page-layout.dark .header-action-btn:hover {
  background: hsl(222, 50%, 25%);
  border-color: hsl(222, 50%, 35%);
}

.page-layout.dark .page-description {
  color: hsl(220, 13%, 62%);
}

/* ===== ACCESSIBILITY ===== */
.tab-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.header-action-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ===== PRINT STYLES ===== */
@media print {
  .page-layout {
    background: white;
  }

  .page-header,
  .page-tabs {
    page-break-inside: avoid;
  }
}
`;
