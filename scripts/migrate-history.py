#!/usr/bin/env python3
"""
Migrate BBB history from a generic workout-app CSV into training-log import JSON.

Usage:
  python3 scripts/migrate-history.py ~/Downloads/MyHistory.csv > migration.json

  # Override detected TMs (recommended — verify in your old app first):
  python3 scripts/migrate-history.py ~/Downloads/MyHistory.csv \
      --ohp=90 --dl=180 --bench=102.5 --squat=155 > migration.json

Then import migration.json via Settings → IMPORT JSON in the app.
"""

import csv
import json
import sys
import argparse
from datetime import datetime
from collections import defaultdict

# ── Lift config (must match seed.ts order so IDs are 1–4) ──────────────────
LIFTS = [
    { "id": 1, "name": "OHP",      "order": 1, "progressionIncrement": 5,  "baseWeight": 95,  "liftType": "upper" },
    { "id": 2, "name": "Deadlift", "order": 2, "progressionIncrement": 10, "baseWeight": 135, "liftType": "lower" },
    { "id": 3, "name": "Bench",    "order": 3, "progressionIncrement": 5,  "baseWeight": 95,  "liftType": "upper" },
    { "id": 4, "name": "Squat",    "order": 4, "progressionIncrement": 10, "baseWeight": 135, "liftType": "lower" },
]

EXERCISES = [
    { "id":  1, "name": "Chinups",                      "type": "reps" },
    { "id":  2, "name": "Lat Pulldowns",                "type": "reps" },
    { "id":  3, "name": "Curls",                        "type": "reps" },
    { "id":  4, "name": "Glute Ham Raise",              "type": "reps" },
    { "id":  5, "name": "Bulgarian Split Squat",        "type": "reps" },
    { "id":  6, "name": "Nordic Curls",                 "type": "reps" },
    { "id":  7, "name": "Hip Thrust",                   "type": "reps" },
    { "id":  8, "name": "Barbell Row",                  "type": "reps" },
    { "id":  9, "name": "Dumbbell Row",                 "type": "reps" },
    { "id": 10, "name": "T Bar Row",                    "type": "reps" },
    { "id": 11, "name": "Ab Wheel",                     "type": "reps" },
    { "id": 12, "name": "Single Leg Romanian Deadlift", "type": "reps" },
    { "id": 13, "name": "Romanian Deadlift",            "type": "reps" },
    { "id": 14, "name": "Back Extension",               "type": "reps" },
    { "id": 15, "name": "Good Mornings",                "type": "reps" },
    { "id": 16, "name": "Leg Press",                    "type": "reps" },
    { "id": 17, "name": "Loaded Carry",                 "type": "distance" },
    { "id": 18, "name": "Plank",                        "type": "timed" },
]

LIFT_ACCESSORIES = [
    { "id":  1, "liftId": 1, "exerciseId":  1, "order": 1 },
    { "id":  2, "liftId": 1, "exerciseId":  2, "order": 2 },
    { "id":  3, "liftId": 1, "exerciseId":  3, "order": 3 },
    { "id":  4, "liftId": 2, "exerciseId":  4, "order": 1 },
    { "id":  5, "liftId": 2, "exerciseId":  5, "order": 2 },
    { "id":  6, "liftId": 2, "exerciseId":  6, "order": 3 },
    { "id":  7, "liftId": 2, "exerciseId":  7, "order": 4 },
    { "id":  8, "liftId": 3, "exerciseId":  8, "order": 1 },
    { "id":  9, "liftId": 3, "exerciseId":  9, "order": 2 },
    { "id": 10, "liftId": 3, "exerciseId": 10, "order": 3 },
    { "id": 11, "liftId": 4, "exerciseId": 11, "order": 1 },
    { "id": 12, "liftId": 4, "exerciseId": 12, "order": 2 },
    { "id": 13, "liftId": 4, "exerciseId": 13, "order": 3 },
    { "id": 14, "liftId": 4, "exerciseId": 14, "order": 4 },
    { "id": 15, "liftId": 4, "exerciseId": 15, "order": 5 },
    { "id": 16, "liftId": 4, "exerciseId": 16, "order": 6 },
]

SETTINGS = [{ "id": 1, "restTimer1": 90, "restTimer2": 180, "restTimerFail": 300 }]

# Week % tables (from BBB.workout analysis)
WEEK_PCT = {
    1: { "main": [0.65, 0.75, 0.85], "fsl": 0.65 },
    2: { "main": [0.70, 0.80, 0.90], "fsl": 0.70 },
    3: { "main": [0.75, 0.85, 0.95], "fsl": 0.75 },
    4: { "main": [0.40, 0.50, 0.60], "fsl": 0.40 },
}

LIFT_NAME_TO_ID = {
    "Overhead Press": 1,
    "Deadlift":       2,
    "Bench Press":    3,
    "Squat":          4,
}

def round5(x):
    return round(x / 5) * 5

def iso(dt):
    return dt.isoformat()

def determine_week(main_sets, fsl_sets):
    """
    Best-fit week detection: for each candidate week, estimate TM from the AMRAP
    set, then compute how far off all other set weights are from expected.
    Uses the rep count for set 2 as a tiebreaker when weights are ambiguous.
    """
    s1 = next((s for s in main_sets if s["order"] == 1), None)
    s2 = next((s for s in main_sets if s["order"] == 2), None)
    s3 = next((s for s in main_sets if s["order"] == 3), None)
    fsl = next((s for s in fsl_sets  if s["weight"]), None)

    if not s3 or not s3["weight"]:
        # No AMRAP data: fall back to rep pattern
        r1 = s1["reps"] if s1 else None
        r2 = s2["reps"] if s2 else None
        if r1 and r1 <= 3:
            return 2
        if r2 and r2 <= 3:
            return 3
        return 1

    amrap_w = s3["weight"]

    # All main sets at identical weight → deload
    all_weights = [s["weight"] for s in [s1, s2, s3] if s and s["weight"]]
    if len(set(all_weights)) == 1 and len(all_weights) == 3:
        return 4

    best_week  = 1
    best_error = float("inf")

    for w in [1, 2, 3, 4]:
        pcts = WEEK_PCT[w]["main"]
        tm   = amrap_w / pcts[2]

        error = 0
        if s1 and s1["weight"]:
            error += abs(s1["weight"] - round5(tm * pcts[0]))
        if s2 and s2["weight"]:
            error += abs(s2["weight"] - round5(tm * pcts[1]))
        if fsl:
            error += abs(fsl["weight"] - round5(tm * WEEK_PCT[w]["fsl"]))

        if error < best_error:
            best_error = error
            best_week  = w
        elif error == best_error:
            # Tiebreak using both set-1 and set-2 rep counts vs prescribed
            prescribed_s1 = {1: 5, 2: 3, 3: 5, 4: 5}
            prescribed_s2 = {1: 5, 2: 3, 3: 3, 4: 5}
            r1 = s1["reps"] if s1 else None
            r2 = s2["reps"] if s2 else None
            cur_dev = abs((r1 or 5) - prescribed_s1[best_week]) + \
                      abs((r2 or 5) - prescribed_s2[best_week])
            new_dev = abs((r1 or 5) - prescribed_s1[w]) + \
                      abs((r2 or 5) - prescribed_s2[w])
            if new_dev < cur_dev:
                best_week = w

    return best_week

def calc_tm(week, main_sets, fsl_sets):
    """Calculate TM from AMRAP weight (primary) or FSL (fallback)."""
    s3 = next((s for s in main_sets if s["order"] == 3 and s["weight"]), None)
    if s3:
        return round5(s3["weight"] / WEEK_PCT[week]["main"][2])
    fsl = next((s for s in fsl_sets if s["weight"]), None)
    if fsl:
        return round5(fsl["weight"] / WEEK_PCT[week]["fsl"])
    return None

# ── Parse CSV ──────────────────────────────────────────────────────────────
def parse_csv(path):
    raw = defaultdict(list)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            workout = (row.get("Workout Name") or "").strip().strip('"')
            if workout not in ("BBB", "BBB(base)"):
                continue
            exercise = (row.get("Exercise Name") or "").strip()
            lift_id  = LIFT_NAME_TO_ID.get(exercise)
            if not lift_id:
                continue

            date_str = (row.get("Date") or "").strip().strip('"')
            try:
                date = datetime.strptime(date_str, "%a, %b %d, %Y")
            except ValueError:
                continue

            weight_s = (row.get("Weight (LB)") or "").strip()
            reps_s   = (row.get("Reps")        or "").strip()
            order_s  = (row.get("Set Order")   or "").strip()

            raw[(date, lift_id)].append({
                "order":  int(order_s)    if order_s  else None,
                "weight": float(weight_s) if weight_s else None,
                "reps":   int(reps_s)     if reps_s   else None,
            })

    sessions = {}
    for (date, lift_id), rows in sorted(raw.items()):
        # Split at the second occurrence of set_order == 1
        main_sets, fsl_sets = [], []
        seen_first = False
        in_fsl     = False
        for r in rows:
            if r["order"] == 1 and seen_first:
                in_fsl = True
            if r["order"] == 1:
                seen_first = True
            (fsl_sets if in_fsl else main_sets).append(r)

        sessions[(date, lift_id)] = {
            "date":      date,
            "lift_id":   lift_id,
            "main_sets": main_sets,
            "fsl_sets":  fsl_sets,
        }
    return sessions

# ── Assign cycles ──────────────────────────────────────────────────────────
def assign_cycles(sessions):
    items = []
    for s in sessions.values():
        week = determine_week(s["main_sets"], s["fsl_sets"])
        tm   = calc_tm(week, s["main_sets"], s["fsl_sets"])
        items.append({ **s, "week": week, "tm": tm })

    items.sort(key=lambda x: (x["date"], x["lift_id"]))

    cycles    = []
    current   = []
    last_week = {}     # lift_id → last week seen

    for item in items:
        lid  = item["lift_id"]
        week = item["week"]
        # New cycle: same lift reappears at week 1 after being at week ≥ 3
        if last_week.get(lid, 0) >= 3 and week == 1:
            if current:
                cycles.append(current)
            current   = []
            last_week = {}
        current.append(item)
        last_week[lid] = week

    if current:
        cycles.append(current)
    return cycles

# ── Build export JSON ──────────────────────────────────────────────────────
def build_json(csv_path, tm_overrides):
    raw_sessions = parse_csv(csv_path)
    cycle_groups = assign_cycles(raw_sessions)

    training_maxes = []
    cycles_out     = []
    sessions_out   = []
    sets_out       = []

    tm_id      = 1
    cycle_id   = 1
    session_id = 1
    set_id     = 1

    latest_tm  = {}   # lift_id → most recent calculated weight
    max_tm     = {}   # lift_id → highest TM seen (guards against deload false-positives)

    for group in cycle_groups:
        if not group:
            continue

        is_last_group = (group is cycle_groups[-1])
        cycles_out.append({
            "id":        cycle_id,
            "number":    cycle_id,
            "startDate": iso(group[0]["date"]),
            "endDate":   None if is_last_group else iso(group[-1]["date"]),
        })

        for item in group:
            lift_id = item["lift_id"]
            week    = item["week"]
            tm      = item["tm"]

            if tm and week != 4:   # skip deload — back-calculated TMs are unreliable
                training_maxes.append({
                    "id": tm_id, "liftId": lift_id,
                    "weight": tm, "setAt": iso(item["date"]),
                })
                latest_tm[lift_id] = tm
                max_tm[lift_id]    = max(max_tm.get(lift_id, 0), tm)
                tm_id += 1

            session_sets = []
            n_main = len(item["main_sets"])

            for i, s in enumerate(item["main_sets"]):
                if not s["weight"]:
                    continue
                session_sets.append({
                    "id": set_id, "sessionId": session_id,
                    "type": "main", "setNumber": i + 1,
                    "weight": s["weight"],
                    "reps":   s["reps"] if s["reps"] else 0,
                    "isAmrap": (i == n_main - 1),
                })
                set_id += 1

            for i, s in enumerate(item["fsl_sets"]):
                if not s["weight"]:
                    continue
                session_sets.append({
                    "id": set_id, "sessionId": session_id,
                    "type": "fsl", "setNumber": i + 1,
                    "weight": s["weight"],
                    "reps":   s["reps"] if s["reps"] else 0,
                    "isAmrap": False,
                })
                set_id += 1

            sessions_out.append({
                "id": session_id, "cycleId": cycle_id,
                "liftId": lift_id, "week": week,
                "date": iso(item["date"]),
                "notes": None, "status": "completed",
            })
            sets_out.extend(session_sets)
            session_id += 1

        cycle_id += 1

    # Append a "current TM" entry per lift using max TM or override
    lift_name_to_id = {"ohp": 1, "dl": 2, "deadlift": 2, "bench": 3, "squat": 4}
    now_iso = iso(datetime.now())

    # Lifts with an explicit override
    for key, weight in tm_overrides.items():
        lid = lift_name_to_id.get(key.lower())
        if lid:
            training_maxes.append({
                "id": tm_id, "liftId": lid,
                "weight": weight, "setAt": now_iso,
            })
            latest_tm[lid] = weight
            max_tm[lid]    = weight
            tm_id += 1

    # Lifts without an override: pin to max seen TM if it differs from latest
    for lid, peak in max_tm.items():
        if lid in {lift_name_to_id.get(k.lower()) for k in tm_overrides}:
            continue
        if latest_tm.get(lid) != peak:
            training_maxes.append({
                "id": tm_id, "liftId": lid,
                "weight": peak, "setAt": now_iso,
            })
            latest_tm[lid] = peak
            tm_id += 1

    # ── Summary ────────────────────────────────────────────────────────────
    lift_names = {1: "OHP", 2: "Deadlift", 3: "Bench", 4: "Squat"}
    w = sys.stderr.write
    w("── Migration summary ──────────────────────────────\n")
    w(f"  Cycles:   {len(cycles_out)}\n")
    w(f"  Sessions: {len(sessions_out)}\n")
    w(f"  Sets:     {len(sets_out)}\n")
    w("\n  Training Maxes that will be set:\n")
    # Use the max TM seen (not the most recent, which may be a deload-based underestimate)
    reported_tm = {lid: max_tm.get(lid, latest_tm.get(lid)) for lid in latest_tm}
    # Apply overrides on top
    for k, val in tm_overrides.items():
        lid = lift_name_to_id.get(k.lower())
        if lid:
            reported_tm[lid] = val

    for lid in sorted(reported_tm):
        src = "  [--override]" if lid in {lift_name_to_id.get(k) for k in tm_overrides} else ""
        w(f"    {lift_names[lid]:8s}: {reported_tm[lid]} lb{src}\n")
    w("\n  ⚠  Verify TMs match your current program before importing.\n")
    w("     To override:  --ohp=N --dl=N --bench=N --squat=N\n")
    w("────────────────────────────────────────────────────\n")

    return {
        "exportedAt": now_iso,
        "version":    1,
        "lifts":                  LIFTS,
        "trainingMaxes":          training_maxes,
        "accessoryTrainingMaxes": [],
        "cycles":                 cycles_out,
        "sessions":               sessions_out,
        "sets":                   sets_out,
        "exercises":              EXERCISES,
        "liftAccessories":        LIFT_ACCESSORIES,
        "accessorySets":          [],
        "settings":               SETTINGS,
    }

# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate BBB CSV history to training-log JSON")
    parser.add_argument("csv", help="Path to exported CSV file")
    parser.add_argument("--ohp",   type=float, help="Override OHP training max (lb)")
    parser.add_argument("--dl",    type=float, help="Override Deadlift training max (lb)")
    parser.add_argument("--bench", type=float, help="Override Bench training max (lb)")
    parser.add_argument("--squat", type=float, help="Override Squat training max (lb)")
    args = parser.parse_args()

    overrides = {}
    for k in ("ohp", "dl", "bench", "squat"):
        v = getattr(args, k)
        if v is not None:
            overrides[k] = v

    data = build_json(args.csv, overrides)
    print(json.dumps(data, indent=2))
