# Validation on PixInsight

The suite under `tests/` runs on Node and covers everything that does not need the
PixInsight runtime: cadence, geometry, the ffmpeg command line, overlays, i18n,
packaging. It cannot cover the runtime itself — image I/O, the graphics layer, the
process instances — and that is where several defects have hidden, because the API
does not always behave the way its naming suggests.

This is what is checked against a real PixInsight, and how to replay it.

## The two gates

**Gate 1 — headless render.** `SESSIONCINEMA_AUTORUN=<config.json>` runs the engine
with no dialog and writes a result file. It is the entry point that makes an
end-to-end check possible.

```
PixInsight -n --automation-mode --force-exit -r=<script.js>
```

with `SESSIONCINEMA_AUTORUN` set in the environment. The config is the same JSON a
process icon carries, plus `files`, `outputDir` and an optional `marker`. The
result file carries `ok`, `rendered`, `skipped`, `videoPath`, `scriptPath`,
`aborted`, `warnings`, `errorKey`, `error`, `perf`, `disk` and `msPerFrame` — enough
to assert on without opening a single frame.

**Gate 2 — API probes.** Small scripts that call one API and write down what it
actually did. They exist because reasoning about these was wrong more than once.

## What the probes established

Recorded here because the source alone does not say it, and because each of these
was a real defect before it was measured.

| API | Behaviour |
|---|---|
| `Graphics.rotateTransformation` | Rotates **clockwise** on screen and **ignores negative angles**. To place an axis along `atan2(uy,ux)`, pass `(2π − atan2) % 2π`. |
| `translate; rotate(a1); scale(sx,sy); rotate(a2)` | Composes to `Rp(a1)·diag(sx,sy)·Rp(a2)`, so **any** 2×2 is expressible through its SVD — sheared, anisotropic, mirrored (negative `sy`). Both angles must be normalised into `[0, 2π)`. |
| `Graphics.drawBitmapRect( p, bmp, r )` | Places the **top-left of `r`** on `p` in the transformed frame. |
| `ExternalProcess` | `P.stdout` carries the text; **`P.stderr` always reads empty** — the two are merged upstream. A missing program does not throw: `start` succeeds and `waitForStarted` returns false. |
| `View.setPropertyValue` | An astrometric solution survives `saveAs` only through the **four-argument** form, `( id, value, 0, Storable|Permanent )`. The three-argument form takes the flags for a type and throws. |
| `Vector` | `new Vector( 274.7, -13.8 )` throws. Use `new Vector( 2 )` then `v.at( 0, x )`. |
| `estimateSigma` | Returns 0 on a strictly flat frame, a fully clipped one, and a flat frame with a single hot pixel. **Not** on a near-empty narrowband frame, which measures cleanly. |
| `IntegerResample` before `render()` | **Slower**, not faster: 48 ms → 195 ms on a 5100×5100 RGB view to 1920×1080. It rewrites the whole image to save a blit Qt does in tens of milliseconds. |
| `logicalPixelsToPhysical`, `setScaledFixedSize` | Exist on `Dialog` and on `Control`; identity at scale factor 1. |

## Fixtures

Capture data is not required and should not be depended on — it disappears. The
fixtures are generated:

- **mono subs** — small XISF frames with `DATE-OBS`, `EXPTIME` and `FILTER`,
  cycling through Ha / OIII / SII, with simulated dither. Fixed seed.
- **CFA subs** — the same, mono with an RGGB mosaic baked in and a `BAYERPAT`
  keyword, stars given colours so a correct debayer is measurable.
- **a plate-solved image** — the astrometric solution written into the view
  properties (see the table above), so the whole Zoom Odyssey path is reachable.
- **large subs** — 3000 px, for anything about cost.

Keep them, and the probes, in a staging directory outside the repository.

## What is still unverified

Everything platform-specific off Windows. CI runs on Linux but executes only the
pure functions under Node: it exercises no platform-specific line and opens no
socket. The macOS and Linux install roots, the `chmod` calls and the POSIX encode
script have never been run. See the corresponding issue before claiming those
platforms in a release note.
