import { type Clip, hexToRgb, rgbToHex } from '@stagehand/shared'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberCell } from './controls'

const SPAN = 2.4
const W = 600
const H = 90

// The strike's flashes on a time axis: each one rises, holds and decays. Edited
// as rows below; the drawing follows. A flash can carry its own color, for the
// blue afterglow.
export function ClipTimeline({
  clips,
  color,
  onChange,
}: {
  clips: Clip[]
  color: string
  onChange: (clips: Clip[]) => void
}) {
  const x = (t: number) => (Math.min(t, SPAN) / SPAN) * W
  const set = (i: number, patch: Partial<Clip>) =>
    onChange(clips.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[90px] w-full shrink-0 rounded-md bg-surface-0"
        role="img"
        aria-label="Flash envelopes over time"
        preserveAspectRatio="none"
      >
        {[0.5, 1, 1.5, 2].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--surface-3)" strokeWidth={1} />
            <text
              x={x(t) + 3}
              y={H - 4}
              fill="var(--text-muted)"
              fontSize={9}
              fontFamily="monospace"
            >
              {t}s
            </text>
          </g>
        ))}
        {clips.map((c, i) => {
          const top = H - 8 - c.lvl * (H - 20)
          const base = H - 8
          const d = `M${x(c.at)},${base} L${x(c.at + c.att)},${top} L${x(c.at + c.att + c.dur)},${top} L${x(c.at + c.att + c.dur + c.dec * 2)},${base} Z`
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: clips have no identity of their own
            <path key={i} d={d} fill={c.col ?? color} fillOpacity={0.55} stroke={c.col ?? color} />
          )
        })}
      </svg>
      <div className="grid grid-cols-[18px_repeat(5,minmax(0,1fr))_28px_28px] items-center gap-x-1.5 gap-y-1 text-[11px]">
        <span />
        {['Start s', 'Level', 'Rise s', 'Hold s', 'Fall s'].map((h) => (
          <span key={h} className="text-right text-muted-foreground">
            {h}
          </span>
        ))}
        <span />
        <span />
        {clips.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: clips have no identity of their own
          <ClipRow key={i} i={i} c={c} color={color} set={set} clips={clips} onChange={onChange} />
        ))}
      </div>
      <Button
        variant="dashed"
        size="xs"
        className="self-start"
        disabled={clips.length >= 12}
        onClick={() => {
          const last = clips[clips.length - 1]
          onChange([
            ...clips,
            { at: (last?.at ?? 0) + 0.2, att: 0.01, dur: 0.05, dec: 0.1, lvl: 0.7 },
          ])
        }}
      >
        <Plus /> Add a flash
      </Button>
    </div>
  )
}

function ClipRow({
  i,
  c,
  color,
  set,
  clips,
  onChange,
}: {
  i: number
  c: Clip
  color: string
  set: (i: number, patch: Partial<Clip>) => void
  clips: Clip[]
  onChange: (clips: Clip[]) => void
}) {
  return (
    <>
      <span className="font-mono text-muted-foreground">{i + 1}</span>
      <NumberCell
        label={`Flash ${i + 1} start`}
        value={c.at}
        step={0.01}
        min={0}
        max={5}
        onCommit={(v) => set(i, { at: v })}
      />
      <NumberCell
        label={`Flash ${i + 1} level`}
        value={c.lvl}
        step={0.05}
        min={0}
        max={1}
        onCommit={(v) => set(i, { lvl: v })}
      />
      <NumberCell
        label={`Flash ${i + 1} rise`}
        value={c.att}
        step={0.005}
        min={0.002}
        max={2}
        onCommit={(v) => set(i, { att: v })}
      />
      <NumberCell
        label={`Flash ${i + 1} hold`}
        value={c.dur}
        step={0.01}
        min={0}
        max={2}
        onCommit={(v) => set(i, { dur: v })}
      />
      <NumberCell
        label={`Flash ${i + 1} fall`}
        value={c.dec}
        step={0.01}
        min={0.01}
        max={5}
        onCommit={(v) => set(i, { dec: v })}
      />
      <input
        type="color"
        aria-label={`Flash ${i + 1} color`}
        value={rgbToHex(hexToRgb(c.col ?? color))}
        onChange={(e) => set(i, { col: e.target.value })}
        className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove flash ${i + 1}`}
        disabled={clips.length <= 1}
        onClick={() => onChange(clips.filter((_, j) => j !== i))}
      >
        <X />
      </Button>
    </>
  )
}
