# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- First implementation of Session Cinema (PJSR, `#engine v8`, PixInsight ≥ 1.9.4).
- **Timelapse** style: one video frame per sub — clouds, meteors, satellites and
  field rotation as they happened, with a fixed or per-frame auto-stretch.
- **Progressive stack** style: cumulative mean integration rendered from 1 to
  N subs, with a render cadence computed from the target animation length.
- **Zoom Odyssey** style: a "you are here" context zoom built from the plate
  solve of the final image — whole sky → constellation figures → the field →
  the image revealing itself at its true on-sky position, orientation and
  scale. Reads the embedded `AstrometricSolution` (WCS) via `View.propertyValue`
  and draws the sky from PixInsight's bundled catalogs (NamedStars,
  ConstellationLines); the image's own dense stars bridge the range where the
  bright-star catalog thins, so every star shown is genuine. Optional angular
  scale bar, subtitle (e.g. the constellation) and distance overlays.
- Honest screen-stretch options: fixed reference computed on the final stack
  (2 passes, default), on the first frame (1 pass), or per rendered frame.
- Sober overlays showing measured facts only: title, frame counter, cumulative
  exposure, UT clock (timelapse), noise-based SNR gain in dB (stacking,
  MRS/k-sigma noise estimate), progress bar, free signature.
- Overlay title (and output file names) default to the `OBJECT` keyword read
  from the frames when left blank, so an untitled video carries the real
  target name; auto-derived titles are never persisted as a hand-typed value.
- Output formats 16:9 (1080p/4K), 1:1 and 9:16 with fill-crop or letterbox
  framing; PNG sequence + H.264 encoding through a detected or user-provided
  ffmpeg; a ready-to-run encode script is always written next to the frames.
- CFA debayering (BAYERPAT auto-detection), chronological ordering via
  DATE-OBS across multiple nights, bilingual UI (EN/FR) with persistent
  settings, headless automation hook (`SESSIONCINEMA_AUTORUN`).

<!-- Every release entry states its VALIDATION evidence (which run, which gates). -->
<!-- Unreleased validation: logic tests + packaging battery pass (tests/run.sh,
     tests/packaging.sh). Two PixInsight runtime gates PASSED headless on real data
     (PI 1.9.x, Windows): progressive stack over 53 registered 300 s Ha subs and
     timelapse over 25 raw subs — gate 1 clean (ok:true, 0 skipped, no errors);
     gate 2 outputs verified (53 + 25 frames, overlays correct, measured SNR gain
     +17.5 dB vs +17.2 dB theoretical for N=53, MP4s encode to spec). -->
<!-- Fixed during validation: ExternalProcess false-success (exitCode 0 on launch
     failure), noise estimator (MAD dominated by nebula structure -> noiseMRS),
     and literal % escaping in the fallback encode.bat. -->
