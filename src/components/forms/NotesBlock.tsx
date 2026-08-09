import NotesText from './NotesText'
import SubLabel from '../layout/SubLabel'

interface Props {
  text: string
}

// A note in a history view: dim top rule + Notes eyebrow + the note body.
// Shared by the History session detail, LiftHistoryModal, and
// ExerciseSetsBlock so the divider idiom has a single definition.
export default function NotesBlock(props: Props) {
  return (
    <div class="mt-2 pt-2 border-t border-border-dim">
      <SubLabel class="pl-2 mb-0.5">Notes</SubLabel>
      <NotesText class="pl-2 text-text-dim" text={props.text} />
    </div>
  )
}
