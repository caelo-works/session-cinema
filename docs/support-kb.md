# Session Cinema — support knowledge base

Written for a **support agent**, not for a user. It is exhaustive on purpose: it
states what every control does, what every error message means, and what is
actually broken today. Quote it, don't paraphrase it.

Two rules when you use it:

- **The UI is bilingual.** A user will describe *their* window, so they will say
  "Habillage", not "Overlay". Every label below is given in both languages.
- **Never invent a figure.** The product's whole pitch is that it only shows
  measured facts; support has to hold the same line. If you don't know, say so
  and escalate.

Applies to **1.1.0**. Check `#define SC_VERSION` at the top of
`pjsr/SessionCinema.js` if in doubt — the version is also printed under the
script's name in the dialog header.

---

## 1. The facts card

| | |
|---|---|
| What it is | A PixInsight script that turns an imaging session into a video |
| Version | 1.1.0 · GPL-3.0 · free and open source |
| Requires | **PixInsight 1.9.4 or newer** — Windows, macOS, Linux |
| Where it lives | **Script → CaeloWorks → Session Cinema** |
| Video encoding | ffmpeg — detected, or installed in one click, or done later by a generated script |
| Repository | https://github.com/caelo-works/session-cinema |
| Product page | https://pixinsight-scripts.caelo.works/en/scripts/session-cinema |

**Two styles, one dialog.** *Zoom Odyssey* (the tab it opens on) and *Progressive
stack*. They share the Overlay, Video and Output panels on the right; only the
left half changes with the tab.

---

## 2. Installing it

### Route A — the CaeloWorks update repository (recommended)

1. **Resources → Updates → Manage Repositories**
2. Add `https://pixinsight-scripts.caelo.works/update/`
3. **Resources → Updates → Check for Updates**, accept, **restart PixInsight**.

Updates then arrive through the same channel automatically.

> **"Unsigned repository" warning.** Expected. The repository is not CPD-signed
> yet; signing is underway. Tell the user it is safe to accept, and that this is
> a signature on the *repository*, not a virus warning.

### Route B — manual

Download `SessionCinema.js` from the
[Releases](https://github.com/caelo-works/session-cinema/releases), then
**Script → Feature Scripts… → Add** and select the folder containing the file.
Or run it once with **Script → Execute Script File…**.

### "I installed it and the menu entry is not there"

Almost always one of:

- **PixInsight was not restarted** after the update.
- The user is looking under the wrong menu. It is **Script → CaeloWorks →
  Session Cinema** since 1.0.0. Before that it sat elsewhere; a user upgrading
  from a very old build may have a stale entry pointing at a deleted file — have
  them re-run **Feature Scripts…** and remove the old entry.

---

## 3. The window, control by control

### 3.1 Label map — English / French

The user will name things in their language. This is the lookup.

| English | Français |
|---|---|
| Zoom Odyssey (tab 1) | Zoom Odyssey |
| Progressive stack (tab 2) | Empilement progressif |
| Zoom Odyssey — source images | Zoom Odyssey — images sources |
| Render options | Options de rendu |
| Light frames | Brutes |
| Rendering | Rendu |
| Colour (multi-filter) | Couleur (multi-filtre) |
| Final image (revealed at the end) | Image finale (révélée à la fin) |
| Overlay | Habillage |
| Video | Vidéo |
| Output | Sortie |
| Progress | Progression |
| Align… | Aligner… |
| Auto | Auto |
| Detect | Détecter |
| Install ffmpeg… | Installer ffmpeg… |
| Generate | Générer |

### 3.2 Tab 1 — Zoom Odyssey

*"You are here": the video starts at the whole sky, falls through the
constellation, and lands on the user's image at its true position, orientation
and scale.*

**Zoom Odyssey — source images**

| Control | What it needs | Notes |
|---|---|---|
| **Solved image (WCS)** | One **plate-solved** image | This is the only mandatory input of the whole tab. A **WBPP master is already solved**. If not: **Script → Image Analysis → ImageSolver**, then come back. |
| **Image to reveal** | Optional — the finished, processed image (JPEG/PNG/TIFF/FITS/XISF) | Used **as-is**. Leave it empty and the script reveals the solved image itself. |
| **Different crop from the solved image** | Tick it when the finished image is *not* framed like the solved one (a crop, a rotation, a mirror) | Enables **Align…** |
| **Align…** | Opens the alignment popup | See §4 |

**Render options** — all optional, all cosmetic-but-real:

- **Constellation names** · **Star names** · **Horizon** · **Coordinate grid**
- **Real-sky survey bridge** — downloads genuine **DSS2** imagery (CDS/Aladin
  `hips2fits`) so the star field dissolves into a real photograph of that patch
  of sky before the user's own image lands on it. **Needs internet.**
- **Simulate shoot location** (+ Lat / Lon / UTC) — opens on the sky *as it was
  from the shoot site at the shoot time*, with a true horizon. Reads
  `SITELAT` / `SITELONG` / `DATE-OBS` from the headers.
  - **"From a sub…"** exists because **integrated masters usually drop
    SITELAT/SITELONG**. Point it at a raw or calibrated sub and it fills the
    three fields. This is the single most common cause of "the location fields
    are empty".

### 3.3 Tab 2 — Progressive stack

*The integration builds itself, sub by sub, from black to the finished image.*

**Light frames** — Add files… / Add folder… / Remove / Clear.

- FITS or XISF. **At least 2** frames (`Add at least 2 light frames.`).
- Ordered by **`DATE-OBS`**, so several nights just work.
- Unreadable frames, or frames whose geometry does not match, are **skipped and
  reported** in the console — they do not abort the run.

**Rendering**

| Control | Meaning |
|---|---|
| **Screen stretch: Fixed, computed on the final stack** (default) | Two passes. The reference stretch is computed once on the *finished* stack, so the noise really does visibly drop through the video. **This is the honest one.** |
| Screen stretch: Fixed, computed on the first frame | One pass, faster. |
| Screen stretch: Auto-stretch each rendered frame | **Brightness pumps.** Only for a user who explicitly wants it. It also destroys the point of the video: auto-stretching every frame hides the very noise improvement the video is meant to show. |
| **Linked RGB channels** | Stretch the channels together rather than separately. |
| **Debayer CFA frames** | Auto-detected via `BAYERPAT`. Only applied to mono frames tagged CFA. |
| **Register subs** | StarAlignment. Corrects dithering and meridian flips. Leave it on unless the subs are already registered. |

**Colour (multi-filter)** — map filters to R / G / B.

| Palette | R | G | B |
|---|---|---|---|
| **SHO (Hubble)** | SII | Ha | OIII |
| **HOO (bicolour)** | Ha | OIII | OIII |
| **HOS** | Ha | OIII | SII |
| **RGB** | R | G | B |
| **LRGB** | R | G | B |

- The mapping is driven by the **`FILTER`** header value. "Filters detected: …"
  appears once subs are loaded; before that it says **"Load subs to detect
  filters."**
- Each channel can be overridden by hand.
- **Remove dominant green (SCNR)** caps green at the R/B neutral — the usual
  narrowband green cast.

**Final image (revealed at the end)**

- **Presentation image** — the user's finished, processed image. Cross-faded in
  and held at the end.
- **Align…** places it on the stack (§4).
- **Reveal duration (s)** — 0.3 to 10, default 2.0.

### 3.4 Shared panels

**Overlay** — *this is the honest part of the product, and it matters.*

| Item | Shows |
|---|---|
| Title | blank = the `OBJECT` header from the frames |
| Frame counter | `164 × 300 s`, and `164/164` on the right |
| Cumulative exposure | `13h40` |
| UT clock | from `DATE-OBS` |
| **Measured SNR gain (stacking)** | dB, measured on the running stack — **not** a theoretical √N. **See §7.1: this does not currently draw in colour composites.** |
| Progress bar | thin bar at the very bottom |
| Angular scale bar (zoom) | |
| Subtitle · Distance · Signature | free text |

**Video**

| Control | Values |
|---|---|
| Format | 1920×1080 (16:9) · 3840×2160 (4K) · 1080×1080 (1:1) · **1080×1920 (9:16)** |
| Framing | Fill (center crop) · Fit (letterbox) |
| FPS | 12 – 60 (default 30) |
| Animation length (s) | 3 – 120 (default 12) |
| Hold first frame (s) | 0 – 10 (default 1) |
| Hold last frame (s) | 0 – 15 (default 3) |
| Quality | CRF 16 (best) · **18 (high, default)** · 20 (balanced) · 23 (smaller file) |

**Output**

- **Folder** — mandatory (`Choose an output folder.`).
- **Keep the PNG frame sequence** — off by default.
- **ffmpeg** — see §5.

**Progress** — a live preview, a bar, **Pause** and **Cancel**. Cancelling keeps
the frames already rendered and says how many.

**New Instance** (the triangle, bottom-left) — drag it to the workspace to save
the current settings as a **process icon**, like any PixInsight script.

---

## 4. Alignment — placing the finished image

Both styles can end on the user's finished image, and it has to be placed on the
frame behind it. **Align…** opens a popup showing both images, with the reveal
draggable on top.

- **Auto** star-matches the reveal against the background using `StarAlignment`.
  It works on deep crops (a 3×3 grid of background tiles) and on **mirrored**
  images (triangle similarity), and it refuses a fit that does not pass a quality
  gate rather than returning a plausible-looking wrong one.
- **When Auto fails**, the message is:
  > *Automatic alignment found no reliable star match (starless or heavily
  > processed image?). Align manually.*

  Take it at face value: **a starless image has nothing to match**. Tell the user
  to place it by hand — Auto's job is convenience, not magic.
- The manual controls stay available either way: drag to move, scale, rotation,
  Flip H / Flip V, ±90°, **Fit** (assume the reveal covers the whole frame), and
  an **Overlay** slider that fades the reveal so the user can check the fit.

Full detail: [`reveal-alignment.md`](reveal-alignment.md).

---

## 5. ffmpeg

The script encodes with ffmpeg. It does **not** ship one.

**Detection order:** `PATH` → a previous auto-install → the usual package
managers (winget / Chocolatey / Scoop on Windows; Homebrew on Apple Silicon and
MacPorts on macOS; snap and Linuxbrew on Linux). Absolute candidates that do not
exist on disk are skipped without launching a process.

**If nothing is found**, the Output row shows **⚠️ ffmpeg not found** and offers
**Install ffmpeg…**: it downloads a static build (~50–90 MB) from the CaeloWorks
mirror and validates it by running `ffmpeg -version`. It installs to:

| OS | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\CaeloWorks\ffmpeg` |
| macOS | `~/Library/Application Support/CaeloWorks/ffmpeg` |
| Linux | `$XDG_DATA_HOME/caeloworks/ffmpeg` (or `~/.local/share/caeloworks/ffmpeg`) |

**If the install fails**, the message is explicit — check the internet
connection, or install ffmpeg by hand and point at it with **Browse**.

**If there is no ffmpeg at all**, nothing is lost: the script writes the **PNG
sequence** plus a ready-to-run **`encode.sh` / `encode.bat`** next to it. The
user runs that later and gets the same video.

---

## 6. Headless / automation

`SESSIONCINEMA_AUTORUN=/path/to/config.json` runs the engine without the dialog.
The JSON is the same key set the dialog saves.

> **Trap, and it bites:** a headless config that omits `style` now runs a **zoom**
> (1.1.0 made Zoom Odyssey the default). Set `style` explicitly in every
> automation config.

---

## 7. Known bugs and limitations — read before answering

### 7.1 The measured SNR gain does not draw in colour composites

**The checkbox is ticked, and nothing appears.** In the multi-filter colour path
the SNR inputs are hard-coded to zero, so the gain string comes out empty and is
silently dropped from the overlay. It works on the mono path only — and colour is
**on by default**.

This is the flagship "we only show measured facts" feature, so treat a report of
it as legitimate and important, not as user error. **Do not tell the user to
re-tick the box.** Confirm it, and escalate.

### 7.2 Zoom Odyssey in 9:16 ends letterboxed

Rendering a Zoom Odyssey to **1080×1920** frames the revealed image *whole*
inside the vertical frame, which leaves roughly **59 % of the frame black** with
a landscape photo — even though Framing says "Fill (center crop)". The setting is
not consulted for the zoom's final framing.

Workaround to offer: none inside the script. Either render 16:9, or accept the
bands, or re-frame the reveal outside. Escalate — the fix is known.

### 7.3 Alignments saved before 1.1.0 are reinterpreted

1.1.0 changed the **sign convention** of the stored reveal rotation. A saved
alignment from 1.0.0 or earlier — in the script's settings, in a headless JSON,
or in a **process icon** — now renders **2×θ away from the truth**, silently, with
no error.

**Symptom:** "I upgraded and my reveal is now rotated / lands in the wrong
place." **Answer:** open **Align…** and redo the alignment once (Auto is enough).
It will be correct from then on. Rotations of 0° are unaffected, which is why
most users never see it.

### 7.4 The survey bridge needs the internet

If the DSS2 download fails, the console says so and the script **falls back to
the catalog star field only** — it does not abort. The video is still produced,
it just has no real-sky photograph in the transition.

### 7.5 Sparse sky

> *Star/constellation catalogs not found in the PixInsight install — the sky will
> be sparse.*

The script draws the sky from PixInsight's own bundled catalogs. If they are
missing from the install, it says so and carries on with what it has.

---

## 8. Troubleshooting — symptom → cause → answer

| The user says | It means | Tell them |
|---|---|---|
| *"This image has no astrometric solution."* | The Zoom Odyssey input is not plate-solved | Solve it: **Script → Image Analysis → ImageSolver**, then run Session Cinema again. A **WBPP master is already solved.** |
| *"Add at least 2 light frames."* | Fewer than two subs loaded | Progressive stack needs the session, not a master. |
| *"Choose an output folder."* | Output → Folder is empty | |
| The location fields are empty / "Simulate shoot location" does nothing | **Integrated masters drop `SITELAT` / `SITELONG`** | Use **"From a sub…"** and point at a *raw* sub. This is the most common Zoom Odyssey question. |
| "Some of my frames are missing from the video" | Unreadable, or geometry mismatch | The console lists exactly which, under *"Skipped (unreadable or geometry mismatch)"*. Mixing frames of different dimensions is the usual cause. |
| "No colour, my SHO came out grey" | `FILTER` header missing or unmapped | Check "Filters detected:". If it is empty, the subs carry no `FILTER` value — map the channels by hand. |
| "The brightness pulses through the video" | Screen stretch is set to **Auto-stretch each rendered frame** | Switch to **Fixed, computed on the final stack**. That is also the only setting where the noise improvement shown is real. |
| "The SNR gain never appears" | **Known bug, §7.1** — colour composites | Confirm it. Do not blame the user. Escalate. |
| "My reveal is rotated wrong since the update" | **Known bug, §7.3** — the rotation convention changed | Redo the alignment once via **Align… → Auto**. |
| "ffmpeg failed (exit code …)" | Encoding failed after rendering | The frames and the encode script are kept. Have them run `encode.sh` / `encode.bat`, and send the exit code. |
| "The video is vertical and half black" | **Known limitation, §7.2** | |
| "PixInsight warns about an unsigned repository" | Expected — the repo is not CPD-signed yet | Safe to accept. |

---

## 9. Escalating

Collect these four things. Without them, the report is not actionable:

1. **PixInsight version** and **OS** (Help → About).
2. **Session Cinema version** — printed under the name in the dialog header.
3. **The console output of the run.** The script logs every step, every skipped
   frame, the plate solve it read, and the exact ffmpeg failure. It is almost
   always enough on its own.
4. **The style and the settings** — easiest: have the user drag the **New
   Instance** triangle to the workspace, then send the process icon, or just a
   screenshot of the window.

File issues at https://github.com/caelo-works/session-cinema/issues.
