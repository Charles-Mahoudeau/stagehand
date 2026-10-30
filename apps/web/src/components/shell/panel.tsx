import { cn } from 'cn'
import type * as React from 'react'

// Workspace panels. The window never scrolls: a panel is a header strip plus a
// body that scrolls on its own. Panels sit in a flex row or column on black.

export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[8px] bg-surface-1',
        className,
      )}
      {...props}
    />
  )
}

// 32px strip: a title or tabs on the left, tools and counts on the right.
export function PanelHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-2/60 pr-1.5 pl-3',
        className,
      )}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('text-xs font-semibold', className)} {...props} />
}

// Small mono note in a header: counts, coordinates, hints.
export function PanelNote({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('font-mono text-[11px] text-muted-foreground', className)} {...props} />
  )
}

export const Spacer = () => <span className="flex-1" />

export const panelTabClass = (active: boolean) =>
  cn(
    'flex h-8 items-center px-3 text-xs whitespace-nowrap outline-none focus-visible:bg-surface-3',
    active
      ? 'text-foreground shadow-[inset_0_-2px_var(--text)]'
      : 'text-muted-foreground hover:text-foreground',
  )

// A header tab. In a tab strip the header drops its left padding: `<PanelHeader className="pl-0">`.
export function PanelTab({
  active,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={!!active}
      className={cn(panelTabClass(!!active), className)}
      {...props}
    />
  )
}

export function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-auto', className)} {...props} />
}

// Inspector section: an uppercase caption over its fields.
export function Section({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('border-t border-border-subtle pb-2 first:border-t-0', className)}>
      <div className="flex h-7 items-center justify-between pr-2 pl-3">
        <h3 className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// A label over one control, in the inspector's two-column rhythm.
export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid min-h-7 grid-cols-[84px_minmax(0,1fr)] items-center gap-2 px-3 py-0.5',
        className,
      )}
    >
      <label htmlFor={htmlFor} className="truncate text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
