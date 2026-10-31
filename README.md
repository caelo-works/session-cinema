<div align="center">

# Session Cinema

### Turn a night of raw subs into a colour "watch your stack build itself" video

[![Version](https://img.shields.io/badge/version-1.3.2-22d3ee?style=for-the-badge&labelColor=0f172a)](https://github.com/caelo-works/session-cinema/releases/latest)
[![PixInsight](https://img.shields.io/badge/PixInsight-%E2%89%A5%201.9.4-67e8f9?style=for-the-badge&labelColor=0f172a)](https://pixinsight.com/)
[![Status](https://img.shields.io/badge/status-stable-34d399?style=for-the-badge&labelColor=0f172a)](https://pixinsight-scripts.caelo.works/en/scripts/session-cinema)
[![License](https://img.shields.io/badge/license-GPL--3.0-94a3b8?style=for-the-badge&labelColor=0f172a)](LICENSE)
[![Website](https://img.shields.io/badge/%E2%86%92%20see%20all%20scripts-pixinsight--scripts.caelo.works-0f172a?style=for-the-badge&labelColor=22d3ee)](https://pixinsight-scripts.caelo.works/en)

[![CaeloWorks · PixInsight Scripts](https://pixinsight-scripts.caelo.works/assets/readme-banner.png)](https://pixinsight-scripts.caelo.works/en)

</div>

---

## Overview

Your imaging session already tells great stories: what the sky did all night,
how the signal emerged from the noise, and where in the sky your target actually
sits. Session Cinema turns your frames into videos ready for sharing — a
**progressive stack** where the integration visibly builds itself from your
first sub to your last, in colour: raw camera subs are registered internally
(dithering + meridian flip), your filters composited into an SHO/HOO palette,
the light growing from dark to the optimal stretch before cross-fading to your
finished image. Or a **Zoom Odyssey** that falls from the whole sky through the
constellation down to your image revealing itself at its true position — the
"you are here" that makes even a modest frame land.

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
| 🎬 **Two styles** | Progressive stack — cumulative colour integration from your first sub to your last (raw subs registered internally, multi-filter SHO/HOO composites, then a cross-fade to your finished image) — and **Zoom Odyssey**, a "you are here" context zoom from the whole sky down to your image revealing itself, built from its plate solve |
| 🔬 **Honest by default** | Fixed screen stretch referenced on the final stack (2-pass); SNR gain measured on the linear data (multiscale noise estimation), in mono and in colour alike — overlays never show anything that wasn't measured, and say so when a figure could not be |
| 🖼️ **Sober overlays** | Title, frame counter, cumulative exposure, UT clock, progress bar, optional signature — all individually switchable |
| 📱 **Social-ready formats** | 16:9 (1080p / 4K), square 1:1 and vertical 9:16, fill-crop or letterbox framing, H.264 `yuv420p` with faststart |
| ⚙️ **Robust pipeline** | FITS/XISF input, CFA debayering via `BAYERPAT`, chronological ordering across multiple nights via `DATE-OBS`, unreadable or mismatched frames skipped and reported |
| 🎞️ **ffmpeg, not required** | Finds the ffmpeg you installed (PATH, winget, Chocolatey, Scoop, Homebrew, MacPorts, snap) and runs it only once you have chosen it — or encode later with the generated `encode.sh` / `encode.bat` |
| 🎨 **Multi-filter colour** | Filters detected and mapped to R/G/B via a palette (SHO, HOO, HOS, RGB) or manual override; optional SCNR green removal; a finished image revealed at the end, aligned onto the stack automatically by star matching (or by hand) |
| 🌍 **Bilingual UI** | English and French, switchable live, settings remembered across sessions |

## Screenshots

<div align="center">

![Session Cinema — Zoom Odyssey tab: a plate-solved image and an image to reveal, a Render options group with constellation and star names, horizon, coordinate grid, the real-sky survey bridge and the simulated shoot location](https://pixinsight-scripts.caelo.works/assets/scripts/session-cinema-1-odyssey.webp)

*The **Zoom Odyssey** tab — the one the script opens on. A plate-solved image drives the zoom; **Render options** holds the constellation & star names, the horizon, the coordinate grid, the real-sky survey bridge and the simulated shoot location. Overlays, video and output are shared with the other style, on the right.*

![Session Cinema — Progressive stack tab: the list of subframes, rendering with a fixed stretch computed on the final stack, the SHO colour composite, and the finished image revealed at the end](https://pixinsight-scripts.caelo.works/assets/scripts/session-cinema-2-stack.webp)

*The **Progressive stack** tab — raw subs go in; the fixed screen stretch, the internal registration, the SHO colour composite and the finished image to reveal sit on the left. **Align…** places that image on the stack — automatically, if it can.*

</div>

## Installation

### From the CaeloWorks update repository (recommended)

In PixInsight, open **Resources → Updates → Manage Repositories** and add
`https://pixinsight-scripts.caelo.works/update/`, then run
**Resources → Updates → Check for Updates**, accept the install and restart.
The script then lives under **Script → CaeloWorks → Session Cinema**, and
updates are delivered automatically through the same channel.

### Manual install

Download `SessionCinema-<version>.zip` from the
**[Releases](https://github.com/caelo-works/session-cinema/releases)** and unzip
it anywhere. The script is in `src/scripts/CaeloWorks/SessionCinema/`, next to
its signature (`SessionCinema.xsgn`) and the emblem the dialog header looks for
(`SessionCinema.svg`): keep the three together. Then in PixInsight use
**Script → Feature Scripts…**, click **Add** and select that folder.

### Code signature

Session Cinema is signed with the CaeloWorks identity of the Certified PixInsight
Developer program. It runs with **Allow execution of unsigned scripts** turned
off. The signature covers the script as published: an edited copy is no longer
signed, and PixInsight treats it as unsigned code.

### Upgrading from 1.2.x or earlier

Versions 1.1.0 to 1.2.1 could install ffmpeg in one click by downloading it into
a per-user folder:

- **Windows**: `%LOCALAPPDATA%\CaeloWorks\ffmpeg\ffmpeg.exe`
- **macOS**: `~/Library/Application Support/CaeloWorks/ffmpeg/ffmpeg`
- **Linux**: `$XDG_DATA_HOME/caeloworks/ffmpeg/ffmpeg`, by default
  `~/.local/share/caeloworks/ffmpeg/ffmpeg`

That copy was downloaded outside the PixInsight update system, so from 1.3.1 on
Session Cinema **never runs it and no longer offers it**, even if your settings,
your PATH or a file you browse to point at it. While it is still on disk, the
ffmpeg panel of the **Output** group tells you where it is and offers
**Delete this copy…**. After you confirm, that button deletes that one file, then
its folder if nothing else is left in it. Nothing is deleted without that click.
You can also delete the folder yourself, or keep it if another program uses it.

To encode videos, install ffmpeg yourself:

- **Windows**: `winget install ffmpeg` (or Chocolatey, Scoop, or a build from
  ffmpeg.org)
- **macOS**: `brew install ffmpeg` (or MacPorts)
- **Linux**: your distribution's package manager, e.g. `sudo apt install ffmpeg`
  or `sudo dnf install ffmpeg`

Then click **Detect** to use the ffmpeg on your PATH, or **Browse** to choose
the executable yourself. Without ffmpeg, Session Cinema still writes the BMP
frames and an `encode.sh` / `encode.bat` script you can run later.


> **Requires PixInsight 1.9.4 to 1.9.99** — Windows, macOS and Linux. That upper
> bound is what the published package declares to the updater; the script itself
> only enforces the lower one.
> Constellation figures, borders and labels are read from the **AnnotateImage**
> script's data files, which ship with PixInsight. Without them the Zoom Odyssey
> still runs, with named stars but no figures, and says so.
> Video encoding uses [ffmpeg](https://ffmpeg.org/) when available.

## Getting started

1. Pick a style. The script opens on **Zoom Odyssey**, which needs a single
   plate-solved image and no sub list at all (a WBPP master is already solved).
   **Progressive stack** takes the session's raw light frames instead — FITS or
   XISF, files or a whole directory — registers them internally (dithering +
   meridian flip) and orders them by `DATE-OBS`, so several nights just work;
   with several filters, map them to R/G/B for a colour composite.
2. Give the video a title, choose format and duration, and check the overlay
   items you want.
3. Optionally pick a finished image to reveal at the end. **Align…** places it
   on the frame behind it: **Auto** computes the placement by star matching,
   and the manual controls are there when it can't (or to fine-tune it) — see
   [reveal alignment](docs/reveal-alignment.md).
4. Click **Generate**: the frame sequence is rendered, then encoded to MP4 if
   ffmpeg is available. If it isn't, the BMP frames are kept with an `encode`
   script written next to them, to run once you have installed ffmpeg.

## Documentation

- **[Support knowledge base](docs/support-kb.md)** — written for a support agent
  to quote: the controls and messages a user is most likely to name, in both
  languages; every message that stops a run and every one that does not; what is
  genuinely broken today, and what was fixed in the version before. It is not an
  exhaustive dump of the string table, and does not try to be. Written for a support
  agent, useful to anyone who wants the whole picture.
- **[Validation on PixInsight](docs/pjsr-validation.md)** — what is checked
  against a real PixInsight and how to replay it, plus what the PJSR APIs
  actually do where that differs from what their naming suggests.
- **[Reveal alignment](docs/reveal-alignment.md)** — how **Auto** places your
  finished image on the frame behind it, when it gives up, and what to do then.

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

## Releasing

### Every release updates the support KB. Every one.

**[`docs/support-kb.md`](docs/support-kb.md) is what a support agent quotes to a
user.** A stale KB is worse than no KB: it makes support confidently wrong, and
the user believes them. So a version bump is not done until the KB has been
walked through:

- new or renamed **controls** and **messages** → the reference and the EN/FR
  lookup table;
- bugs **fixed** → move them under a *Fixed in X.Y.Z* heading, with the answer
  for users still on the previous version. Do **not** delete them: someone who
  has not updated still hits them, and support still has to recognise what they
  describe. An entry leaves the KB when the version it belongs to is two
  releases behind;
- bugs **found** → add them, with the answer support should give today;
- the **`Applies to`** line and the facts card → the new version.

This is enforced, not merely requested: `tests/docs.test.js` fails the build if
`SC_VERSION` moves and the KB does not follow, and it also checks that every
label the KB quotes still exists in the script's string table, in **both**
languages. Renaming a group box without updating the KB breaks CI.

**The KB's shape is dictated by its consumer.** It is imported into the support
agent's knowledge base, which cuts **one article per `##`**, re-cuts on `###` when
a section is long, and **truncates what it serves at 4000 characters**. So a long
`##` with no `###` inside it is silently beheaded — the agent goes blind to its
end and nothing reports an error. `tests/docs.test.js` fails the build on that
too. Two consequences when writing it: **headings must contain the words a user
would type**, and **every section must stand on its own** — the agent retrieves
three articles, so "see the section above" points at something it cannot see.

### The update-repository package

Distribution through the CaeloWorks update repository relies on a
standardized artifact built here and ingested by the site repository
(which owns the aggregated, signed `updates.xri`). To build it:

```bash
scripts/build-update-package.sh <version> [releaseDate YYYYMMDD]
```

This produces two files under `dist/`:

- **`SessionCinema-<version>.zip`** — the install tree extracted as-is by the
  PixInsight updater (`src/scripts/CaeloWorks/SessionCinema/SessionCinema.js`
  plus the script icon, shipped both under `rsc/icons/script/` for the menu
  entry and next to the script for the dialog emblem). The unsigned archive is
  reproducible: entries are sorted, timestamps and permissions are fixed, and
  nothing is compressed, so the same content rebuilt on any machine yields the
  same sha1. The released package is then signed (below), and a signature
  carries a timestamp, so the signed zip is not reproducible.
- **`update-package.json`** — the metadata contract for the site: name, slug,
  version, `fileName`, `sha1`, type, `releaseDate`, `piVersionRange`, title
  and `descriptionHtml`.

`scripts/check-package.sh [--signed] <zip>` checks a package against that
contract. A tag `vX.Y.Z` on `main` runs the tests and opens a **draft** release
carrying the unsigned zip and `update-package.json`, nothing else.

Signing happens afterwards, outside CI, on a machine with PixInsight and the
CaeloWorks keys:

```bash
XSSK_PATH=/path/to/keys.xssk scripts/sign-package.sh dist/SessionCinema-<version>.zip
```

It signs only the entry script, as the zip carries it after the version stamp
(its `.xsgn` covers everything it includes), re-zips, writes the new sha1 into
the `update-package.json` next to the zip, then runs `check-package.sh --signed`
and `verify-signature.sh`. The key password is read from stdin and never stored.
The signing PixInsight must keep **Allow execution of unsigned scripts** on: the
small runners these scripts hand it are unsigned.

## Network, programs and files

What Session Cinema does outside PixInsight, all of it.

**Network.** One connection, and only while **Real-sky survey bridge** is ticked
(it is by default): for each Zoom Odyssey render, two requests over HTTPS to the
CDS hips2fits service, `https://alasky.cds.unistra.fr/hips-image-services/hips2fits`.
They carry the target's right ascension, declination, field of view, the cutout
size and the survey name — nothing about you or your site. They go through
PixInsight's own network stack; certificates are verified, redirects are not
followed, plain HTTP is refused, and a cutout is used only if it decodes at
exactly the size requested. Untick the bridge and Session Cinema makes no
network connection at all. Nothing else is ever downloaded, and no program.

**Programs launched.**

- **ffmpeg**, to encode the video — the one *you* installed and chose with
  **Detect** or **Browse**. Session Cinema does not ship or download it. It looks
  for one on disk (PATH, then winget, Chocolatey, Scoop, Homebrew, MacPorts,
  snap, Linuxbrew) by checking that the file exists, and runs nothing until you
  have chosen it: then `ffmpeg -version` once to check it, and ffmpeg itself for
  each encode. The copy that versions 1.1.0 to 1.2.1 downloaded is never run, see
  *Upgrading from 1.2.x or earlier*.
- **The system file browser** — `explorer.exe`, `open` or `xdg-open` — only when
  you click to show the output folder or the video.

Nothing else. The generated `encode.sh` / `encode.bat` is written for you to run;
Session Cinema never runs it.

**Files written outside the PixInsight installation.**

- The **output folder** you choose: the video, and, if kept or if ffmpeg is
  missing, the BMP frame sequence with `encode.sh` / `encode.bat`.
- The **system temp directory**: `sc-reg/` (registered subs and stretch cache),
  `sc-hips-*.jpg` (survey cutouts), `sc-autoalign-*.bmp` (reveal alignment).
  These make a re-run fast. **Clear caches…** in the Output group deletes them;
  so can you, at any time.
- Settings, through PixInsight's own settings interface, under
  `SessionCinema/config`.
- Only in headless mode, the result file named by `SESSIONCINEMA_AUTORUN`.

**Files deleted outside the PixInsight installation.** Only on your click: the
caches above with **Clear caches…**, and the ffmpeg copy that versions 1.1.0 to
1.2.1 downloaded, with **Delete this copy…** (see *Upgrading from 1.2.x or
earlier*). Nothing writes into that folder any more.

## License and credits

[GPL-3.0](LICENSE) © CaeloWorks. The licence text travels inside the published
package, next to the script.

Session Cinema redistributes no third-party data: the star and constellation
catalogues are read from your own PixInsight installation at run time. It does
paint real-sky imagery into the video when the survey bridge is on, fetched from
the CDS. A short credit is drawn on screen while that imagery is visible, and the
acknowledgements the providers publish are these — quoted, not reworded:

> This research made use of hips2fits, a service provided by CDS.

> The Digitized Sky Surveys were produced at the Space Telescope Science Institute
> under U.S. Government grant NAG W-2166. The images of these surveys are based on
> photographic data obtained using the Oschin Schmidt Telescope on Palomar Mountain
> and the UK Schmidt Telescope.

If you publish a video that shows survey imagery, reproduce them.
