# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automatic reveal alignment: an "Auto" button in the alignment popup computes
  the placement (centre, scale, rotation, flip) by star-matching the two
  bitmaps the popup shows, with StarAlignment in OutputMatrix mode. Full-frame
  matching first; deep-crop reveals (which starve the matcher — see the API
  notes) are recovered by re-matching against a 3x3 overlapping grid of
  background tiles. Mirrored reveals are covered by doubling every stage with
  triangle similarity (polygonal descriptors cannot match specular
  transforms), and a quality gate (pairs/inliers/rms) rejects degenerate
  RANSAC consensus. The manual popup remains both the fallback (starless or
  heavily processed reveals) and the fine-tuning surface.
- The zoom "Align…" button now enables whatever the order of ticking the
  cropped-reveal box and choosing the two images; both align buttons say
  "Opening…" while the images load, and the popup's Auto button reports its
  attempt progress.
- One-click ffmpeg install: when detection comes up empty, the output row
  offers to download a static build from the CaeloWorks mirror
  (`pixinsight-scripts.caelo.works/ffmpeg/`, contract in
  `docs/ffmpeg-mirror.md`) into a per-user directory. Every candidate is
  validated by running `-version`, which doubles as the architecture selector
  on macOS/Linux (arm64/x64 tried in order); the resulting path is persisted
  like a hand-picked one.

### Fixed
- Zoom Odyssey rendered a rotated cropped reveal at the WRONG angle: the
  reveal WCS carried R(−θ) while the popup preview places with R(+θ), so any
  aligned reveal with a non-trivial rotation rendered 2·θ away from the real
  sky (measured: a 32° reveal showed the DSS2 nebula as a ghost rotated ~64°
  next to the photo). Manual alignments were affected too. cropWcs /
  cropWcsCentered now use the preview's R(+θ) convention, and a cross-path
  test (tests/align.test.js) locks "what you align is what renders".

### Changed
- ffmpeg detection now probes, beyond PATH and the user path: a previous
  auto-install, winget/Chocolatey/Scoop (Windows), Homebrew Apple Silicon and
  MacPorts (macOS), snap and Linuxbrew (Linux). Absolute candidates that do
  not exist on disk are skipped without paying a process launch.

<!-- Unreleased validation: logic tests pass (tests/run.sh, incl. the new
     tests/ffmpeg.test.js covering candidate paths, install locations and the
     mirror name contract, and tests/align.test.js covering the SA-matrix ->
     placement decomposition incl. mirror equivalence and degenerate inputs).
     PixInsight runtime gates PASSED headless (PI 1.9.x, Windows):
     - ffmpeg install: empty detection -> mirror download -> -version gate ->
       persisted path -> re-detection finds the install; GUI flow (button,
       confirm, collapse) validated interactively by the author. macOS gate
       still to run once the production mirror serves the binaries.
     - auto-align: synthetic 140-star pairs with known transforms; recovered
       plain (scale .8501/.85, rot 15.03/15, c at 0.1 px) and mirrored
       (1.0986/1.10, -31.95/-32, flip) through the real autoAlignReveal path,
       proving the polygons->triangles retry. Real-data gate PASSED headless:
       NGC6888 star-reduced HOO PNG (deep crop, scale 0.50, rot 32.2°) placed
       onto its wide-field Ha master via the tile stage (attempt 3/20, ~44 s),
       correctness verified visually on a rendered composite. -->
<!-- API notes captured during build: StarAlignment enum CONSTANTS are not
     resolvable as globals (StarAlignment.mode.X) but DO live on process
     instances: SA.OutputMatrix == 8, SA.RegisterMatch == 0, etc. In
     OutputMatrix mode SA still writes the registered file (remove it after
     reading outputData). outputData[0][11..19] is the row-major 3x3 mapping
     REFERENCE px -> TARGET px. The parameter for mirror-capable matching is
     the boolean `useTriangles` (default false = polygonal descriptors,
     `descriptorType` does not exist). UndoFlag_* and other .jsh constants are
     unavailable even in classic-engine scripts run via -r; use literals.
     Matcher root-cause note: a deep-crop target against a full-field
     reference yields thousands of putative pairs but ZERO RANSAC inliers —
     the reference's brightest-5000 cut goes ~8x shallower over the crop's
     sky than the target's, so descriptor neighbourhoods never agree. No
     parameter fixes it (maxStars/sensitivity/matcherTolerance/scale grid all
     tested); restoring symmetric coverage (match against a crop/tile) fixes
     it instantly. Scale ratios up to ~3x are fine once coverage is
     symmetric. Beware permissive ransacTolerance: it can return a confident
     FALSE consensus (gate on pairs>=12, inliers>=0.5, rms<=2.5). -->

## [1.0.0] - 2026-07-11

First stable release: both styles — progressive colour stack and Zoom Odyssey —
are validated end to end on real sessions (see 0.1.0 below for the full feature
set and its validation evidence).

### Changed
- The script now installs under its own vendor menu: **Script → CaeloWorks →
  Session Cinema** (it was under *Utilities*), and carries an explicit
  `SessionCinema` feature identifier — consistent with the other CaeloWorks
  scripts, and a prerequisite for code signing.
- New script icon, used for the menu entry and the dialog header emblem. The
  icon now ships twice in the update package — under `rsc/icons/script/` for
  the `#feature-icon` directive, and next to the script, which is the only copy
  an install outside the PixInsight tree can find.

<!-- 1.0.0 validation: logic tests pass (tests/run.sh) and the packaging battery
     (tests/packaging.sh) asserts the 3-entry install tree — script + both icon
     copies — and a reproducible sha1. The rendering pipeline is unchanged since
     the 0.1.0 runtime gates below; this release only moves the menu entry and
     swaps the icon. -->

## [0.1.0] - 2026-07-05

### Added
- First release of Session Cinema (PJSR, `#engine v8`, PixInsight ≥ 1.9.4).
- **Progressive stack** style: cumulative mean integration rendered from the
  first to the last sub, with a render cadence computed from the target
  animation length. Raw, straight-off-the-camera subs are accepted directly —
  they are registered internally (StarAlignment) to a common reference,
  correcting dithering offsets and meridian flips across filters, with the
  registered frames cached on disk.
- **Multi-filter colour composites**: the filters present in the subs are
  detected and mapped to the R/G/B channels via a palette preset (SHO, HOO,
  HOS, RGB, LRGB) or a manual per-channel override. The composite builds in
  colour as each channel's subs accumulate. A global brightness ramp grows the
  integrated light — dark at the start, the optimal fixed per-channel stretch on
  the final frame — while keeping the SHO colour balanced throughout. Optional
  **remove dominant green** (SCNR, average-neutral).
- **End reveal**: a finished, processed image cross-fades in over the last
  seconds (configurable duration) and zooms to fill the frame, visually aligned
  onto the stack through a popup (drag / scale / rotate / flip) so the switch is
  seamless. The overlay stays anchored to the frame while the image zooms.
- **Zoom Odyssey** style: a "you are here" context zoom built from the plate
  solve of the final image — whole sky → constellation figures → the field →
  the image revealing itself at its true on-sky position, orientation and
  scale. Reads the embedded `AstrometricSolution` (WCS) via `View.propertyValue`
  and draws the sky from PixInsight's bundled catalogs (NamedStars,
  ConstellationLines, ConstellationBorders); constellation figures and names
  (localized), named stars, an artificial horizon and an equatorial grid open
  the sequence. A real-sky survey bridge (CDS/Aladin **hips2fits**, DSS2)
  fetched over the network fills the mid-zoom with genuine stars and crossfades
  into the photo. Optional angular scale bar, subtitle and distance overlays.
  A plate-solved image provides the coordinates while a separate finished image
  is the one revealed; a "different crop" option opens the same alignment popup
  to place the reveal onto the solved image.
- Honest screen-stretch options: fixed reference computed on the final stack
  (2 passes, default), on the first frame (1 pass), or per rendered frame.
- Sober overlays showing measured facts only: title, frame counter, cumulative
  exposure, UT clock of the current sub, noise-based SNR gain in dB (MRS/k-sigma
  noise estimate), progress bar, free signature.
- Overlay title (and output file names) default to the `OBJECT` keyword read
  from the frames when left blank, so an untitled video carries the real
  target name; auto-derived titles are never persisted as a hand-typed value.
- Output formats 16:9 (1080p/4K), 1:1 and 9:16 with fill-crop or letterbox
  framing; BMP frame sequence + H.264 encoding through a detected or
  user-provided ffmpeg; a ready-to-run encode script is written next to the
  frames.
- CFA debayering (BAYERPAT auto-detection), chronological ordering via
  DATE-OBS across multiple nights, two-column dialog with button and tab icons,
  bilingual UI (EN/FR) with persistent settings, headless automation hook
  (`SESSIONCINEMA_AUTORUN`).

<!-- Every release entry states its VALIDATION evidence (which run, which gates). -->
<!-- 0.1.0 validation: logic tests pass (tests/run.sh). PixInsight runtime gates
     PASSED headless on real data (PI 1.9.x, Windows): 168 raw M16 subs (H/O/S,
     multi-night, dithered, one meridian flip). Registration proven numerically —
     StarAlignment matched 1300+ stars across the 180° flip (affine [[-1,0],[0,-1]]),
     and NCC(single sub, deep stack) = 0.99 confirms a sharp stack. Colour SHO
     composite: measured R/G ≈ 0.7–0.9 throughout (balanced), luminosity ramps
     10 → 98 (dark → optimal); SCNR drops green 104 → 92 (R/G 0.88 → 0.99). End
     reveal renders (cross-fade + zoom-to-fill) with the overlay anchored (strip
     NCC 0.89 while the image region moves at 0.57). Validated end-to-end by the
     author on M16. -->
<!-- API notes captured during build: StarAlignment needs referenceIsFile=true;
     RGB assembled via 4-arg apply(image, op, point, channel); enum constants
     (StarAlignment.mode, ChannelCombination.colorSpace) are not reliably
     resolvable — rely on defaults. -->

[1.0.0]: https://github.com/caelo-works/session-cinema/releases/tag/v1.0.0
[0.1.0]: https://github.com/caelo-works/session-cinema/releases/tag/v0.1.0
