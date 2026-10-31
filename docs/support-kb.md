# Session Cinema — support knowledge base

**This is written for a support agent, not for a user.** Quote it, do not
paraphrase it: the sentences here are checked, a paraphrase is not.

Applies to **1.3.1**. To check what the user is running: the version is printed
under the script's name in the top-left of its window (`v1.3.1`). A version
followed by `(dev)` — `v1.3.1 (dev)` — means the file did not come from a package:
it was copied by hand. That is worth knowing before anything else.

**Ask for that number early.** 1.2.0 fixed seventy-two defects, many of which a
user reports rather than notices, and several of which change what the same
symptom means. On an earlier version you confirm the bug and tell them to update;
on 1.2.0 and later the same description usually means something else.

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
| Version | 1.3.1 |
| Licence | GPL-3.0 — free and open source |
| Requires | **PixInsight 1.9.4 to 1.9.99** — Windows, macOS, Linux |
| Also uses | **AnnotateImage**'s constellation data files, which ship with PixInsight |
| Where it appears | **Script → CaeloWorks → Session Cinema** |
| Video encoding | ffmpeg the user installed — detected, or done afterwards by a generated script |
| Code signature | Signed by CaeloWorks (Certified PixInsight Developer); runs with unsigned scripts disallowed |

### Privacy: what leaves the machine, and what the video reveals about the site

Three channels, and a user who posts a process icon or publishes a video should
know about them.

**The process icon does not carry the site.** `observerLat`, `observerLong` and
the shoot date are read from the headers without being asked for, and they stay
**local**: they are in the settings file and deliberately not in an exported
icon, which is made to be handed to someone else. Everything else about the
recipe — style, cadence, format, palette, overlays, paths — does travel. Up to
1.1.1 the coordinates travelled too, to four decimals, about eleven metres.

**The video does reveal the site when the location option is on.** That is the
feature: the opening frame draws the horizon, the cardinal points and the
target's altitude, next to the `DATE-OBS` in the overlay. Altitude, azimuth and
time together determine latitude and longitude. Anyone publishing a video who
does not want their site inferred should untick **Simulate the shoot location**.

**The real-sky bridge makes outbound requests.** With the survey bridge on, the
target's right ascension, declination and field of view are sent to the CDS
hips2fits service (`alasky.cds.unistra.fr`), over HTTPS, twice per generation. It
is the **only** network connection the product makes — since 1.3.0 nothing else
is ever downloaded — and the checkbox's tooltip says so. Untick the bridge and
there is none.

### Credits: the sky survey imagery in the video, and how to acknowledge it

Session Cinema redistributes no third-party data — the star and constellation
catalogues are read from the user's own PixInsight at run time — but the Zoom
Odyssey **paints real-sky imagery into the video** when the survey bridge is on.
A short credit is drawn on screen while that imagery is visible, naming the
survey, STScI and CDS. It is not the signature field and cannot be edited.

If a user asks what to write when they publish, give them these two, verbatim.
They are the providers' own wording and must not be reworded:

- *This research made use of hips2fits, a service provided by CDS.*
- *The Digitized Sky Surveys were produced at the Space Telescope Science
  Institute under U.S. Government grant NAG W-2166. The images of these surveys
  are based on photographic data obtained using the Oschin Schmidt Telescope on
  Palomar Mountain and the UK Schmidt Telescope.*

If they untick the survey bridge, the video contains no third-party imagery and
neither line applies.

**"Where are the constellations?"** — the figures, borders and labels come from
the **AnnotateImage** script's data files. Those ship with PixInsight; if they
cannot be found the run says so by name in the console and continues with named
stars only.

**The introductory line follows the tab.** It used to describe the frame list on
a tab that has none — Zoom Odyssey opens first and offers a single solved image.
If a user says they cannot find the *Add* button, they are on the zoom tab.

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

### "PixInsight says the script is unsigned" or "unsigned repository"

**Not expected.** Since 1.3.1 the script itself is signed by CaeloWorks, and the
CaeloWorks update repository is signed too. Session Cinema runs with
**Allow execution of unsigned scripts** turned off. A warning usually means one of
three things: a version older than 1.3.1 (ask for the version), a copy whose
`SessionCinema.js` was edited (any change to the code voids the signature), or a
manual install where `SessionCinema.xsgn` was not kept next to the script. Ask for
the version, the install route and a screenshot of the warning, and escalate if
none of those explains it.

### Manual install

1. Download `SessionCinema-<version>.zip` from the releases page:
   https://github.com/caelo-works/session-cinema/releases
2. Unzip it anywhere. The script is in `src/scripts/CaeloWorks/SessionCinema/`,
   with `SessionCinema.xsgn` (its signature) and `SessionCinema.svg` (the emblem
   the dialog header looks for). Keep the three files together: without the
   `.xsgn` PixInsight treats the script as unsigned.
3. In PixInsight: **Script → Feature Scripts… → Add**, and select **that folder**
   (not a file itself).

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
- **Delete this copy…** = **Supprimer cette copie…**
- **Clear caches…** = **Vider les caches…**
- **Generate** = **Générer**
- **Colour composite — map filters to R / G / B** = **Composite couleur — associer les filtres à R / V / B**
- **Screen stretch:** = **Étirement d'affichage :**
- **Overlay:** = **Superposition :**
- **Flip H** = **Miroir H**
- **Flip V** = **Miroir V**
- **Fit** = **Ajuster**
- **Register subs (corrects dithering + meridian flip)** = **Recaler les brutes (corrige le dithering et le retournement au méridien)**
- **Debayer CFA frames (auto-detected via BAYERPAT)** = **Dématriçage des brutes CFA (détection via BAYERPAT)**
- **Keep the BMP frame sequence** = **Conserver la séquence BMP**
- **Different crop from the solved image** = **Cadrage différent de l'image résolue**
- **Simulate shoot location** = **Simuler le lieu de prise de vue**
- **Real-sky survey bridge** = **Pont vers le relevé réel du ciel**

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
- **Debayer CFA frames** — auto-detected via the `BAYERPAT` header. With
  **Register subs** on, the debayering happens **before** registration: the subs
  are debayered into the registration cache and StarAlignment aligns colour
  images. An OSC session therefore comes out in colour whether registration is on
  or off. (Up to 1.1.1 it did not: a registered OSC session rendered as a raw
  Bayer mosaic, grey from end to end, with nothing said. If a user reports a grey
  or oddly cross-hatched video from a colour camera, ask for their version.)
- **Register subs** — StarAlignment; corrects dithering and meridian flips. Leave
  it on unless the subs are already registered.

**Colour (multi-filter)** (*« Couleur (multi-filtre) »*) — maps filters to R/G/B
using the **`FILTER`** header value:

- **SHO (Hubble)**: SII → R, Ha → G, OIII → B
- **HOO (bicolour)**: Ha → R, OIII → G, OIII → B
- **HOS**: Ha → R, OIII → G, SII → B
- **RGB**: R → R, G → G, B → B. There is no LRGB entry: it was an exact alias of
  RGB, so luminance subs were listed among the filters and fed no channel. A
  config saved with LRGB opens as RGB and renders exactly as it did before.
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

### Overlay — shared by both tabs

**Overlay** (*« Habillage »*) — this is the honest part of the product:

- **Title** — leave blank and it uses the `OBJECT` header from the frames.
- **Frame counter**, **Cumulative exposure**, **UT clock** (from `DATE-OBS`),
  **Progress bar**, **Angular scale bar (zoom)**.
- **Measured SNR gain (stacking)** — a noise-based gain in dB, measured on the
  running stack, never a theoretical √N. In mono and in colour alike since 1.1.1;
  **in 1.1.0 it did not draw at all in colour, which is the default.** When the measurement itself fails, 1.1.1 writes `SNR —`
  rather than dropping the figure.
- **Subtitle**, **Distance**, **Signature** — free text.

### Video and Output — shared by both tabs

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
- **Keep the BMP frame sequence** — off by default. A kept sequence is large:
  each 1920x1080 frame is about 6 MB, so a 900-frame render leaves roughly
  5.5 GB next to the video.

**Disk.** Every run ends with a line saying what Session Cinema is holding: the
registered subs and the survey cutouts, both under the system temp directory, plus
the frame sequence if it was kept. On a season that reaches tens of GB. Nothing is
deleted automatically — the registration cache is what makes a re-run fast — so
the line names the directory and the user decides. The same figures are in the
result window and in the headless result file, under `disk`.

Exactly what lives under the system temp directory (`%TEMP%` on Windows,
usually `/tmp` or `$TMPDIR` elsewhere):

- `sc-reg/` — registered subs and their stretch cache;
- `sc-hips-*.jpg` — survey cutouts;
- `sc-autoalign-*.png` — images written while **Auto** aligns a reveal.

**Clear caches…** (*« Vider les caches… »*), next to **Keep the BMP frame
sequence**, deletes those three after a confirmation that shows the size. It is
always safe: the next render rebuilds what it needs, only more slowly. It never
touches the output folder.

**"Why did my render take so long?"** The console prints a per-phase breakdown at
the end of every run (`PERF stack mono`, `PERF stack colour`, `PERF zoom`),
in milliseconds per rendered frame. In practice the answer is almost always the
**measured SNR** overlay: it costs a noise estimation per channel per rendered
frame, and on a large sensor that is most of the render. Measured on six
3000x3000 subs: 13 465 ms of noise against 599 ms of compositing. Unticking it
does not make the video less honest — it removes a figure rather than inventing
one.
- **ffmpeg** — see the ffmpeg section.

### Progress, disk and the New Instance icon

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

### The alignment window

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

### ffmpeg: the user installs it, the script finds it

**Since 1.3.0 the script never downloads ffmpeg.** The **Install ffmpeg…** button
of earlier versions is gone: PixInsight's developer rules forbid a script from
downloading and running a program outside PixInsight's own update system. If a
user asks where the button went, that is the answer — it is not a bug.

**How a user gets ffmpeg:** they install it themselves — `winget install ffmpeg`
on Windows, `brew install ffmpeg` on macOS, their package manager on Linux, or a
build from ffmpeg.org — then click **Detect** or point at it with **Browse**.

**Where it is looked for:** every directory of the system `PATH`, then the usual
package managers — winget,
Chocolatey and Scoop on Windows; Homebrew and MacPorts on macOS; snap and
Linuxbrew on Linux. Looking only checks that the file exists. **Nothing is run
until the user has chosen it**: when one is found at start-up, the panel shows
**⚠️ ffmpeg found, not selected** and asks them to click **Detect**. Detect (or
Browse) then runs `ffmpeg -version` once to check it is ffmpeg, and remembers the
path. A file that does not answer as ffmpeg is refused with
**"… does not answer as ffmpeg (ffmpeg -version). Choose another file."**

**The ffmpeg that 1.1.0 to 1.2.1 installed is no longer used** — see
*Upgrading from 1.2.x or earlier: the old ffmpeg copy*.

**If there is no ffmpeg at all, nothing is lost.** The script writes the **BMP
frame sequence** plus a ready-to-run **`encode.sh`** (or **`encode.bat`**) next to
it. The user runs that script whenever they like and gets exactly the same video.
On macOS and Linux the script is not made executable: the message gives the
command, `sh "…/encode.sh"`.
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
is reinterpreted with the opposite rotation. See *"My revealed image is rotated wrong since the update"* under Troubleshooting. Since
1.1.1 a config carries `cfgVersion`, the build that wrote it, and a rotation that
arrives without one is flagged rather than trusted: the warning appears in the
console and, for a headless run, in the `warnings` field of
`sessioncinema-result.json`. Someone hand-writing a config can set
`"cfgVersion": "1.1.1"` to declare the rotation is in the current convention.

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
**Except on 1.2.0 under PixInsight 1.9.5**: there it is raised on images that *are*
solved — see *Fixed in 1.2.1* below.

**"Could not load the reveal image. Check the file (JPEG/PNG/TIFF/FITS/XISF)."** /
*« Impossible de charger l'image à révéler… »*
The finished image is unreadable or in an unsupported format. This one is raised
**before the render starts**. Do not confuse it with the next entry, which looks
like it and comes from a different place.

**"Could not load the solved or reveal image for alignment."** / *« Impossible de
charger l'image résolue ou l'image à révéler pour l'alignement. »*
Raised by the **Align…** button, not by Generate — so the user was setting the
placement up, not rendering. Either of the two images failed to open. Same causes
as above; ask which button they pressed to tell the two apart.

**"Generation failed: …"** / *« Échec de la génération : … »*
The catch-all. It carries a JavaScript exception message after the colon, which is
the only useful part — **always ask for the whole line**, and for the console
output with it. Anything else that stops a run has its own message above; if this
one appears, it is not a case anybody anticipated. Collect and escalate.

**"No network: the sky survey bridge is switched off for this run. The video
renders from the star catalogue instead."** / *« Pas de réseau : le pont vers le
relevé du ciel est coupé pour ce rendu… »*
Not an error. The machine could not resolve or reach the survey service, so the
run stops asking rather than spending two minutes on timeouts. The video is
produced from the bright-star catalogue.

### Messages that do NOT stop the run

These worry users, and most of them are not errors at all. The video is still
produced in every case below.

**"Automatic alignment found no reliable star match (starless or heavily processed
image?). Align manually."** / *« L'alignement automatique n'a pas trouvé
d'appariement d'étoiles fiable… »*
Not a bug. A starless image has nothing to match. Align by hand.

**"ffmpeg not found. Install it yourself …"** / *« ffmpeg introuvable.
Installez-le vous-même … »*
Not an error. The message carries the install commands. Tell them to install
ffmpeg, then click **Detect** — or to run the generated `encode.sh` /
`encode.bat` later.

**"ffmpeg is installed at …. Click Detect to use it …"** / *« ffmpeg est installé
dans …. Cliquez sur Détecter pour l'utiliser … »*
Not an error. One was found on disk; the script waits for the user to choose it
before running it. One click on **Detect**.

**"ffmpeg failed (exit code N). The BMP sequence and … are left for manual
encoding."** / *« Échec ffmpeg (code N)… »*
The render succeeded and the frames are safe. Ask for the exit code and escalate.

**"Skipped (unreadable or geometry mismatch): …"** / *« Ignorées (illisibles ou
géométrie différente) : … »*
Those frames are missing from the video. The console names them. Frames of
different dimensions in the same set are the usual cause.

**"Survey download unavailable — using the catalog star field only."** /
*« Téléchargement du relevé indisponible — champ d'étoiles catalogue uniquement. »*
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

**"⚠ This alignment (rotation N°) was saved by an earlier version, which stored
rotations the other way round. Check it, or redo it with Align… — one click on
Auto is enough."** / *« ⚠ Cet alignement (rotation N°) a été enregistré par une
version antérieure… »*
New in 1.1.1, shown in the window next to the alignment it concerns, with the same
warning in the console. **It is not an error and the render is not blocked.** It
means the script found a saved rotation it cannot date: versions up to 1.0.0 stored
the opposite sign, and nothing in the saved value says which one it is. The script
does not guess — guessing would silently break the alignments that *are* correct.
**Answer:** redo the alignment once (**Align… → Auto**) and the notice is gone for
good. If they close the window without doing it, it comes back next time, on
purpose. A rotation of exactly 0° never triggers it.

---

## Known bugs and limits — read before answering

**No bug is open in 1.3.0.** Entries are kept for one version back, because users
who have not updated still hit them and because the symptoms identify the version
from the description alone. An entry leaves this list when its version is two
releases behind.

**So: get the version first.** On the version named in the heading, confirm the
bug — it is ours, the user did nothing wrong — and tell them to update. On the current version,
the same description means something else and belongs in escalation, not here.

### Fixed in 1.2.1 — "it says my image is not solved, and it is"

**Symptom:** Zoom Odyssey stops with **"This image has no astrometric solution…"**
on an image the user solved — typically a WBPP master, or an image they just ran
ImageSolver on.

**On 1.2.0 with PixInsight 1.9.5:** real bug. PixInsight 1.9.5 stores the solution
in a new standard format that 1.2.0 did not read. Confirm it and tell them to
update; there is no workaround on 1.2.0 under 1.9.5. Under PixInsight 1.9.4, 1.2.0
is not affected.

**On 1.2.1:** both formats are read. The message now means the image really has no
solution.

### Fixed in 1.2.0 — the ones a user is most likely to describe

These were all open up to and including 1.1.1. If the user is on 1.1.1 or earlier,
any of these descriptions is confirmation, not a mystery — tell them to update.

- **"My video has frames that are not from tonight."** / **"It says 180 frames and
  the video is much longer."** Frames of an earlier render into the same folder
  were encoded with the new ones.
- **"I regenerated and got the old video."** Regenerating into a folder that
  already held a render reported the previous file as the new one.
- **"My colour camera came out grey."** / **"The video looks cross-hatched."** A
  registered OSC or DSLR session lost its debayering and rendered as a raw Bayer
  mosaic, end to end.
- **"Two nights of mine got mixed up."** Subs whose file names matched across
  folders shared a registration cache entry.
- **"The presentation image never appears."** On any session that is not a
  multi-filter composite — every OSC night, every single-filter night — the end
  reveal was never rendered at all. And on a colour composite it was dropped
  whenever the last sub of the night fed no channel, which an SHO night pulled in
  HOO does every time.
- **"Half my subs are missing from the count."** Two spellings of the same filter,
  `Ha` and `HA`, counted as two filters and only one could feed a channel.
- **"The counter and the exposure contradict each other."** The overlay printed
  the sub's position in the list rather than the number actually composited:
  `200 × 120 s` next to `4h00`.
- **"The scale bar is wrong."** It was sized with a linear law under a
  stereographic projection — on a 9:16 export a bar labelled 30° spanned 10°.
- **"It said 200 frames and rendered 66."** The estimate ignored the colour
  cadence, and counted the end reveal in neither mode.
- **"The progress went over 100 %."** It read `Render 201 / 60 (reveal)` at 335 %.
- **"It just says nothing was rendered."** Every engine failure collapsed into
  those four words while the explanation went to the console behind the dialog.
- **"Choosing (none) for a channel does nothing."** The palette refilled it.
- **"My new final image is upside down."** A newly chosen presentation image
  inherited the rotation and the mirrors of the previous one.
- **"The zoom ends on the wrong bit of sky."** Ticking *Different crop from the
  solved image* without opening **Align…** put the reveal a full degree off
  target. That combination is refused now, with the reason.



### Upgrading from 1.2.x or earlier: the old ffmpeg copy

Versions 1.1.0 to 1.2.1 could install ffmpeg in one click, downloaded into:

- **Windows**: `%LOCALAPPDATA%\CaeloWorks\ffmpeg\ffmpeg.exe`
- **macOS**: `~/Library/Application Support/CaeloWorks/ffmpeg/ffmpeg`
- **Linux**: `$XDG_DATA_HOME/caeloworks/ffmpeg/ffmpeg`, by default
  `~/.local/share/caeloworks/ffmpeg/ffmpeg`

**Since 1.3.1 that copy is never run and no longer offered**, even when the
settings, the `PATH` or a file picked with **Browse** point at it: it was
downloaded outside PixInsight's update system, which PixInsight's developer rules
forbid. This is deliberate, not a bug. A path saved by 1.2.x that pointed at it is
forgotten.

While the copy is still on disk, the ffmpeg panel of the **Output** group says:
**"Old ffmpeg copy, no longer used: …"** / *« Ancienne copie de ffmpeg, plus
utilisée : … »* with a button **Delete this copy…** / *« Supprimer cette
copie… »*. After a confirmation it deletes that one file, then its folder if
nothing else is left in it — nothing else, and never without the click. If the
user browses to that file: **"… is the copy Session Cinema 1.2.x or earlier
downloaded."** / *« … est la copie téléchargée par Session Cinema 1.2.x ou
antérieur. »*

What to tell them: install ffmpeg yourself (`winget install ffmpeg`,
`brew install ffmpeg`, your package manager, or ffmpeg.org), click **Detect** or
**Browse**, then delete the old copy with the button. Keeping it is harmless if
another program uses it. If deleting fails, they can delete the folder by hand.

### Changed in 1.3.0 — "where is the Install ffmpeg button?"

Not a bug. It was removed on purpose: PixInsight's developer rules (CPD Program
Rules v1.0) forbid a script from downloading and running a program outside
PixInsight's own update system. The user installs ffmpeg themselves and clicks
**Detect** — the full answer is in *ffmpeg: the user installs it, the script
finds it*. Since 1.3.1, the ffmpeg an earlier version installed is no longer
used either: see *Upgrading from 1.2.x or earlier: the old ffmpeg copy*.

Also new in 1.3.0, so a user may ask: the panel can say **⚠️ ffmpeg found, not
selected** at start-up. One click on **Detect**. The script no longer runs any
program the user has not chosen.

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

### Troubleshooting — frames, colour and the SNR figure

**"Some of my frames are missing from the video."**
They were unreadable, or their geometry did not match the others. The PixInsight
console lists exactly which ones. Frames of different dimensions in the same set
are the usual cause.

**"My SHO came out grey / no colour."**
The channel mapping is driven by the **`FILTER`** header. If the panel still says
*"Load subs to detect filters."* after loading them, the subs carry no `FILTER`
value — the channels must be mapped by hand in **Colour (multi-filter)**.

**"The SNR gain never appears."**
Ask for the version. **1.1.0:** known bug, never drawn on a colour composite, which
is the default — confirm it and tell them to update. **1.1.1:** the box is
unticked. If it shows **`SNR —`**, the measurement failed: escalate with the
console output.

### Troubleshooting — the reveal, the video and the encode

**"My revealed image is rotated wrong since the update."**
Alignments saved before 1.1.0 are read with the opposite rotation, on every
version. Have them open **Align…** and redo the alignment once (**Auto** is
enough). It is correct from then on. On 1.1.1 the script flags this itself with a
⚠ notice.

**"The video is vertical and half black."**
Ask for the version. **1.1.0:** known bug, a 9:16 Zoom Odyssey fits the whole image
inside the frame instead of filling it — render in 16:9, crop afterwards, or
update. **1.1.1:** check **Framing** — **Fit (letterbox)** keeps the bands by
design; **Fill (center crop)** is the one that fills the frame.

**"Encoding cancelled."**
Cancel now reaches the encoder. No partial `.mp4` is left behind — the video is
written under a temporary name and only moved into place once ffmpeg says it is
done, so a file with the final name is always a complete video.

**"ffmpeg failed."**
The frames are safe: the script keeps the BMP sequence and an `encode.sh` /
`encode.bat` next to them. Have the user run that script. Ask for the exit code
and escalate.

**"PixInsight says the script or the repository is unsigned."**
Not expected from 1.3.1 on: both the script and the CaeloWorks repository are
signed. Ask for the version (older than 1.3.1 is unsigned), whether the script was
edited or installed by hand without `SessionCinema.xsgn`, a screenshot of the
warning and the repository URL they added, then escalate.

**"Session Cinema no longer uses my ffmpeg" after updating from 1.2.x.**
Expected if it was the copy the one-click install downloaded. See *Upgrading from
1.2.x or earlier: the old ffmpeg copy*.

**"I installed it but I can't find it."**
It is at **Script → CaeloWorks → Session Cinema**, and **PixInsight must be
restarted** after the install.

---

## Escalation — when to stop and hand over to a human

**Escalate, and do not improvise, when:**

- the user is on **1.1.0** and reports one of its three known bugs — confirm the
  bug, tell them to update, then hand over; do not promise a date;
- the user is on **1.1.1** and reports one of those same symptoms anyway. That is
  a new fact, not a known bug, and it needs the console output;
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
