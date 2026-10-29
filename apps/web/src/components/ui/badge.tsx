import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import type * as React from 'react'

// The Stagehand StatusPill. State colours (live, warning, destructive) only ever colour the dot.
const badgeVariants = cva(
  'group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full bg-surface-2 px-2.5 text-xs whitespace-nowrap text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: '',
        live: 'before:size-1.5 before:rounded-full before:bg-live',
        warning: 'before:size-1.5 before:rounded-full before:bg-warning',
        destructive: 'before:size-1.5 before:rounded-full before:bg-destructive',
        idle: 'text-muted-foreground before:size-1.5 before:rounded-full before:border-[1.5px] before:border-off-ring',
        outline: 'bg-transparent shadow-[inset_0_0_0_1px_var(--input)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
