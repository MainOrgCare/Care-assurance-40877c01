import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

const VARIANT_ICON = {
  destructive: AlertTriangle,
  success: CheckCircle2,
  default: Info,
} as const

const VARIANT_ICON_CLASS = {
  destructive: "text-destructive shrink-0 mt-0.5",
  success: "text-success shrink-0 mt-0.5",
  default: "text-muted-foreground shrink-0 mt-0.5",
} as const

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const key = (variant ?? "default") as keyof typeof VARIANT_ICON
        const Icon = VARIANT_ICON[key] ?? VARIANT_ICON.default
        const iconClass = VARIANT_ICON_CLASS[key] ?? VARIANT_ICON_CLASS.default
        const showIcon = variant === "destructive" || variant === "success"

        return (
          <Toast key={id} variant={variant} {...props}>
            <div className={cn("grid gap-1 flex-1", showIcon && "grid-cols-[auto_1fr]")}>
              {showIcon && (
                <Icon className={cn("h-4 w-4", iconClass)} aria-hidden="true" />
              )}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
