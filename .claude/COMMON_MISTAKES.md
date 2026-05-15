# Common Mistakes

**⚠️ Read at session start**

---

### 1. Schema change without Dexie version bump

**Symptom**: New column silently missing at runtime; no error thrown.
**Check**: `src/db/db.ts` — only one `this.version(1).stores(...)` block.
**Fix**: Add `this.version(N+1).stores({...}).upgrade(tx => ...)` — never edit the existing version block. Dexie only runs migrations for new version numbers.

---

### 2. Import JSON wipes entire DB before re-inserting

**Symptom**: User imports a partial backup and loses all data not in that file.
**Check**: `src/lib/exportImport.ts` — `importFromRawData` calls `.clear()` on every table before `bulkAdd`.
**Fix**: Warn users that import is destructive. Export first, then import. Don't add partial-merge logic unless explicitly asked.

---

### 3. Lift IDs are positional, not stable

**Symptom**: Seeded accessories/TMs reference wrong lift after a DB reset or fresh seed.
**Check**: `src/db/seed.ts` — lifts inserted via `bulkAdd` with `++id`; IDs assigned by insertion order (OHP=1, Deadlift=2, Bench=3, Squat=4). `migrate-history.py` hardcodes the same order.
**Fix**: Never assume lift IDs outside of seed order. Use `liftId('OHP')` helper in seed; look up by name elsewhere.

---

### 4. `workoutStore` persists to localStorage — stale state survives refresh

**Symptom**: Workout screen shows ghost session or wrong `currentSetIndex` after reload.
**Check**: `src/store/workoutStore.ts` — store uses `persist` middleware (zustand). Active session state written to localStorage.
**Fix**: Call `clearSession()` explicitly on session complete or abandon. Don't assume store resets on page load.

---

### 5. Demo mode only seeds if DB is empty

**Symptom**: `VITE_DEMO=true` build shows no demo data after a real user has set up the app.
**Check**: `src/App.tsx` — `import.meta.env.VITE_DEMO` check gates on `trainingMaxes.count() === 0`.
**Fix**: Demo mode is for fresh deployments only. To reset demo state: clear IndexedDB manually or use Settings → Import with `demo-seed.json`.

---

**Update when**: bug took >1h, could cause data loss, or repeated across sessions.

**Last Updated**: 2026-05-12
