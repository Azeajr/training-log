# Common Mistakes

**⚠️ Read at session start**

---

### 1. Schema change applied to only one place

**Symptom**: New column missing at runtime; "no such column" errors only on already-deployed DBs;
or tests pass against in-memory but prod (OPFS-persisted) DBs error.
**Check**: `src/db/schema.ts` — `SCHEMA` (used on fresh installs), `ADDITIVE_MIGRATIONS`
(applied after `CREATE TABLE IF NOT EXISTS` for already-deployed DBs), and `ALL_TABLES`
(used by `__resetForTest`). Both `src/db/sqlite.worker.ts` (prod) and
`src/db/sqlite-test-client.ts` (vitest) import from here.
**Fix**: Add the column to `SCHEMA` AND push a matching `ALTER TABLE … ADD COLUMN` into
`ADDITIVE_MIGRATIONS`. Update `ALL_TABLES` if introducing a brand-new table. Mirror the
column in `src/types/domain.ts`. Wire any non-trivial serialization (dates / booleans /
JSON) into the matching `SQLiteTable` instance in `src/db/index.ts`.

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
`localStorage['workout-store']` at module init, and `setupWorkoutPersistence()` registers a
`createEffect` that writes back on every change. Persisted shape is gated by
`STORAGE_VERSION` — mismatched version returns `{}` instead of throwing.
**Fix**: Call `clearSession()` explicitly on session complete or abandon. Bump `STORAGE_VERSION`
when changing the persisted shape. Don't assume the store resets on page load.

---

### 5. Demo data is shipped as a static asset, not auto-seeded

**Symptom**: Expecting demo content on a fresh deploy and finding the DB empty.
**Check**: `public/demo-seed.json` is bundled but no code reads it; the `VITE_DEMO` declaration
was removed.
**Fix**: To populate demo data, import `public/demo-seed.json` manually via Settings →
IMPORT JSON on a fresh DB. If automatic demo-mode seeding is needed, wire it up in `main.tsx`
between `dbReady` and `seedDatabase` — don't reintroduce the dead env var.

---

**Update when**: bug took >1h, could cause data loss, or repeated across sessions.

**Last Updated**: 2026-05-21
