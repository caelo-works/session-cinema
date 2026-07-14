# Session Cinema — support knowledge base

**This is written for a support agent, not for a user.** Quote it, do not
paraphrase it: the sentences here are checked, a paraphrase is not.

Applies to **1.1.0**. To check what the user is running: the version is printed
under the script's name in the top-left of its window (`v1.1.0`).

**The interface is bilingual — English and French — and the user will describe
*their* window.** A French user says *« Habillage »*, not "Overlay"; *« Brutes »*,
not "Light frames". Every label in this document is given in both languages for
that reason. If a user quotes a label you cannot find here, say so and escalate
rather than guess which control they mean.

**Never invent a figure, a path, a menu name or a compatibility claim.** This
product's entire pitch is that it only ever shows measured facts; support has to
hold the same line. If the answer is not in this document, the correct answer is
*"I don't know, I'm passing this to the team."*

- Repository and issue tracker: https://github.com/caelo-works/session-cinema
- Product page: https://pixinsight-scripts.caelo.works/en/scripts/session-cinema

---

## The product card — what Session Cinema is

Session Cinema is a **PixInsight script** that turns an imaging session into a
video: either the stack building itself sub by sub, or a zoom from the whole sky
down to the user's image.

| | |
|---|---|
| Version | 1.1.0 |
| Licence | GPL-3.0 — free and open source |
| Requires | **PixInsight 1.9.4 or newer** — Windows, macOS, Linux |
| Where it appears | **Script → CaeloWorks → Session Cinema** |
| Video encoding | ffmpeg — detected, installed in one click, or done afterwards by a generated script |

**Two styles, one window.** The window opens on the **Zoom Odyssey** tab; the
second tab is **Progressive stack** (*« Empilement progressif »*). The right-hand
half of the window — Overlay, Video, Output — is shared by both.

- **Zoom Odyssey** — "you are here". The video starts at the whole sky, falls
  through the constellation, and lands on the user's image at its true position,
  orientation and scale. It needs **one plate-solved image** and no subs at all.
- **Progressive stack** — the integration builds itself from the first sub to the
  last, in colour. It needs the session's **raw light frames**.

---

## Installation — how to install Session Cinema

Two routes. The first is the one to recommend.

### From the CaeloWorks update repository (recommended)

1. In PixInsight: **Resources → Updates → Manage Repositories**.
2. Add this URL: `https://pixinsight-scripts.caelo.works/update/`
3. **Resources → Updates → Check for Updates**, accept the install.
4. **Restart PixInsight.** The script will not appear until you do.

Updates then arrive automatically through the same channel.

### "PixInsight warns me about an unsigned repository"

**Expected, and harmless.** The CaeloWorks repository is not CPD-signed yet;
signing is underway. It is a signature on the *repository*, not a virus warning.
Tell the user it is safe to accept.

### Manual install

1. Download `SessionCinema.js` from the releases page:
   https://github.com/caelo-works/session-cinema/releases
2. In PixInsight: **Script → Feature Scripts… → Add**, and select the **folder**
   containing the file (not the file itself).
3. Alternatively, run it once with **Script → Execute Script File…**

### "I installed it and I can't find it in the menus"

It lives at **Script → CaeloWorks → Session Cinema**. Almost always one of:

- **PixInsight was not restarted** after the update. This is the number one
  cause. Have them restart.
- They are looking in the wrong place. It is under a **CaeloWorks** submenu, not
  at the top level of Script.
- They upgraded from a very old build and have a **stale Feature Scripts entry**
  pointing at a file that no longer exists. Have them open **Script → Feature
  Scripts…**, remove the old entry, and re-add it.

---

## The window, control by control

### English / French label lookup

The user will name things in their own language. This is the lookup, and the
words on the left are the **exact** strings the dialog shows.

- **Zoom Odyssey** = **Zoom Odyssey**
- **Progressive stack** = **Empilement progressif**
- **Zoom Odyssey — source images** = **Zoom Odyssey — images sources**
- **Render options** = **Options de rendu**
- **Light frames** = **Brutes**
- **Rendering** = **Rendu**
- **Colour (multi-filter)** = **Couleur (multi-filtre)**
- **Final image (revealed at the end)** = **Image finale (révélée à la fin)**
- **Overlay** = **Habillage**
- **Video** = **Vidéo**
- **Output** = **Sortie**
- **Progress** = **Progression**
- **Align…** = **Aligner…**
- **Auto** = **Auto**
- **Detect** = **Détecter**
- **Install ffmpeg…** = **Installer ffmpeg…**
- **Generate** = **Générer**

### Tab 1 — Zoom Odyssey

**Zoom Odyssey — source images** (*« Zoom Odyssey — images sources »*):

- **Solved image (WCS)** — the only mandatory input of this tab. It must be
  **plate-solved**. A **WBPP master is already solved**. If it is not solved, the
  script refuses to run and says so; the user must solve it first with
  **Script → Image Analysis → ImageSolver**.
- **Image to reveal** — optional. The finished, processed image
  (JPEG/PNG/TIFF/FITS/XISF), used **as-is**. Leave it empty and the script reveals
  the solved image itself.
- **Different crop from the solved image** — tick this when the finished image is
  *not* framed like the solved one (a crop, a rotation, a mirror). It enables the
  **Align…** button.
- **Align…** — opens the alignment window, where the finished image is placed on
  the solved one, automatically or by hand.

**Render options** (*« Options de rendu »*) — all optional:

- **Constellation names**, **Star names**, **Horizon**, **Coordinate grid**.
- **Real-sky survey bridge** — downloads genuine **DSS2** imagery so the star
  field dissolves into a real photograph of that patch of sky. **Needs an internet
  connection.** If the download fails, the script says so and carries on with the
  catalog star field only; the video is still produced.
- **Simulate shoot location** with **Lat / Lon / UTC** — opens on the sky as it
  was from the shoot site at the shoot time, with a true horizon. It reads
  `SITELAT`, `SITELONG` and `DATE-OBS` from the headers.
- **"From a sub…"** — this button exists because **integrated masters usually
  drop `SITELAT` and `SITELONG`**. Point it at a **raw** sub and it fills the three
  fields. *"My location fields are empty"* is the most common Zoom Odyssey
  question, and this is the answer.

### Tab 2 — Progressive stack

**Light frames** (*« Brutes »*) — Add files… / Add folder… / Remove / Clear.

- FITS or XISF. **At least 2 frames** are required.
- Frames are ordered by **`DATE-OBS`**, so several nights just work.
- Unreadable frames, and frames whose geometry does not match the others, are
  **skipped and listed in the console**. They do not abort the run. Mixing frames
  of different dimensions is the usual cause.

**Rendering** (*« Rendu »*):

- **Screen stretch: Fixed, computed on the final stack** — the default, and the
  honest one. Two passes: the reference stretch is computed once on the *finished*
  stack, so the noise really does visibly drop through the video.
- **Screen stretch: Fixed, computed on the first frame** — one pass, faster.
- **Screen stretch: Auto-stretch each rendered frame** — **the brightness will
  pump.** It also defeats the purpose of the video: auto-stretching every frame
  hides the very noise improvement the video exists to show. If a user complains
  the brightness pulses, this is the setting.
- **Linked RGB channels** — stretch the channels together rather than separately.
- **Debayer CFA frames** — auto-detected via the `BAYERPAT` header.
- **Register subs** — StarAlignment; corrects dithering and meridian flips. Leave
  it on unless the subs are already registered.

**Colour (multi-filter)** (*« Couleur (multi-filtre) »*) — maps filters to R/G/B
using the **`FILTER`** header value:

- **SHO (Hubble)**: SII → R, Ha → G, OIII → B
- **HOO (bicolour)**: Ha → R, OIII → G, OIII → B
- **HOS**: Ha → R, OIII → G, SII → B
- **RGB** and **LRGB**: R → R, G → G, B → B
- Each channel can be overridden by hand.
- **Remove dominant green (SCNR)** caps green at the R/B neutral — the usual
  narrowband green cast.
- If the panel says **"Load subs to detect filters."** (*« Chargez des brutes pour
  détecter les filtres. »*), no subs are loaded yet. If it stays empty **after**
  loading subs, the subs carry no `FILTER` header value and the channels must be
  mapped by hand.

**Final image (revealed at the end)** (*« Image finale (révélée à la fin) »*):

- **Presentation image** — the user's finished image, cross-faded in and held at
  the end.
- **Align…** places it on the stack.
- **Reveal duration (s)** — from 0.3 to 10, default **2.0**.

### Overlay, Video and Output — shared by both tabs

**Overlay** (*« Habillage »*) — this is the honest part of the product:

- **Title** — leave blank and it uses the `OBJECT` header from the frames.
- **Frame counter**, **Cumulative exposure**, **UT clock** (from `DATE-OBS`),
  **Progress bar**, **Angular scale bar (zoom)**.
- **Measured SNR gain (stacking)** — a noise-based gain in dB, measured on the
  running stack, never a theoretical √N. **Warning: in version 1.1.0 this does not
  draw at all when the colour composite is on, which is the default.** See the
  known-bugs section.
- **Subtitle**, **Distance**, **Signature** — free text.

**Video** (*« Vidéo »*):

- **Format**: 1920×1080 (16:9) · 3840×2160 (16:9, 4K) · 1080×1080 (1:1) ·
  1080×1920 (9:16)
- **Framing**: Fill (center crop) · Fit (letterbox)
- **FPS**: 12 to 60, default **30**
- **Animation length (s)**: 3 to 120, default **12**
- **Hold first frame (s)**: 0 to 10, default **1**
- **Hold last frame (s)**: 0 to 15, default **3**
- **Quality**: CRF 16 (best) · **18 (high, the default)** · 20 (balanced) ·
  23 (smaller file)

**Output** (*« Sortie »*):

- **Folder** — mandatory. The script refuses to run without one.
- **Keep the PNG frame sequence** — off by default.
- **ffmpeg** — see the ffmpeg section.

**Progress** (*« Progression »*) — a live preview, a bar, **Pause** and **Cancel**.
Cancelling keeps the frames already rendered and reports how many.

**New Instance** — the small triangle at the bottom-left. Dragging it to the
workspace saves the current settings as a **process icon**, like any PixInsight
script.

---

## Aligning the finished image on the stack or on the sky

Both styles can end on the user's finished image, and it must be placed on the
frame behind it — the plate-solved image (Zoom Odyssey) or the growing stack
(Progressive stack). The **Align…** button (*« Aligner… »*) opens a window showing
both images, with the finished one draggable on top and an opacity slider to check
the fit.

**Auto** star-matches the finished image against the background automatically. It
handles deep crops, and it handles **mirrored** images. It will refuse a fit it is
not sure of rather than return a plausible-looking wrong one — so when it says it
failed, it really did fail.

**When Auto gives up**, the message is:

> *Automatic alignment found no reliable star match (starless or heavily processed
> image?). Align manually.*
> *« L'alignement automatique n'a pas trouvé d'appariement d'étoiles fiable (image
> starless ou très retouchée ?). Alignez manuellement. »*

Take it at face value: **a starless image has no stars to match**. Tell the user
to place it by hand. Auto is a convenience, not magic, and there is nothing to fix.

**The manual controls** are always available, and stay available after Auto: drag
to move, **Scale**, **Rotation**, **Flip H**, **Flip V**, **+90° / −90°**, **Fit**
(assume the finished image covers the whole frame), and an **Overlay** slider that
fades it in and out so the fit can be checked.

---

## ffmpeg and video encoding

The script encodes the video with **ffmpeg**. It does not ship one.

**It looks for ffmpeg** in the system `PATH`, then in a previous auto-install, then
in the usual package managers — winget, Chocolatey and Scoop on Windows; Homebrew
and MacPorts on macOS; snap and Linuxbrew on Linux.

**If none is found**, the Output panel shows **⚠️ ffmpeg not found** and offers a
button, **Install ffmpeg…** (*« Installer ffmpeg… »*). It downloads a static build
(about 50–90 MB) from the CaeloWorks mirror, checks that it actually runs, and
keeps it. It installs to:

- **Windows**: `%LOCALAPPDATA%\CaeloWorks\ffmpeg`
- **macOS**: `~/Library/Application Support/CaeloWorks/ffmpeg`
- **Linux**: `$XDG_DATA_HOME/caeloworks/ffmpeg`, or `~/.local/share/caeloworks/ffmpeg`

**If the install fails**, the message says so and the fix is in it: check the
internet connection, or install ffmpeg by hand and point at it with **Browse**.

**If there is no ffmpeg at all, nothing is lost.** The script writes the **PNG
frame sequence** plus a ready-to-run **`encode.sh`** (or **`encode.bat`**) next to
it. The user runs that script whenever they like and gets exactly the same video.
Never tell a user that a missing ffmpeg has cost them their render.

---

## Headless automation and process icons

The settings can be saved and replayed two ways:

- **Process icon** — drag the **New Instance** triangle (bottom-left of the
  window) to the workspace. It saves the current settings like any PixInsight
  script.
- **Headless run** — set the environment variable
  `SESSIONCINEMA_AUTORUN=/path/to/config.json` and the engine runs without the
  window. The JSON uses the same keys the dialog saves.

**Trap in 1.1.0:** a headless config that does **not** specify `style` now runs a
**Zoom Odyssey**, because Zoom Odyssey became the default style. Anyone automating
a progressive stack must set `style` explicitly in the config.

Also note: an alignment saved **before** 1.1.0 — in a process icon or in a JSON —
is reinterpreted with the opposite rotation. See the known-bugs section.

---

## Error messages, word for word

The user will paste the message. Here is what each one means. English first, then
the French the same message shows in a French interface.

### Messages that stop the run

**"Add at least 2 light frames."** / *« Ajoutez au moins 2 brutes. »*
Progressive stack needs the session's subs, not a master. Fewer than two are
loaded.

**"Choose a plate-solved final image for Zoom Odyssey."** / *« Choisissez une image
finale résolue astrométriquement pour Zoom Odyssey. »*
No image selected in the **Solved image (WCS)** field.

**"Choose an output folder."** / *« Choisissez un dossier de sortie. »*
The Output → Folder field is empty.

**"This image has no astrometric solution. Solve it first (Script > Image Analysis
> ImageSolver), then run Session Cinema again."** / *« Cette image n'a pas de
solution astrométrique. Résolvez-la d'abord… »*
Zoom Odyssey needs a **plate-solved** image. A WBPP master is already solved; an
exported JPEG or a hand-processed TIFF is not. The fix is in the message.

**"Could not load the reveal image. Check the file (JPEG/PNG/TIFF/FITS/XISF)."** /
*« Impossible de charger l'image à révéler… »*
The finished image is unreadable or in an unsupported format.

### Messages that do NOT stop the run

These worry users, and most of them are not errors at all. The video is still
produced in every case below.

**"Automatic alignment found no reliable star match (starless or heavily processed
image?). Align manually."** / *« L'alignement automatique n'a pas trouvé
d'appariement d'étoiles fiable… »*
Not a bug. A starless image has nothing to match. Align by hand.

**"ffmpeg not found — the PNG sequence and an encoding script will be generated
instead."** / *« ffmpeg introuvable — la séquence PNG et un script d'encodage
seront générés. »*
Not an error. Offer the **Install ffmpeg…** button, or tell them to run the
generated `encode.sh` / `encode.bat` later.

**"ffmpeg installation failed — check your internet connection, or install it
manually and use Browse."** / *« Échec de l'installation de ffmpeg… »*
Exactly what it says.

**"ffmpeg failed (exit code N). The PNG sequence and … are left for manual
encoding."** / *« Échec ffmpeg (code N)… »*
The render succeeded and the frames are safe. Ask for the exit code and escalate.

**"Skipped (unreadable or geometry mismatch): …"** / *« Ignorées (illisibles ou
géométrie différente) : … »*
Those frames are missing from the video. The console names them. Frames of
different dimensions in the same set are the usual cause.

**"Survey download unavailable — using the catalog star field only."** /
*« Téléchargement du survey indisponible — champ d'étoiles catalogue uniquement. »*
The DSS2 download failed (no internet, or the service is down). The video is still
produced; it simply has no real-sky photograph in the transition.

**"Star/constellation catalogs not found in the PixInsight install — the sky will
be sparse."** / *« Catalogues d'étoiles/constellations introuvables… »*
The script draws the sky from PixInsight's own bundled catalogs and cannot find
them. It carries on with what it has.

**"That file has no SITELAT/SITELONG/DATE-OBS to read."** / *« Ce fichier n'a pas
de SITELAT/SITELONG/DATE-OBS à lire. »*
Shown by **"From a sub…"**. Have them pick a **raw** sub — integrated masters
usually drop those headers.

---

## Known bugs and limits — read before answering

Three real bugs are open in 1.1.0. If a user reports one of them, **confirm it**.
Do not send them back to their settings to look for a mistake they did not make.

### The measured SNR gain never appears when the image is in colour

**Symptom:** the user ticked **Measured SNR gain (stacking)** and the dB figure is
simply not in the video. The overlay shows the frame count and the cumulative
exposure, and nothing else.

**Cause:** in 1.1.0 the SNR gain is never drawn when the **colour composite** is
on — and colour is **on by default**. It only works on mono renders. Nothing warns
the user.

**This is a real bug and it is ours.** It is also the product's flagship claim
("we only show measured facts"), so treat the report as legitimate and important.
**Do not tell the user to re-tick the box.** Confirm it, apologise, and escalate.
There is no workaround other than rendering in mono.

### A vertical (9:16) Zoom Odyssey ends with big black bands

**Symptom:** "I rendered a Zoom Odyssey in 1080×1920 for Instagram/TikTok/Shorts
and the end of the video is half black."

**Cause:** in 1.1.0, the final framing of a Zoom Odyssey fits the *whole* revealed
image inside the frame, even when **Framing** is set to **Fill (center crop)**.
With a landscape image in a vertical frame, that leaves roughly **59 % of the
frame black**.

**Workaround:** none inside the script today. Either render in 16:9, or accept the
bands, or crop the video afterwards in an external editor. Escalate — the fix is
known.

### After updating to 1.1.0, a saved alignment comes out rotated wrong

**Symptom:** "I updated and now my revealed image is rotated / lands in the wrong
place. I changed nothing."

**Cause:** 1.1.0 changed the sign convention of the **stored** rotation of an
alignment. An alignment saved by 1.0.0 or earlier — in the settings, in a process
icon, or in a headless JSON — is now read with the opposite sign, and the image
lands at twice the angle away from the truth. Silently: no error, no warning.

**Answer, and it works immediately:** open **Align…** and redo the alignment once.
**Auto** is enough. From then on it is correct. Alignments with no rotation at all
are unaffected, which is why most users never see this.

### The real-sky survey bridge needs an internet connection

Not a bug, but it surprises people. If the DSS2 download fails, the script prints
*"Survey download unavailable — using the catalog star field only."* and **carries
on**. The video is produced; it just has no real photograph of the sky in the
transition. Nothing is lost, and it is worth re-running with a connection.

---

## Troubleshooting — symptom → cause → answer

**"The brightness pulses / flickers through my video."**
Screen stretch is set to **Auto-stretch each rendered frame**. Switch it to
**Fixed, computed on the final stack** — which is also the only setting where the
noise improvement shown in the video is real.

**"My location fields are empty" / "Simulate shoot location does nothing."**
Integrated masters usually drop the `SITELAT` and `SITELONG` headers. Use the
**"From a sub…"** button and point it at a **raw** sub; it fills Lat, Lon and UTC.

**"Some of my frames are missing from the video."**
They were unreadable, or their geometry did not match the others. The PixInsight
console lists exactly which ones. Frames of different dimensions in the same set
are the usual cause.

**"My SHO came out grey / no colour."**
The channel mapping is driven by the **`FILTER`** header. If the panel still says
*"Load subs to detect filters."* after loading them, the subs carry no `FILTER`
value — the channels must be mapped by hand in **Colour (multi-filter)**.

**"The SNR gain never appears."**
Known bug in 1.1.0: it is never drawn when the colour composite is on, which is the
default. Confirm it, do not blame the user, and escalate.

**"My revealed image is rotated wrong since the update."**
Known bug in 1.1.0: alignments saved by an earlier version are read with the
opposite rotation. Have them open **Align…** and redo the alignment once (**Auto**
is enough). It is correct from then on.

**"The video is vertical and half black."**
Known limit in 1.1.0: a Zoom Odyssey rendered in 9:16 fits the whole image inside
the vertical frame instead of filling it. Render in 16:9, or crop afterwards.

**"ffmpeg failed."**
The frames are safe: the script keeps the PNG sequence and an `encode.sh` /
`encode.bat` next to them. Have the user run that script. Ask for the exit code
and escalate.

**"PixInsight says the repository is unsigned."**
Expected. The CaeloWorks repository is not CPD-signed yet. It is safe to accept.

**"I installed it but I can't find it."**
It is at **Script → CaeloWorks → Session Cinema**, and **PixInsight must be
restarted** after the install.

---

## Escalation — when to stop and hand over to a human

**Escalate, and do not improvise, when:**

- the user reports one of the three known bugs above — confirm the bug, then hand
  over; do not promise a date;
- the user reports something this document does not cover. Say *"I don't know, I'm
  passing this to the team"*. A plausible-sounding guess about someone's data is
  worse than silence;
- the user's **data or files** may be at risk, or they are asking you to tell them
  to delete or overwrite something;
- anything about payment, licensing beyond "it is free and GPL-3.0", or a
  commercial commitment.

**Collect these four things before escalating.** Without them the report is not
actionable:

1. **PixInsight version** and **operating system** (Help → About).
2. **Session Cinema version** — printed under the name in the top-left of the
   window.
3. **The PixInsight console output of the run.** The script logs every step, every
   skipped frame, the plate solve it read, and the exact ffmpeg failure. It is
   almost always enough on its own.
4. **The settings used** — easiest: have the user drag the **New Instance**
   triangle to the workspace and send the process icon, or simply a screenshot of
   the window.

Bugs can also be filed directly at
https://github.com/caelo-works/session-cinema/issues
