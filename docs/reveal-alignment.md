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

Up to 1.0.0 this was **not** true for a rotated, cropped reveal. The reveal's
WCS carried R(−θ) while the popup places with R(+θ), so an aligned reveal with a
non-trivial rotation rendered 2·θ away from the real sky — a 32° reveal put the
survey nebula on screen as a ghost rotated some 64° next to the photo. Manual
alignments were affected too.

1.1.0 fixes the convention and `tests/align.test.js` locks the invariant across
both code paths (preview and render). **If you rendered a Zoom Odyssey from a
rotated cropped reveal with 1.0.0, the result is wrong — re-render it.**
