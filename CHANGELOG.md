# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/caelo-works/session-cinema/releases/tag/v0.1.0
