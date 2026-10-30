import { cn } from 'cn'
import { ChevronDown } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type Room, useRoomMutations } from '@/lib/rooms'

type Props = {
  rooms: Room[]
  room: Room | undefined
  onSelect: (id: number) => void
}

// Header room switcher. Picking a room opens it for editing; only the active
// one is driven, so making another active is a separate, explicit step.
export function RoomMenu({ rooms, room, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<'new' | 'rename' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mutations = useRoomMutations()
  const error = Object.values(mutations).find((m) => m.isError)?.error

  const reset = () => {
    setForm(null)
    setConfirmDelete(false)
    for (const m of Object.values(mutations)) m.reset()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          size="xs"
          className="h-7 gap-2 px-2.5 text-[13px] aria-expanded:bg-surface-3"
        >
          <ActiveDot active={!!room?.active} />
          {room?.name ?? 'No room'}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-0.5">
        <span className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
          Rooms · the active one is driven
        </span>
        {rooms.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              aria-current={r.id === room?.id}
              className="flex-1 justify-start gap-2.5 px-2.5"
              onClick={() => {
                onSelect(r.id)
                setOpen(false)
              }}
            >
              <ActiveDot active={r.active} />
              <span className="flex-1 truncate text-left">{r.name}</span>
              {r.active && (
                <span className="font-mono text-[11px] text-muted-foreground">active</span>
              )}
            </Button>
            {!r.active && (
              <Button
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs"
                disabled={mutations.activate.isPending}
                onClick={() => mutations.activate.mutate(r.id)}
              >
                Make active
              </Button>
            )}
          </div>
        ))}
        <div className="mx-1.5 my-1 h-px bg-input" />
        {form ? (
          <RoomNameForm
            label={form === 'new' ? 'New room name' : `Rename ${room?.name}`}
            initial={form === 'rename' ? (room?.name ?? '') : ''}
            submit={form === 'new' ? 'Create' : 'Rename'}
            pending={mutations.create.isPending || mutations.rename.isPending}
            onCancel={reset}
            onSubmit={(name) => {
              if (form === 'new') {
                mutations.create.mutate(name, {
                  onSuccess: (created) => {
                    onSelect(created.id)
                    reset()
                  },
                })
              } else if (room) {
                mutations.rename.mutate({ id: room.id, name }, { onSuccess: reset })
              }
            }}
          />
        ) : (
          <>
            <MenuAction onClick={() => setForm('new')}>New room</MenuAction>
            {room && <MenuAction onClick={() => setForm('rename')}>Rename {room.name}</MenuAction>}
            {room && !room.active && (
              <MenuAction
                className="text-destructive"
                disabled={mutations.remove.isPending}
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  const next = rooms.find((r) => r.active) ?? rooms.find((r) => r.id !== room.id)
                  mutations.remove.mutate(room.id, {
                    onSuccess: () => {
                      if (next) onSelect(next.id)
                      reset()
                    },
                  })
                }}
              >
                {confirmDelete ? `Delete ${room.name} and its fixtures?` : `Delete ${room.name}`}
              </MenuAction>
            )}
          </>
        )}
        {error && <p className="px-2.5 py-1.5 text-sm text-destructive">{error.message}</p>}
      </PopoverContent>
    </Popover>
  )
}

function ActiveDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        active ? 'bg-live' : 'border-[1.5px] border-off-ring',
      )}
    />
  )
}

function MenuAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('justify-start px-2.5 font-normal', className)}
      {...props}
    />
  )
}

function RoomNameForm(props: {
  label: string
  initial: string
  submit: string
  pending: boolean
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(props.initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) props.onSubmit(name.trim())
  }
  return (
    <form className="flex flex-col gap-2 p-1.5" onSubmit={submit}>
      <Input
        aria-label={props.label}
        placeholder={props.label}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          props.onCancel()
        }}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={props.pending || !name.trim()}>
          {props.submit}
        </Button>
      </div>
    </form>
  )
}
