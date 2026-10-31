import { slugify } from '@stagehand/shared'
import { cn } from 'cn'
import { CommitInput } from './commit-input'

type Props = Omit<React.ComponentProps<typeof CommitInput>, 'onCommit'> & {
  // Called with the new ID, already a valid slug and different from `value`.
  onCommit: (id: string) => void
}

// The ID of a room, fixture, effect, scene, cue or target: lower-case letters,
// digits and dashes, which is what the text is turned into on commit.
export function IdInput({ value, onCommit, className, ...props }: Props) {
  return (
    <CommitInput
      compact
      aria-label="ID"
      maxLength={40}
      spellCheck={false}
      className={cn('font-mono', className)}
      value={value}
      onCommit={(text) => {
        const id = slugify(text)
        if (id && id !== value) onCommit(id)
      }}
      {...props}
    />
  )
}
