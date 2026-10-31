import { cn } from 'cn'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { CommitInput } from '@/components/configure/commit-input'
import { IdInput } from '@/components/configure/id-input'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { type Cue, type Scene, useCueMutations } from '@/lib/show'
import { NumberCell } from './controls'

// The show's order, edited. One line per cue: which scene, how long the fade is,
// and whether it waits for GO or follows the cue before it.
export function CueList({
  roomId,
  cues,
  scenes,
}: {
  roomId: string
  cues: Cue[]
  scenes: Scene[]
}) {
  const m = useCueMutations(roomId)
  const { playback } = useLive()
  const move = (i: number, by: number) => {
    const ids = cues.map((c) => c.id)
    const [id] = ids.splice(i, 1)
    if (id !== undefined) ids.splice(i + by, 0, id)
    m.order.mutate(ids)
  }
  const error = m.update.error ?? m.order.error ?? m.remove.error ?? null

  return (
    <>
      {cues.length === 0 && (
        <p className="p-3 text-xs text-muted-foreground">
          No cues yet. Pick a scene and use “Add to cue list”.
        </p>
      )}
      <ol className="flex flex-col gap-1 p-1.5">
        {cues.map((c, i) => (
          <li
            key={c.id}
            className={cn(
              'flex flex-col gap-1 rounded-md bg-surface-2 p-1.5',
              c.id === playback?.cueId && 'shadow-[inset_0_0_0_1.5px_var(--text)]',
            )}
          >
            <div className="flex items-center gap-1">
              <span className="w-5 text-center font-mono text-[11px] text-muted-foreground">
                {i + 1}
              </span>
              <CommitInput
                compact
                aria-label={`Cue ${i + 1} name`}
                className="bg-surface-3"
                value={c.name}
                onCommit={(name) => m.update.mutate({ id: c.id, name })}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move down"
                disabled={i === cues.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove cue"
                onClick={() => m.remove.mutate(c.id)}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="pl-6">
              <IdInput
                aria-label={`Cue ${i + 1} ID`}
                className="bg-surface-3 text-[11px]"
                value={c.id}
                onCommit={(newId) => m.update.mutate({ id: c.id, newId })}
              />
            </div>
            <div className="flex items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
              <select
                aria-label={`Cue ${i + 1} scene`}
                value={c.sceneId}
                onChange={(e) => m.update.mutate({ id: c.id, sceneId: e.target.value })}
                className="h-6 min-w-0 flex-1 rounded bg-surface-3 px-1.5 text-[11px] text-foreground outline-none"
              >
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span>fade</span>
              <span className="w-12">
                <NumberCell
                  label={`Cue ${i + 1} fade`}
                  value={c.fade ?? scenes.find((s) => s.id === c.sceneId)?.fade ?? 0}
                  step={0.5}
                  min={0}
                  max={120}
                  onCommit={(fade) => m.update.mutate({ id: c.id, fade })}
                />
              </span>
              <select
                aria-label={`Cue ${i + 1} trigger`}
                value={c.trigger}
                disabled={i === 0}
                onChange={(e) =>
                  m.update.mutate({ id: c.id, trigger: e.target.value as Cue['trigger'] })
                }
                className="h-6 rounded bg-surface-3 px-1 text-[11px] text-foreground outline-none"
              >
                <option value="go">on GO</option>
                <option value="follow">follows</option>
              </select>
              {c.trigger === 'follow' && i > 0 && (
                <span className="w-12">
                  <NumberCell
                    label={`Cue ${i + 1} delay`}
                    value={c.delay}
                    step={0.5}
                    min={0}
                    max={600}
                    onCommit={(delay) => m.update.mutate({ id: c.id, delay })}
                  />
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {error && <p className="px-3 pb-2 text-xs text-warning">{error.message}</p>}
    </>
  )
}
