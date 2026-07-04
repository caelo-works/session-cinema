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
- Honest screen-stretch options: fixed reference computed on the final stack
  (2 passes, default), on the first frame (1 pass), or per rendered frame.
- Sober overlays showing measured facts only: title, frame counter, cumulative
  exposure, UT clock (timelapse), noise-based SNR gain in dB (stacking,
  scaled-MAD estimate on the central region), progress bar, free signature.
- Output formats 16:9 (1080p/4K), 1:1 and 9:16 with fill-crop or letterbox
  framing; PNG sequence + H.264 encoding through a detected or user-provided
  ffmpeg; a ready-to-run encode script is always written next to the frames.
- CFA debayering (BAYERPAT auto-detection), chronological ordering via
  DATE-OBS across multiple nights, bilingual UI (EN/FR) with persistent
  settings, headless automation hook (`SESSIONCINEMA_AUTORUN`).

<!-- Every release entry states its VALIDATION evidence (which run, which gates). -->
<!-- Unreleased: logic tests + packaging battery pass under node/bash (tests/run.sh,
     tests/packaging.sh); the PixInsight runtime gates (§8 two-gate discipline on a
     real frame set) have not run yet — required before the first tagged release. -->
