# Band loading

This is the current behavior of band-assisted lifts, cross-lift work and
assistance exercises. The implementation is in `src/lib/band-loading.ts`.

## Equipment and calibration

Settings → Equipment → Bands owns the single list of band names and quantities.
Names are trimmed and unique without regard to case. Count zero hides a band
from new sets while preserving its measurements; removing a band deletes its
measurement from every movement. Renaming one updates the inventory and
profiles together, while recorded sets retain their original name and load.

Each movement has an independent, opt-in `BandProfile`: raw unassisted load,
measured effective load for each band, and an optional cap on suggested added
weight. Saving a profile marks it accepted. A name or exercise category never
enables band controls automatically. Enabling the profile replaces the ordinary
weight stepper with band and added-weight controls.

The default measurements in pounds are:

| Movement | Raw | Orange | Green | Purple | Red |
|---|---:|---:|---:|---:|---:|
| Chin-ups and pull-ups | 191 | 86 | 141 | 161 | 181 |
| Nordic curls | 145 | 70 | 105 | 115 | 135 |

Assistance is raw minus measured load at the working position. It depends on
the movement and setup, so a profile belongs to a movement, not to a band
alone. Editing raw load preserves each band's assistance, clamped to the new
raw load; editing a measured band load recalibrates it. A band in the inventory
but absent from a movement's profile is shown as unmeasured and assists zero.

## Loads and suggestions

Effective load is `max(0, raw + added weight - total assistance)`, rounded to
hundredths. It is a record of what happened, so it is never snapped to a 5 lb
prescription grid. The added-weight input moves in 2.5 lb steps. Bands can be
combined: assistance sums across the stack, including repeated copies of one
band up to the owned quantity. A stack that assists more than raw load is not
offered for a new set.

Suggestions enumerate available stacks and plate combinations. They minimize
distance to the target to within one plate step (2.5 lb), then prefer less
assistance, then less added weight. If two stacks produce the same assistance,
the one with fewer bands wins, then calibration order. The cap limits
suggestions; a manual entry can exceed it or the inventory, and the plate
readout reports whether that setup is loadable.

The logger uses toggle chips, including NONE. An accepted profile offers owned
bands with a positive measurement, plus bands already recorded on the set so
the set can be edited back to its original setup. Assistance sets carry the
previous setup forward; drop rounds copy the preceding round. Main and cross
sets retain a setup when raw and effective loads still match the prescription.
A setup the user has edited is not replaced when an earlier set changes the
prescription.

Logged weight is the effective load, so the existing PR, e1RM and TM rules
apply. Each set and drop round snapshots its selected bands, raw load,
assistance, added weight and calibration. Editing a past set uses its snapshot,
never today's profile. `BandLoad.bands` stores names in calibration order, and
CSV writes them as a joined label such as `Green + Purple`.

## Existing data

Older single-band rows used `band: string | null`. `upgradeLegacyBandLoads`
converts them to `bands: string[]` on boot, and imports convert them before
validation. A missing calibration on an older row cannot be reconstructed from
the current profile. The app also removes profiles byte-identical to templates
written by an earlier automatic seed; an accepted profile is never removed.
`reconcileBandInventory` adds names from existing profiles when an older
database or backup has no inventory yet.

JSON backup preserves the band fields. A build from before stacked bands cannot
reliably edit or restore their metadata, so use a current JSON backup before
rolling back.
