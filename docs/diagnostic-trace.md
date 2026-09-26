# Diagnostic trace — rest timer, audio cues, notifications

**What it is.** A recorder for the three paths whose failures are otherwise
silent. Switch it on in **Settings → APP → DIAGNOSTICS**, do the thing that
fails, come back and copy the log out.

It is **off by default** and records nothing at all while off.

---

## Using it on the phone

1. Settings → APP → DIAGNOSTICS → **TRACE: ON**.
2. Do the thing. One scenario per capture is easiest to read — start a rest and
   leave the app open; or start a rest and lock the phone; or switch away and
   come back.
3. Settings → DIAGNOSTICS → **COPY** (or **SHARE**, or **SHOW** and select the
   text by hand — on an installed iOS PWA a clipboard write is the most likely
   of the three to be refused).
4. Paste it somewhere it can be read.

**CLEAR** before each capture keeps the log to one scenario. The log is capped at 1200
records; the oldest fall off.

---

## What the records mean

Every record carries `t` (wall clock), `p` (ms since page start), `src` (`page`
or `worker` — the worker's are relayed through the page and stamped with the
worker's own clock), and `ev`.

### The rest timer and the tick worker

| Event | Says |
|---|---|
| `rest.start` / `rest.end` | a rest was armed or torn down, with its thresholds |
| `worker.tick` | the tick worker ran. `at` is the **worker's own clock**, `lag` is how long the page took to receive it |
| `worker.beat` | the worker ran but withheld a tick — normal while the page is hidden |
| `page.beat` | the **page** ran, once a second, independent of the worker |
| `page.visibility` | the tab hid or came back |

`worker.tick`/`worker.beat` share one `seq`. **A hole in `seq` means the worker
lost time. A large `lag` means the page did.** This is the split the whole
harness exists for, and `elapsed` cannot show it: `elapsed` is computed from
`Date.now()` when the tick is emitted, so it looks correct however late it is.

### The audio cue

| Event | Says |
|---|---|
| `cue.play` | a bell was requested, and the context state at that moment |
| `audio.tone` | `playTone` entered, with `state` and `currentTime` |
| `audio.tone.resumed` | a stopped context was asked to resume. `resumed` is `ok`, `failed` or **`timeout`** — and `timeout` means `resume()` never settled, which is what iOS does outside a user gesture |
| `audio.tone.deadctx` | the context was **still not running** when the note was scheduled — the ghost bell, which will sound on the next touch |
| `cue.test` | the TEST CUE button was tapped |
| `audio.tone.armed` | the note was scheduled, at `at` on the audio clock |
| `audio.tone.ended` | **the note actually ran** |
| `audio.tone.failed` | the error the old silent `catch` swallowed |
| `audio.ctx.state` | the context changed state on its own — iOS does this |
| `audio.vibrate.absent` | no Vibration API (iOS Safari has none) |

Read it as a ladder:

- `audio.tone.resumed` carrying `timeout` → **`resume()` never settled.** iOS
  refuses to start a context outside a user gesture; nothing sounds until you
  touch the screen.
- `audio.tone.deadctx` → **the ghost bell.** The note was queued against a
  stopped clock and will play whenever the context next resumes — captured once
  at 30 seconds late, released by the tap that hit SKIP. If you hear a bell at
  the moment you touch the screen, this is what it is.
- `resumed` but no `armed` → it threw in between; see `audio.tone.failed`.
- `armed` but no `ended` → the note was scheduled against a clock that is not
  advancing. Compare `currentTime` between records: if it is frozen, the
  context is not really running whatever `state` claims.
- `ended`, and still nothing audible → **WebAudio did its job.** The loss is
  below it: silent switch, routing, volume. Not fixable in this app, but no
  longer a mystery.

### The notifications

| Event | Says |
|---|---|
| `notify.scheduleRest` | bells armed, with `permission` and whether a SW controls the page |
| `notify.arm` / `notify.fire` / `notify.cancel` | one timer. `drift` on a fire is **due time vs actual** — a suspended process shows up here |
| `notify.page.ok` | the page constructed a notification |
| `notify.page.denied` | permission was not granted — a decision, not a failure |
| `notify.page.threw` | the constructor was refused |
| `notify.reg.*` | the service-worker-registration fallback |
| `notify.readback` | how many notifications the registration is **holding** under that tag afterwards |

There is **no service-worker half**. There was one, writing to IndexedDB, and it
recorded nothing in any capture taken from a real device — a zero that means
"the sink never worked" reads exactly like a zero that means "the worker did
nothing", so it was removed rather than left to mislead. What the SW does is
therefore inferred from the page side, not observed. The remaining iOS audio
issue is tracked in `ROADMAP.md`.

---

## TEST CUE

Settings → DIAGNOSTICS → **TEST CUE** plays the real bell immediately, from your
tap. Use it instead of waiting out a rest:

- A tap is a user gesture, which is the one context where iOS reliably lets an
  AudioContext resume — so it removes the resume question entirely.
- Nothing else is making a sound, where a real bell lands within half a second
  of the system notification chime, which masks a 150 ms tone completely.

**If TEST CUE is inaudible with media volume up and the silent switch off, the
loss is below the app** — routing or volume, not code. Note that iOS has
separate ringer and media volume: pressing the volume buttons while nothing is
playing usually moves the ringer, not the channel this tone rides.

## What it cannot see

Stated plainly, because the gaps are part of reading it:

1. **Nothing runs while the process is suspended or killed.** No log can cover
   that window. What you get is the boundary on each side — and the gap itself
   is the measurement, which is why the heartbeats are there.
2. **`showNotification` resolving is not proof of display.** `notify.readback`
   is the closest available proxy; `sw.click` is the only proof.
3. **Nothing below WebAudio.** Silent switch, ringer volume and audio routing
   are invisible to the page. `audio.tone.ended` tells you the app did its part.
4. **No reason codes** for why iOS reaped a worker or froze a page.
5. **No console or network** without a Mac and Safari Web Inspector.

---

## Where it lives

| Piece | File |
|---|---|
| The sink (localStorage, synchronous) | `src/lib/trace.ts` |
| Merge + environment block | `src/lib/trace-export.ts` |
| Settings panel | `src/components/settings/DiagnosticsPanel.tsx` |
| Worker stamps and heartbeats | `src/workers/rest-timer-protocol.ts` |
| Real-browser verification | `scripts/verify-notify-hardening.js`, leg H |

The page sink is synchronous on purpose: iOS can suspend a process between an
`await` and its continuation, so an async sink loses exactly the write that
mattered. It does not use the app's own SQLite/OPFS either — that goes through a
Worker, and a frozen worker is one of the things under investigation.
