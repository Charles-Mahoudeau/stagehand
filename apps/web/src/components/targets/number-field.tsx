import { CommitInput } from '@/components/configure/commit-input'
import { Label } from '@/components/ui/label'

export function NumberField(props: {
  id: string
  label: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <CommitInput
        id={props.id}
        inputMode="decimal"
        className="font-mono"
        placeholder={props.placeholder}
        value={props.value}
        onCommit={props.onCommit}
      />
    </div>
  )
}
