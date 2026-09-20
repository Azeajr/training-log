# Band-assisted and weighted exercises

Band loading applies to main lifts, cross-lift work, and assistance exercises.
Each movement owns a raw load, calibrated assistance for each band, and an
optional cap on suggested added weight. Chin-ups and pull-ups are independent.

Initial measurements (lb):

| Movement | Raw | Orange | Green | Purple | Red |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chin-ups | 191 | 87 | 143 | 160 | 181 |
| Pull-ups | 191 | 87 | 143 | 160 | 181 |
| Nordic curls | 145 | 70 | 105 | 115 | 135 |

Assistance is calibration raw load minus measured band load. Changing raw load
keeps assistance fixed. Editing a band's measured load recalibrates assistance
against the current raw load. The model assumes an unchanged band setup and
movement; assistance varies during the movement, so effective load is an estimate.

Effective load = raw load + added weight - assistance, rounded once to the
nearest 5 lb (halfway rounds up). None means zero assistance. Added weight may
be combined with any band. Negative weight entry is not used for assistance.
Existing historical negative weights are preserved rather than reinterpreted.

Suggestions enumerate available single-plate combinations from the existing
plate inventory, within the optional cap. Choose the closest rounded effective
load to the prescribed target, allowing a heavier result. Ties favor less added
weight, then None, then calibration order. A manual override can exceed the
suggestion cap or inventory; the plate readout still reports whether it is loadable.

The next assistance set carries the previous setup; drop rounds initially copy
the preceding round (or parent set). Main/cross sets carry a setup when it matches
the next target; otherwise they suggest a setup for the new prescription.

Logged weight is effective load. Existing PR, e1RM and TM rules therefore apply
to band-assisted sets. Each set/round also snapshots the band, raw load,
assistance and added weight. Editing reps or settings does not recalculate past
sets. Editing a recorded band's selection explicitly recalculates that set using
its recorded raw load and the chosen band's current calibration.

Storage adds nullable JSON fields: lifts/exercises.bandProfile and
sets/accessorySets.bandLoad. Drop rounds carry their own snapshots inside
accessorySets.dropRounds. Old rows need no conversion. Initial profiles are
seeded only where missing; explicit disabled profiles and user edits survive.
JSON backups preserve all fields; CSV includes setup columns when band work is
present. Older app versions can read original weight/reps columns but cannot
edit or restore band metadata reliably; retain a current JSON backup before a
rollback. No schema contraction or historical-weight rewrite is required.
