# 2026-09-17 — process keepalive, and the audio clock that lies

Two captures from an installed iOS PWA (iPhone, iOS 18.7, Safari 26.6.1), taken
with the diagnostic trace (`docs/diagnostic-trace.md`). One control, one with
KEEP ALIVE on. The raw exports are not kept; everything they settled is below.

> **KEEP ALIVE no longer exists in the app.** It was removed the same day, not
> because it failed — it passed, and the numbers are below — but because nothing
> consumed the aliveness it bought, and it cost battery and an audio session for
> the length of every rest. This record is kept so that rebuilding it is a known
> quantity rather than a fresh investigation. Claim 2 is what it achieved;
> claim 3 is what was never demonstrated and would have to be, first.

## Claim 1 — an app switch suspends the page process

**Established earlier the same day**, and the reason KEEP ALIVE exists. With the
app backgrounded, `page.beat` went dark for the whole window while the monotonic
clock advanced normally — the device was awake, the page was not. The rest bell
came due with nothing running to fire it and landed on return.

A screen **lock** is different again: there the monotonic clock freezes too
(316 s of wall time, 23 s of clock), so a pending `setTimeout` is not dropped,
it is *postponed by the length of the sleep*.

## Claim 2 — an inaudible loop holds the process alive. **PASS**

| | control | KEEP ALIVE on |
|---|---|---|
| loop | never played | `keepalive.playing` |
| time backgrounded | 31.9 s, then 293.2 s | 103.4 s, then 175.1 s |
| `page.beat` gaps > 3 s | 31.9 s dark, 293.2 s dark | **none**, max interval 2.9 s |
| worker | — | 312 emissions, **0 sequence gaps**, max lag 60 ms |

The page and its worker ran continuously through roughly three minutes
backgrounded. `navigator.audioSession.type = 'ambient'` was accepted, so the
loop asks to mix with other audio rather than interrupt it.

**A first attempt failed entirely** and is worth recording: every `play()`
returned `NotSupportedError` with a media `error` event, because the source was
a `blob:` URL. iOS requires a media resource that answers byte-range requests.
It is `public/silence.wav` now — a real file, precached with the rest of the app.

## Claim 3 — does the bell then arrive on time? **NOT TESTED**

The run that proved the process survives could not show this, for two reasons
that belong to the app rather than the platform:

- the tick worker is **paused while the page is hidden**
  (`RestTimer.tsx:128`), so `elapsed` never advances and the cue cannot fire;
- that run had REST NOTIFICATIONS **off** (`notify: false`), so nothing was
  armed to fire at all.

The end-to-end test is therefore still owed: **keepalive on, notifications on**,
backgrounded past the 90 s bell, then read `notify.fire`'s `drift`. Also
untested: whether the keepalive survives a screen **lock** — both windows in the
passing run were app switches.

Worth weighing at the same time: the worker pause exists because a hidden page
gets no CPU. With the keepalive on it does, so the pause now discards the one
thing that works.

## Claim 4 — `AudioContext.state` lies after a background. **FAIL, opened as F109**

In the control capture the audio clock **froze at `currentTime` 68.41 for 320
seconds** while `state` reported `running` throughout. A tone armed at t+103.6 s
did not sound until t+424 s, when the context finally cycled
`suspended` → `running`.

F108 made the resume conditional on `ctx.state !== 'running'`, so this case
walks straight past it. It is also the likeliest explanation of the original
report — no bell with the app open and visible — because that state follows a
background.

**The state is not the signal. Clock advancement is.** See the F109 row in
`docs/deep-code-review-fixes.md`.

## Also recorded

- **iOS has no Vibration API** (`vibrate: false`), so the haptic half of every
  cue has never fired on this device and never will.
- **The service-worker half of the trace recorded nothing** in any capture
  (`sw: 0`), including after a cold launch with its flag already set. Suspected:
  IndexedDB inside a service worker on iOS never settling its `open()`. Until
  that is resolved, `sw: 0` in an export means "the sink is unproven", not "the
  worker did nothing".
