import { cn } from 'cn'
import type * as React from 'react'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-control-md w-full min-w-0 rounded-lg border-0 bg-surface-2 px-3.5 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:outline-2 aria-invalid:outline-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
