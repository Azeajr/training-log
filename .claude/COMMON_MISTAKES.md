# Common Mistakes

**⚠️ Read at session start**

---

### 1. Schema change applied to only one DB backend

**Symptom**: Tests pass against Dexie but the column is missing in production SQLite (or vice
versa); silent NULLs or "no such column" errors at runtime only.
**Check**: `src/db/sqlite.worker.ts` `SCHEMA` block + `ALTER TABLE` calls, AND `src/db/db.ts`
Dexie schema. Vitest aliases `db/index` → `db/db.ts`, so tests never exercise the SQLite worker.
**Fix**: Update both files together. SQLite needs both a `CREATE TABLE` entry (for fresh installs)
AND an `ALTER TABLE … ADD COLUMN` (for already-deployed DBs). Dexie is schemaless for plain fields
but bump the Dexie version if the field is indexed. Mirror the column in `src/types/domain.ts`.

---

### 2. Import JSON wipes entire DB before re-inserting

**Symptom**: User imports a partial backup and loses all data in tables not present in the file.
**Check**: `src/lib/export-import.ts` — `importFromRawData` calls `.clear()` on every table
before `bulkAdd`. Wrapped in a transaction so a parse error rolls back, but a *valid* JSON that
omits a table will still wipe that table.
**Fix**: Treat import as destructive — warn users to export first. Don't add partial-merge logic
unless explicitly asked.

---

### 3. Lift IDs are positional, not stable

**Symptom**: Seeded accessories/TMs reference wrong lift after a DB reset or fresh seed.
**Check**: `src/db/seed.ts` — lifts inserted via `bulkAdd` with `AUTOINCREMENT`; IDs assigned by
insertion order (OHP=1, Deadlift=2, Bench=3, Squat=4). `scripts/migrate-history.py` hardcodes the
same order.
**Fix**: Never assume lift IDs outside of seed order. Inside `seed.ts` use the `liftId('OHP')`
helper; everywhere else look up by name.

---

### 4. `workout-store` persists to localStorage — stale state survives refresh

**Symptom**: Workout screen shows ghost session or wrong `currentSetIndex` after reload.
**Check**: `src/store/workout-store.ts` — `loadFromStorage()` rehydrates from
`localStorage['workout-store']` at module init, and `persistWorkoutToStorage()` registers a
`createEffect` that writes back on every change. Persisted shape is gated by
`STORAGE_VERSION` — mismatched version returns `{}` instead of throwing.
**Fix**: Call `clearSession()` explicitly on session complete or abandon. Bump `STORAGE_VERSION`
when changing the persisted shape. Don't assume the store resets on page load.

---

### 5. No automatic demo mode — `VITE_DEMO` is dead

**Symptom**: Setting `VITE_DEMO=true` does nothing; demo data doesn't appear on a fresh deploy.
**Check**: `src/vite-env.d.ts` declares `VITE_DEMO` but no source file reads `import.meta.env.VITE_DEMO`.
`public/demo-seed.json` is shipped as a static asset only.
**Fix**: To populate demo data, import `public/demo-seed.json` manually via Settings → IMPORT JSON
on a fresh DB. If you need automatic demo-mode seeding, you'll have to wire it up in `main.tsx`
between `dbReady` and `seedDatabase`. Remove the dead `VITE_DEMO` declaration once decided.

---

**Update when**: bug took >1h, could cause data loss, or repeated across sessions.

**Last Updated**: 2026-05-21
