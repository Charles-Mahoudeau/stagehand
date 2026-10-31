import type { Look, LookEntry } from '@stagehand/shared'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { Play, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import {
  Field,
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
import type { Fixture, Room } from '@/lib/rooms'
import {
  cuesQuery,
  effectsQuery,
  type Scene,
  scenesQuery,
  useCueMutations,
  useSceneMutations,
} from '@/lib/show'
import { type Target, targetsQuery } from '@/lib/targets'
import { RangeRow, useThrottle } from './controls'
import { CueList } from './cue-list'
import { canalOf, groupChoices } from './effects-workspace'

type Props = {
  room: Room
  fixtures: Fixture[]
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}

export function ScenesWorkspace({ room, fixtures, selectedId, onSelect }: Props) {
  const scenes = useQuery(scenesQuery(room.id))
  const cues = useQuery(cuesQuery(room.id))
  const effects = useQuery(effectsQuery(room.id))
  const targets = useQuery(targetsQuery(room.id))
  const m = useSceneMutations(room.id)
  const cueM = useCueMutations(room.id)
  const { playback } = useLive()
  const groups = useMemo(() => groupChoices(fixtures), [fixtures])
  const list = scenes.data ?? []
  const selected = list.find((s) => s.id === selectedId)

  const addScene = () => {
    const taken = new Set(list.map((s) => s.name.toLowerCase()))
    let name = 'New scene'
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New scene ${n}`
    // Starts dark, with every group listed off; the inspector turns groups on.
    m.create.mutate({ name }, { onSuccess: (s) => onSelect(s.id) })
  }

  return (
    <>
      <Panel className="min-w-0 flex-1">
        <PanelHeader>
          <PanelTitle>Scenes</PanelTitle>
          <PanelNote>{list.length}</PanelNote>
          <Spacer />
          <Button size="xs" onClick={addScene}>
            <Plus /> New scene
          </Button>
        </PanelHeader>
        <PanelBody className="p-2">
          {list.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">
              A scene is a look for the room plus the effects running under it. Make one to start.
            </p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === selectedId}
                onClick={() => onSelect(s.id)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg bg-surface-2 p-2 text-left hover:bg-surface-3',
                  s.id === selectedId && 'bg-surface-3 shadow-[inset_0_0_0_1.5px_var(--text)]',
                )}
              >
                <SceneThumb scene={s} fixtures={fixtures} />
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {s.name}
                  </span>
                  {s.id === playback?.sceneId && (
                    <span className="size-2 shrink-0 rounded-full bg-live" title="Playing" />
                  )}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {[s.tag, s.effects.length > 0 && `${s.effects.length} fx`, `${s.fade}s`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </PanelBody>
      </Panel>

      <Panel className="w-[340px] shrink-0">
        <PanelHeader>
          <PanelTitle>Cue list</PanelTitle>
          <PanelNote>{cues.data?.length ?? 0}</PanelNote>
          <Spacer />
          <Button
            size="xs"
            disabled={!selected}
            onClick={() => selected && cueM.create.mutate({ sceneId: selected.id })}
          >
            <Plus /> Add {selected ? `“${selected.name}”` : 'scene'}
          </Button>
        </PanelHeader>
        <PanelBody>
          <CueList roomId={room.id} cues={cues.data ?? []} scenes={list} />
        </PanelBody>
      </Panel>

      <Panel className="w-[340px] shrink-0">
        <PanelHeader>
          <PanelTitle>Inspector</PanelTitle>
          <Spacer />
          {selected && (
            <>
              <Button
                size="xs"
                variant="default"
                disabled={!room.active || m.go.isPending}
                onClick={() => m.go.mutate(selected.id)}
              >
                <Play /> Play
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete scene"
                onClick={() => {
                  if (window.confirm(`Delete "${selected.name}" and its cues?`)) {
                    m.remove.mutate(selected.id, { onSuccess: () => onSelect(undefined) })
                  }
                }}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </PanelHeader>
        <PanelBody>
          {selected ? (
            <Inspector
              key={selected.id}
              scene={selected}
              groups={groups}
              targets={targets.data ?? []}
              effects={effects.data ?? []}
              update={(patch) => m.update.mutate({ id: selected.id, ...patch })}
              error={m.update.error ?? m.go.error}
            />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Pick a scene to edit it.</p>
          )}
        </PanelBody>
      </Panel>
    </>
  )
}

const hexLevel = (e: LookEntry) => {
  const k = (i: number) =>
    Math.round(Number.parseInt(e.color.slice(1 + i * 2, 3 + i * 2), 16) * e.level)
  return `rgb(${k(0)},${k(1)},${k(2)})`
}

// A small top view of the room in the scene's colors.
function SceneThumb({ scene, fixtures }: { scene: Scene; fixtures: Fixture[] }) {
  return (
    <svg
      viewBox="0 0 100 64"
      className="aspect-[100/64] w-full rounded-md bg-surface-0"
      aria-hidden
    >
      {fixtures.map((f) => {
        if (!f.position) return null
        const entry = scene.look[String(f.address)]
        const cx = 4 + f.position.x * 92
        const cy = 4 + f.position.y * 56
        return entry ? (
          <circle key={f.id} cx={cx} cy={cy} r={3} fill={hexLevel(entry)} />
        ) : (
          <circle key={f.id} cx={cx} cy={cy} r={2.4} fill="none" stroke="var(--surface-3)" />
        )
      })}
    </svg>
  )
}

function Inspector({
  scene,
  groups,
  targets,
  effects,
  update,
  error,
}: {
  scene: Scene
  groups: ReturnType<typeof groupChoices>
  targets: Target[]
  effects: { id: string; name: string }[]
  update: (patch: Partial<Pick<Scene, 'name' | 'tag' | 'look' | 'effects' | 'fade'>>) => void
  error: Error | null
}) {
  // The look is edited here and streamed to the server, which replaces it whole.
  const [look, setLook] = useState<Look>(scene.look)
  const sceneLook = useRef(scene.look)
  useEffect(() => {
    // A change from elsewhere (another client) replaces what is shown.
    if (JSON.stringify(sceneLook.current) !== JSON.stringify(scene.look)) setLook(scene.look)
    sceneLook.current = scene.look
  }, [scene.look])
  const latest = useRef(look)
  const send = useThrottle(() => update({ look: latest.current }))
  const edit = (next: Look) => {
    latest.current = next
    setLook(next)
    send()
  }
  const setEntry = (address: number, patch: Partial<LookEntry> | null) => {
    const key = String(address)
    if (patch === null) {
      const { [key]: _, ...rest } = look
      edit(rest)
      return
    }
    const old: LookEntry = look[key] ?? { color: '#ffffff', level: 0.8 }
    edit({ ...look, [key]: { ...old, ...patch } })
  }
  const [fade, setFade] = useState(scene.fade)
  const sendFade = useThrottle((v: number) => update({ fade: v }))
  const free = effects.filter((e) => !scene.effects.some((r) => r.effectId === e.id))

  return (
    <>
      <div className="flex flex-col gap-2 p-3">
        <CommitInput
          compact
          aria-label="Scene name"
          className="text-sm font-semibold"
          value={scene.name}
          onCommit={(name) => update({ name })}
        />
        <CommitInput
          compact
          aria-label="Tag"
          placeholder="Tag, like Night or Day"
          value={scene.tag}
          onCommit={(tag) => update({ tag })}
        />
        {error && <p className="text-xs text-warning">{error.message}</p>}
      </div>
      <Section title="Transition">
        <RangeRow
          label="Fade in"
          value={fade}
          min={0}
          max={30}
          step={0.5}
          format="s"
          onChange={(v) => {
            setFade(v)
            sendFade(v)
          }}
        />
      </Section>
      <Section title="Look">
        {groups.map((g) => {
          const e = look[String(g.address)]
          return (
            <div key={g.address} className="flex flex-col gap-0.5 px-3 py-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`${g.label} on`}
                  checked={!!e}
                  onChange={(ev) => setEntry(g.address, ev.target.checked ? {} : null)}
                  className="size-3.5 accent-[var(--text)]"
                />
                <span className={cn('w-16 text-xs', !e && 'text-muted-foreground')}>{g.label}</span>
                {e ? (
                  <>
                    {!g.mover && (
                      <input
                        type="color"
                        aria-label={`${g.label} color`}
                        value={e.color}
                        onChange={(ev) => setEntry(g.address, { color: ev.target.value })}
                        className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                      />
                    )}
                    <input
                      type="range"
                      aria-label={`${g.label} level`}
                      min={0}
                      max={1}
                      step={0.01}
                      value={e.level}
                      className="fader fader-sm min-w-0 flex-1"
                      style={
                        {
                          '--fill': `${e.level * 100}%`,
                          '--tint': 'var(--text)',
                        } as React.CSSProperties
                      }
                      onChange={(ev) => setEntry(g.address, { level: Number(ev.target.value) })}
                    />
                    <span className="w-9 text-right font-mono text-[11px]">
                      {Math.round(e.level * 100)}%
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">leaves it to effects</span>
                )}
              </div>
              {e && g.mover && (
                <select
                  aria-label={`${g.label} aim`}
                  value={e.target ?? ''}
                  onChange={(ev) => setEntry(g.address, { target: ev.target.value || null })}
                  className="ml-[88px] h-6 rounded bg-surface-2 px-1.5 text-[11px] outline-none"
                >
                  <option value="">Keep aim</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      Aim at {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          Canals are the room's 16-channel slots; fixtures that share one move together.
        </p>
      </Section>
      <Section title="Effects under the look">
        {scene.effects.map((ref) => {
          const eff = effects.find((e) => e.id === ref.effectId)
          return (
            <Field key={ref.effectId} label={eff?.name ?? 'Missing'}>
              <span className="flex items-center gap-1.5">
                <input
                  type="range"
                  aria-label={`${eff?.name} opacity`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={ref.opacity}
                  className="fader fader-sm min-w-0 flex-1"
                  style={
                    {
                      '--fill': `${ref.opacity * 100}%`,
                      '--tint': 'var(--text)',
                    } as React.CSSProperties
                  }
                  onChange={(ev) =>
                    update({
                      effects: scene.effects.map((r) =>
                        r.effectId === ref.effectId
                          ? { ...r, opacity: Number(ev.target.value) }
                          : r,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${eff?.name}`}
                  onClick={() =>
                    update({ effects: scene.effects.filter((r) => r.effectId !== ref.effectId) })
                  }
                >
                  <X />
                </Button>
              </span>
            </Field>
          )
        })}
        <div className="px-3 pt-1">
          <select
            aria-label="Add an effect"
            value=""
            disabled={free.length === 0}
            onChange={(ev) =>
              ev.target.value &&
              update({
                effects: [...scene.effects, { effectId: ev.target.value, opacity: 1 }],
              })
            }
            className="h-7 w-full rounded-md bg-surface-2 px-2 text-xs outline-none disabled:opacity-40"
          >
            <option value="">{free.length === 0 ? 'No more effects' : 'Add an effect…'}</option>
            {free.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <p className="pt-1 text-[11px] text-muted-foreground">
            They run from the library: edit one there and every scene using it follows.
          </p>
        </div>
      </Section>
    </>
  )
}

export { canalOf }
