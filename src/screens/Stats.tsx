import RecordsPanel from '../components/stats/RecordsPanel'

// STATS — records and training-max progression. The panel itself lives in
// components/stats so History can show the same numbers for the lift already on
// screen (see History's RECORDS mode and its by-lift header) instead of sending
// the user to a second destination that answers the same question. This route
// is kept as the stable URL for the whole-roster view.
export default function Stats() {
  return (
    <div class="p-4 md:p-8 font-mono max-w-3xl mx-auto">
      <RecordsPanel />
    </div>
  )
}
