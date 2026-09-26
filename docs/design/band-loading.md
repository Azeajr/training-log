# Band-assisted and weighted exercises

Band loading applies to main lifts, cross-lift work, and assistance exercises.
Each movement owns a raw load, calibrated assistance for each band, and an
optional cap on suggested added weight. Chin-ups and pull-ups are independent.

The bands themselves are equipment. Settings › Equipment › Bands lists the bands
you own and how many of each (`settings.bands`, a `BandInventoryItem[]`), beside
the plates, and it is the ONE list of band names. A movement's profile only
measures what each of those bands assists it by. See "The band inventory" below.

A profile is **opt-in, per movement**. It does not add controls, it REPLACES
them: the weight stepper disappears and the only remaining way to change the
load is "Added lb" over a fixed raw load. So band loading stays off until the
user ticks "Use raw load and bands" in band settings, and `BandProfile.accepted`
records that a person saved it rather than a build writing it. An earlier build
seeded profiles by name — anything spelled chinup, pullup or nordic — which took
the stepper away from a chin-up deliberately set up as `plateMode: 'total'` with
a base weight of 0 to log a real belt total, and decided by spelling, so
"Chin-ups" was banded and "Chinup (neutral grip)" was not. `defaultBandProfile`
keeps the measured calibrations and prefills the dialog when it opens; it no
longer answers whether bands are in use, and the box it prefills starts unticked.

Measured effective load with each band on (lb). Raw is the movement's
UNASSISTED load, not bodyweight — the nordic figure is nothing like a scale
weight, and the same physical bands assist the two movements very differently
because a stiff band's assistance depends on how far it is stretched at the
working position.

| Movement | Raw | Orange | Green | Purple | Red |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chin-ups | 191 | 86 | 141 | 161 | 181 |
| Pull-ups | 191 | 86 | 141 | 161 | 181 |
| Nordic curls | 145 | 70 | 105 | 115 | 135 |

Which gives, as assistance (raw − measured): chin/pull 105 / 50 / 30 / 10, and
nordic 75 / 40 / 30 / 10. The chin/pull row replaces an earlier estimate of
104 / 48 / 31 / 10; `CALIBRATIONS.pulling.superseded` keeps that older shape so
`clearSeededBandProfiles` still recognises a profile the old boot seed wrote.

Assistance is calibration raw load minus measured band load. Changing raw load
keeps assistance fixed, but clamped to it — a band that assists more than the
movement weighs is a negative load. The measured stepper already clamped what it
DISPLAYED to `max(0, rawLoad - assistance)` and nothing wrote that back, so at
raw load 100 against 105 of assistance it read 0 while the profile still held
105, and one press of `+` wrote 99, moving the stored value by six. Editing a
band's measured load recalibrates assistance against the current raw load. The
model assumes an unchanged band setup and movement; assistance varies during the
movement, so effective load is an estimate.

Effective load = raw load + added weight - assistance, clamped at zero and kept
exact to hundredths. Deliberately NOT snapped to a 5 lb grid: this is a RECORD
of a load that already happened, not a prescription being proposed. The
added-weight stepper moves in 2.5s, so a 5 lb grid swallowed half of every
press — two sessions genuinely a plate apart wrote the same `sets.weight`, which
is what e1RM, records and the TM prompt all read — and it corrupted the
calibration itself, a band measured at 87 reading back as 85. Hundredths match
`calcPlates`: plate weights go to 1.25 and repeated float addition does not stay
exact.

None means zero assistance. Added weight may be combined with any band. Negative
weight entry is not used for assistance. Existing historical negative weights are
preserved rather than reinterpreted.

## The band inventory

Which bands exist, what they are called and how many can go on at once belong to
the equipment, not to any one movement — the same four physical bands serve every
movement, only their assistance differs. So `settings.bands` holds names and
counts, and each `BandProfile.bands` holds a measured assistance per inventory
band and nothing else. The per-movement dialog shows one row per inventory band,
in inventory order, with no rename, add or remove; a band added to the equipment
since that movement was saved shows as "not measured" there (assistance 0).

- **Offered on a set**: a band you own (count > 0) with assistance > 0 on that
  movement, plus whatever the set already has on, so a finished set can always be
  edited back to what it was recorded with — even up to more of a band than you
  now own.
- **Counts bound the search.** `bandStacks` is bounded subset sums over the
  calibration, each band at most as many times as the inventory holds, exactly
  as `availableBeltLoads` treats plates. A band the inventory does not list
  counts as 0.
- **Count 0 puts a band aside**: it keeps its name and every movement's
  measurement, and is offered nowhere. **Remove** is for a band gone for good:
  `removeBand` deletes it from the equipment and its measurement from every
  profile, in one transaction.
- **Rename** is one name in one place: `renameBand` rewrites the equipment and
  every profile together. Recorded sets are untouched — they say what the band
  was called when they happened — and `BandLoadControls` marks one renamed since.
- **Names** are unique case-insensitively and trimmed (`bandNameError`), since
  they key every calibration and every recorded set.

Counts write straight through, the way plate counts do; a name waits for SAVE.

Before the inventory, each profile carried its own band list. The invariant now is
that every name a profile measures is in the inventory, and
`reconcileBandInventory` establishes it wherever rows arrive — at boot and after
import. With no inventory yet, it is built from the names the profiles use, one of
each, in the order first met (nothing recorded how many anyone owned); with no
profiles either, the default is one each of the four measured bands. A backup's
inventory is restored as it was, and any name its profiles measure that it lacks
is added the same way, so no measurement is stranded. A malformed inventory is
refused before the destructive clear, like a malformed calibration.

## Stacked bands

Bands stack: any number can be on at once, and a stack assists the SUM of its
bands. Two bands on one anchor are stretched the same distance, so their pulls
add, and each band's assistance is already measured at the working position — a
stack needs no measurement of its own, and recalibrating one band re-prices every
stack that uses it. Summing was chosen over measuring each combination: four bands
make eleven stacks, and measured combinations go stale whenever a single band is
re-measured.

Stacking fills the gaps singles leave. Chin/pull singles give 86, 141, 161 and
181, a 55 lb hole between Orange and Green; Green + Purple is 111, and Orange +
Green is 36, well under the old 86 floor. A stack that assists more than the
movement weighs is not a load and is never offered (all four chin/pull bands
assist 195 against 191 raw).

The logger shows bands as toggle chips (`NONE` plus one per band), not a select:
a select holds one value, and chips are the app's toggle idiom anyway. Swapping
one band for another is two taps — off, then on — and suggestions pick the stack
most of the time. With more than one of a band, each tap puts one more on, up to
as many as you own, and the next takes them all off; the chip reads `GREEN ×2`.

Suggestions search every stack, via `bandStacks`: bounded subset sums over the
calibration, one entry per distinct total, keeping the stack with the fewest bands
(then calibration order) when two give the same total. The ranking rule is
unchanged, so a stack wins only when it is the least-assisted option within
tolerance: at 111, Green + Purple (80 assistance) beats Orange + 25 lb (105), and
at 150 Purple + Red (151, 40) beats Green + 10 lb (151, 50). The rule counts
assistance, not bands, so it can pick a three-band stack over one band plus
plates when that is less assisted.

`BandLoad.bands` is a list in calibration order, empty for unassisted, and
`assistance` is the stack's total. A name listed twice is two of that band and
assists twice; `bandsLabel` writes it as `Green ×2 + Purple`. `makeBandLoad` sorts into calibration order,
so one stack has one spelling (`Green + Purple`, never also `Purple + Green`) in
history and in the CSV's `band` column.

Suggestions enumerate available single-plate combinations from the existing
plate inventory, within the optional cap. Ranked by distance to the target ONLY
down to one plate step (2.5 lb), then by least assistance, then by least added
weight. Nearest-load-wins on its own is arithmetic rather than training advice:
a band and a loaded belt pull in opposite directions, so once the effective load
is exact rather than snapped to a grid, the closest candidate at a 190 target is
"Purple band plus 30 lb hanging off you" (exactly 190) rather than "unassisted"
(191). Nobody rigs an assistance band in order to carry more weight. A manual
override can exceed the suggestion cap or inventory; the plate readout still
reports whether it is loadable.

The next assistance set carries the previous setup; drop rounds initially copy
the preceding round (or parent set). Main/cross sets carry a setup when its raw
load still matches the profile and its effective load matches the next target;
otherwise they suggest a setup for the new prescription. A setup the user has
touched survives the prescription moving under it: that effect re-runs every
time an earlier set is edited, and re-suggesting there threw away the band
already dialled in, mid-exercise, with nothing to say it had happened.

Logged weight is effective load. Existing PR, e1RM and TM rules therefore apply
to band-assisted sets. Each set/round also snapshots the bands, raw load,
total assistance, added weight, AND the full calibration in force at the
time. Editing reps or settings does not recalculate past sets. Editing a
recorded band's selection recalculates that set from its own snapshot — the
recorded raw load against the recorded calibration — never the live profile.

Pinning only the chosen band's assistance was not enough, because a
recalibration keeps all four names while changing every number under them. A set
logged at 191 - 48 = 143 under the estimated figures, reopened after the measured
ones landed, priced `Green -> Purple` at 161 — a recorded raw load against an
assistance measured afterwards, a load from neither calibration, where both
readings agree on 160 — and `Green -> Purple -> Green` at 141, re-pricing the set
for good although its own 48 was sitting on the row.

Storage adds nullable JSON fields: lifts/exercises.bandProfile and
sets/accessorySets.bandLoad. Drop rounds carry their own snapshots inside
accessorySets.dropRounds. `BandLoad.calibration` and `BandProfile.accepted` are
both optional and absent on rows written before they existed, so old rows need no
conversion.

`BandLoad.bands` DOES convert old rows. Before stacking, a load held one
`band: string | null`. Readers learning both shapes would be one shape per reader
to get wrong, so `upgradeBandLoad` rewrites `band` into `bands` (`null` or `''` to
`[]`) wherever rows arrive, like the seed undo below: `upgradeLegacyBandLoads` at
boot, and the import transform, which validates a backup's loads as they will be
stored. `validBandLoad` accepts the current shape only. A single-band row with
no calibration snapshot is always one of these legacy rows, which is why
`BandLoadControls` only reconstructs a "(recorded)" band for single-band loads:
a stack always carries the snapshot its assistances came from, and a total cannot
be split back into its bands.

No profile is seeded. `clearSeededBandProfiles` does the opposite: it nulls any
profile byte-identical to one the old boot seed could have written — against the
current template and every superseded calibration, or a database seeded before a
measurement was corrected would be stranded with band loading forced on. It runs
on import as well as at boot, because a backup taken from a seeded database
carries those rows too, and a seed fixup has to run wherever rows arrive. A
profile the user saved carries `accepted`, which no template has, so it can never
match one and is left exactly as it stands, enabled or not.

JSON backups preserve all fields; CSV includes setup columns when band work is
present. Older app versions can read original weight/reps columns but cannot
edit or restore band metadata reliably — a build from before stacking reads
`bands` as no band at all — so retain a current JSON backup before a rollback. No schema contraction or historical-weight rewrite is required.
