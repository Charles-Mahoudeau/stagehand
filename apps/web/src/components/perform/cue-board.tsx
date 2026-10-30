import { GENERATOR_INFO } from '@stagehand/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { StagePlan } from '@/components/configure/stage-plan'
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTitle,
  Spacer,
} from '@/components/shell/panel'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { fixturesQuery, type Room, roomAspect } from '@/lib/rooms'
import {
  cuesQuery,
  effectsQuery,
  scenesQuery,
  useCueMutations,
  useEffectMutations,
  usePlaybackMutations,
} from '@/lib/show'

// Perform › cues: step through the show with GO, and fire effects over the scene.
export function CueBoard({ room }: { room: Room }) {
  const { playback } = useLive()
  const cues = useQuery(cuesQuery(room.id))
  const scenes = useQuery(scenesQuery(room.id))
  const effects = useQuery(effectsQuery(room.id))
  const fixtures = useQuery(fixturesQuery(room.id))
  const cueM = useCueMutations(room.id)
  const transport = usePlaybackMutations(room.id)
  const fx = useEffectMutations(room.id)

  const list = cues.data ?? []
  const current = list.findIndex((c) => c.id === playback?.cueId)
  const next = list[current + 1]
  const pads = (effects.data ?? []).filter((e) => e.pad)
  const sceneName = (id: number) => scenes.data?.find((s) => s.id === id)?.name ?? ''
  const error =
    transport.go.error ??
    transport.back.error ??
    transport.stop.error ??
    cueM.go.error ??
    fx.fire.error

  return (
    <>
      <Panel className="flex-1 rounded-xl">
        <PanelHeader className="h-10 pl-4">
          <PanelTitle className="text-[13px]">Cues</PanelTitle>
          <span className="text-xs text-muted-foreground">
            {next ? `Next: ${next.name}` : list.length > 0 ? 'End of the list' : ''}
          </span>
          <Spacer />
          <PanelNote className="text-xs">{list.length} cues</PanelNote>
        </PanelHeader>
        <PanelBody className="p-2">
          {cues.isSuccess && list.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No cues yet. Build the list in{' '}
              <Link to="/scenes" className="text-foreground underline underline-offset-4">
                Scenes
              </Link>
              .
            </p>
          )}
          <ol className="flex flex-col gap-1.5">
            {list.map((c, i) => {
              const on = i === current
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={on}
                    onClick={() => cueM.go.mutate(c.id)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 text-left',
                      on ? 'bg-primary text-primary-foreground' : 'bg-surface-2 hover:bg-surface-3',
                      !on && c.id === next?.id && 'shadow-[inset_0_0_0_1.5px_var(--text-muted)]',
                    )}
                  >
                    <span className="w-6 font-mono text-sm opacity-60">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold">{c.name}</span>
                      <span className="truncate text-xs opacity-70">{sceneName(c.sceneId)}</span>
                    </span>
                    {c.trigger === 'follow' && (
                      <span className="font-mono text-[11px] opacity-70">follows +{c.delay}s</span>
                    )}
                    {on && playback && playback.fading > 0 && (
                      <span className="font-mono text-[11px]">fading</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </PanelBody>
        {error && <span className="px-3 pb-2 text-xs text-warning">{error.message}</span>}
        <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 p-3 pt-1">
          <Button
            size="lg"
            className="h-14"
            disabled={current <= 0 || transport.back.isPending}
            onClick={() => transport.back.mutate()}
          >
            Back
          </Button>
          <Button
            variant="default"
            size="go"
            disabled={!next || transport.go.isPending}
            onClick={() => transport.go.mutate()}
          >
            GO
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-14"
            onClick={() => transport.stop.mutate()}
          >
            Release
          </Button>
        </div>
      </Panel>

      <div className="flex w-[380px] shrink-0 flex-col gap-1.5">
        <Panel className="flex-1 rounded-xl">
          <PanelHeader className="h-10 pl-4">
            <PanelTitle className="text-[13px]">Effects</PanelTitle>
            <span className="text-xs text-muted-foreground">Over the scene</span>
          </PanelHeader>
          <PanelBody className="p-3">
            {pads.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No pads. Tick “Show as a pad” on an effect in{' '}
                <Link to="/effects" className="text-foreground underline underline-offset-4">
                  Effects
                </Link>
                .
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {pads.map((e) => {
                const once = GENERATOR_INFO[e.generator].once
                const on = !!playback?.overlays.some((o) => o.effectId === e.id)
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => fx.fire.mutate(e.id)}
                    className={cn(
                      'flex h-[84px] flex-col items-start justify-center gap-0.5 rounded-xl px-3.5 text-left active:brightness-125',
                      on ? 'bg-primary text-primary-foreground' : 'bg-surface-2 hover:bg-surface-3',
                    )}
                  >
                    <span className="text-base font-semibold">{e.name}</span>
                    <span className="font-mono text-[11px] opacity-70">
                      {once && e.generator === 'lightning'
                        ? 'tap to fire'
                        : on
                          ? 'tap to stop'
                          : 'tap to start'}
                    </span>
                  </button>
                )
              })}
            </div>
          </PanelBody>
        </Panel>

        <Panel className="h-[250px] shrink-0 rounded-xl">
          <PanelHeader className="h-10 pl-4">
            <PanelTitle className="text-[13px]">Room</PanelTitle>
            <Spacer />
            <PanelNote className="text-xs">live</PanelNote>
          </PanelHeader>
          {fixtures.data && (
            <StagePlan
              size="sm"
              className="min-h-0 flex-1 rounded-none"
              fixtures={fixtures.data}
              live
              aspect={roomAspect(room)}
            />
          )}
        </Panel>
      </div>
    </>
  )
}
