import {
  EFFECT_KINDS,
  GENERATOR_INFO,
  GENERATORS,
  type Generator,
  type ParamsInput,
  resolveParams,
} from '@stagehand/shared'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { Play, Plus, Square, Trash2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import { IdInput } from '@/components/configure/id-input'
import { StagePlan } from '@/components/configure/stage-plan'
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTitle,
  Section,
  Spacer,
} from '@/components/shell/panel'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { groupByAddress } from '@/lib/patch'
import { type Fixture, type Room, roomAspect } from '@/lib/rooms'
import { type Effect, effectsQuery, useEffectMutations } from '@/lib/show'
import { targetsQuery } from '@/lib/targets'
import { ClipTimeline } from './clip-timeline'
import { type GroupChoice, ParamsForm } from './params-form'

// A group's name in the editor: its canal, counting 16-channel slots from 1.
export const canalOf = (address: number) => Math.floor((address - 1) / 16) + 1

export function groupChoices(fixtures: Fixture[]): GroupChoice[] {
  return groupByAddress(fixtures).map((g) => ({
    address: g.address,
    label: `Canal ${canalOf(g.address)}`,
    mover: g.type === 'moving_head',
  }))
}

type Props = {
  room: Room
  fixtures: Fixture[]
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}

export function EffectsWorkspace({ room, fixtures, selectedId, onSelect }: Props) {
  const effects = useQuery(effectsQuery(room.id))
  const targets = useQuery(targetsQuery(room.id))
  const m = useEffectMutations(room.id)
  const { playback } = useLive()
  const groups = useMemo(() => groupChoices(fixtures), [fixtures])
  const list = effects.data ?? []
  const selected = list.find((e) => e.id === selectedId)
  const info = selected && GENERATOR_INFO[selected.generator]
  const running = !!selected && !!playback?.overlays.some((o) => o.effectId === selected.id)
  const error =
    m.fire.error ?? m.stop.error ?? m.update.error ?? m.create.error ?? m.remove.error ?? null

  return (
    <>
      <Library
        effects={list}
        selectedId={selectedId}
        onSelect={onSelect}
        create={(generator) => {
          const base = GENERATOR_INFO[generator].name
          const taken = new Set(list.map((e) => e.name.toLowerCase()))
          let name = base
          for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
          m.create.mutate({ name, generator }, { onSuccess: (e) => onSelect(e.id) })
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Panel className="flex-1">
          <PanelHeader>
            <PanelTitle>{selected?.name ?? 'Preview'}</PanelTitle>
            {info && <PanelNote>{info.kind}</PanelNote>}
            <Spacer />
            {selected && info && (
              <>
                {error && <span className="text-xs text-warning">{error.message}</span>}
                {info.once && !resolveParams(selected.generator, selected.params).auto ? (
                  <Button
                    size="xs"
                    variant="default"
                    disabled={!room.active}
                    onClick={() => m.fire.mutate(selected.id)}
                  >
                    <Zap /> {selected.generator === 'lightning' ? 'Strike' : 'Play'}
                  </Button>
                ) : running ? (
                  <Button size="xs" onClick={() => m.stop.mutate(selected.id)}>
                    <Square /> Stop
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="default"
                    disabled={!room.active}
                    onClick={() => m.fire.mutate(selected.id)}
                  >
                    <Play /> Start
                  </Button>
                )}
              </>
            )}
          </PanelHeader>
          <StagePlan
            size="lg"
            className="min-h-0 flex-1 rounded-none"
            fixtures={fixtures}
            live={room.active}
            aspect={roomAspect(room)}
          />
          {!room.active && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              This room is not driven. Make it active in Configure to see effects on the lights.
            </p>
          )}
        </Panel>

        {selected?.generator === 'lightning' && (
          <Panel className="h-[270px] shrink-0">
            <PanelHeader>
              <PanelTitle>Flashes</PanelTitle>
              <PanelNote>one strike</PanelNote>
            </PanelHeader>
            <ClipTimeline
              clips={resolveParams('lightning', selected.params).clips}
              color={resolveParams('lightning', selected.params).color}
              onChange={(clips) => m.update.mutate({ id: selected.id, params: { clips } })}
            />
          </Panel>
        )}
      </div>

      <Panel className="w-[320px] shrink-0">
        <PanelHeader>
          <PanelTitle>Inspector</PanelTitle>
          <Spacer />
          {selected && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete effect"
              onClick={() => {
                if (window.confirm(`Delete "${selected.name}"? Scenes stop using it.`)) {
                  m.remove.mutate(selected.id, { onSuccess: () => onSelect(undefined) })
                }
              }}
            >
              <Trash2 />
            </Button>
          )}
        </PanelHeader>
        <PanelBody>
          {selected && info ? (
            <Inspector
              key={selected.id}
              effect={selected}
              description={info.description}
              groups={groups}
              targets={targets.data ?? []}
              onRename={(name) => m.update.mutate({ id: selected.id, name })}
              onRenameId={(newId) =>
                m.update.mutate({ id: selected.id, newId }, { onSuccess: (e) => onSelect(e.id) })
              }
              onPad={(pad) => m.update.mutate({ id: selected.id, pad })}
              onParams={(params) => m.update.mutate({ id: selected.id, params })}
            />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              Pick an effect from the library, or add one.
            </p>
          )}
        </PanelBody>
      </Panel>
    </>
  )
}

function Library({
  effects,
  selectedId,
  onSelect,
  create,
}: {
  effects: Effect[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  create: (generator: Generator) => void
}) {
  const [generator, setGenerator] = useState<Generator>('fire')
  return (
    <Panel className="w-[250px] shrink-0">
      <PanelHeader>
        <PanelTitle>Library</PanelTitle>
        <Spacer />
        <PanelNote>{effects.length}</PanelNote>
      </PanelHeader>
      <PanelBody>
        {EFFECT_KINDS.map((kind) => {
          const rows = effects.filter((e) => GENERATOR_INFO[e.generator].kind === kind)
          if (rows.length === 0) return null
          return (
            <Section key={kind} title={kind}>
              <ul className="flex flex-col gap-px px-1.5">
                {rows.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-current={e.id === selectedId}
                      onClick={() => onSelect(e.id)}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]',
                        e.id === selectedId
                          ? 'bg-surface-3 text-foreground'
                          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      {e.pad && <PanelNote>pad</PanelNote>}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )
        })}
        {effects.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            No effects yet. Pick a kind below and add it.
          </p>
        )}
      </PanelBody>
      <div className="flex gap-1.5 border-t border-border-subtle p-1.5">
        <select
          aria-label="New effect kind"
          value={generator}
          onChange={(e) => setGenerator(e.target.value as Generator)}
          className="h-7 min-w-0 flex-1 rounded-md bg-surface-2 px-2 text-xs outline-none"
        >
          {GENERATORS.map((g) => (
            <option key={g} value={g}>
              {GENERATOR_INFO[g].name}
            </option>
          ))}
        </select>
        <Button size="xs" onClick={() => create(generator)}>
          <Plus /> Add
        </Button>
      </div>
    </Panel>
  )
}

function Inspector({
  effect,
  description,
  groups,
  targets,
  onRename,
  onRenameId,
  onPad,
  onParams,
}: {
  effect: Effect
  description: string
  groups: GroupChoice[]
  targets: Parameters<typeof ParamsForm>[0]['targets']
  onRename: (name: string) => void
  onRenameId: (id: string) => void
  onPad: (pad: boolean) => void
  onParams: (patch: ParamsInput) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-2 p-3">
        <CommitInput
          compact
          aria-label="Effect name"
          className="text-sm font-semibold"
          value={effect.name}
          onCommit={onRename}
        />
        <IdInput value={effect.id} onCommit={onRenameId} />
        <p className="text-xs text-muted-foreground">{description}</p>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={effect.pad}
            onChange={(e) => onPad(e.target.checked)}
            className="size-3.5 accent-[var(--text)]"
          />
          Show as a pad in Perform
        </label>
      </div>
      <ParamsForm effect={effect} groups={groups} targets={targets} onChange={onParams} />
    </>
  )
}
