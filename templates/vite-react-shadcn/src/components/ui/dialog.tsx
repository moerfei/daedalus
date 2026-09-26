import { useEffect, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

// proto-kit 自研 Dialog（shadcn 风格，无 radix）。
// 关闭按钮 id 契约：<dialogId>-close（与 A 轨自动生成的关闭按钮一致）。

interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  dialogId?: string
}

export function Dialog({ open, onOpenChange, title, dialogId, className, children, ...props }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      id={dialogId}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}
      {...props}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            id={dialogId ? `${dialogId}-close` : undefined}
            type="button"
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/15 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
