# Training Log — open work

This file tracks work that remains under consideration. Shipped features are described in
`README.md` and in the code; completed reviews and verification runs are not retained here.

## Known issue: iOS rest bell after returning to the app

An installed iOS PWA can report `AudioContext.state === 'running'` while its audio
`currentTime` is frozen. In a device trace, the clock stayed at 68.41 for 320 seconds
after backgrounding; a tone scheduled at t+103.6 s sounded at t+424 s, after the context
finally cycled through `suspended` and back to `running`. The current resume guard in
`src/lib/audio-cues.ts` trusts `state`, so it misses this case.

Next investigation: sample `currentTime` on return to visible and compare it with wall
time. If the clock is stalled, determine whether resuming or rebuilding the context
restores it, then verify the bell on an installed iOS PWA. Preserve the existing
`audio.tone.deadctx` trace until the replacement behavior is verified: the queued tone
can still reach the user on a later gesture. `docs/diagnostic-trace.md` explains how to
capture and read the trace.

## Product ideas

These are candidates, not commitments. Recheck each against the current code and user
need before implementation.

- **Web Push for closed-browser reminders and rest alerts.** Page timers cannot wake a
  closed browser. This would require a backend, VAPID keys, and connectivity when a rest
  starts; assess whether that tradeoff fits an offline-first app before building it.
- **5/3/1 onboarding.** Explain training maxes, AMRAP sets and optional deload weeks
  before the setup wizard asks for numbers.
- **TM prompt after an increased top-set weight.** If a user voluntarily raises the
  prescribed AMRAP weight, offer an opt-in TM adjustment after the session.
- **Training volume.** Show per-session and weekly tonnage, set counts by category and
  training frequency.
- **5's PRO, Leader/Anchor and 7th Week programming.** Add these as separate, opt-in
  program modes, with cycle and TM rules defined before implementation.
- **Assistance rep targets.** Show progress toward a configurable push, pull and
  legs/core rep goal for the session.
- **History usability.** Indicate notes on collapsed session rows; consider text,
  date-range, status and week filters.
- **Body weight and readiness.** Optional entries that can be charted against
  performance without cluttering the default workout flow.
- **lb/kg input and display.** Keep a canonical stored unit and centralize conversion;
  plate inventory and step sizes need explicit unit handling.
- **Workout reminders.** Recurring schedule in Settings; page timers alone cannot
  guarantee delivery after the browser closes.
- **Microloading controls.** Expose smaller plates and input steps where the configured
  equipment supports them.
- **Per-set comments.** Add an optional note field to sets, including backup, CSV and
  history editing support.
