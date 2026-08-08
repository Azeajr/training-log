# Common Mistakes

**⚠️ Read at session start**

---

### 1. Schema change applied to only one place

**Symptom**: New column missing at runtime; "no such column" errors *only* on already-deployed
(OPFS-persisted) DBs; or the column exists but is silently absent from every backup.
**Check**: a schema change touches six places, all in one commit:
- `src/db/schema.ts` — `SCHEMA` (fresh installs) **and** a matching `ALTER TABLE … ADD COLUMN` in
  `ADDITIVE_MIGRATIONS` (deployed installs); `ALL_TABLES` for a brand-new table.
- `src/types/domain.ts` — mirror the field, optional (`?`) unless every existing row is backfilled.
- `src/db/index.ts` — wire date/bool/JSON serialization into that table's `SQLiteTable` instance.
- `src/lib/export-import.ts` — add the column to that table's `COLS` allowlist, and a new table to
  both `COLS` and `importSpec`.
- Consumers: `SETTINGS_DEFAULTS` + `loadSettings` fallbacks, `src/db/seed.ts`, any resolver helper.

**Also**: `ADDITIVE_MIGRATIONS` is append-only — never edit or reorder a shipped entry. An index that
can *fail* against existing rows (a UNIQUE index over possible duplicates) belongs there, not in
`SCHEMA`: migrations run inside a swallowed try/catch, `SCHEMA` exec does not, so a failure in
`SCHEMA` breaks every boot for that user.

---

### 2. Import JSON wipes the entire DB before re-inserting

**Symptom**: User imports a partial backup and loses all data in tables absent from the file.
**Check**: `src/lib/export-import.ts` — `importFromRawData` runs `validateImportShape`, then clears
**every** table in `importSpec` inside one transaction before restoring only the tables present in the
payload. A parse or validation error rolls back; a *valid* JSON that omits a table still wipes it.
**Fix**: Treat import as destructive — warn users to export first. Don't add partial-merge logic
unless explicitly asked. Keep validation strictly before the first `clear()`.

---

### 3. Lift IDs are positional, not stable

**Symptom**: Seeded TMs or imported history reference the wrong lift after a DB reset or fresh seed.
**Check**: `src/db/seed.ts` inserts lifts via `bulkAdd` with `AUTOINCREMENT`, so IDs follow insertion
order (OHP=1, Deadlift=2, Bench=3, Squat=4). `scripts/migrate-history.py` hardcodes the same order.
**Fix**: Never assume lift IDs outside of seed order — look up by name.
**Note**: an import payload may carry table keys that no longer exist (`public/demo-seed.json` and
older backups still contain `liftAccessories`). Unknown keys are ignored — `validateImportShape` and
`importFromRawData` both iterate `COLS`/`importSpec`, never the payload — so they neither restore nor
error.

---

### 4. `workout-store` persists to localStorage — stale state survives refresh

**Symptom**: Workout screen shows a ghost session or the wrong `currentSetIndex` after reload.
**Check**: `src/store/workout-store.ts` — `loadFromStorage()` rehydrates from
`localStorage['workout-store']` at module init; `setupWorkoutPersistence()` registers a `createEffect`
that writes back on every change. The blob is gated by `STORAGE_VERSION` (mismatch → `{}`, never a
throw), and each key must be in `PERSISTED_KEYS` *and* pass its `PERSISTED_VALIDATORS` shape check.
**Fix**: Call `clearSession()` on session complete or abandon. Bump `STORAGE_VERSION` when changing
the persisted shape, and add a validator for any new key. Don't assume the store resets on page load.

---

### 5. The persisted store can point at a session the DB disagrees with

**Symptom**: A completed workout gets wiped by an EXIT/abandon, or the app resumes into a session
row that no longer exists.
**Check**: `handleComplete` updates status in the DB only, so `workout.activeSession` still reads
`'pending'` after completion. If the app is killed while a post-complete modal is open, the persisted
store resurrects that stale session.
**Fix**: Resume only through `reconcileActiveSession` and discard only through
`discardPendingSession` (`src/lib/session.ts`) — the latter re-reads status *inside* the transaction
so there is no await gap between the check and the deletes. Never trust the store's copy of status.

---

### 6. `<For>` over a rebuilt array remounts every row

**Symptom**: Page scroll jumps to the active set on an unrelated action; hold-to-repeat on a Stepper
dies mid-press; a row's `ref` callback re-fires for no reason.
**Check**: Solid's `<For>` keys by object reference. Recomputing a list into fresh objects — as
`rebuildAllSets` does — remounts every row even when the values are identical.
**Fix**: Use `<Index>` for positional lists (the set list, the stepper rows). `<Index>` updates rows
in place, so refs and effects fire only on a genuine value transition. Reserve `<For>` for lists whose
identity is stable and whose order actually moves.

---

### 7. Demo data is a static asset, not an auto-seed

**Symptom**: Expecting demo content on a fresh deploy and finding the DB empty.
**Check**: `public/demo-seed.json` is bundled but nothing reads it; the `VITE_DEMO` declaration was
removed.
**Fix**: Import it manually via Settings → IMPORT JSON on a fresh DB. If automatic demo seeding is
ever needed, wire it in `main.tsx` between `dbReady` and `seedDatabase` — don't reintroduce the env var.

---

### 8. Tests cannot catch a missing migration

**Symptom**: Green suite, then "no such column" in production for existing users only.
**Check**: The vitest client builds every DB from a fresh `SCHEMA`, so the `ADDITIVE_MIGRATIONS` path
is never the one under test.
**Fix**: After any schema change, run the app against a database that already holds data
(`pnpm dev` in a browser profile with existing OPFS state, or `pnpm debug:browser:nowipe`) and confirm
both the absent-column error is gone and existing rows resolve to the intended default.

---

### 9. iOS Safari back-swipe cannot be disabled from web code

**Symptom**: Swiping left-to-right in the PWA navigates back to the previous route.
**Check**: A native WebKit gesture, not triggered by app code. `overscroll-behavior-x: none` does not
suppress it on iOS.
**Fix**: None available. Apple exposes no disable API. Do not spend time on CSS, touch handlers, or
history manipulation to block it.

---

### 10. `<button>` silently drops inherited `text-transform`

**Symptom**: A label that rendered uppercase as a `<span>` comes back mixed-case after being
converted to a real `<button>` — even though the parent still has Tailwind's `uppercase`.
**Check**: Tailwind's preflight (modern-normalize) sets `button { text-transform: none }`, which
beats inheritance from an ancestor. `uppercase` on the parent row does nothing for a `<button>`
child.
**Fix**: Put `uppercase` explicitly on the button. Precedent: `AccessoryLog` exercise-name button.
Cheap live check: `getComputedStyle(el).textTransform` — class presence on the parent proves
nothing.

---

**Update when**: a bug took >1h, could cause data loss, or recurred across sessions.

**Last Updated**: 2026-08-08
