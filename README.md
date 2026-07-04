<div align="center">

# Session Cinema

### Turn a night of raw subs into a timelapse or a "watch your stack build itself" video

[![Version](https://img.shields.io/badge/version-0.1.0-22d3ee?style=for-the-badge&labelColor=0f172a)](https://github.com/caelo-works/session-cinema/releases/latest)
[![PixInsight](https://img.shields.io/badge/PixInsight-%E2%89%A5%201.9.4-67e8f9?style=for-the-badge&labelColor=0f172a)](https://pixinsight.com/)
[![Status](https://img.shields.io/badge/status-beta-fbbf24?style=for-the-badge&labelColor=0f172a)](https://pixinsight-scripts.caelo.works/en/scripts/session-cinema)
[![License](https://img.shields.io/badge/license-GPL--3.0-94a3b8?style=for-the-badge&labelColor=0f172a)](LICENSE)
[![Website](https://img.shields.io/badge/%E2%86%92%20see%20all%20scripts-pixinsight--scripts.caelo.works-0f172a?style=for-the-badge&labelColor=22d3ee)](https://pixinsight-scripts.caelo.works/en)

[![CaeloWorks · PixInsight Scripts](https://pixinsight-scripts.caelo.works/assets/readme-banner.png)](https://pixinsight-scripts.caelo.works/en)

</div>

---

## Overview

Your imaging session already tells two great stories: what the sky did all
night, and how the signal emerged from the noise. Session Cinema turns the raw
light frames of one or more nights into videos ready for sharing — a
**timelapse** where clouds, meteors, satellites and field rotation play back as
they happened, or a **progressive stack** where the integration visibly builds
itself from 1 to N subs while the noise melts away.

The overlays stay on the scientific side of pretty: they only display measured
facts — frame count, cumulative exposure, UT clock from `DATE-OBS`, and a
noise-based SNR gain in dB actually measured on the running stack, not a
theoretical √N. The default screen stretch is computed once on the *final*
stack, so the noise improvement you see through the video is real, not hidden
by per-frame auto-stretching.

> 📖 **Full details, screenshots & docs:** **[pixinsight-scripts.caelo.works/en/scripts/session-cinema](https://pixinsight-scripts.caelo.works/en/scripts/session-cinema)**

## Features

| | |
|---|---|
| 🎬 **Two styles** | Timelapse (one video frame per sub) and progressive stack (cumulative mean integration from 1 to N subs, render cadence fitted to your target duration) |
| 🔬 **Honest by default** | Fixed screen stretch referenced on the final stack (2-pass); SNR gain measured on the data (scaled MAD, central region) — overlays never show anything that wasn't measured |
| 🖼️ **Sober overlays** | Title, frame counter, cumulative exposure, UT clock, progress bar, optional signature — on a discreet gradient scrim, all individually switchable |
| 📱 **Social-ready formats** | 16:9 (1080p / 4K), square 1:1 and vertical 9:16, fill-crop or letterbox framing, H.264 `yuv420p` with faststart |
| ⚙️ **Robust pipeline** | FITS/XISF input, CFA debayering via `BAYERPAT`, chronological ordering across multiple nights via `DATE-OBS`, unreadable or mismatched frames skipped and reported |
| 🎞️ **ffmpeg, not required** | Uses a detected or user-provided ffmpeg to encode; without one, the PNG sequence plus a ready-to-run `encode.sh` / `encode.bat` are generated |
| 🌍 **Bilingual UI** | English and French, switchable live, settings remembered across sessions |

## Installation

### From the CaeloWorks update repository (recommended)

In PixInsight, open **Resources → Updates → Manage Repositories** and add
`https://pixinsight-scripts.caelo.works/update/`, then run
**Resources → Updates → Check for Updates**, accept the install and restart.
Updates are then delivered automatically through the same channel.

> The repository is not CPD-signed yet, so PixInsight shows an
> "unsigned repository" warning; signing is underway.

### Manual install

Download `SessionCinema.js` from the **[Releases](https://github.com/caelo-works/session-cinema/releases)**, then in
PixInsight use **Script → Feature Scripts…**, click **Add** and select the
folder containing the file. Alternatively, run it once via
**Script → Execute Script File…**.

> **Requires PixInsight 1.9.4 or newer** — Windows, macOS and Linux.
> Video encoding uses [ffmpeg](https://ffmpeg.org/) when available.

## Getting started

1. Add the raw light frames of the session — FITS or XISF, files or a whole
   directory. Frames are ordered by `DATE-OBS`, so several nights just work.
2. Pick a style. **Timelapse** takes the subs as they are; **Progressive
   stack** expects registered frames (point it at WBPP's `registered/`
   output for a clean build-up).
3. Give the video a title, choose format and duration, check the overlay
   items you want. **Preview frame** renders a single frame so you can check
   the framing and overlay before committing.
4. Click **Generate**: the PNG sequence is rendered, then encoded to MP4 if
   ffmpeg is available — otherwise run the `encode` script written next to
   the frames.

## Development

<details>
<summary><b>Tests &amp; CI</b></summary>

Logic-level tests (stretch math, header parsing, render cadence, geometry,
ffmpeg command, overlays, i18n) run under Node without PixInsight:

```bash
tests/run.sh
tests/packaging.sh
```

The same suite plus a packaging dry-run runs in CI on every pull request;
GUI and image I/O are validated in PixInsight, including a headless
automation hook (`SESSIONCINEMA_AUTORUN=<config.json>`).

</details>

## Releasing — update-repository package

Distribution through the CaeloWorks update repository relies on a
standardized artifact built here and ingested by the site repository
(which owns the aggregated, signed `updates.xri`). To build it:

```bash
scripts/build-update-package.sh <version> [releaseDate YYYYMMDD]
```

This produces two files under `dist/`:

- **`SessionCinema-<version>.zip`** — the install tree extracted as-is by the
  PixInsight updater (`src/scripts/CaeloWorks/SessionCinema/SessionCinema.js`
  and the menu icon). The archive is reproducible on a given build
  environment: rebuilt there, its sha1 only changes when the content changes.
- **`update-package.json`** — the metadata contract for the site: name, slug,
  version, `fileName`, `sha1`, type, `releaseDate`, `piVersionRange`, title
  and `descriptionHtml`.

## License

[GPL-3.0](LICENSE) © CaeloWorks
