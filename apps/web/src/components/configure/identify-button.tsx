import { useMutation } from '@tanstack/react-query'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { type Fixture, startIdentify, stopIdentify } from '@/lib/rooms'

type Props = Omit<React.ComponentProps<typeof Button>, 'onClick'> & {
  fixture: Fixture
  roomActive: boolean
}

// Toggles the server's rainbow on a fixture's address so it can be found in
// the room. The rainbow swatch is light output, so it is allowed its hue.
export function IdentifyButton({ fixture, roomActive, className, children, ...props }: Props) {
  const { identifying } = useLive()
  const on = identifying === fixture.id
  const toggle = useMutation({
    mutationFn: () =>
      on ? stopIdentify(fixture.roomId, fixture.id) : startIdentify(fixture.roomId, fixture.id),
  })

  return (
    <Button
      {...props}
      aria-pressed={on}
      disabled={!roomActive || toggle.isPending || props.disabled}
      title={roomActive ? undefined : 'Make this room active to identify'}
      onClick={() => toggle.mutate()}
      className={cn(on && 'bg-surface-3 font-medium text-foreground', className)}
    >
      <span
        className={cn(
          'size-3 shrink-0 rounded-full bg-[conic-gradient(#ff4646,#ffd23c,#46dc78,#40e0e0,#3c6eff,#e040e0,#ff4646)]',
          on && 'animate-spin [animation-duration:2s]',
        )}
      />
      {children ?? (on ? 'Stop identify' : 'Identify')}
    </Button>
  )
}
