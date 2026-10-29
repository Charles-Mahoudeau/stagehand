import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import type * as React from 'react'

// Stagehand buttons: rounded, filled, borderless. `default` (white) at most once per region;
// `outline` is for Blackout; `dashed` closes a list ("Add canal").
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,filter,color] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-invalid:outline-2 aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary font-semibold text-primary-foreground hover:brightness-90',
        secondary: 'bg-secondary text-secondary-foreground hover:brightness-125',
        quiet: 'bg-surface-1 text-foreground hover:bg-surface-2',
        outline:
          'bg-surface-1 font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-surface-2 aria-expanded:bg-surface-2',
        dashed:
          'border-dashed border-input bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        ghost:
          'text-foreground hover:bg-surface-2 aria-expanded:bg-surface-2 aria-[current=true]:bg-surface-3',
        destructive: 'bg-surface-1 text-destructive hover:bg-surface-2',
        link: 'text-foreground underline underline-offset-4 hover:text-muted-foreground',
      },
      size: {
        default: 'h-control-md px-5',
        sm: 'h-control-sm px-4',
        lg: 'h-control-lg px-5',
        go: 'h-control-go w-full rounded-xl text-[22px] leading-7 font-semibold',
        icon: 'size-control-md',
        'icon-sm': 'size-control-sm',
        'icon-lg': 'size-control-lg',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'secondary',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
