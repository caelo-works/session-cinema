# Reveal alignment

Both styles can end on your finished image. To reveal it, the script needs to
know where that image sits on the frame behind it — the plate-solved image
(Zoom Odyssey) or the growing stack (Progressive stack). That is a *placement*:
a centre, a scale, a rotation and a mirror flag.

The **Align…** button on either tab opens a popup showing the two bitmaps: the
background, and your reveal on top of it, draggable, with an opacity slider to
check the fit. Since 1.1.0 the popup can also compute the placement for you.

## Auto

**Auto** star-matches the reveal against the background using PixInsight's
`StarAlignment` in `OutputMatrix` mode — it only needs the transformation, so
the registered file it writes is deleted. It matches **exactly the two bitmaps
the popup shows**: what you align is what renders.

Two stages are tried, in order:

- **Stage A — full frame against full frame.** This is the fast path, and it
  works when the reveal frames roughly the same sky as the background, up to a
  ~3× scale ratio.
- **Stage B — a 3×3 grid of overlapping half-size background tiles.** A deep
  crop defeats a full-frame match: over the same sky, the reveal's stars are
  some 8× fainter than the background's field-wide brightest-5000 cut, so the
  descriptor neighbourhoods never agree (measured: thousands of putative pairs,
  **zero** RANSAC inliers). Any reveal region up to a quarter of the background
  lies fully inside at least one tile, and a tile restores a symmetric star
  selection — which the matcher tolerates across that same ~3× ratio.

Each stage is run **twice**, once with polygonal descriptors and once with
triangle similarity. Polygonal descriptors cannot match a specular transform;
triangle similarity can. That doubling is what covers a **mirrored** reveal.

A fit is accepted only if it passes a quality gate: at least **12 matched
pairs**, an **inlier ratio ≥ 0.5**, and an **rms error ≤ 2.5 px**
(`saQualityOk`). A wrong-scale attempt can still produce a RANSAC consensus, and
the gate is what rejects it — the script reports a failure rather than a
plausible-looking wrong placement.

## When Auto gives up

> *Automatic alignment found no reliable star match (starless or heavily
> processed image?). Align manually.*

Take it at face value: a starless or heavily reworked reveal has nothing left to
match. The manual controls are the fallback — and they stay the fine-tuning
surface either way, since Auto's result is a normal placement you can nudge.

## What you align is what renders

The placement the popup shows is the placement the render uses — one matrix,
both paths, locked by `tests/align.test.js`. Align it until it looks right, and
that is what comes out of the video.

## Alignments saved before 1.1.1

1.1.0 unified the reveal→background map on `R(+θ)`. Versions up to 1.0.0 stored
the **opposite sign**, under the same key, with nothing to tell the two apart —
so an alignment saved by 1.0.0 and re-run under 1.1.0 renders at twice the angle
away from the sky. Rotations of exactly 0° are unaffected, whichever convention
wrote them.

That number cannot be repaired after the fact, and the script does not pretend
otherwise: negating unstamped rotations on sight would fix the 1.0.0 ones and
break every 1.1.0 one in exactly the same silent way. So **the value is left
untouched and the doubt is shown**, next to the alignment it applies to:

> ⚠ This alignment (rotation 328°) was saved by an earlier version, which stored
> rotations the other way round. Check it, or redo it with Align… — one click on
> Auto is enough.

Redoing the alignment once settles it for good. The notice comes back on every
launch until you do — a config is stamped with the build that wrote it
(`cfgVersion`) only once no unchecked rotation is riding along, so closing the
window does not quietly make the question go away.

The same check covers a process icon dragged out before 1.1.1 and a headless
`SESSIONCINEMA_AUTORUN` config: the icon's own rotation is checked rather than
trusted, and a headless run reports the warning in the console and in
`sessioncinema-result.json` (`warnings`). A headless config you write yourself
can carry `"cfgVersion": "1.1.1"` to say the rotation is in the current
convention.
