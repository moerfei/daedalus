import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

// proto-kit 自研 Tabs（shadcn 风格，无 radix）。
// 交互契约与 A 轨一致：触发器 id 形如 tab-<名>，激活态 aria-selected="true"。

interface TabsContextValue {
  value: string
  setValue: (v: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

export function Tabs({
  defaultValue,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { defaultValue: string; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-muted/10 p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('TabsTrigger 必须在 <Tabs> 内使用')
  const active = ctx.value === value
  return (
    <button
      id={`tab-${value}`}
      data-tab={value}
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
        className,
      )}
      onClick={() => ctx.setValue(value)}
      {...props}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: string; children?: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('TabsContent 必须在 <Tabs> 内使用')
  if (ctx.value !== value) return null
  return (
    <div
      data-panel={value}
      role="tabpanel"
      className={cn('mt-4 rounded-lg border border-border bg-surface p-4', className)}
      {...props}
    >
      {children}
    </div>
  )
}
