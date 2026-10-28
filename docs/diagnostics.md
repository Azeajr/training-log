# Capturing a visual issue

In Settings → Diagnostics, choose **Start recording**, then use the app normally.
When the issue appears, tap **Capture issue** in the top corner. Tap **Stop
recording** to preserve the recent evidence. Return to Diagnostics and use
**Share trace** or **Copy trace**. **More options** contains the text viewer,
clear action and sound test. No screenshot is required.

Recording stays enabled across reloads until stopped. Data stays on the device
until you copy or share it. The workout JSON backup does not include this log.

## Evidence

- `layout.sample`: route, window and visual viewport dimensions/offsets/scale,
  orientation, focus, page and nested scrolling, document extent, font-loading
  state, landmark rectangles, positioning, and center-point hit tests. Reasons
  identify scroll, viewport, focus, DOM, resize and visibility changes.
- `layout.capture`: an immediate detailed measurement, including ancestor
  transforms/overflow/containment and relevant computed styles, plus a bounded
  map of visible controls and sections. Rectangles are `[x,y,width,height]` in
  CSS pixels. Structural paths use tag and sibling index, not element text.
- Existing rest, audio and notification events remain in the same timeline.
- `measureMs` on automatic samples reports the layout-measurement cost;
  `prevWriteMs` reports the previous sample's serialization and storage write.

The Capture issue control is itself a fixed overlay (landmark `capture-control`,
hidden on Settings and setup), so it can appear as an occluder in hit tests.
Repeated taps within half a second record one capture.

Manual pointer capture runs before focus changes can dismiss a keyboard.
The log excludes notes, exercise names, input values, arbitrary attributes,
full DOM/HTML, URL queries and screenshots. It cannot reconstruct the exact
screen or prove a compositor/painting glitch when browser geometry is correct.
Missing `visualViewport` is explicit `null`; a failed probe is
`layout.unavailable`, not evidence that the layout was normal.

## Cost and bounds

When off, no layout listeners, observers, sampling timers or DOM measurements
remain. When on, passive handlers only schedule work and retain one target.
Events coalesce into at most one automatic measurement every two seconds;
a ten-second heartbeat covers quiet layout changes. Automatic measurements
inspect at most 16 landmarks/dialogs. Text-only timer mutations are ignored.
Automatic samples identical to the previous one are skipped (one is still
written per minute). Detailed visible-element scans occur only on explicit
capture: visibility is tested on at most 2,000 candidates before the 60-entry
cap, with six ancestors per landmark. Limits are reported by `truncated`.

The shared trace keeps at most 1,200 events and 192 KiB of UTF-8 JSON. Older
events roll off, only as many as needed; the two newest `layout.capture`
records are spared until nothing else remains, and a record over half the
budget is replaced by an `oversized` marker. The oldest retained timestamp is
available in the export.
Event sizes are counted once; storage serializes the bounded buffer per event.
LocalStorage is synchronous, so recording still has a cost. Capture and stop
promptly. This is diagnostic evidence, not a continuous session recorder.

For a displaced workout bar, compare `session-bar` and `bottom-nav` rectangles
against `visualViewport`, document scroll, and the bar's ancestor styles.
`centerUnobstructed: false` indicates that its sampled center hit another
element or nothing; inspect `centerHit` and the rectangles before concluding
that a control was covered. Center testing does not prove the entire region
is visible or clickable.
