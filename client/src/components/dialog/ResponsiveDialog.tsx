// Responsive Dialog/Modal Component for Mobile & Desktop
// Fixes the issue where dialogs take full width on small screens

import React from 'react';

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdropClick?: boolean;
}

/**
 * ResponsiveDialog Component
 * Provides a mobile-first modal/dialog that:
 * - Takes 100% width on screens < 640px with top/bottom drawer style
 * - Centered modal on desktop (> 640px)
 * - Proper max-width constraints
 * - Accessible focus management
 * - Smooth animations
 * - Escape key handling
 *
 * Usage:
 * <ResponsiveDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Confirm Action"
 *   description="Are you sure?"
 *   footer={
 *     <>
 *       <Button onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button onClick={handleConfirm}>Confirm</Button>
 *     </>
 *   }
 * >
 *   <p>Dialog content goes here</p>
 * </ResponsiveDialog>
 */
export const ResponsiveDialog = React.forwardRef<
  HTMLDivElement,
  ResponsiveDialogProps
>(
  (
    {
      open,
      onOpenChange,
      title,
      description,
      children,
      footer,
      className = '',
      maxWidth = 'md',
      closeOnBackdropClick = true,
    },
    ref
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [isAnimating, setIsAnimating] = React.useState(false);

    // Focus management
    React.useEffect(() => {
      if (!open) return;

      setIsAnimating(true);

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onOpenChange(false);
        }
      };

      // Lock body scroll
      document.body.style.overflow = 'hidden';

      // Add escape key listener
      document.addEventListener('keydown', handleEscape);

      // Focus trap
      const focusableElements = contentRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements?.[0] as HTMLElement;
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }, [open, onOpenChange]);

    if (!open) return null;

    const maxWidthClass = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
    }[maxWidth];

    return (
      <div className={`responsive-dialog-overlay ${isAnimating ? 'is-animating' : ''}`}>
        {/* Backdrop */}
        <div
          className="responsive-dialog-backdrop"
          onClick={() => closeOnBackdropClick && onOpenChange(false)}
          role="presentation"
          aria-hidden="true"
        />

        {/* Dialog Container */}
        <div
          ref={ref}
          className={`responsive-dialog-container ${maxWidthClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          aria-describedby={description ? 'dialog-description' : undefined}
        >
          {/* Header */}
          <div className="responsive-dialog-header">
            <div className="responsive-dialog-title-group">
              <h2 id="dialog-title" className="responsive-dialog-title">
                {title}
              </h2>
              {description && (
                <p id="dialog-description" className="responsive-dialog-description">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="responsive-dialog-close"
              aria-label="Close dialog"
              title="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div ref={contentRef} className="responsive-dialog-content">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="responsive-dialog-footer">{footer}</div>
          )}
        </div>
      </div>
    );
  }
);

ResponsiveDialog.displayName = 'ResponsiveDialog';

// ============================================================================
// CSS FOR RESPONSIVE DIALOG
// ============================================================================

export const responsiveDialogStyles = `
/* ===== DIALOG OVERLAY ===== */
.responsive-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  animation: fadeIn 200ms ease;
}

@media (min-width: 640px) {
  .responsive-dialog-overlay {
    align-items: center;
    padding: 2rem;
  }
}

.responsive-dialog-overlay.is-animating {
  animation: fadeIn 200ms ease;
}

/* ===== BACKDROP ===== */
.responsive-dialog-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  cursor: pointer;
  animation: fadeIn 150ms ease;
  z-index: -1;
}

/* ===== DIALOG CONTAINER ===== */
.responsive-dialog-container {
  position: relative;
  width: 100%;
  background-color: var(--color-card);
  border-radius: 0;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  animation: slideUp 300ms cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 0;
}

@media (min-width: 640px) {
  .responsive-dialog-container {
    width: auto;
    border-radius: 12px;
    animation: slideDown 300ms cubic-bezier(0.4, 0, 0.2, 1);
    margin-bottom: unset;
  }
}

/* Mobile: drawer from bottom */
@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Desktop: fade in centered */
@keyframes slideDown {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ===== HEADER ===== */
.responsive-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

@media (min-width: 640px) {
  .responsive-dialog-header {
    padding: 1.5rem 1.5rem;
  }
}

.responsive-dialog-title-group {
  flex: 1;
  min-width: 0;
}

.responsive-dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-foreground);
  word-break: break-word;
}

.responsive-dialog-description {
  font-size: 0.875rem;
  color: var(--color-muted-foreground);
  margin: 0.5rem 0 0 0;
  line-height: 1.5;
}

.responsive-dialog-close {
  padding: 0.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-muted-foreground);
  border-radius: 6px;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.responsive-dialog-close:hover {
  background: var(--color-muted);
  color: var(--color-foreground);
}

.responsive-dialog-close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ===== CONTENT ===== */
.responsive-dialog-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  font-size: 0.95rem;
  line-height: 1.6;
}

/* ===== FOOTER ===== */
.responsive-dialog-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  align-items: center;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-muted);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Mobile: full-width buttons in footer */
@media (max-width: 639px) {
  .responsive-dialog-footer {
    flex-direction: column-reverse;
  }

  .responsive-dialog-footer button {
    width: 100%;
  }
}

/* ===== DARK MODE ===== */
html[data-theme-dark] .responsive-dialog-container {
  background-color: var(--color-card);
}

html[data-theme-dark] .responsive-dialog-header {
  border-bottom-color: var(--color-border);
}

html[data-theme-dark] .responsive-dialog-footer {
  border-top-color: var(--color-border);
  background-color: var(--color-muted);
}

html[data-theme-dark] .responsive-dialog-title {
  color: var(--color-foreground);
}

html[data-theme-dark] .responsive-dialog-description {
  color: var(--color-muted-foreground);
}

/* ===== MAX-WIDTH CONSTRAINTS ===== */
.max-w-sm {
  max-width: 320px;
}

.max-w-md {
  max-width: 448px;
}

.max-w-lg {
  max-width: 512px;
}

.max-w-xl {
  max-width: 576px;
}

/* ===== ACCESSIBILITY ===== */
@media (prefers-reduced-motion: reduce) {
  .responsive-dialog-overlay,
  .responsive-dialog-backdrop,
  .responsive-dialog-container {
    animation: none;
  }
}

/* High contrast mode */
@media (prefers-contrast: more) {
  .responsive-dialog-container {
    border: 2px solid var(--color-foreground);
  }

  .responsive-dialog-header {
    border-bottom-width: 2px;
  }

  .responsive-dialog-footer {
    border-top-width: 2px;
  }
}
`;
