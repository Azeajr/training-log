# Band-assisted and weighted exercises

Band loading applies to main lifts, cross-lift work, and assistance exercises.
Each movement owns a raw load, calibrated assistance for each band, and an
optional cap on suggested added weight. Chin-ups and pull-ups are independent.

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
to band-assisted sets. Each set/round also snapshots the band, raw load,
assistance, added weight, AND the full four-band calibration in force at the
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
edit or restore band metadata reliably; retain a current JSON backup before a
rollback. No schema contraction or historical-weight rewrite is required.
