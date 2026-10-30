import { cn } from 'cn'
import type * as React from 'react'

// `compact` is the dense 28px field used in editor panels.
function Input({
  className,
  type,
  compact,
  ...props
}: React.ComponentProps<'input'> & { compact?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        compact
          ? 'h-7 rounded-md px-2 text-xs'
          : 'h-control-md rounded-lg px-3.5 text-base md:text-sm',
        'w-full min-w-0 border-0 bg-surface-2 text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:outline-2 aria-invalid:outline-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
