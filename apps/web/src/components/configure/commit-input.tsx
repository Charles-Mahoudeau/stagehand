import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

type Props = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  // Called on blur or Enter when the text changed. Escape reverts.
  onCommit: (value: string) => void
}

// A field that saves when you leave it, rather than on every keystroke.
export function CommitInput({ value, onCommit, onKeyDown, ...props }: Props) {
  const [draft, setDraft] = useState(value)
  const canceled = useRef(false)
  useEffect(() => setDraft(value), [value])

  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!canceled.current && draft.trim() !== value) onCommit(draft.trim())
        canceled.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          canceled.current = true
          setDraft(value)
          e.currentTarget.blur()
        }
        onKeyDown?.(e)
      }}
    />
  )
}
