/*
 * SessionCinema.js — entry point.
 *
 * Session Cinema turns one or more nights of raw light frames into videos:
 * a "watch your stack build itself" progressive-integration movie (mono or a
 * multi-filter colour composite), with sober, honest overlays (frame count,
 * cumulative exposure, measured SNR gain) ready for sharing.
 *
 * Copyright (C) 2026 CaeloWorks
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See <https://www.gnu.org/licenses/gpl-3.0>.
 */

/* beautify ignore:start */

#engine v8

#feature-id    SessionCinema : CaeloWorks > Session Cinema
#feature-icon  @script_icons_dir/SessionCinema.svg
#feature-info  Turn a night of raw subs into a progressive live-stacking video \
               (mono or multi-filter colour) with sober scientific overlays \
               (frame count, cumulative exposure, measured SNR gain).

#define SC_VERSION "1.1.1"
#define SC_TITLE   "Session Cinema"

// Stamped by scripts/build-update-package.sh at packaging time.
#define SESSIONCINEMA_BUILD "__BUILD__"

/* beautify ignore:end */

// TextAlign is not injected as a runtime global under #engine v8 (pjsr headers
// do not load). Define it from the official flag values so label alignment works.
if ( typeof TextAlign == "undefined" )
   TextAlign = { Left: 0x01, Right: 0x02, HorzCenter: 0x04, Justify: 0x08,
                 Top: 0x20, Bottom: 0x40, VertCenter: 0x80,
                 Center: 0x84, Default: 0x21, Unknown: 0x00 };

// ============================================================================
// Version gate — fail with a clear message instead of a cryptic v8 error.
// ============================================================================

function ensureMinimumVersion( maj, min, rel )
{
   var ok = ( CoreApplication.versionMajor > maj ) ||
            ( CoreApplication.versionMajor == maj && ( CoreApplication.versionMinor > min ||
              ( CoreApplication.versionMinor == min && CoreApplication.versionRelease >= rel ) ) );
   if ( !ok )
      throw new Error( SC_TITLE + " requires PixInsight " + maj + "." + min + "." + rel +
                       " or newer (this is " + CoreApplication.versionMajor + "." +
                       CoreApplication.versionMinor + "." + CoreApplication.versionRelease + ")." );
}

// ============================================================================
// STYLES AND DEFAULT CONFIGURATION
// ============================================================================

var STYLE_STACKING  = 1;   // cumulative mean integration, 1..N subs
var STYLE_ZOOM      = 2;   // "you are here": whole sky -> constellation -> image

// Progressive-stack brightness ramp: the balanced, stretched composite is dimmed
// by one global factor (total_subs_so_far / total_subs)^gamma, so the light
// visibly grows — dark at the start, exactly the optimal stretch on the final
// frame — while the SHO colour stays balanced throughout. Applied AFTER the
// per-channel stretch (dimming the linear signal would clip the faint channels
// below their black point and green-dominate the buildup). gamma < 1 brightens
// earlier than a linear ramp (gamma = 1).
var STACK_RAMP_GAMMA = 0.5;

// Default duration (s) of the end reveal (cross-fade from the final stack to the
// aligned presentation image while zooming it to fill the frame); overridable
// per run via cfg.stackRevealSec.
var STACK_REVEAL_SEC = 2.0;

var STRETCH_REF_FINAL = 0; // fixed stretch computed on the final stack (2 passes)
var STRETCH_REF_FIRST = 1; // fixed stretch computed on the first frame (1 pass)
var STRETCH_REF_EACH  = 2; // auto-stretch recomputed on every rendered frame

var FIT_CROP = 0;          // fill the output frame, crop the excess (social-ready)
var FIT_LETTERBOX = 1;     // fit entirely, black bars if aspect differs

var OUTPUT_FORMATS = [
   { label: "1920 × 1080  (16:9)", w: 1920, h: 1080 },
   { label: "3840 × 2160  (16:9, 4K)", w: 3840, h: 2160 },
   { label: "1080 × 1080  (1:1)", w: 1080, h: 1080 },
   { label: "1080 × 1920  (9:16)", w: 1080, h: 1920 }
];

var CRF_CHOICES = [ 16, 18, 20, 23 ];

var DEFAULT_CONFIG = {
   // Build that wrote this config. Empty means "written before 1.1.1, or written
   // by 1.1.1+ while a saved reveal rotation was still waiting to be checked" —
   // see rotationNeedsCheck(): 1.1.0 flipped the sign convention of the stored
   // rotation and nothing recorded which convention a given number belongs to.
   cfgVersion:      "",
   language:        "en",
   style:           STYLE_ZOOM,   // headless configs should set style explicitly
   stretchRef:      STRETCH_REF_FINAL,
   stretchLinked:   false,
   debayer:         true,        // auto: only applied to mono frames tagged CFA
   formatIndex:     0,
   fitMode:         FIT_CROP,
   fps:             30,
   targetDuration:  12,          // seconds of animation for stacking mode
   holdFirst:       1,           // seconds, freeze on first frame
   holdLast:        3,           // seconds, freeze on final result
   crfIndex:        1,
   ovTitle:         "",
   ovShowCounter:   true,
   ovShowExposure:  true,
   ovShowTime:      true,        // UT clock of the current sub, from DATE-OBS
   ovShowSnr:       true,        // stacking: measured noise-based SNR gain
   ovShowBar:       true,
   ovSignature:     "",
   outputDir:       "",
   keepFrames:      false,
   ffmpegPath:      "",
   // Multi-filter colour + registration (progressive stack)
   alignEnabled:    true,        // register subs (StarAlignment): dithering + meridian flip
   colorEnabled:    true,        // combine filters into an RGB composite (else mono)
   palette:         "SHO",       // preset id resolving the filter→channel mapping
   chR:             "",          // FILTER value feeding the Red channel ("" = from
   chG:             "",          //  … Green                              palette,
   chB:             "",          //  … Blue                               CH_NONE = leave empty)
   removeGreen:     false,       // SCNR: cap green at the R/B neutral (kills the green cast)
   // Presentation image revealed at the end of the stack (aligned onto the stack)
   stackRevealPath: "",          // finished image (JPEG/TIFF/…); "" = no reveal
   stackRevealOffX: 0,           // reveal→stack alignment: centre offset X (stack px)
   stackRevealOffY: 0,           //  … Y
   stackRevealScale: 1.0,        //  … reveal-pixel to stack-pixel scale
   stackRevealRot:  0,           //  … rotation (deg)
   stackRevealFlipH: false,      //  … horizontal flip
   stackRevealFlipV: false,      //  … vertical flip
   stackRevealAligned: false,    // the placement above was actually aligned (see
                                 //   revealAligned) — NOT inferred from a scale
   stackRevealFor:  "",          // key of the reference sub it was aligned against
   stackRevealSec:  2.0,         // reveal cross-fade + zoom-to-fill duration (s)
   // Zoom Odyssey
   zoomImagePath:   "",          // plate-solved image (provides the WCS)
   zoomRevealPath:  "",          // image inserted in the video (jpg/png/tiff/…);
                                 // empty = reveal the solved image itself
   zoomRevealCropped: false,     // reveal image has a different crop than solved
   zoomRevealOffX:  0,           // reveal→solved alignment: offset X (solved px)
   zoomRevealOffY:  0,           //  … offset Y (solved px)
   zoomRevealScale: 1.0,         //  … reveal-pixel to solved-pixel scale
   zoomRevealRot:   0,           //  … rotation (deg)
   zoomRevealFlipH: false,       //  … horizontal flip
   zoomRevealFlipV: false,       //  … vertical flip
   zoomRevealAligned: false,     // the placement above was actually aligned
   zoomStartFov:    180,         // whole-sky field of view (deg) at t=0
   ovShowScale:     true,        // angular scale bar
   ovSubtitle:      "",          // free subtitle, e.g. the constellation name
   ovDistance:      "",          // free distance label, e.g. "5000 ly"
   ovConstNames:    true,        // draw constellation names
   ovStarNames:     true,        // draw the brightest named stars in the field
   ovShowHorizon:   true,        // artificial horizon for scale at wide fields
   ovShowGrid:      true,        // equatorial coordinate grid at wide fields
   locationEnabled: true,        // simulate the shoot location (real alt-az opening)
   observerLat:     999,         // observer latitude (deg); 999 = read from headers
   observerLong:    999,         // observer longitude east (deg); 999 = from headers
   observerDateUtc: "",          // shoot time (ISO UTC); "" = read DATE-OBS
   hipsEnabled:     true,        // bridge star field -> photo with a real survey image
   hipsSurvey:      "CDS/P/DSS2/color"  // Aladin/CDS hips2fits HiPS id
};

var SETTINGS_KEY = "SessionCinema/config";

// ============================================================================
// LOCALIZATION
// ============================================================================
//
// All user-visible strings live in the STRINGS table. English is the
// reference language and the fallback when a key is missing. tr("key", a, b)
// replaces %1, %2, ... with the extra arguments.

var gLanguage = "en";

// Reveal alignments loaded with a rotation whose convention cannot be known
// (see rotationNeedsCheck). Runtime only — never persisted; what IS persisted is
// the absence of a version stamp, so the doubt survives a restart.
var gRotPending = { zoom: false, stack: false, any: false };

var STRINGS = {

   en: {
      "help": "Add the raw light frames of one or more sessions (FITS or XISF), pick a style, " +
              "then generate a frame sequence and its video. Overlays only show measured facts: " +
              "frame count, cumulative exposure, noise-based SNR gain.",

      "frames.title":      "Light frames",
      "frames.addFiles":   "Add files…",
      "frames.addFolder":  "Add folder…",
      "frames.remove":     "Remove",
      "frames.clear":      "Clear",
      "frames.col.num":    "#",
      "frames.col.name":   "File",
      "frames.col.date":   "DATE-OBS",
      "frames.col.exp":    "Exp. (s)",
      "frames.summary":    "%1 frame(s) — total exposure %2",
      "frames.summary.none": "No frames loaded.",
      "frames.scanning":   "Reading headers… %1 / %2",

      "style.title":       "Style",
      "tab.sequence":      "Progressive stack",
      "tab.zoom":          "Zoom Odyssey",
      "tagline.stacking":  "Watch your stack build itself, from 1 to N subs.",
      "tagline.zoom":      "You are here — from the whole sky down to your image.",
      "stretch.groupTitle": "Rendering",
      "seq.colorGroup":    "Colour (multi-filter)",
      "seq.align":         "Register subs (corrects dithering + meridian flip)",
      "seq.color":         "Colour composite — map filters to R / G / B",
      "seq.removeGreen":   "Remove dominant green (SCNR)",
      "seq.palette":       "Palette:",
      "seq.chNone":        "(none)",
      "seq.chR":           "R ←",
      "seq.chG":           "G ←",
      "seq.chB":           "B ←",
      "seq.filtersFound":  "Filters detected: %1",
      "seq.noFilters":     "Load subs to detect filters.",
      "seq.revealGroup":   "Final image (revealed at the end)",
      "seq.reveal":        "Presentation image:",
      "seq.revealHint":    "Your finished, processed image — cross-faded in and held at the end. Align it onto the stack so the switch is seamless.",
      "seq.revealDur":     "Reveal duration (s):",
      "style.stacking":    "Progressive stack — watch the integration build from 1 to N subs",
      "style.stackNote":   "Raw subs are registered automatically (dithering + meridian flip). " +
                           "With several filters, map them to R/G/B for a colour composite.",
      "style.zoom":        "Zoom Odyssey — \"you are here\": whole sky → constellation → your image reveals itself",
      "style.zoomNote":    "Needs one plate-solved image (a WBPP master is already solved). " +
                           "Its embedded WCS drives the zoom; the sky is drawn from PixInsight's bundled catalogs.",
      "zoom.image":        "Solved image (WCS):",
      "zoom.inputTitle":   "Zoom Odyssey — source images",
      "zoom.renderTitle":  "Render options",
      "zoom.imageHint":    "A plate-solved image providing the coordinates — a WBPP master is already solved. Otherwise solve it first with Script > Image Analysis > ImageSolver.",
      "zoom.revealImage":  "Image to reveal:",
      "zoom.revealHint":   "Optional — the finished image inserted in the video (JPEG/PNG/TIFF/FITS/XISF), used as-is. Leave empty to reveal the solved image itself. Assumes the same framing as the solved image.",
      "zoom.revealFilter": "Images (JPEG/PNG/TIFF/FITS/XISF)",
      "zoom.revealClear":  "Clear",
      "zoom.cropped":      "Different crop from the solved image",
      "zoom.align":        "Align…",
      "align.title":       "Align the reveal image on the solved image",
      "align.help":        "Drag the reveal to position it; scale/rotate/flip it to match the solved image behind. Mouse wheel zooms the view. The overlay slider fades the reveal to check the fit. Resize this window as needed.",
      "align.resetView":   "Reset",
      "align.resetViewHint": "Reset the view zoom and pan.",
      "align.move":        "Move",
      "align.pan":         "Pan",
      "align.panHint":     "Toggle what left-drag does: move the reveal, or pan the zoomed view.",
      "align.scale":       "Scale:",
      "align.rotation":    "Rotation:",
      "align.opacity":     "Overlay:",
      "align.flipH":       "Flip H",
      "align.flipV":       "Flip V",
      "align.rot90":       "+90°",
      "align.rotM90":      "−90°",
      "align.fit":         "Fit",
      "align.fitHint":     "Assume the reveal covers the whole solved frame.",
      "align.auto":        "Auto",
      "align.autoBusy":    "Aligning…",
      "align.autoHint":    "Compute the placement automatically by star-matching the reveal against the background image (StarAlignment).",
      "align.autoFail":    "Automatic alignment found no reliable star match (starless or heavily processed image?). Align manually.",
      "align.opening":     "Opening…",
      "align.loading":     "Loading images for alignment…",
      "align.loadFailed":  "Could not load the solved or reveal image for alignment.",
      "align.placementStale": "⚠ The presentation image was aligned on a different set of subs. Its placement has been reset — open Align… again.",
      "align.rotStale":    "⚠ This alignment (rotation %1°) was saved by an earlier version, which stored rotations the other way round. Check it, or redo it with Align… — one click on Auto is enough.",
      "align.rotStaleLog": "WARNING: a saved reveal alignment carries a non-zero rotation with no version stamp. Versions up to 1.0.0 stored the opposite sign, so it may render at twice the angle away from the sky. Redo the alignment once (Align… → Auto) to settle it.",
      "btn.ok":            "OK",
      "btn.cancel":        "Cancel",
      "prog.title":        "Progress",
      "prog.idle":         "Idle — press Generate to start.",
      "prog.done":         "Done.",
      "prog.pause":        "Pause",
      "prog.resume":       "Resume",
      "prog.cancel":       "Cancel",
      "prog.paused":       "⏸  Paused.",
      "prog.cancelled":    "Cancelled.",
      "stretch.label":     "Screen stretch:",
      "stretch.final":     "Fixed, computed on the final stack (2 passes — honest noise progression)",
      "stretch.first":     "Fixed, computed on the first frame (1 pass, faster)",
      "stretch.each":      "Auto-stretch each rendered frame (brightness may pump)",
      "stretch.linked":    "Linked RGB channels",
      "debayer.check":     "Debayer CFA frames (auto-detected via BAYERPAT)",

      "overlay.title":     "Overlay",
      "overlay.videoTitle": "Title:",
      "overlay.videoTitle.hint": "blank = OBJECT from the frames",
      "overlay.counter":   "Frame counter",
      "overlay.exposure":  "Cumulative exposure",
      "overlay.time":      "UT clock",
      "overlay.snr":       "Measured SNR gain (stacking)",
      "overlay.bar":       "Progress bar",
      "overlay.scale":     "Angular scale bar (zoom)",
      "zoom.constNames":   "Constellation names",
      "zoom.starNames":    "Star names",
      "zoom.horizon":      "Horizon",
      "zoom.grid":         "Coordinate grid",
      "zoom.hips":         "Real-sky survey bridge",
      "zoom.location.opt": "Simulate shoot location",
      "zoom.location.hint": "Open from the real sky as seen from the shoot site (SITELAT/SITELONG/DATE-OBS), with a true horizon and cardinal points.",
      "zoom.lat":          "Lat:",
      "zoom.lon":          "Lon:",
      "zoom.date":         "UTC:",
      "zoom.date.hint":    "blank = DATE-OBS from headers",
      "zoom.fromSub":      "From a sub…",
      "zoom.fromSub.hint": "Pick a raw/calibrated sub to fill lat/lon/UTC — integrated masters often drop SITELAT/SITELONG.",
      "zoom.subNoData":    "That file has no SITELAT/SITELONG/DATE-OBS to read.",
      "overlay.subtitle":  "Subtitle:",
      "overlay.subtitle.hint": "e.g. the constellation",
      "overlay.distance":  "Distance:",
      "overlay.distance.hint": "e.g. 7000 ly",
      "overlay.signature": "Signature:",
      "overlay.signature.hint": "optional, e.g. @yourhandle",

      "video.title":       "Video",
      "video.format":      "Format:",
      "video.fit":         "Framing:",
      "video.fit.crop":    "Fill (center crop)",
      "video.fit.letterbox": "Fit (letterbox)",
      "video.fps":         "FPS:",
      "video.duration":    "Animation length (s):",
      "video.holdFirst":   "Hold first frame (s):",
      "video.holdLast":    "Hold last frame (s):",
      "video.quality":     "Quality:",
      "video.quality.item": "CRF %1 (%2)",
      "video.quality.best": "best",
      "video.quality.good": "high",
      "video.quality.balanced": "balanced",
      "video.quality.small": "smaller file",
      "video.estimate":    "Estimated video: %1 rendered frame(s), ~%2 at %3 fps.",
      "video.estimateFrom": "Starts at sub %1, the first with every colour channel.",

      "out.title":         "Output",
      "out.dir":           "Folder:",
      "out.browse":        "Browse…",
      "out.keepFrames":    "Keep the BMP frame sequence",
      "out.ffmpeg":        "ffmpeg:",
      "out.detect":        "Detect",
      "out.allFiles":      "All files",
      "out.ffmpegFound":   "ffmpeg found: %1",
      "out.ffmpegMissing": "ffmpeg not found — the BMP sequence and an encoding script will be generated instead.",
      "out.ffmpegHeaderOk":      "⚙️ ffmpeg detected",
      "out.ffmpegHeaderMissing": "⚠️ ffmpeg not found",
      "out.ffmpegHeaderBusy":    "⏳ installing ffmpeg…",
      "out.install":       "Install ffmpeg…",
      "out.installConfirm":"Download ffmpeg (about 50–90 MB) from %1 and install it to %2?",
      "out.installing":    "Downloading ffmpeg from %1… this may take a few minutes.",
      "out.installDone":   "ffmpeg installed: %1",
      "out.installFail":   "ffmpeg installation failed — check your internet connection, or install it manually and use Browse.",

      "btn.generate":      "Generate",
      "btn.close":         "Close",
      "btn.newInstance":   "New Instance — drag to the workspace to save a process icon",
      "lang.label":        "Language:",

      "err.noFrames":      "Add at least 2 light frames.",
      "err.noZoomImage":   "Choose a plate-solved final image for Zoom Odyssey.",
      "err.noOutput":      "Choose an output folder.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 frames, style: %3",
      "run.styleStacking": "progressive stack",
      "run.styleZoom":     "zoom odyssey",
      "zoom.solved":       "Plate solve read: field %1, center RA %2° Dec %3°.",
      "zoom.location":     "Shoot location: target %1° above the %2 horizon, from lat %3° lon %4°.",
      "zoom.belowHorizon": "Target was below the horizon at the given site/time — using the equatorial opening.",
      "zoom.revealFrom":   "Reveal image: %1 (%2×%3).",
      "zoom.errReveal":    "Could not load the reveal image. Check the file (JPEG/PNG/TIFF/FITS/XISF).",
      "zoom.fetching":     "Downloading real-sky survey (CDS/Aladin hips2fits)…",
      "zoom.fetchedNear":  "Survey (close-up) downloaded.",
      "zoom.fetchedWide":  "Survey (wide field) downloaded.",
      "zoom.hipsRetry":    "Survey download attempt %1/%2 failed (%3).",
      "zoom.hipsFailed":   "Survey download unavailable — using the catalog star field only.",
      "zoom.noCatalogs":   "Star/constellation catalogs not found in the PixInsight install — the sky will be sparse.",
      "zoom.errUnsolved":  "This image has no astrometric solution. Solve it first (Script > Image Analysis > ImageSolver), then run Session Cinema again.",
      "run.pass1":         "Pass 1 of 2 — integrating %1 frames to compute the reference stretch…",
      "run.pass1Done":     "Reference stretch computed on the final stack.",
      "run.registering":   "Registering %1 sub(s) (StarAlignment: dithering + meridian flip)…",
      "run.regCached":     "Registration reused from cache.",
      "run.regRef":        "Alignment reference: %1",
      "run.debayered":     "Debayered %1 CFA sub(s) before registration.",
      "run.render":        "Rendered %1 / %2 (%3)",
      "run.skipped":       "Skipped (unreadable or geometry mismatch): %1",
      "run.aborted":       "Aborted by user. %1 frame(s) were rendered.",
      "run.encoding":      "Encoding video with ffmpeg…",
      "run.encodeOk":      "Video written: %1",
      "run.encodeFail":    "ffmpeg failed (exit code %1). The BMP sequence and %2 are left for manual encoding.",
      "run.encodeScript":  "ffmpeg not available — BMP sequence kept, run %1 to encode.",
      "run.framesKept":    "Frame sequence: %1",
      "run.done":          "Done. %1 frame(s) rendered in %2.",
      "run.error":         "Generation failed: %1",
      "run.frameLost":     "A frame could not be written: %1. Check free space and folder permissions.",
      "run.framesLost":    "%1 frame(s) could not be written — the video would be short. Nothing was deleted.",
      "run.encodeSaid":    "ffmpeg said: %1",
      "run.encodeNoStart": "ffmpeg could not be started (%1). The BMP sequence and %2 are left for manual encoding.",
      "run.encodeTimeout": "ffmpeg was still running after %1 s and was stopped. The BMP sequence and %2 are left for manual encoding.",

      "result.title":      "Session Cinema — done",
      "result.rendered":   "%1 frame(s) rendered.",
      "result.video":      "Video: %1",
      "result.script":     "ffmpeg not found — BMP sequence kept. Run the encode script: %1",
      "result.skipped":    "%1 input(s) were skipped (unreadable or geometry mismatch).",
      "result.aborted":    "Aborted. %1 frame(s) were rendered.",
      "result.nothing":    "Nothing was rendered.",
      "zoom.errCropNotAligned": "\"Different crop from the solved image\" is ticked but the reveal has not been aligned. Open Align… and place it, or untick the box.",
      "zoom.errOpen":      "PixInsight could not open %1. Check the file is a readable FITS/XISF/TIFF and not in use elsewhere.",
      "result.openVideo":  "Open video",
      "result.openFolder": "Open folder"
   },

   fr: {
      "help": "Ajoutez les brutes d'une ou plusieurs sessions (FITS ou XISF), choisissez un style, " +
              "puis générez la séquence d'images et sa vidéo. Les incrustations n'affichent " +
              "que des faits mesurés : nombre de brutes, exposition cumulée, gain de SNR.",

      "frames.title":      "Brutes",
      "frames.addFiles":   "Ajouter des fichiers…",
      "frames.addFolder":  "Ajouter un dossier…",
      "frames.remove":     "Retirer",
      "frames.clear":      "Vider",
      "frames.col.num":    "#",
      "frames.col.name":   "Fichier",
      "frames.col.date":   "DATE-OBS",
      "frames.col.exp":    "Expo (s)",
      "frames.summary":    "%1 brute(s) — exposition totale %2",
      "frames.summary.none": "Aucune brute chargée.",
      "frames.scanning":   "Lecture des en-têtes… %1 / %2",

      "style.title":       "Style",
      "tab.sequence":      "Empilement progressif",
      "tab.zoom":          "Zoom Odyssey",
      "tagline.stacking":  "Regardez votre empilement se construire, de 1 à N brutes.",
      "tagline.zoom":      "Vous êtes ici — du ciel entier jusqu'à votre image.",
      "stretch.groupTitle": "Rendu",
      "seq.colorGroup":    "Couleur (multi-filtre)",
      "seq.align":         "Recaler les brutes (corrige dithering + flip méridien)",
      "seq.color":         "Composite couleur — associer les filtres à R / V / B",
      "seq.removeGreen":   "Supprimer la dominante verte (SCNR)",
      "seq.palette":       "Palette :",
      "seq.chNone":        "(aucun)",
      "seq.chR":           "R ←",
      "seq.chG":           "V ←",
      "seq.chB":           "B ←",
      "seq.filtersFound":  "Filtres détectés : %1",
      "seq.noFilters":     "Chargez des brutes pour détecter les filtres.",
      "seq.revealGroup":   "Image finale (révélée à la fin)",
      "seq.reveal":        "Image à présenter :",
      "seq.revealHint":    "Votre image traitée finale — fondu enchaîné puis maintenue à la fin. Alignez-la sur le stack pour que le passage soit invisible.",
      "seq.revealDur":     "Durée du reveal (s) :",
      "style.stacking":    "Empilement progressif — l'intégration se construit de 1 à N brutes",
      "style.stackNote":   "Les brutes sont recalées automatiquement (dithering + flip méridien). " +
                           "Avec plusieurs filtres, associez-les à R/V/B pour un composite couleur.",
      "style.zoom":        "Zoom Odyssey — « vous êtes ici » : ciel entier → constellation → votre image se révèle",
      "style.zoomNote":    "Nécessite une image résolue astrométriquement (un master WBPP l'est déjà). " +
                           "Son WCS embarqué pilote le zoom ; le ciel est tracé depuis les catalogues fournis avec PixInsight.",
      "zoom.image":        "Image résolue (WCS) :",
      "zoom.inputTitle":   "Zoom Odyssey — images sources",
      "zoom.renderTitle":  "Options de rendu",
      "zoom.imageHint":    "Une image résolue astrométriquement qui fournit les coordonnées — un master WBPP l'est déjà. Sinon, résolvez-la avec Script > Image Analysis > ImageSolver.",
      "zoom.revealImage":  "Image à révéler :",
      "zoom.revealHint":   "Optionnel — l'image finie insérée dans la vidéo (JPEG/PNG/TIFF/FITS/XISF), utilisée telle quelle. Laissez vide pour révéler l'image résolue elle-même. Suppose le même cadrage que l'image résolue.",
      "zoom.revealFilter": "Images (JPEG/PNG/TIFF/FITS/XISF)",
      "zoom.revealClear":  "Vider",
      "zoom.cropped":      "Cadrage différent de l'image résolue",
      "zoom.align":        "Aligner…",
      "align.title":       "Aligner l'image à révéler sur l'image résolue",
      "align.help":        "Glissez l'image à révéler pour la positionner ; échelle/rotation/miroir pour la faire coïncider avec l'image résolue derrière. La molette zoome la vue. Le curseur de superposition l'estompe pour vérifier le calage. Fenêtre redimensionnable.",
      "align.resetView":   "Réinitialiser",
      "align.resetViewHint": "Réinitialise le zoom et le panoramique de la vue.",
      "align.move":        "Déplacer",
      "align.pan":         "Naviguer",
      "align.panHint":     "Bascule ce que fait le glisser gauche : déplacer l'image ou la vue zoomée.",
      "align.scale":       "Échelle :",
      "align.rotation":    "Rotation :",
      "align.opacity":     "Superposition :",
      "align.flipH":       "Miroir H",
      "align.flipV":       "Miroir V",
      "align.rot90":       "+90°",
      "align.rotM90":      "−90°",
      "align.fit":         "Ajuster",
      "align.fitHint":     "Suppose que l'image à révéler couvre tout le cadre résolu.",
      "align.auto":        "Auto",
      "align.autoBusy":    "Alignement…",
      "align.autoHint":    "Calcule le placement automatiquement en appariant les étoiles de l'image à révéler avec l'image de fond (StarAlignment).",
      "align.autoFail":    "L'alignement automatique n'a pas trouvé d'appariement d'étoiles fiable (image starless ou très retouchée ?). Alignez manuellement.",
      "align.opening":     "Ouverture…",
      "align.loading":     "Chargement des images pour l'alignement…",
      "align.loadFailed":  "Impossible de charger l'image résolue ou l'image à révéler pour l'alignement.",
      "align.placementStale": "⚠ L'image de présentation a été alignée sur d'autres brutes. Son placement a été réinitialisé — rouvrez Aligner…",
      "align.rotStale":    "⚠ Cet alignement (rotation %1°) a été enregistré par une version antérieure, qui stockait les rotations dans l'autre sens. Vérifiez-le, ou refaites-le avec Aligner… — un clic sur Auto suffit.",
      "align.rotStaleLog": "AVERTISSEMENT : un alignement enregistré porte une rotation non nulle sans marque de version. Les versions jusqu'à 1.0.0 stockaient le signe opposé : le rendu peut être décalé du double de l'angle par rapport au ciel. Refaites l'alignement une fois (Aligner… → Auto) pour lever le doute.",
      "btn.ok":            "OK",
      "btn.cancel":        "Annuler",
      "prog.title":        "Progression",
      "prog.idle":         "En attente — cliquez sur Générer.",
      "prog.done":         "Terminé.",
      "prog.pause":        "Pause",
      "prog.resume":       "Reprendre",
      "prog.cancel":       "Annuler",
      "prog.paused":       "⏸  En pause.",
      "prog.cancelled":    "Annulé.",
      "stretch.label":     "Étirement d'affichage :",
      "stretch.final":     "Fixe, calculé sur le stack final (2 passes — progression du bruit honnête)",
      "stretch.first":     "Fixe, calculé sur la première brute (1 passe, plus rapide)",
      "stretch.each":      "Auto-stretch à chaque image rendue (la luminosité peut pomper)",
      "stretch.linked":    "Canaux RGB liés",
      "debayer.check":     "Dématriçage des brutes CFA (détection via BAYERPAT)",

      "overlay.title":     "Habillage",
      "overlay.videoTitle": "Titre :",
      "overlay.videoTitle.hint": "vide = OBJECT lu dans les brutes",
      "overlay.counter":   "Compteur d'images",
      "overlay.exposure":  "Exposition cumulée",
      "overlay.time":      "Horloge TU",
      "overlay.snr":       "Gain de SNR mesuré (empilement)",
      "overlay.bar":       "Barre de progression",
      "overlay.scale":     "Barre d'échelle angulaire (zoom)",
      "zoom.constNames":   "Noms des constellations",
      "zoom.starNames":    "Noms des étoiles",
      "zoom.horizon":      "Horizon",
      "zoom.grid":         "Grille de coordonnées",
      "zoom.hips":         "Pont imagerie réelle du ciel",
      "zoom.location.opt": "Simuler le lieu du shoot",
      "zoom.location.hint": "Ouvre sur le ciel réel vu depuis le site de prise (SITELAT/SITELONG/DATE-OBS), avec un vrai horizon et les points cardinaux.",
      "zoom.lat":          "Lat :",
      "zoom.lon":          "Lon :",
      "zoom.date":         "UTC :",
      "zoom.date.hint":    "vide = DATE-OBS des en-têtes",
      "zoom.fromSub":      "Depuis une brute…",
      "zoom.fromSub.hint": "Choisissez une brute (calibrée/registered) pour remplir lat/lon/UTC — les masters intégrés perdent souvent SITELAT/SITELONG.",
      "zoom.subNoData":    "Ce fichier n'a pas de SITELAT/SITELONG/DATE-OBS à lire.",
      "overlay.subtitle":  "Sous-titre :",
      "overlay.subtitle.hint": "ex. la constellation",
      "overlay.distance":  "Distance :",
      "overlay.distance.hint": "ex. 7000 al",
      "overlay.signature": "Signature :",
      "overlay.signature.hint": "optionnel, ex. @votrepseudo",

      "video.title":       "Vidéo",
      "video.format":      "Format :",
      "video.fit":         "Cadrage :",
      "video.fit.crop":    "Remplir (recadrage centré)",
      "video.fit.letterbox": "Ajuster (bandes noires)",
      "video.fps":         "IPS :",
      "video.duration":    "Durée d'animation (s) :",
      "video.holdFirst":   "Figé sur la première image (s) :",
      "video.holdLast":    "Figé sur l'image finale (s) :",
      "video.quality":     "Qualité :",
      "video.quality.item": "CRF %1 (%2)",
      "video.quality.best": "maximale",
      "video.quality.good": "élevée",
      "video.quality.balanced": "équilibrée",
      "video.quality.small": "fichier plus léger",
      "video.estimate":    "Vidéo estimée : %1 image(s) rendue(s), ~%2 à %3 ips.",
      "video.estimateFrom": "Démarre à la brute %1, la première où tous les canaux sont alimentés.",

      "out.title":         "Sortie",
      "out.dir":           "Dossier :",
      "out.browse":        "Parcourir…",
      "out.keepFrames":    "Conserver la séquence BMP",
      "out.ffmpeg":        "ffmpeg :",
      "out.detect":        "Détecter",
      "out.allFiles":      "Tous les fichiers",
      "out.ffmpegFound":   "ffmpeg trouvé : %1",
      "out.ffmpegMissing": "ffmpeg introuvable — la séquence BMP et un script d'encodage seront générés.",
      "out.ffmpegHeaderOk":      "⚙️ ffmpeg détecté",
      "out.ffmpegHeaderMissing": "⚠️ ffmpeg introuvable",
      "out.ffmpegHeaderBusy":    "⏳ installation de ffmpeg…",
      "out.install":       "Installer ffmpeg…",
      "out.installConfirm":"Télécharger ffmpeg (environ 50–90 Mo) depuis %1 et l'installer dans %2 ?",
      "out.installing":    "Téléchargement de ffmpeg depuis %1… cela peut prendre quelques minutes.",
      "out.installDone":   "ffmpeg installé : %1",
      "out.installFail":   "Échec de l'installation de ffmpeg — vérifiez la connexion internet, ou installez-le manuellement puis utilisez Parcourir.",

      "btn.generate":      "Générer",
      "btn.close":         "Fermer",
      "btn.newInstance":   "New Instance — glissez sur l'espace de travail pour créer une icône de process",
      "lang.label":        "Langue :",

      "err.noFrames":      "Ajoutez au moins 2 brutes.",
      "err.noZoomImage":   "Choisissez une image finale résolue astrométriquement pour Zoom Odyssey.",
      "err.noOutput":      "Choisissez un dossier de sortie.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 brutes, style : %3",
      "run.styleStacking": "empilement progressif",
      "run.styleZoom":     "zoom odyssey",
      "zoom.solved":       "Solve astrométrique lu : champ %1, centre AD %2° Déc %3°.",
      "zoom.location":     "Lieu du shoot : cible à %1° au-dessus de l'horizon %2, depuis lat %3° lon %4°.",
      "zoom.belowHorizon": "La cible était sous l'horizon au lieu/heure donnés — ouverture équatoriale utilisée.",
      "zoom.revealFrom":   "Image révélée : %1 (%2×%3).",
      "zoom.errReveal":    "Impossible de charger l'image à révéler. Vérifiez le fichier (JPEG/PNG/TIFF/FITS/XISF).",
      "zoom.fetching":     "Téléchargement de l'imagerie réelle du ciel (CDS/Aladin hips2fits)…",
      "zoom.fetchedNear":  "Survey (gros plan) téléchargé.",
      "zoom.fetchedWide":  "Survey (grand champ) téléchargé.",
      "zoom.hipsRetry":    "Tentative de téléchargement du survey %1/%2 échouée (%3).",
      "zoom.hipsFailed":   "Téléchargement du survey indisponible — champ d'étoiles catalogue uniquement.",
      "zoom.noCatalogs":   "Catalogues d'étoiles/constellations introuvables dans l'install PixInsight — le ciel sera clairsemé.",
      "zoom.errUnsolved":  "Cette image n'a pas de solution astrométrique. Résolvez-la d'abord (Script > Image Analysis > ImageSolver), puis relancez Session Cinema.",
      "run.pass1":         "Passe 1 sur 2 — intégration des %1 brutes pour calculer l'étirement de référence…",
      "run.pass1Done":     "Étirement de référence calculé sur le stack final.",
      "run.registering":   "Recalage de %1 brute(s) (StarAlignment : dithering + flip méridien)…",
      "run.regCached":     "Recalage réutilisé depuis le cache.",
      "run.regRef":        "Référence d'alignement : %1",
      "run.debayered":     "%1 brute(s) CFA dématricées avant recalage.",
      "run.render":        "Rendu %1 / %2 (%3)",
      "run.skipped":       "Ignorées (illisibles ou géométrie différente) : %1",
      "run.aborted":       "Interrompu par l'utilisateur. %1 image(s) rendues.",
      "run.encoding":      "Encodage de la vidéo avec ffmpeg…",
      "run.encodeOk":      "Vidéo écrite : %1",
      "run.encodeFail":    "Échec ffmpeg (code %1). La séquence BMP et %2 restent disponibles pour un encodage manuel.",
      "run.encodeScript":  "ffmpeg indisponible — séquence BMP conservée, lancez %1 pour encoder.",
      "run.framesKept":    "Séquence d'images : %1",
      "run.done":          "Terminé. %1 image(s) rendues en %2.",
      "run.error":         "Échec de la génération : %1",
      "run.frameLost":     "Une image n'a pas pu être écrite : %1. Vérifiez l'espace disque et les droits du dossier.",
      "run.framesLost":    "%1 image(s) n'ont pas pu être écrites — la vidéo serait incomplète. Rien n'a été supprimé.",
      "run.encodeSaid":    "ffmpeg a répondu : %1",
      "run.encodeNoStart": "ffmpeg n'a pas pu démarrer (%1). La séquence BMP et %2 restent disponibles pour un encodage manuel.",
      "run.encodeTimeout": "ffmpeg tournait encore après %1 s et a été arrêté. La séquence BMP et %2 restent disponibles pour un encodage manuel.",

      "result.title":      "Session Cinema — terminé",
      "result.rendered":   "%1 image(s) rendues.",
      "result.video":      "Vidéo : %1",
      "result.script":     "ffmpeg introuvable — séquence BMP conservée. Lancez le script d'encodage : %1",
      "result.skipped":    "%1 entrée(s) ignorée(s) (illisibles ou géométrie différente).",
      "result.aborted":    "Interrompu. %1 image(s) rendues.",
      "result.nothing":    "Rien n'a été rendu.",
      "zoom.errCropNotAligned": "« Cadrage différent de l'image résolue » est coché mais l'image à révéler n'a pas été alignée. Ouvrez Aligner… pour la placer, ou décochez la case.",
      "zoom.errOpen":      "PixInsight n'a pas pu ouvrir %1. Vérifiez que le fichier est un FITS/XISF/TIFF lisible et qu'il n'est pas ouvert ailleurs.",
      "result.openVideo":  "Ouvrir la vidéo",
      "result.openFolder": "Ouvrir le dossier"
   }
};

function tr( key )
{
   var table = STRINGS[ gLanguage ] || STRINGS.en;
   var s = table[ key ];
   if ( s === undefined )
      s = STRINGS.en[ key ];
   if ( s === undefined )
      return key;
   for ( var i = 1; i < arguments.length; ++i )
      s = s.split( "%" + i ).join( String( arguments[ i ] ) );
   return s;
}

// ============================================================================
// PURE HELPERS (free of PixInsight APIs — exercised by tests/run.sh)
// ============================================================================

// The version as a human must be able to read it back to support: the source
// constant, plus the build stamp the packaging step wrote into this very file.
// Without the stamp, "I have 1.1.1" does not say whether the file came from the
// update repository, from an older release's zip, or from a hand copy sitting in
// a stale Feature Scripts entry — the three causes the support KB has to tell
// apart. A checkout that was never packaged still carries the raw token; it
// reads as "dev", which is the truth.
//
// The token is detected by substring rather than by comparing to its literal
// spelling: the packaging step rewrites EVERY occurrence of it in this file, so
// a literal here would be substituted too and the test would never fire.
function versionLabel()
{
   var build = SESSIONCINEMA_BUILD;
   if ( build.indexOf( "BUILD" ) >= 0 )
      build = "dev";
   // The build script refuses to package a version the source does not declare,
   // so on a real package the two are equal and repeating the number would be
   // noise. Anything else is worth showing.
   return SC_VERSION + ( build == SC_VERSION ? "" : " (" + build + ")" );
}

function clamp01( x )
{
   return x < 0 ? 0 : ( x > 1 ? 1 : x );
}

// Midtones transfer function, the histogram-transformation kernel.
function mtf( m, x )
{
   if ( x <= 0 )
      return 0;
   if ( x >= 1 )
      return 1;
   var d = ( 2*m - 1 )*x - m;
   if ( d == 0 )
      return 0;
   return ( ( m - 1 )*x )/d;
}

// Standard auto-stretch parameters from median and (unscaled) MAD.
// Returns { c0: shadows clipping point, m: midtones balance }, following the
// canonical STF auto-stretch: clip at median - 2.8 sigma, background 0.25.
function computeAutoStretch( median, mad )
{
   var SHADOWS_CLIP = -2.8;
   var TARGET_BKG = 0.25;
   var sigma = 1.4826*mad;
   var c0 = ( sigma <= 0 ) ? 0 : clamp01( median + SHADOWS_CLIP*sigma );
   var m = mtf( TARGET_BKG, median - c0 );
   if ( !( m > 0 ) || !( m < 1 ) )
      m = 0.5;
   return { c0: c0, m: m };
}

// FITS DATE-OBS parser -> epoch seconds (UTC) or null. Accepts "YYYY-MM-DD",
// "YYYY-MM-DDTHH:MM:SS", fractional seconds, and a space instead of the T.
function parseDateObs( s )
{
   if ( !s )
      return null;
   var t = String( s ).trim();
   var re = new RegExp( "^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2}(?:\\.\\d+)?))?)?" );
   var m = re.exec( t );
   if ( !m )
      return null;
   var sec = m[ 6 ] ? parseFloat( m[ 6 ] ) : 0;
   var ms = Date.UTC( parseInt( m[ 1 ], 10 ), parseInt( m[ 2 ], 10 ) - 1, parseInt( m[ 3 ], 10 ),
                      m[ 4 ] ? parseInt( m[ 4 ], 10 ) : 0, m[ 5 ] ? parseInt( m[ 5 ], 10 ) : 0, 0 );
   return ms/1000 + sec;
}

// Strip FITS string-value quoting: "'M 42     '" -> "M 42".
function kwValue( raw )
{
   if ( raw === undefined || raw === null )
      return "";
   var v = String( raw ).trim();
   if ( v.length >= 2 && v.charAt( 0 ) == "'" && v.charAt( v.length - 1 ) == "'" )
      v = v.substring( 1, v.length - 1 );
   return v.trim();
}

// Order frames chronologically (DATE-OBS); undated frames come last, in
// stable path order.
function sortFrames( frames )
{
   var sorted = frames.slice();
   sorted.sort( function( a, b )
   {
      var da = ( a.dateObs !== null && a.dateObs !== undefined );
      var db = ( b.dateObs !== null && b.dateObs !== undefined );
      if ( da && db && a.dateObs != b.dateObs )
         return a.dateObs - b.dateObs;
      if ( da != db )
         return da ? -1 : 1;
      return a.path < b.path ? -1 : ( a.path > b.path ? 1 : 0 );
   } );
   return sorted;
}

// 1-based indices of the subs to render so the animation lasts about
// targetDuration seconds at the given fps. Always includes 1 and N.
function computeRenderIndices( N, fps, targetDuration )
{
   if ( N <= 0 )
      return [];
   var budget = Math.max( 1, Math.round( fps*targetDuration ) );
   if ( N <= budget )
   {
      var all = [];
      for ( var i = 1; i <= N; ++i )
         all.push( i );
      return all;
   }
   var indices = [ 1 ];
   for ( var k = 1; k <= budget; ++k )
   {
      var idx = Math.max( 1, Math.min( N, Math.round( k*N/budget ) ) );
      if ( idx != indices[ indices.length - 1 ] )
         indices.push( idx );
   }
   if ( indices[ indices.length - 1 ] != N )
      indices.push( N );
   return indices;
}

// The colour cadence, as pure arithmetic. Rendering only starts once EVERY mapped
// channel has a sub, so the animation is spread over [firstFullN, N] rather than
// [1, N] — and on a filter-per-night set that is most of the list. It lived inside
// the engine loop, where the dialog could not see it, so the dialog announced the
// mono count instead: twice the frames on a two-block sequence, three times on
// three nights. One definition now, and the only cadence in the product that had
// no test has one.
function colorRenderPlan( frames, map, fps, targetDuration )
{
   var keys = [ "R", "G", "B" ];
   var N = frames.length;
   var fed = { R: false, G: false, B: false }, mappedFrames = 0;
   var i, ch, c;
   for ( i = 0; i < N; ++i )
   {
      ch = channelsFedBy( frames[ i ].filter, map );
      if ( ch.length )
         ++mappedFrames;
      for ( c = 0; c < ch.length; ++c )
         fed[ ch[ c ] ] = true;
   }
   var need = [];
   for ( i = 0; i < 3; ++i )
      if ( map[ keys[ i ] ] && fed[ keys[ i ] ] )
         need.push( keys[ i ] );
   var seen = { R: 0, G: 0, B: 0 }, firstFullN = N;
   for ( i = 0; i < N; ++i )
   {
      ch = channelsFedBy( frames[ i ].filter, map );
      for ( c = 0; c < ch.length; ++c )
         seen[ ch[ c ] ] = 1;
      var all = true;
      for ( c = 0; c < need.length; ++c )
         if ( !seen[ need[ c ] ] )
            all = false;
      if ( all ) { firstFullN = i + 1; break; }
   }
   // Cadence over the positions that will actually render: the loop skips a sub
   // whose filter feeds no channel BEFORE consulting renderSet, so spreading over
   // raw positions announced frames that were never written — 247 for 148 on an
   // LRGB night pulled in RGB.
   var eligible = [];
   for ( i = firstFullN - 1; i < N; ++i )
      if ( channelsFedBy( frames[ i ].filter, map ).length )
         eligible.push( i + 1 );
   var T = computeRenderIndices( N, fps, targetDuration ).length;
   var E = eligible.length;
   var renderSet = {}, totalRenders = 0;
   for ( i = 0; i < T && E > 0; ++i )
   {
      var rn = ( T > 1 ) ? eligible[ Math.round( i*( E - 1 )/( T - 1 ) ) ] : eligible[ E - 1 ];
      if ( !renderSet[ rn ] ) { renderSet[ rn ] = true; ++totalRenders; }
   }
   // The last position that will render. Every entry of renderSet is mapped, so
   // this one composes unless its sub cannot be opened — which is reported.
   var lastRender = 0;
   for ( i = 0; i < eligible.length; ++i )
      if ( renderSet[ eligible[ i ] ] )
         lastRender = eligible[ i ];
   return { mappedFrames: mappedFrames, firstFullN: firstFullN, renderSet: renderSet,
            totalRenders: totalRenders, lastRender: lastRender };
}

// The end reveal writes this many frames, or none when there is no image to
// reveal. Read by the renderer AND by the estimate, so the count announced before
// the run and the total reported during it cannot come apart.
function revealTailFrames( cfg )
{
   if ( !cfg.stackRevealPath || !cfg.stackRevealPath.length )
      return 0;
   var sec = ( cfg.stackRevealSec > 0 ) ? cfg.stackRevealSec : STACK_REVEAL_SEC;
   return Math.max( 1, Math.round( cfg.fps*sec ) );
}

// How many frames a progressive-stack run will WRITE — the whole run, animation
// plus reveal tail. This is the number the dialog announces and the number the
// engine counts against; tests/announced.test.js holds the two together.
// map = null for mono, the resolved channel map for colour.
function plannedFrameCount( frames, cfg, map )
{
   var N = frames.length;
   if ( N == 0 )
      return { animation: 0, reveal: 0, total: 0, firstFullN: 1 };
   var animation, firstFullN = 1;
   if ( map )
   {
      var plan = colorRenderPlan( frames, map, cfg.fps, cfg.targetDuration );
      animation = plan.totalRenders;
      firstFullN = plan.firstFullN;
   }
   else
      animation = computeRenderIndices( N, cfg.fps, cfg.targetDuration ).length;
   var reveal = revealTailFrames( cfg );
   return { animation: animation, reveal: reveal,
            total: animation + reveal, firstFullN: firstFullN };
}

// Destination rectangle of the source image inside the output frame.
// FIT_CROP fills and crops symmetrically; FIT_LETTERBOX fits entirely.
function computeCoverRect( srcW, srcH, dstW, dstH, fitMode )
{
   var scale;
   if ( fitMode == FIT_CROP )
      scale = Math.max( dstW/srcW, dstH/srcH );
   else
      scale = Math.min( dstW/srcW, dstH/srcH );
   var w = Math.round( srcW*scale );
   var h = Math.round( srcH*scale );
   var x0 = Math.round( ( dstW - w )/2 );
   var y0 = Math.round( ( dstH - h )/2 );
   return { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h };
}

// "2h04", "34 min", "58 s" — compact universal duration.
function formatDuration( seconds )
{
   var s = Math.round( seconds );
   if ( s < 60 )
      return s + " s";
   var m = Math.round( s/60 );
   if ( m < 60 )
      return m + " min";
   var h = Math.floor( m/60 );
   var mm = m - 60*h;
   return h + "h" + ( mm < 10 ? "0" : "" ) + mm;
}

// Stands in for the SNR gain when the noise could not be measured (see
// buildOverlayInfo): the overlay states the figure is missing instead of hiding it.
var SNR_UNAVAILABLE = "—";

// Noise-based SNR gain in dB between the first sub and the current mean.
// Returns "" when the measurement is not usable.
function formatSnrGainDb( sigmaFirst, sigmaCurrent )
{
   if ( !( sigmaFirst > 0 ) || !( sigmaCurrent > 0 ) )
      return "";
   var db = 20*Math.log( sigmaFirst/sigmaCurrent )/Math.LN10;
   if ( !isFinite( db ) )
      return "";
   var r = Math.round( db*10 )/10;
   return ( r >= 0 ? "+" : "" ) + r.toFixed( 1 ) + " dB";
}

// Noise of a multi-filter composite, and the single-sub reference it is compared
// to — both built from noise MEASURED per filter, never from a theoretical sqrt(N).
// `entries` holds one item per distinct filter feeding the composite:
//    { weight, sigmaFirst, sigmaCurrent }
// weight is the number of channels that filter feeds (OIII feeds G and B in HOO),
// sigmaFirst its noise on a single sub, sigmaCurrent its noise on the running
// channel mean. Both sigmas must be measured on the LINEAR data, before the
// stretch, or the figure measures the stretch instead of the stack.
//
// The composite is read through its luminance, the equal-weight mean of the three
// channels; a filter feeding w channels lands in that mean w times, correlated
// with itself, hence the w^2:
//    current = sqrt( sum( w^2 * sigmaCurrent^2 ) ) / K,   K = sum( w )
// The reference stays ONE SUB, so the overlay reads the same in mono and in colour
// ("this stack is X dB quieter than a single sub"): the weighted quadratic mean of
// the per-filter single-sub noises,
//    first   = sqrt( sum( w * sigmaFirst^2 ) / K )
// On a balanced session this gives back the mono law exactly (n subs over F
// filters -> sqrt(n)), so the mono and colour curves are directly comparable.
//
// A filter whose noise could not be measured is dropped from both sums, which
// keeps the ratio coherent; with nothing left the result is { 0, 0 } and the
// overlay says the figure is unavailable rather than quietly dropping it.
function compositeSnrSigmas( entries )
{
   var K = 0, sumCurrent = 0, sumFirst = 0, dropped = 0;
   for ( var i = 0; i < entries.length; ++i )
   {
      var e = entries[ i ], w = e.weight;
      if ( !( w > 0 ) || !( e.sigmaFirst > 0 ) || !( e.sigmaCurrent > 0 ) )
      {
         if ( w > 0 )
            ++dropped;
         continue;
      }
      K += w;
      sumCurrent += w*w*e.sigmaCurrent*e.sigmaCurrent;
      sumFirst += w*e.sigmaFirst*e.sigmaFirst;
   }
   if ( K <= 0 )
      return { first: 0, current: 0, partial: false };
   // A filter whose noise did not measure drops out of both sums AND of K, so the
   // ratio stays self-coherent while no longer describing the image on screen.
   // Measured on HOO with 50 Ha + 50 OIII: complete +19.5 dB, the same call with
   // OIII missing +17.0 dB, truth +26.5 dB. Wrong, not merely imprecise — so the
   // figure is marked and drawn with a "~".
   return { first: Math.sqrt( sumFirst/K ), current: Math.sqrt( sumCurrent )/K,
            partial: dropped > 0 };
}

// UT clock "23:47:13" from epoch seconds.
function formatClockUT( epochSeconds )
{
   var d = new Date( Math.round( epochSeconds*1000 ) );
   function p2( n ) { return ( n < 10 ? "0" : "" ) + n; }
   return p2( d.getUTCHours() ) + ":" + p2( d.getUTCMinutes() ) + ":" + p2( d.getUTCSeconds() );
}

// "M 42 — Orion" -> "m-42-orion" (accents stripped, filesystem-safe).
function slugify( s )
{
   var t = String( s );
   try
   {
      t = t.normalize( "NFD" ).replace( new RegExp( "[\\u0300-\\u036f]", "g" ), "" );
   }
   catch ( e )
   {
   }
   t = t.toLowerCase().replace( new RegExp( "[^a-z0-9]+", "g" ), "-" );
   t = t.replace( new RegExp( "^-+" ), "" ).replace( new RegExp( "-+$" ), "" );
   return t.length ? t : "session";
}

// The text lines of the overlay, as pure data (testable without a GUI).
// info: { style, index, total, cumulativeExposure, exposure, dateObs,
//         sigmaFirst, sigmaCurrent, title? }. When info.title is given it wins
// over cfg.ovTitle (that is how the engine injects the OBJECT-derived title).
function buildOverlayInfo( cfg, info )
{
   var subLeft = [];
   var right = [];
   var parts = [];
   if ( cfg.ovShowCounter )
      parts.push( info.index + ( info.exposure > 0 ? " × " + Math.round( info.exposure ) + " s" : "" ) );
   if ( cfg.ovShowExposure && info.cumulativeExposure > 0 )
      parts.push( formatDuration( info.cumulativeExposure ) );
   if ( cfg.ovShowSnr )
   {
      // Asked for but not measurable → SAY so. Dropping the term silently makes a
      // measurement that failed look exactly like one that was never requested.
      var db = formatSnrGainDb( info.sigmaFirst, info.sigmaCurrent );
      // "~" when a channel could not be measured: the figure is built from the
      // rest, and the noise of the image on screen is not what it describes.
      parts.push( "SNR " + ( db.length ? ( ( info.snrPartial ? "~" : "" ) + db )
                                       : SNR_UNAVAILABLE ) );
   }
   if ( parts.length )
      subLeft.push( parts.join( "  ·  " ) );
   var tright = [];
   if ( cfg.ovShowTime && info.dateObs !== null && info.dateObs !== undefined )
      tright.push( "UT " + formatClockUT( info.dateObs ) );
   if ( cfg.ovShowCounter )
      tright.push( info.index + "/" + info.total );
   if ( tright.length )
      right.push( tright.join( "  ·  " ) );
   return {
      title: ( info.title !== undefined ) ? info.title : ( cfg.ovTitle || "" ),
      subLeft: subLeft.join( "  ·  " ),
      right: right.join( "  ·  " ),
      signature: cfg.ovSignature || "",
      progress: cfg.ovShowBar ? ( info.total > 0 ? info.index/info.total : 0 ) : -1
   };
}

// ---------------------------------------------------------------------------
// ffmpeg discovery and auto-install locations (pure; getEnv is injected —
// getEnvironmentVariable in PixInsight — so all of this runs under the tests)
// ---------------------------------------------------------------------------

// Environment lookup normalized to forward slashes ("" when unset). getEnv is
// injected (getEnvironmentVariable in PixInsight) so callers stay testable.
function envPath( getEnv, name )
{
   var v = getEnv( name );
   return ( v && v.length ) ? String( v ).split( "\\" ).join( "/" ) : "";
}

// Base URL of the CaeloWorks ffmpeg mirror: one static, self-contained build
// per platform/architecture under a fixed name (hosting contract in
// docs/ffmpeg-mirror.md). Downloads are validated by running `-version`.
var FFMPEG_MIRROR_BASE = "https://pixinsight-scripts.caelo.works/ffmpeg/";

// Mirror file names to try, in order. PJSR does not expose the CPU
// architecture, so on macOS and Linux both builds are listed: a binary for
// the wrong CPU fails the `-version` gate and the next one is tried.
function ffmpegMirrorCandidates( platform )
{
   if ( platform == "windows" )
      return [ "ffmpeg-windows-x64.exe" ];
   if ( platform == "macos" )
      return [ "ffmpeg-macos-arm64", "ffmpeg-macos-x64" ];
   return [ "ffmpeg-linux-x64", "ffmpeg-linux-arm64" ];
}

function ffmpegInstalledName( platform )
{
   return ( platform == "windows" ) ? "ffmpeg.exe" : "ffmpeg";
}

// Reorder the mirror candidates so the build matching the machine (from
// `uname -m`) downloads first — a wrong-architecture build is 50–90 MB of
// wasted transfer before the -version gate rejects it. Unknown/empty uname
// output leaves the order untouched (try-in-order remains the fallback).
function orderMirrorCandidatesByArch( names, unameM )
{
   var m = String( unameM || "" ).toLowerCase();
   if ( !/arm|aarch|x86|amd64/.test( m ) )
      return names.slice();
   var wantArm = /arm|aarch/.test( m );
   return names.slice().sort( function ( a, b )
   {
      var aArm = a.indexOf( "arm64" ) >= 0, bArm = b.indexOf( "arm64" ) >= 0;
      if ( aArm == bArm )
         return 0;
      return ( aArm == wantArm ) ? -1 : 1;
   } );
}

// Per-user directory where the auto-installed ffmpeg lives (forward slashes).
function ffmpegInstallDir( platform, getEnv )
{
   function env( name ) { return envPath( getEnv, name ); }
   if ( platform == "windows" )
   {
      var base = env( "LOCALAPPDATA" );
      if ( !base.length )
      {
         var up = env( "USERPROFILE" );
         base = up.length ? ( up + "/AppData/Local" ) : "C:/CaeloWorks";
      }
      return base + "/CaeloWorks/ffmpeg";
   }
   var home = env( "HOME" );
   if ( platform == "macos" )
      return home + "/Library/Application Support/CaeloWorks/ffmpeg";
   var xdg = env( "XDG_DATA_HOME" );
   return ( xdg.length ? xdg : ( home + "/.local/share" ) ) + "/caeloworks/ffmpeg";
}

// Ordered list of ffmpeg locations to probe beyond a user-provided path:
// PATH first, then a previous auto-install, then the usual package managers.
function ffmpegCandidatePaths( platform, getEnv )
{
   function env( name ) { return envPath( getEnv, name ); }
   var list = [];
   var installed = ffmpegInstallDir( platform, getEnv ) + "/" + ffmpegInstalledName( platform );
   if ( platform == "windows" )
   {
      list.push( "ffmpeg.exe" );
      list.push( installed );
      var la = env( "LOCALAPPDATA" );
      if ( la.length )
         list.push( la + "/Microsoft/WinGet/Links/ffmpeg.exe" );          // winget
      var pd = env( "ProgramData" );
      list.push( ( pd.length ? pd : "C:/ProgramData" ) + "/chocolatey/bin/ffmpeg.exe" );
      var up = env( "USERPROFILE" );
      if ( up.length )
         list.push( up + "/scoop/shims/ffmpeg.exe" );                     // scoop
      list.push( "C:/ffmpeg/bin/ffmpeg.exe" );
   }
   else
   {
      list.push( "ffmpeg" );
      list.push( installed );
      list.push( "/usr/bin/ffmpeg" );
      list.push( "/usr/local/bin/ffmpeg" );
      if ( platform == "macos" )
      {
         list.push( "/opt/homebrew/bin/ffmpeg" );                         // Homebrew (Apple Silicon)
         list.push( "/opt/local/bin/ffmpeg" );                            // MacPorts
      }
      else
      {
         list.push( "/snap/bin/ffmpeg" );
         list.push( "/home/linuxbrew/.linuxbrew/bin/ffmpeg" );
      }
   }
   return list;
}

// ffmpeg argument list (pure; paths are passed through untouched).
function buildFfmpegArgs( params )
{
   var args = [ "-y",
                "-framerate", String( params.fps ),
                "-i", params.framesPattern,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-crf", String( params.crf ),
                "-preset", "medium" ];
   var pads = [];
   if ( params.holdFirst > 0 )
      pads.push( "start_mode=clone:start_duration=" + params.holdFirst );
   if ( params.holdLast > 0 )
      pads.push( "stop_mode=clone:stop_duration=" + params.holdLast );
   if ( pads.length )
      args.push( "-vf", "tpad=" + pads.join( ":" ) );
   args.push( "-movflags", "+faststart", params.outputPath );
   return args;
}

function shellQuote( s )
{
   return "\"" + String( s ).split( "\"" ).join( "\\\"" ) + "\"";
}

// Full text of the fallback encoding script. In a .bat, every literal %
// must be doubled or cmd.exe eats it (frame_%05d.png would break).
function buildEncodeScriptText( isWin, ffmpegArgs )
{
   var cmd = shellQuote( "ffmpeg" );
   for ( var i = 0; i < ffmpegArgs.length; ++i )
   {
      var a = shellQuote( ffmpegArgs[ i ] );
      if ( isWin )
         a = a.split( "%" ).join( "%%" );
      cmd += " " + a;
   }
   return isWin ? ( "@echo off\r\n" + cmd + "\r\npause\r\n" )
                : ( "#!/bin/sh\n" + cmd + "\n" );
}

// Most frequent non-empty OBJECT among the frames, "" if none carries one.
// Used to default the overlay title to the imaged target read from headers,
// so an untitled video is never mislabeled by a stale hand-typed name.
function dominantObject( frames )
{
   var counts = {};
   var best = "", bestN = 0;
   for ( var i = 0; i < frames.length; ++i )
   {
      var o = frames[ i ].object;
      if ( !o || !o.length )
         continue;
      counts[ o ] = ( counts[ o ] || 0 ) + 1;
      if ( counts[ o ] > bestN )
      {
         bestN = counts[ o ];
         best = o;
      }
   }
   return best;
}

// The overlay title actually used: an explicit user title wins, otherwise the
// OBJECT keyword read from the frames.
function resolveTitle( cfg, frames )
{
   var t = cfg.ovTitle ? String( cfg.ovTitle ).trim() : "";
   return t.length ? t : dominantObject( frames );
}

// Extract the frame metadata Session Cinema needs from a raw keyword map.
function frameMetaFromKeywords( map )
{
   var meta = { dateObs: null, exposure: 0, object: "", filter: "", cfa: false,
                siteLat: null, siteLong: null, dateObsStr: "" };
   meta.dateObsStr = kwValue( map[ "DATE-OBS" ] );
   meta.dateObs = parseDateObs( meta.dateObsStr );
   var la = parseFloat( kwValue( map[ "SITELAT" ] || map[ "LAT-OBS" ] || map[ "OBSGEO-B" ] || "" ) );
   if ( isFinite( la ) ) meta.siteLat = la;
   var lo = parseFloat( kwValue( map[ "SITELONG" ] || map[ "LONG-OBS" ] || map[ "OBSGEO-L" ] || "" ) );
   if ( isFinite( lo ) ) meta.siteLong = lo;
   var exp = parseFloat( kwValue( map[ "EXPTIME" ] || map[ "EXPOSURE" ] || "" ) );
   if ( isFinite( exp ) && exp > 0 )
      meta.exposure = exp;
   meta.object = kwValue( map[ "OBJECT" ] || "" );
   meta.filter = kwValue( map[ "FILTER" ] || "" );
   var pat = kwValue( map[ "BAYERPAT" ] || map[ "COLORTYP" ] || "" );
   meta.cfa = pat.length > 0 && pat.toUpperCase() != "NONE";
   return meta;
}

// ============================================================================
// MULTI-FILTER COLOUR — filter detection, palettes, channel mapping (pure)
// ============================================================================
//
// A night may span several filters interleaved in time (H, O, S, …). The
// progressive stack can combine them into an RGB composite: each channel is fed
// by one filter, chosen from a palette preset or overridden by the user. All of
// the following is free of PixInsight APIs and unit-tested.

// Map a raw FILTER keyword to a canonical narrowband/broadband role token so
// palettes can match "H"/"Ha"/"Halpha" alike. Unknown names pass through
// uppercased, so an exact-name palette/override still works.
function canonicalFilter( name )
{
   var s = String( name || "" ).trim().toUpperCase().replace( /[\s_\-]/g, "" );
   if ( s == "" ) return "";
   if ( s == "HA" || s == "H" || s == "HALPHA" || s == "HALPH" ) return "Ha";
   if ( s == "OIII" || s == "O3" || s == "O" || s == "OII" ) return "OIII";
   if ( s == "SII" || s == "S2" || s == "S" ) return "SII";
   if ( s == "L" || s == "LUM" || s == "LUMINANCE" || s == "CLEAR" ) return "L";
   if ( s == "R" || s == "RED" ) return "R";
   if ( s == "G" || s == "GREEN" ) return "G";
   if ( s == "B" || s == "BLUE" ) return "B";
   return s;
}

// Palette presets: channel → canonical role. Resolved against the filters
// actually present. "custom" means: use the explicit chR/chG/chB overrides.
var PALETTES = {
   SHO:  { R: "SII", G: "Ha",   B: "OIII", label: "SHO (Hubble)" },
   HOO:  { R: "Ha",  G: "OIII", B: "OIII", label: "HOO (bicolour)" },
   HOS:  { R: "Ha",  G: "OIII", B: "SII",  label: "HOS" },
   RGB:  { R: "R",   G: "G",    B: "B",    label: "RGB" },
   // Kept so a config saved with it still resolves, but not offered: it was an
   // exact alias of RGB. Luminance subs were counted in the filter list and fed
   // no channel, which is a promise the render never kept.
   LRGB: { R: "R",   G: "G",    B: "B",    label: "RGB" }
};
var PALETTE_ORDER = [ "SHO", "HOO", "HOS", "RGB" ];

// Distinct FILTER values present, in first-appearance (shoot) order, with counts.
// Grouped on the CANONICAL filter, not the raw string: a night written half "Ha"
// and half "HA" used to appear as two filters, only one of which could be mapped
// to a channel, and the other half of the subs never entered the composite.
// The first spelling seen is kept as the label, so the dialog still shows what
// the headers actually say.
function detectFilters( frames )
{
   var seen = {}, out = [];
   for ( var i = 0; i < frames.length; ++i )
   {
      var f = String( ( frames[ i ] && frames[ i ].filter ) || "" ).trim();
      if ( !f.length ) continue;
      var c = canonicalFilter( f );
      if ( seen.hasOwnProperty( c ) ) { out[ seen[ c ] ].count++; continue; }
      seen[ c ] = out.length;
      out.push( { filter: f, count: 1 } );
   }
   return out;
}

// Resolve {R,G,B} → actual FILTER name (or "" for an unfed channel). Explicit
// chR/chG/chB win; otherwise the palette's canonical roles are matched against
// the detected filters. `filters` is the detectFilters() array.
// "" means "take it from the palette", which is also what an unset channel is —
// so choosing (none) in the dialog had no way to say so, and the palette refilled
// the channel on the next refresh. A leading "!" cannot be a FILTER value read
// from a header, so this sentinel cannot collide with one.
var CH_NONE = "!none";

function resolveChannelMap( cfg, filters )
{
   var byCanon = {};
   for ( var i = 0; i < filters.length; ++i )
   {
      var c = canonicalFilter( filters[ i ].filter );
      if ( !byCanon.hasOwnProperty( c ) ) byCanon[ c ] = filters[ i ].filter;  // first wins
   }
   var present = {};
   for ( var j = 0; j < filters.length; ++j )
      present[ canonicalFilter( filters[ j ].filter ) ] = true;

   function pick( override, role )
   {
      var o = String( override || "" ).trim();
      if ( o == CH_NONE ) return "";                       // explicitly left empty
      if ( o.length && present[ canonicalFilter( o ) ] ) return o;   // explicit, present
      if ( role && byCanon.hasOwnProperty( role ) ) return byCanon[ role ];
      return "";
   }
   var pal = PALETTES[ cfg.palette ] || PALETTES.SHO;
   return {
      R: pick( cfg.chR, pal.R ),
      G: pick( cfg.chG, pal.G ),
      B: pick( cfg.chB, pal.B )
   };
}

// Channels ('R'/'G'/'B') a given FILTER value feeds under a channel map (a
// filter may feed several channels, e.g. OIII → G and B in HOO).
function channelsFedBy( filter, map )
{
   var f = canonicalFilter( filter ), out = [];
   if ( map.R && f == canonicalFilter( map.R ) ) out.push( "R" );
   if ( map.G && f == canonicalFilter( map.G ) ) out.push( "G" );
   if ( map.B && f == canonicalFilter( map.B ) ) out.push( "B" );
   return out;
}

// Colour mode is meaningful only when at least two distinct filters feed the
// channels; otherwise fall back to mono. Returns the list of distinct filters used.
function mappedFilters( map )
{
   var s = {}, out = [];
   [ "R", "G", "B" ].forEach( function( c ) { if ( map[ c ] ) s[ map[ c ] ] = true; } );
   for ( var k in s ) out.push( k );
   return out;
}

// ============================================================================
// ZOOM ODYSSEY — astrometry, projection and camera path (pure math)
// ============================================================================
//
// Builds a "you are here" context zoom from the plate solve of the final image
// and PixInsight's bundled star/constellation catalogs: whole sky -> the
// constellation -> the field -> the image revealing itself. Everything below
// is free of PixInsight APIs and exercised by tests/zoom.test.js. The WCS is
// the linear part of the AstrometricSolution (reference point + CD matrix +
// gnomonic deprojection); sub-arcsecond spline distortion is irrelevant at
// zoom scales and intentionally ignored.

var DEG = Math.PI/180;

function deg2rad( d ) { return d*DEG; }
function rad2deg( r ) { return r/DEG; }

function smoothstep01( t )
{
   if ( t <= 0 ) return 0;
   if ( t >= 1 ) return 1;
   return t*t*( 3 - 2*t );
}

// Quintic ease-in-out (zero velocity AND acceleration at both ends) for a
// smoother camera motion than cubic smoothstep.
function smootherstep01( t )
{
   if ( t <= 0 ) return 0;
   if ( t >= 1 ) return 1;
   return t*t*t*( t*( t*6 - 15 ) + 10 );
}

// Cubic ease-OUT: fast from the start, decelerating to a stop. Used for the
// zoom so the wide opening (and its horizon) is left behind quickly rather than
// lingering during the roll.
function easeOut01( t )
{
   if ( t <= 0 ) return 0;
   if ( t >= 1 ) return 1;
   var u = 1 - t;
   return 1 - u*u*u;
}

// Great-circle separation between two sky points, in degrees.
function angularSepDeg( ra1, dec1, ra2, dec2 )
{
   var a1 = deg2rad( ra1 ), d1 = deg2rad( dec1 ), a2 = deg2rad( ra2 ), d2 = deg2rad( dec2 );
   var c = Math.sin( d1 )*Math.sin( d2 ) + Math.cos( d1 )*Math.cos( d2 )*Math.cos( a1 - a2 );
   c = Math.max( -1, Math.min( 1, c ) );
   return rad2deg( Math.acos( c ) );
}

// WCS from the AstrometricSolution linear part.
//   refRA, refDec : reference celestial coordinates (deg)
//   refX,  refY   : reference image coordinates (px)
//   cd = [ [m11,m12], [m21,m22] ] : tangent-plane deg = cd * (pixel - refPixel)
function makeWcs( refRA, refDec, refX, refY, cd )
{
   return { refRA: refRA, refDec: refDec, refX: refX, refY: refY, cd: cd };
}

// Image pixel (x,y) -> celestial (ra,dec) in degrees, standard gnomonic (TAN)
// deprojection about the reference point.
function wcsPixelToSky( wcs, x, y )
{
   var dx = x - wcs.refX, dy = y - wcs.refY;
   var xi  = deg2rad( wcs.cd[0][0]*dx + wcs.cd[0][1]*dy );
   var eta = deg2rad( wcs.cd[1][0]*dx + wcs.cd[1][1]*dy );
   var a0 = deg2rad( wcs.refRA ), d0 = deg2rad( wcs.refDec );
   var rho = Math.sqrt( xi*xi + eta*eta );
   if ( rho == 0 )
      return { ra: ( wcs.refRA + 360 ) % 360, dec: wcs.refDec };
   var c = Math.atan( rho );
   var sinc = Math.sin( c ), cosc = Math.cos( c );
   var dec = Math.asin( cosc*Math.sin( d0 ) + eta*sinc*Math.cos( d0 )/rho );
   var ra = a0 + Math.atan2( xi*sinc, rho*Math.cos( d0 )*cosc - eta*Math.sin( d0 )*sinc );
   return { ra: ( rad2deg( ra ) + 360 ) % 360, dec: rad2deg( dec ) };
}

// Derived framing of a solved image: center, angular width, roll, pixel scale.
function wcsImageFraming( wcs, width, height )
{
   var center = wcsPixelToSky( wcs, width/2, height/2 );
   var det = Math.abs( wcs.cd[0][0]*wcs.cd[1][1] - wcs.cd[0][1]*wcs.cd[1][0] );
   var scale = Math.sqrt( det );                 // deg/px
   // Position angle of the image +y (up) axis on the sky.
   var roll = Math.atan2( wcs.cd[0][1], wcs.cd[1][1] );
   return {
      centerRA: center.ra,
      centerDec: center.dec,
      fovDeg: scale*width,                        // angular width of the frame
      rollDeg: rad2deg( roll ),
      pixScaleArcsec: scale*3600
   };
}

// --- 3D vector helpers (equatorial Cartesian: x=cosδcosα, y=cosδsinα, z=sinδ)
function raDecToVec( ra, dec )
{
   var a = deg2rad( ra ), d = deg2rad( dec );
   return [ Math.cos( d )*Math.cos( a ), Math.cos( d )*Math.sin( a ), Math.sin( d ) ];
}
function vecToRaDec( v )
{
   return { ra: ( rad2deg( Math.atan2( v[1], v[0] ) ) + 360 ) % 360,
            dec: rad2deg( Math.atan2( v[2], Math.sqrt( v[0]*v[0] + v[1]*v[1] ) ) ) };
}
function vdot( a, b ) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function vcross( a, b ) { return [ a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0] ]; }
function vnorm( a ) { var m = Math.sqrt( vdot( a, a ) ) || 1; return [ a[0]/m, a[1]/m, a[2]/m ]; }

// Camera as an orthonormal basis (forward=look, up, right=east-ish), a FOV and
// an in-plane roll. Works for both the equatorial framing and an arbitrary
// alt-az orientation (used to open from the observer's local horizon).
function makeCameraFromBasis( forward, up, fovDeg, rollDeg, W, H )
{
   var f = vnorm( forward );
   var u = vnorm( [ up[0] - f[0]*vdot( up, f ), up[1] - f[1]*vdot( up, f ), up[2] - f[2]*vdot( up, f ) ] );
   var r = vnorm( vcross( u, f ) );   // east when up is celestial north
   return { f: f, u: u, r: r, fovDeg: fovDeg, rollDeg: rollDeg || 0, W: W, H: H };
}

// Camera looking at (ra0,dec0), north up (before roll). RA increases to the
// left, north is up — identical outputs to the previous spherical formulation.
function makeCamera( ra0, dec0, fovDeg, rollDeg, W, H )
{
   var f = raDecToVec( ra0, dec0 );
   var zproj = [ -f[0]*f[2], -f[1]*f[2], 1 - f[2]*f[2] ];   // celestial north perp to f
   if ( vdot( zproj, zproj ) < 1e-12 )
      zproj = [ 1, 0, 0 ];                                   // at a pole: arbitrary up
   return makeCameraFromBasis( f, zproj, fovDeg, rollDeg, W, H );
}

// Stereographic projection of a sky point to screen pixels — stable from an
// all-sky view down to a fraction of a degree. Returns { x, y, front }.
function projectToScreen( cam, ra, dec )
{
   var v = raDecToVec( ra, dec );
   var x = vdot( v, cam.r ), y = vdot( v, cam.u ), z = vdot( v, cam.f );
   var k = 2/( 1 + z );
   var xp = k*x, yp = k*y;
   var rEdge = 2*Math.tan( deg2rad( cam.fovDeg/2 )/2 );
   var s = ( cam.W/2 )/rEdge;
   var cr = Math.cos( deg2rad( cam.rollDeg ) ), sr = Math.sin( deg2rad( cam.rollDeg ) );
   var rx = xp*cr - yp*sr;
   var ry = xp*sr + yp*cr;
   return {
      x: cam.W/2 - s*rx,     // higher RA (east) to the left
      y: cam.H/2 - s*ry,     // north up
      front: z > -0.2
   };
}

// Undo projectToScreen: the sky direction a screen pixel looks at, as a unit
// vector in the same frame the camera basis is built in. The stereographic
// projection is invertible over the whole sphere but its antipode, so this is
// exact rather than an approximation — tests/announced.test.js round-trips it
// against the forward projection before resting anything on it.
function screenToVec( cam, x, y )
{
   var rEdge = 2*Math.tan( deg2rad( cam.fovDeg/2 )/2 );
   var s = ( cam.W/2 )/rEdge;
   var rx = ( cam.W/2 - x )/s, ry = ( cam.H/2 - y )/s;
   var cr = Math.cos( deg2rad( cam.rollDeg ) ), sr = Math.sin( deg2rad( cam.rollDeg ) );
   var xp = rx*cr + ry*sr, yp = -rx*sr + ry*cr;
   var rho = Math.sqrt( xp*xp + yp*yp );
   var theta = 2*Math.atan( rho/2 );             // stereographic: rho = 2 tan(theta/2)
   var sn = Math.sin( theta ), z = Math.cos( theta );
   var ux = rho > 0 ? xp/rho : 0, uy = rho > 0 ? yp/rho : 0;
   return [ sn*ux*cam.r[ 0 ] + sn*uy*cam.u[ 0 ] + z*cam.f[ 0 ],
            sn*ux*cam.r[ 1 ] + sn*uy*cam.u[ 1 ] + z*cam.f[ 1 ],
            sn*ux*cam.r[ 2 ] + sn*uy*cam.u[ 2 ] + z*cam.f[ 2 ] ];
}

// Frame-constant projector: all the camera-only terms computed ONCE, plus a
// cull threshold on z = vec·forward (no on-screen point can have a smaller z,
// so a star below it is safely skipped before any projection math). Hot loops
// use projectVecPre with precomputed star/vertex vectors — no per-point trig.
function cameraProjector( cam )
{
   var rEdge = 2*Math.tan( deg2rad( cam.fovDeg/2 )/2 );
   var s = ( cam.W/2 )/rEdge;
   var half = Math.sqrt( cam.W*cam.W + cam.H*cam.H )/2;     // corner radius (px)
   var thetaCorner = 2*Math.atan( ( half/s )/2 );           // its angular distance
   var cullZ = Math.cos( Math.min( Math.PI, thetaCorner + deg2rad( 2 ) ) );
   return { f: cam.f, u: cam.u, r: cam.r, s: s,
            cr: Math.cos( deg2rad( cam.rollDeg ) ), sr: Math.sin( deg2rad( cam.rollDeg ) ),
            W: cam.W, H: cam.H, fovDeg: cam.fovDeg, cullZ: cullZ };
}

// Project a PRECOMPUTED unit vector. Returns { x, y } or null when the point is
// culled (behind the camera or outside the frame). Identical screen coords to
// projectToScreen for on-screen points.
function projectVecPre( pj, v )
{
   var z = pj.f[0]*v[0] + pj.f[1]*v[1] + pj.f[2]*v[2];
   if ( z <= pj.cullZ )
      return null;
   var x = pj.r[0]*v[0] + pj.r[1]*v[1] + pj.r[2]*v[2];
   var y = pj.u[0]*v[0] + pj.u[1]*v[1] + pj.u[2]*v[2];
   var k = 2/( 1 + z );
   var xp = k*x, yp = k*y;
   var rx = xp*pj.cr - yp*pj.sr, ry = xp*pj.sr + yp*pj.cr;
   return { x: pj.W/2 - pj.s*rx, y: pj.H/2 - pj.s*ry };
}

// --- Observer-frame astronomy (for the "you are here on Earth" opening) ------

// Julian Date from epoch seconds (UTC).
function julianDate( epochSeconds )
{
   return epochSeconds/86400 + 2440587.5;
}

// Greenwich mean sidereal time (degrees) for a Julian Date.
function gmstDeg( jd )
{
   var T = ( jd - 2451545.0 )/36525;
   var g = 280.46061837 + 360.98564736629*( jd - 2451545.0 ) + 0.000387933*T*T - T*T*T/38710000;
   return ( ( g % 360 ) + 360 ) % 360;
}

// Local sidereal time (degrees) at an east-positive longitude.
function lstDeg( jd, longEastDeg )
{
   return ( ( gmstDeg( jd ) + longEastDeg ) % 360 + 360 ) % 360;
}

// (ra,dec) -> local horizontal (alt,az) — az from North through East, degrees.
function raDecToAltAz( ra, dec, lst, latDeg )
{
   var H = deg2rad( ( ( lst - ra ) % 360 + 360 ) % 360 );
   var d = deg2rad( dec ), lat = deg2rad( latDeg );
   var sinAlt = Math.sin( d )*Math.sin( lat ) + Math.cos( d )*Math.cos( lat )*Math.cos( H );
   sinAlt = Math.max( -1, Math.min( 1, sinAlt ) );
   var alt = Math.asin( sinAlt );
   var az = Math.atan2( -Math.cos( d )*Math.sin( H ),
                        Math.sin( d )*Math.cos( lat ) - Math.cos( d )*Math.sin( lat )*Math.cos( H ) );
   return { alt: rad2deg( alt ), az: ( rad2deg( az ) + 360 ) % 360 };
}

// local horizontal (alt,az) -> (ra,dec), the inverse of raDecToAltAz.
function altAzToRaDec( alt, az, lst, latDeg )
{
   var a = deg2rad( alt ), A = deg2rad( az ), lat = deg2rad( latDeg );
   var sinDec = Math.sin( a )*Math.sin( lat ) + Math.cos( a )*Math.cos( lat )*Math.cos( A );
   sinDec = Math.max( -1, Math.min( 1, sinDec ) );
   var dec = Math.asin( sinDec );
   var H = Math.atan2( -Math.sin( A )*Math.cos( a ),
                       Math.sin( a )*Math.cos( lat ) - Math.cos( a )*Math.sin( lat )*Math.cos( A ) );
   var ra = ( ( lst - rad2deg( H ) ) % 360 + 360 ) % 360;
   return { ra: ra, dec: rad2deg( dec ) };
}

// Camera along the zoom at normalized time t in [0,1]: center fixed on the
// target, FOV shrinking log-linearly (a "powers of ten" feel), north kept up
// so the image drops in at its true orientation on reveal.
function zoomCameraAt( t, target, startFovDeg, W, H )
{
   var e = smootherstep01( t );   // ease-in-out: gentle start AND stop
   var fov = Math.exp( Math.log( startFovDeg )*( 1 - e ) + Math.log( target.fovDeg )*e );
   var fEnd = raDecToVec( target.centerRA, target.centerDec );
   // The image is the anchor: the camera stays locked to its frame the whole
   // zoom — NO roll, nothing spins. The sky simply appears in the image's
   // orientation. up = the image's own up (north-up when none is supplied).
   var up = target.upVec || vnorm( [ -fEnd[0]*fEnd[2], -fEnd[1]*fEnd[2], 1 - fEnd[2]*fEnd[2] ] );
   return makeCameraFromBasis( fEnd, up, fov, 0, W, H );
}

// Spherical linear interpolation between two unit vectors.
function slerpVec( a, b, t )
{
   var d = Math.max( -1, Math.min( 1, vdot( a, b ) ) );
   var om = Math.acos( d );
   if ( om < 1e-6 )
      return vnorm( [ a[0] + ( b[0]-a[0] )*t, a[1] + ( b[1]-a[1] )*t, a[2] + ( b[2]-a[2] )*t ] );
   var so = Math.sin( om ), c0 = Math.sin( ( 1-t )*om )/so, c1 = Math.sin( t*om )/so;
   return vnorm( [ c0*a[0]+c1*b[0], c0*a[1]+c1*b[1], c0*a[2]+c1*b[2] ] );
}

// Opening framing for the location path: find the camera center altitude and
// FOV so the TARGET sits at ~1/4 from the top of the frame and the HORIZON
// sits near the bottom (~85% of the height, just above the title band).
// Stereographic vertical offset of a point θ° from center: y = 2·s·tan(θ/2)
// with s = W / (4·tan(fov/4)). Solved by bisection on the FOV; falls back to
// pinning the target at 1/4 when both constraints can't hold (very high alt).
function locationStartFraming( targetAltDeg, W, H )
{
   var T_FRAC = 0.25;   // target above center: 0.25·H from the top
   var H_FRAC = 0.35;   // horizon below center: 0.85·H from the top
   function sOf( fov ) { return W/( 4*Math.tan( deg2rad( fov )/4 ) ); }
   function altC( fov ) { return 2*rad2deg( Math.atan( H_FRAC*H/( 2*sOf( fov ) ) ) ); }
   function g( fov )
   {
      return 2*sOf( fov )*Math.tan( deg2rad( targetAltDeg - altC( fov ) )/2 ) - T_FRAC*H;
   }
   var lo = 10, hi = 150;
   if ( g( hi ) > 0 )
   {
      // Target too high for both constraints: keep it at 1/4, horizon drops.
      var s = sOf( hi );
      return { fovDeg: hi, altCDeg: targetAltDeg - 2*rad2deg( Math.atan( T_FRAC*H/( 2*s ) ) ) };
   }
   if ( g( lo ) < 0 )
      return { fovDeg: lo, altCDeg: altC( lo ) };
   for ( var i = 0; i < 60; ++i )
   {
      var mid = ( lo + hi )/2;
      if ( g( mid ) > 0 ) lo = mid; else hi = mid;
   }
   var fov = ( lo + hi )/2;
   return { fovDeg: fov, altCDeg: altC( fov ) };
}

// Camera along the LOCATION path. It opens with the target ~1/4 from the top
// and the real horizon low (up = local zenith, level horizon). The look
// direction re-centers onto the target early (t≈0.15). The ROLL — from the
// level horizon to the image's own frame — is spread gently all the way to
// where the photo starts to appear (target.tRoll), then held; since the surveys
// track the roll correctly this reads as a slow, unified turn. obs = { lst, lat,
// targetAlt, targetAz, startFov, altC }.
function zoomCameraLocation( t, target, startFovDeg, W, H, obs )
{
   var e = smootherstep01( t );   // ease-in-out: gentle start AND stop
   var fov = Math.exp( Math.log( startFovDeg )*( 1 - e ) + Math.log( target.fovDeg )*e );
   var eSlew = smootherstep01( Math.min( 1, t/0.15 ) );                 // re-centre early
   var eRoll = smootherstep01( Math.min( 1, t/( target.tRoll || 0.85 ) ) );  // roll, spread

   var fEnd = raDecToVec( target.centerRA, target.centerDec );
   var startC = altAzToRaDec( ( obs.altC !== undefined ) ? obs.altC : obs.targetAlt, obs.targetAz, obs.lst, obs.lat );
   var fStart = raDecToVec( startC.ra, startC.dec );
   var zenith = raDecToVec( obs.lst, obs.lat );                        // local vertical

   var f = slerpVec( fStart, fEnd, eSlew );

   // Roll as an ANGLE offset from a continuous north-up carrier (singularity-free
   // near the zenith), from the level horizon at the START to the IMAGE's own up
   // at the end of the opening — then held.
   function northUp( v ) { return vnorm( [ -v[0]*v[2], -v[1]*v[2], 1 - v[2]*v[2] ] ); }
   function projPerp( u, v ) { var d = vdot( u, v ); return vnorm( [ u[0]-v[0]*d, u[1]-v[1]*d, u[2]-v[2]*d ] ); }
   function rollOff( nu, ref, axis ) { return Math.atan2( vdot( vcross( nu, ref ), axis ), vdot( nu, ref ) ); }

   var endUp = target.upVec || northUp( fEnd );
   var rollA = rollOff( northUp( fStart ), projPerp( zenith, fStart ), fStart );   // start: level
   var rollB = rollOff( northUp( fEnd ), endUp, fEnd );                            // end: image up
   while ( rollB - rollA >  Math.PI ) rollB -= 2*Math.PI;                          // shortest path
   while ( rollB - rollA < -Math.PI ) rollB += 2*Math.PI;
   var roll = rollA*( 1 - eRoll ) + rollB*eRoll;

   var nu = northUp( f ), cx = vcross( f, nu ), cr = Math.cos( roll ), sr = Math.sin( roll );
   var up = vnorm( [ nu[0]*cr + cx[0]*sr, nu[1]*cr + cx[1]*sr, nu[2]*cr + cx[2]*sr ] );
   return makeCameraFromBasis( f, up, fov, 0, W, H );
}

// Opacity of the real-image reveal as the FOV approaches the image field. The
// image starts appearing several times wider than its own field: its dense,
// real stars bridge the range where the bright-star catalog runs thin, so the
// zoom never crosses an empty gap — and every star shown there is genuine.
function revealAlpha( fovDeg, imageFovDeg, wideMult )
{
   var wide = imageFovDeg*( wideMult || 6 );
   if ( fovDeg <= imageFovDeg ) return 1;
   if ( fovDeg >= wide ) return 0;
   return smoothstep01( ( wide - fovDeg )/( wide - imageFovDeg ) );
}

// Field of view (deg, horizontal — what the camera spans over W) the zoom ends
// on, so the revealed image lands in the output frame the way Framing says.
//   imageFov  angular WIDTH of the reveal (its plate solve)
//   revealW/H its pixel dimensions, W/H the output frame's
// Two candidates: the fov whose width matches the image's width, and the one
// whose height does. Taking the LARGER contains the whole image (letterbox, with
// black where the sky has faded out); taking the SMALLER covers the frame and
// crops the image (fill). They are EQUAL when the output aspect matches the
// reveal's — which is why a 16:9 render cannot tell the two apart, and why this
// went unnoticed until a 9:16 export came out two thirds black.
function zoomEndFov( imageFov, revealW, revealH, W, H, fitMode )
{
   // Same aspect: both candidates are the same framing. Settled on the integer
   // pixel dimensions rather than on the two fovs, so an existing 16:9 render
   // keeps its EXACT camera path — the float expression below agrees to within a
   // rounding step, which is not the same thing as agreeing.
   if ( revealW*H == revealH*W )
      return imageFov;
   var byWidth = imageFov;                                   // image width  = frame width
   var byHeight = ( imageFov*revealH/revealW )*W/H;          // image height = frame height
   return ( fitMode == FIT_CROP ) ? Math.min( byWidth, byHeight )
                                  : Math.max( byWidth, byHeight );
}

// Opacity of the constellation figures: present from the very first frame
// (whole sky, a touch calmer to avoid clutter), full across medium fields,
// gone once we dive into the target field.
function constellationAlpha( fovDeg )
{
   if ( fovDeg <= 4 ) return 0;
   if ( fovDeg < 8 ) return smoothstep01( ( fovDeg - 4 )/4 );
   if ( fovDeg <= 60 ) return 1;
   if ( fovDeg < 160 ) return 0.45 + 0.55*smoothstep01( ( 160 - fovDeg )/100 );
   return 0.45;
}

// Opacity of constellation NAME labels — a narrower band than the figures, so
// names appear once the figure is readable and vanish before the dive.
function constellationLabelAlpha( fovDeg )
{
   return ( fovDeg > 6 && fovDeg < 150 ) ? constellationAlpha( fovDeg ) : 0;
}

// Generic fade band over a DECREASING quantity (the FOV): 0 at inStart, ramps
// to 1 by inFull, holds to outFull, ramps back to 0 by outEnd.
// inStart > inFull >= outFull > outEnd.
function fadeBand( x, inStart, inFull, outFull, outEnd )
{
   if ( x >= inStart ) return 0;
   if ( x > inFull ) return smoothstep01( ( inStart - x )/( inStart - inFull ) );
   if ( x >= outFull ) return 1;
   if ( x > outEnd ) return smoothstep01( ( x - outEnd )/( outFull - outEnd ) );
   return 0;
}

// Limiting magnitude shown at a given FOV: the bright naked-eye set on the
// whole-sky shot, everything the catalog has (to ~mag 7) once we close in.
function limitingMagnitude( fovDeg )
{
   var f = Math.min( 60, Math.max( 5, fovDeg ) );
   return 6.5 + 0.5*smoothstep01( ( 60 - f )/55 );
}

// Synthetic WCS for a HiPS survey image: a TAN cutout centered on (ra,dec),
// north up, east left (the hips2fits default), nPx square, fovDeg across.
function makeSurveyWcs( ra, dec, fovDeg, nPx )
{
   var s = fovDeg/nPx;   // deg/px
   return makeWcs( ra, dec, nPx/2, nPx/2, [ [ -s, 0 ], [ 0, -s ] ] );
}

// Rescale a WCS from one pixel grid to another covering the SAME sky field
// (e.g. a solved master vs a finished JPEG of the same framing at a different
// resolution). Reference pixel scales with size; the CD (deg/px) scales inverse.
function scaleWcsToDims( wcs, fromW, fromH, toW, toH )
{
   var sx = toW/fromW, sy = toH/fromH;
   return makeWcs( wcs.refRA, wcs.refDec, wcs.refX*sx, wcs.refY*sy,
      [ [ wcs.cd[ 0 ][ 0 ]/sx, wcs.cd[ 0 ][ 1 ]/sy ],
        [ wcs.cd[ 1 ][ 0 ]/sx, wcs.cd[ 1 ][ 1 ]/sy ] ] );
}

// WCS for a reveal image that maps onto the solved image by the similarity
//   solvedPixel = offset + M · revealPixel,   M = R(rotDeg) · diag(scale·fx, scale·fy)
// (fx/fy = -1 for a horizontal/vertical flip) — the full output of the visual
// alignment tool (drag + scale + rotate + flip). With rotDeg=0 and no flip this
// reduces to the plain offset+scale crop.
// The ONE reveal→background linear map, M = R(+θ)·diag(±scale, ±scale),
// shared by every consumer: the popup preview (revealPlacement), the zoom
// render WCS (cropWcs/cropWcsCentered) and the auto-align decomposition.
// The R(+θ) convention was measured end-to-end on a reveal aligned at 32° —
// with R(−θ) the DSS2 survey showed the nebula as a ghost rotated by exactly
// 2·θ next to the photo; with R(+θ) they coincide. Keeping a single source
// makes that class of desync structurally impossible.
function placementMatrix( scale, rotDeg, flipH, flipV )
{
   var th = deg2rad( rotDeg || 0 ), c = Math.cos( th ), s = Math.sin( th );
   var fx = flipH ? -1 : 1, fy = flipV ? -1 : 1;
   return [ [ scale*fx*c, -scale*fy*s ], [ scale*fx*s, scale*fy*c ] ];
}

function cropWcs( wcs, offX, offY, scale, rotDeg, flipH, flipV )
{
   var M = placementMatrix( scale, rotDeg, flipH, flipV );
   var m00 = M[ 0 ][ 0 ], m01 = M[ 0 ][ 1 ];
   var m10 = M[ 1 ][ 0 ], m11 = M[ 1 ][ 1 ];
   var cd = wcs.cd;
   var CD = [ [ cd[0][0]*m00 + cd[0][1]*m10, cd[0][0]*m01 + cd[0][1]*m11 ],
              [ cd[1][0]*m00 + cd[1][1]*m10, cd[1][0]*m01 + cd[1][1]*m11 ] ];
   var det = m00*m11 - m01*m10;
   var dx = wcs.refX - offX, dy = wcs.refY - offY;
   var refX = (  m11*dx - m01*dy )/det;   // inv(M) · (refPixSolved - offset)
   var refY = ( -m10*dx + m00*dy )/det;
   return makeWcs( wcs.refRA, wcs.refDec, refX, refY, CD );
}

// Like cropWcs but the alignment is expressed about the reveal CENTRE (cx,cy =
// where the reveal centre lands in solved px), so rotation pivots on the centre:
//   solvedPixel = (cx,cy) + M · ( revealPixel - revealCentre )
function cropWcsCentered( wcs, cx, cy, scale, rotDeg, flipH, flipV, revealW, revealH )
{
   var M = placementMatrix( scale, rotDeg, flipH, flipV );
   var hx = revealW/2, hy = revealH/2;
   var mx = M[ 0 ][ 0 ]*hx + M[ 0 ][ 1 ]*hy;   // M · revealCentre
   var my = M[ 1 ][ 0 ]*hx + M[ 1 ][ 1 ]*hy;
   return cropWcs( wcs, cx - mx, cy - my, scale, rotDeg, flipH, flipV );
}

// Unit-sphere centroid of each constellation from ConstellationBorders.json
// (segments carry the two adjacent constellation codes c1/c2; x is in degrees).
// Returns { CODE: { ra, dec } }.
function constellationCentroids( bordersJson )
{
   var data = ( typeof bordersJson == "string" ) ? JSON.parse( bordersJson ) : bordersJson;
   var acc = {};
   function add( code, ra, dec )
   {
      if ( !code )
         return;
      var a = deg2rad( ra ), d = deg2rad( dec );
      var v = acc[ code ] || ( acc[ code ] = { x: 0, y: 0, z: 0 } );
      v.x += Math.cos( d )*Math.cos( a );
      v.y += Math.cos( d )*Math.sin( a );
      v.z += Math.sin( d );
   }
   for ( var i = 0; i < data.length; ++i )
   {
      var pol = data[ i ].pol;
      if ( !pol )
         continue;
      for ( var j = 0; j < pol.length; ++j )
      {
         add( data[ i ].c1, pol[ j ].x, pol[ j ].y );
         add( data[ i ].c2, pol[ j ].x, pol[ j ].y );
      }
   }
   var out = {};
   for ( var code in acc )
   {
      var v = acc[ code ];
      out[ code ] = {
         ra: ( rad2deg( Math.atan2( v.y, v.x ) ) + 360 ) % 360,
         dec: rad2deg( Math.atan2( v.z, Math.sqrt( v.x*v.x + v.y*v.y ) ) )
      };
   }
   return out;
}

// Dot radius (px) for a star of given magnitude at the given magnitude limit.
function starRadius( mag, magLimit, unit )
{
   var b = magLimit - mag;
   if ( b <= 0 ) return 0;
   return Math.max( 0.6*unit, 0.75*unit*Math.pow( b, 0.72 ) );
}

// Round angle just below `targetDeg`, for an honest scale bar.
function niceAngle( targetDeg )
{
   var cands = [ 90, 60, 30, 15, 10, 5, 2, 1, 0.5, 30/60, 15/60, 10/60, 5/60, 2/60, 1/60 ];
   for ( var i = 0; i < cands.length; ++i )
      if ( cands[ i ] <= targetDeg )
         return cands[ i ];
   return cands[ cands.length - 1 ];
}

function formatAngle( deg )
{
   if ( deg >= 1 )
      return ( Math.round( deg*10 )/10 ) + "°";
   var arcmin = deg*60;
   if ( arcmin >= 1 )
      return ( Math.round( arcmin*10 )/10 ) + "′";
   return ( Math.round( arcmin*600 )/10 ) + "″";
}

// A scale bar spanning about a quarter of the frame for the current FOV.
// The bar must span the angle it states AT THE PLACE IT IS DRAWN. The renderer
// is stereographic, so pixels per degree grow with distance from the frame
// centre: sizing the bar on the frame-wide average W/fovDeg is right at exactly
// one radius and wrong everywhere else — and most wrong in the corners, which is
// where drawZoomOverlay puts it. On a 16:9 opening the average understates the
// corner by 40%; on a 9:16 export, where the bar sits far below the horizontal
// half-width, by nearly a factor of three.
//
// x1,y is the bar's RIGHT end in screen pixels. The length is solved, not
// computed: the angle a segment spans grows monotonically with its length, so
// bisection lands on the length that spans the stated angle exactly. The target
// is still a quarter of the frame's width, read as sky at that same place.
function scaleBar( cam, x1, y )
{
   var right = screenToVec( cam, x1, y );
   function spanOf( len )
   {
      var v = screenToVec( cam, x1 - len, y );
      var d = vdot( right, v );
      return rad2deg( Math.acos( d < -1 ? -1 : ( d > 1 ? 1 : d ) ) );
   }
   var ang = niceAngle( spanOf( cam.W*0.25 ) );
   // Searching past a quarter width costs nothing and keeps the bar honest in
   // the degenerate case where even the smallest label needs more room.
   var lo = 0, hi = cam.W*0.9;
   for ( var i = 0; i < 60; ++i )
   {
      var mid = ( lo + hi )/2;
      if ( spanOf( mid ) < ang )
         lo = mid;
      else
         hi = mid;
   }
   return { label: formatAngle( ang ), lengthPx: ( lo + hi )/2 };
}

// NamedStars.csv / Messier.csv share "id,alpha(deg),delta(deg),magnitude,..."
// -> [{ ra, dec, mag, name }], optionally magnitude-limited. nameCol picks the
// common-name column (7 for NamedStars); "" when absent or not requested.
function parseStarCatalog( csvText, maxMag, nameCol )
{
   var out = [];
   var lines = String( csvText ).split( "\n" );
   for ( var i = 1; i < lines.length; ++i )
   {
      var f = lines[ i ].split( "," );
      if ( f.length < 4 )
         continue;
      var ra = parseFloat( f[ 1 ] ), dec = parseFloat( f[ 2 ] ), mag = parseFloat( f[ 3 ] );
      if ( !isFinite( ra ) || !isFinite( dec ) || !isFinite( mag ) )
         continue;
      if ( maxMag !== undefined && mag > maxMag )
         continue;
      var name = ( nameCol !== undefined && f.length > nameCol ) ? f[ nameCol ].trim() : "";
      out.push( { ra: ra, dec: dec, mag: mag, name: name } );
   }
   return out;
}

// ConstellationLines.json: [ { pol:[ {x:RA_hours, y:Dec_deg}, ... ] }, ... ]
// -> array of polylines, each an array of { ra(deg), dec(deg) }.
function parseConstellationLines( jsonText )
{
   var data = ( typeof jsonText == "string" ) ? JSON.parse( jsonText ) : jsonText;
   var polys = [];
   for ( var i = 0; i < data.length; ++i )
   {
      var pol = data[ i ].pol;
      if ( !pol )
         continue;
      var pts = [];
      for ( var j = 0; j < pol.length; ++j )
         pts.push( { ra: pol[ j ].x*15, dec: pol[ j ].y } );
      if ( pts.length >= 2 )
         polys.push( pts );
   }
   return polys;
}

// ============================================================================
// SETTINGS PERSISTENCE (single JSON blob; failures are non-fatal)
// ============================================================================

// Can a persisted reveal rotation be trusted?
//
// 1.1.0 unified the reveal→background map on R(+θ); ≤ 1.0.0 stored R(−θ). Same
// key, same type, opposite meaning, and no stamp to tell them apart — so a value
// saved by 1.0.0 renders 2·θ away from the sky under 1.1.0, silently.
//
// There is no way to recover the convention after the fact. It was checked
// against the history rather than assumed: 1.1.0 added no configuration key at
// all (its DEFAULT_CONFIG differs from 1.0.0's by one default VALUE), so nothing
// in a saved blob dates it. Negating unstamped rotations on sight would fix the
// 1.0.0 ones and break every 1.1.0 one in exactly the same silent way — trading
// one set of victims for another. So the value is left untouched and the doubt
// is REPORTED, which is the part that was actually missing: a wrong render that
// announces itself is a nuisance, a wrong render that does not is a broken promise.
//
// 0° is the same angle in both conventions, which is why most users never saw this.
function rotationNeedsCheck( cfgVersion, rotDeg )
{
   if ( !( Math.abs( rotDeg ) > 0 ) )
      return false;
   return !( cfgVersion && String( cfgVersion ).length );
}

// Both persisted alignments, checked at once: { zoom, stack, any }.
// THE definition of "this reveal placement was actually aligned". There used to
// be three answers to that question: a scale sentinel on the stacking side, none
// at all on the zoom side (zoomRevealScale defaults to 1.0 and nothing reset it),
// and a partial application of the stacking one inside the engine, which put the
// centre and the scale behind the flag but passed the rotation and the mirrors
// through unconditionally. Everything that reads a placement goes through here.
function revealAligned( cfg, which )
{
   if ( which == "zoom" )
      return !!cfg.zoomRevealAligned && cfg.zoomRevealScale > 0;
   return !!cfg.stackRevealAligned && cfg.stackRevealScale > 0;
}

// A rotation only needs checking where it is actually applied. Warning about one
// that nothing reads, with no way to dismiss it, teaches people to ignore
// warnings — and the stamp that would clear it is withheld until every pending
// rotation is checked, so the notice could never go away on its own.
function rotationsNeedingCheck( cfg )
{
   var zoomUsed = !!cfg.zoomRevealCropped && revealAligned( cfg, "zoom" );
   var stackUsed = !!( cfg.stackRevealPath && cfg.stackRevealPath.length ) &&
                   revealAligned( cfg, "stack" );
   var zoom = zoomUsed && rotationNeedsCheck( cfg.cfgVersion, cfg.zoomRevealRot );
   var stack = stackUsed && rotationNeedsCheck( cfg.cfgVersion, cfg.stackRevealRot );
   return { zoom: zoom, stack: stack, any: zoom || stack };
}

// Stamp the config with the build that wrote it — UNLESS a rotation is still
// waiting to be checked. Leaving it unstamped is what makes the warning come
// back on the next launch: stamping a config whose rotation is still in doubt
// would silence the only signal the user has, which is how this bug worked.
//
// The stamp covers the whole config while the doubt is per alignment, so a user
// who settles one of two doubtful rotations and then drags out a process icon
// gets asked about the settled one again. That asymmetry errs towards asking a
// question that was already answered, never towards vouching for a value nobody
// checked, which is the only direction that matters here.
function stampConfig( cfg, pending )
{
   cfg.cfgVersion = pending.any ? "" : SC_VERSION;
   return cfg;
}

function loadConfig()
{
   var cfg = {};
   for ( var k in DEFAULT_CONFIG )
      cfg[ k ] = DEFAULT_CONFIG[ k ];
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType.UCString );
      if ( Settings.lastReadOK && s && s.length )
      {
         var saved = JSON.parse( s );
         // Written before the aligned flag existed: the old sentinels are the only
         // evidence there was, so honour them rather than silently discarding a
         // placement the user really did make.
         if ( !saved.hasOwnProperty( "stackRevealAligned" ) )
            saved.stackRevealAligned = saved.stackRevealScale > 0;
         if ( !saved.hasOwnProperty( "zoomRevealAligned" ) )
            saved.zoomRevealAligned = !!saved.zoomRevealCropped && saved.zoomRevealScale > 0;
         for ( var k2 in DEFAULT_CONFIG )
            if ( saved.hasOwnProperty( k2 ) && typeof saved[ k2 ] == typeof DEFAULT_CONFIG[ k2 ] )
               cfg[ k2 ] = saved[ k2 ];
      }
   }
   catch ( e )
   {
   }
   return cfg;
}

function saveConfig( cfg )
{
   try
   {
      Settings.write( SETTINGS_KEY, DataType.UCString, JSON.stringify( cfg ) );
   }
   catch ( e )
   {
   }
}

// ---------------------------------------------------------------------------
// Process-instance parameters — let the New Instance triangle save the current
// settings as a draggable process icon, like any PixInsight script.

function exportParameters( cfg )
{
   for ( var k in DEFAULT_CONFIG )
      try { Parameters.set( k, cfg[ k ] ); } catch ( e ) {}
}

// Overlay any parameters carried by a launched process icon onto cfg.
function importParameters( cfg )
{
   for ( var k in DEFAULT_CONFIG )
   {
      try
      {
         if ( !Parameters.has( k ) )
            continue;
         var def = DEFAULT_CONFIG[ k ];
         if ( typeof def == "boolean" )
            cfg[ k ] = Parameters.getBoolean( k );
         else if ( typeof def == "number" )
            cfg[ k ] = Parameters.getReal( k );   // indices tolerate float values
         else
            cfg[ k ] = Parameters.getString( k );
      }
      catch ( e )
      {
      }
   }
   // A process icon is a whole config, and one dragged out before the stamp
   // existed cannot vouch for the rotation it carries. Drop the stamp the saved
   // settings may have contributed, or the icon's alignment would inherit a
   // guarantee that was given about a different alignment entirely.
   try
   {
      if ( ( Parameters.has( "zoomRevealRot" ) || Parameters.has( "stackRevealRot" ) )
           && !Parameters.has( "cfgVersion" ) )
         cfg.cfgVersion = "";
   }
   catch ( e )
   {
   }
   return cfg;
}

// ============================================================================
// FRAME SCANNING — fast header-only reads via FileFormatInstance
// ============================================================================

function keywordsToMap( keywords )
{
   var map = {};
   if ( keywords )
      for ( var i = 0; i < keywords.length; ++i )
      {
         try
         {
            map[ String( keywords[ i ].name ).toUpperCase() ] = String( keywords[ i ].value );
         }
         catch ( e )
         {
         }
      }
   return map;
}

function scanFrameHeader( path )
{
   var frame = { path: path, name: File.extractName( path ) + File.extractExtension( path ),
                 dateObs: null, dateObsStr: "", exposure: 0, object: "", filter: "", cfa: false,
                 siteLat: null, siteLong: null };
   try
   {
      var ext = File.extractExtension( path ).toLowerCase();
      var fmt = new FileFormat( ext, true, false );
      var inst = new FileFormatInstance( fmt );
      var desc = inst.open( path, "verbosity 0" );
      if ( desc && desc.length > 0 )
      {
         var meta = frameMetaFromKeywords( keywordsToMap( inst.keywords ) );
         frame.dateObs = meta.dateObs;
         frame.dateObsStr = meta.dateObsStr;
         frame.exposure = meta.exposure;
         frame.object = meta.object;
         frame.filter = meta.filter;
         frame.cfa = meta.cfa;
         frame.siteLat = meta.siteLat;
         frame.siteLong = meta.siteLong;
      }
      inst.close();
   }
   catch ( e )
   {
      // Unreadable header: keep the bare path; generation will retry or skip.
   }
   return frame;
}

var FRAME_EXTENSIONS = [ ".fit", ".fits", ".fts", ".xisf" ];

function isFramePath( path )
{
   var ext = File.extractExtension( path ).toLowerCase();
   for ( var i = 0; i < FRAME_EXTENSIONS.length; ++i )
      if ( ext == FRAME_EXTENSIONS[ i ] )
         return true;
   return false;
}

function findFramesInDirectory( dir )
{
   var found = [];
   var f = new FileFind;
   if ( f.begin( dir + "/*" ) )
      do
      {
         if ( f.isFile )
         {
            var p = dir + "/" + f.name;
            if ( isFramePath( p ) )
               found.push( p );
         }
      }
      while ( f.next() );
   found.sort();
   return found;
}

// ============================================================================
// IMAGE PIPELINE — open, debayer, stretch, render, overlay
// ============================================================================

function windowIdSet()
{
   var ids = {};
   var ws = ImageWindow.windows;
   for ( var i = 0; i < ws.length; ++i )
      ids[ ws[ i ].mainView.id ] = true;
   return ids;
}

function openFrameWindow( path )
{
   var ws = ImageWindow.open( path, "", "verbosity 0", false );
   if ( !ws || ws.length == 0 )
      return null;
   for ( var i = 1; i < ws.length; ++i )
      ws[ i ].forceClose();
   return ws[ 0 ];
}

// Debayer a CFA mono frame; returns the window to use from now on.
function maybeDebayer( win, frame, cfg )
{
   if ( !cfg.debayer || !frame.cfa || win.mainView.image.isColor )
      return win;
   try
   {
      var before = windowIdSet();
      var P = new Debayer;
      try { P.cfaPattern = Debayer.Auto; } catch ( e ) {}
      try { P.evaluateNoise = false; } catch ( e ) {}
      if ( !P.executeOn( win.mainView, false ) )
         return win;
      var ws = ImageWindow.windows;
      for ( var i = 0; i < ws.length; ++i )
         if ( !before[ ws[ i ].mainView.id ] )
         {
            win.forceClose();
            return ws[ i ];
         }
   }
   catch ( e )
   {
      console.warningln( "Debayer failed on " + frame.name + ": " + e.message );
   }
   return win;
}

// Per-channel median and MAD, degrading gracefully to combined statistics
// when channel selection is unavailable.
function imageChannelStats( img, centralOnly )
{
   var stats = [];
   var nc = img.isColor ? 3 : 1;
   try
   {
      if ( centralOnly )
      {
         var w = img.width, h = img.height;
         img.selectedRect = new Rect( Math.floor( w/4 ), Math.floor( h/4 ),
                                      Math.floor( 3*w/4 ), Math.floor( 3*h/4 ) );
      }
      for ( var c = 0; c < nc; ++c )
      {
         var med, mad;
         try
         {
            img.firstSelectedChannel = c;
            img.lastSelectedChannel = c;
            med = img.median();
            mad = img.MAD();
         }
         catch ( e )
         {
            med = img.median();
            mad = img.MAD();
         }
         stats.push( { median: med, mad: mad } );
      }
   }
   finally
   {
      try { img.resetSelections(); } catch ( e ) {}
   }
   return stats;
}

// Compute the HT parameters for a (linear) image.
function computeStretchForImage( img, linked )
{
   var stats = imageChannelStats( img, false );
   if ( linked || stats.length == 1 )
   {
      var mMed = 0, mMad = 0;
      for ( var i = 0; i < stats.length; ++i )
      {
         mMed += stats[ i ].median;
         mMad += stats[ i ].mad;
      }
      var s = computeAutoStretch( mMed/stats.length, mMad/stats.length );
      return { linked: true, channels: [ s ] };
   }
   var perChannel = [];
   for ( var c = 0; c < stats.length; ++c )
      perChannel.push( computeAutoStretch( stats[ c ].median, stats[ c ].mad ) );
   return { linked: false, channels: perChannel };
}

function applyStretchToView( view, stretch )
{
   var ID = [ 0, 0.5, 1, 0, 1 ];
   function row( s ) { return [ s.c0, s.m, 1, 0, 1 ]; }
   var HT = new HistogramTransformation;
   if ( stretch.linked || stretch.channels.length == 1 )
      HT.H = [ ID, ID, ID, row( stretch.channels[ 0 ] ), ID ];
   else
      HT.H = [ row( stretch.channels[ 0 ] ),
               row( stretch.channels[ 1 ] ),
               row( stretch.channels[ 2 ] ), ID, ID ];
   HT.executeOn( view, false );
}

// Noise standard deviation of a (linear) image. A plain MAD is dominated by
// real structure on nebula-filled fields and barely moves while stacking, so
// prefer PixInsight's dedicated estimators: MRS (best), then k-sigma, and
// only fall back to the scaled central MAD when neither is available.
function estimateSigma( img )
{
   try
   {
      var a = img.noiseMRS();
      if ( a && a.length > 0 && a[ 0 ] > 0 )
         return a[ 0 ];
   }
   catch ( e )
   {
   }
   try
   {
      var k = img.noiseKSigma();
      var sigma = ( k && k.length !== undefined ) ? k[ 0 ] : k;
      if ( sigma > 0 )
         return sigma;
   }
   catch ( e )
   {
   }
   try
   {
      var stats = imageChannelStats( img, true );
      var m = 0;
      for ( var i = 0; i < stats.length; ++i )
         m += stats[ i ].mad;
      return 1.4826*m/stats.length;
   }
   catch ( e )
   {
      return 0;
   }
}

// ---------------------------------------------------------------------------
// Zoom Odyssey — PixInsight-facing data access (WCS + bundled catalogs).
// ---------------------------------------------------------------------------

// Read the linear WCS from a solved view's AstrometricSolution; null if unsolved.
function readImageWcs( view )
{
   function pvec( id )
   {
      try
      {
         var v = view.propertyValue( id );
         return ( v == null ) ? null : [ v.at( 0 ), v.at( 1 ) ];
      }
      catch ( e ) { return null; }
   }
   function pmat( id )
   {
      try
      {
         var m = view.propertyValue( id );
         return ( m == null ) ? null : [ [ m.at( 0, 0 ), m.at( 0, 1 ) ], [ m.at( 1, 0 ), m.at( 1, 1 ) ] ];
      }
      catch ( e ) { return null; }
   }
   var refCel = pvec( "PCL:AstrometricSolution:ReferenceCelestialCoordinates" );
   var refImg = pvec( "PCL:AstrometricSolution:ReferenceImageCoordinates" );
   var cd = pmat( "PCL:AstrometricSolution:LinearTransformationMatrix" );
   if ( !refCel || !refImg || !cd )
      return null;
   return makeWcs( refCel[ 0 ], refCel[ 1 ], refImg[ 0 ], refImg[ 1 ], cd );
}

// Root of the PixInsight install, to locate the bundled star/constellation
// catalogs. Override via SESSIONCINEMA_PI_HOME; otherwise derived from this
// script's own location (installed under <root>/src/scripts/...), with a
// per-OS fallback. The PCL* environment variables are empty in automation mode,
// so they are not used.
function piInstallRoot()
{
   var env = getEnvironmentVariable( "SESSIONCINEMA_PI_HOME" );
   if ( env && env.length && File.directoryExists( env ) )
      return env;
   try
   {
      var self = ( File.extractDrive( #__FILE__ ) + File.extractDirectory( #__FILE__ ) ).split( "\\" ).join( "/" );
      var i = self.toLowerCase().lastIndexOf( "/src/" );
      if ( i > 0 && File.directoryExists( self.substring( 0, i ) ) )
         return self.substring( 0, i );
   }
   catch ( e )
   {
   }
   var cands = [];
   var kind = platformKind();
   if ( kind == "windows" )
   {
      var pf = getEnvironmentVariable( "ProgramFiles" );
      cands.push( ( ( pf && pf.length ) ? pf.split( "\\" ).join( "/" ) : "C:/Program Files" ) + "/PixInsight" );
   }
   else if ( kind == "macos" )
      cands.push( "/Applications/PixInsight" );
   else
      cands.push( "/opt/PixInsight" );
   for ( var k = 0; k < cands.length; ++k )
      if ( File.directoryExists( cands[ k ] ) )
         return cands[ k ];
   return "";
}

function readTextFileSafe( path )
{
   try { return File.readTextFile( path ); }
   catch ( e ) { return ""; }
}

var RASTER_EXTENSIONS = [ ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp" ];

function isRasterPath( path )
{
   var ext = File.extractExtension( path ).toLowerCase();
   for ( var i = 0; i < RASTER_EXTENSIONS.length; ++i )
      if ( ext == RASTER_EXTENSIONS[ i ] )
         return true;
   return false;
}

// Load an ALREADY-FINISHED image (JPEG/PNG/TIFF or a processed FITS/XISF) as a
// Bitmap, without applying any stretch. Returns null on failure.
function loadFinishedBitmap( path )
{
   if ( isRasterPath( path ) )
   {
      try
      {
         var b = new Bitmap( path );
         if ( b.width > 1 && b.height > 1 )
            return b;
      }
      catch ( e )
      {
      }
   }
   try
   {
      var w = openFrameWindow( path );
      if ( w != null )
      {
         var bmp = w.mainView.image.render();
         w.forceClose();
         return bmp;
      }
   }
   catch ( e2 )
   {
   }
   return null;
}

// Load the bundled catalogs once. Returns { stars, polys, centroids, labels, ok }.
var gZoomCatalogs = null;
function loadZoomCatalogs()
{
   if ( gZoomCatalogs != null )
      return gZoomCatalogs;
   var root = piInstallRoot();
   var cat = { root: root, stars: [], polys: [], centroids: {}, labels: {}, ok: false };
   if ( root.length )
   {
      cat.stars = parseStarCatalog( readTextFileSafe( root + "/include/pjsr/astrometry/NamedStars.csv" ), 7.0, 7 );
      var linesText = readTextFileSafe( root + "/src/scripts/AnnotateImage/ConstellationLines.json" );
      if ( linesText.length )
         try { cat.polys = parseConstellationLines( linesText ); } catch ( e ) {}
      var bordersText = readTextFileSafe( root + "/src/scripts/AnnotateImage/ConstellationBorders.json" );
      if ( bordersText.length )
         try { cat.centroids = constellationCentroids( bordersText ); } catch ( e ) {}
      var labelsText = readTextFileSafe( root + "/src/scripts/AnnotateImage/ConstellationLabels.json" );
      if ( labelsText.length )
         try { cat.labels = JSON.parse( labelsText ); } catch ( e ) {}
      cat.ok = cat.stars.length > 0;
   }

   // Precompute the fixed 3D unit vector of every star and constellation vertex
   // once (they never move on the sky) so the per-frame hot loops do no trig.
   var i, j;
   for ( i = 0; i < cat.stars.length; ++i )
      cat.stars[ i ].v = raDecToVec( cat.stars[ i ].ra, cat.stars[ i ].dec );
   for ( i = 0; i < cat.polys.length; ++i )
      for ( j = 0; j < cat.polys[ i ].length; ++j )
         cat.polys[ i ][ j ].v = raDecToVec( cat.polys[ i ][ j ].ra, cat.polys[ i ][ j ].dec );

   // Equatorial grid as precomputed polylines of vectors (parallels + meridians).
   cat.grid = [];
   var dec, ra, poly;
   for ( dec = -60; dec <= 60; dec += 30 )
   {
      poly = [];
      for ( ra = 0; ra <= 360; ra += 5 )
         poly.push( raDecToVec( ra, dec ) );
      cat.grid.push( poly );
   }
   for ( ra = 0; ra < 360; ra += 30 )
   {
      poly = [];
      for ( dec = -80; dec <= 80; dec += 5 )
         poly.push( raDecToVec( ra, dec ) );
      cat.grid.push( poly );
   }

   gZoomCatalogs = cat;
   return cat;
}

// hips2fits URL for a square TAN cutout centered on (ra,dec).
function hips2fitsUrl( hips, ra, dec, fovDeg, nPx )
{
   return "https://alasky.cds.unistra.fr/hips-image-services/hips2fits?" +
          "hips=" + encodeURIComponent( hips ) +
          "&width=" + nPx + "&height=" + nPx +
          "&fov=" + fovDeg +
          "&projection=TAN&coordsys=icrs&format=jpg" +
          "&ra=" + ra + "&dec=" + dec;
}

// Download a HiPS survey cutout from the CDS/Aladin public service and load it
// as a Bitmap. Retries a few times (the first request can be slow to warm up),
// validates the payload, and returns null only after all attempts fail — the
// zoom then simply falls back to the catalog star field.
function fileSize( path )
{
   try { var f = new File; f.openForReading( path ); var n = f.size; f.close(); return n; }
   catch ( e ) { return -1; }
}

// Survey cutouts are cached in memory (and on disk) so re-running a generation
// on the same coordinates in the same PixInsight session never re-downloads.
var gHipsCache = {};

function fetchHipsBitmap( hips, ra, dec, fovDeg, nPx, onTick )
{
   var key = hips + "|" + Math.round( ra*1000 ) + "|" + Math.round( dec*1000 ) +
             "|" + Math.round( fovDeg*1000 ) + "|" + nPx;
   if ( gHipsCache[ key ] )
      return gHipsCache[ key ];

   var out = File.systemTempDirectory + "/sc-hips-" +
             Math.round( ra*1000 ) + "_" + Math.round( dec*1000 ) + "_" +
             Math.round( fovDeg*1000 ) + "_" + nPx + ".jpg";

   function loadValid()
   {
      if ( File.exists( out ) && fileSize( out ) > 2048 )
         try
         {
            var b = new Bitmap( out );
            if ( b.width > 1 && b.height > 1 )
               return b;
         }
         catch ( e ) {}
      return null;
   }

   // Reuse a previously downloaded file (survives across generations).
   var cached = loadValid();
   if ( cached ) { gHipsCache[ key ] = cached; return cached; }

   var url = hips2fitsUrl( hips, ra, dec, fovDeg, nPx );
   var attempts = 3;
   for ( var a = 1; a <= attempts; ++a )
   {
      if ( curlDownload( url, out, 90, 2048, onTick ) )
      {
         var bmp = loadValid();
         if ( bmp ) { gHipsCache[ key ] = bmp; return bmp; }
      }
      console.warningln( tr( "zoom.hipsRetry", a, attempts,
                             fileSize( out ) + " B" ) );
   }
   return null;
}

// Overlay renderer. All facts come precomputed in `ov` (buildOverlayInfo).
function drawOverlay( g, W, H, ov )
{
   var u = H/1080;
   var margin = Math.round( 40*u );

   var titleFont = new Font( "Open Sans" );
   titleFont.pixelSize = Math.round( 34*u );
   try { titleFont.bold = true; } catch ( e ) {}
   var subFont = new Font( "Open Sans" );
   subFont.pixelSize = Math.round( 21*u );
   var smallFont = new Font( "Open Sans" );
   smallFont.pixelSize = Math.round( 16*u );

   var baseY = H - margin;
   if ( ov.title.length )
   {
      g.font = titleFont;
      g.pen = new Pen( 0xFFFFFFFF );
      g.drawText( margin, baseY - ( ov.subLeft.length ? Math.round( 34*u ) : 0 ), ov.title );
   }
   if ( ov.subLeft.length )
   {
      g.font = subFont;
      g.pen = new Pen( 0xD9FFFFFF );
      g.drawText( margin, baseY, ov.subLeft );
   }
   if ( ov.right.length )
   {
      g.font = subFont;
      g.pen = new Pen( 0xD9FFFFFF );
      g.drawText( W - margin - subFont.width( ov.right ), baseY, ov.right );
   }
   if ( ov.signature.length )
   {
      g.font = smallFont;
      g.pen = new Pen( 0x99FFFFFF );
      g.drawText( W - margin - smallFont.width( ov.signature ), margin + Math.round( 16*u ), ov.signature );
   }
   if ( ov.progress >= 0 )
   {
      var bh = Math.max( 2, Math.round( 4*u ) );
      g.fillRect( new Rect( 0, H - bh, W, H ), new Brush( 0x33FFFFFF ) );
      g.fillRect( new Rect( 0, H - bh, Math.round( W*clamp01( ov.progress ) ), H ), new Brush( 0xB3FFFFFF ) );
   }
}

// Render a stretched view into a sized output bitmap with overlay.
function renderOutputBitmap( view, cfg, ov )
{
   var fmtDef = OUTPUT_FORMATS[ cfg.formatIndex ];
   var W = fmtDef.w, H = fmtDef.h;
   var src = view.image.render();
   var out = new Bitmap( W, H );
   out.fill( 0xFF000000 );
   var g = new Graphics( out );
   g.antialiasing = true;
   try { g.textAntialiasing = true; } catch ( e ) {}
   var r = computeCoverRect( src.width, src.height, W, H, cfg.fitMode );
   g.drawScaledBitmap( new Rect( r.x0, r.y0, r.x1, r.y1 ), src );
   if ( ov )                       // ov null → bare image (e.g. the reveal base, overlay drawn fixed on top)
      drawOverlay( g, W, H, ov );
   g.end();
   return out;
}

// Create a float32 working window holding a copy of the given image.
function makeWorkWindow( img, id )
{
   var w = new ImageWindow( img.width, img.height, img.numberOfChannels,
                            32, true, img.isColor, id );
   w.mainView.beginProcess( UndoFlag.NoSwapFile );
   w.mainView.image.assign( img );
   w.mainView.endProcess();
   return w;
}

// A zeroed single-channel 32-bit float accumulator window of the given size.
function makeAccWindow( width, height, id )
{
   var w = new ImageWindow( width, height, 1, 32, true, false, id );
   w.mainView.beginProcess( UndoFlag.NoSwapFile );
   w.mainView.image.fill( 0 );
   w.mainView.endProcess();
   return w;
}

// The denoised mean of an accumulator: a copy divided by the sub count.
function meanOf( accImg, n, id )
{
   var w = makeWorkWindow( accImg, id );
   w.mainView.beginProcess( UndoFlag.NoSwapFile );
   w.mainView.image.apply( 1.0/n, ImageOp.Mul );
   w.mainView.endProcess();
   return w;
}

// Intermediate frames are written as uncompressed BMP: ffmpeg re-encodes them
// to H.264 anyway, so PNG's deflate (which dominated render time — ~700 ms per
// 1080p frame) is pure waste. BMP saves are essentially instantaneous.
var FRAME_EXT = ".bmp";

function frameFileName( index )
{
   var s = String( index );
   while ( s.length < 5 )
      s = "0" + s;
   return "frame_" + s + FRAME_EXT;
}

// ============================================================================
// FFMPEG — detection, encoding, fallback script
// ============================================================================

function platformKind()
{
   try
   {
      var p = String( CoreApplication.platform );
      if ( p.match( new RegExp( "Windows", "i" ) ) )
         return "windows";
      if ( p.match( new RegExp( "MAC|macOS|OSX", "i" ) ) )
         return "macos";
   }
   catch ( e )
   {
   }
   return "linux";
}

// Run a program to completion; returns { started, exitCode }.
function runExternal( program, args, timeoutMs, keepUiAlive, onTick )
{
   // failure distinguishes the ways this returns without a clean exit:
   // "notFound", "noStart", "timeout", "exit". output is what the program said —
   // it went in the bin with the process object. Verified on PixInsight: stdout
   // carries the text and stderr always reads empty, so the two are merged
   // upstream; output takes whichever is non-empty and never promises which.
   var result = { started: false, exitCode: -1, failure: "notFound",
                  waitedMs: 0, output: "" };
   var P = null;
   function harvest()
   {
      if ( P == null )
         return;
      var o = "";
      try { o = String( P.stderr || "" ); } catch ( e ) {}
      if ( !o.length )
         try { o = String( P.stdout || "" ); } catch ( e ) {}
      result.output = o;
   }
   try
   {
      P = new ExternalProcess;
      P.start( program, args );
      // A program that fails to launch still reports exitCode 0 (Qt trap):
      // require an actual start before trusting anything else.
      try
      {
         if ( !P.waitForStarted( 5000 ) )
         {
            result.failure = "noStart";
            harvest();
            return result;
         }
      }
      catch ( e )
      {
      }
      var waited = 0;
      for ( ;; )
      {
         if ( P.waitForFinished( 250 ) )
            break;
         waited += 250;
         if ( onTick )
            try { onTick(); } catch ( et ) {}
         if ( keepUiAlive )
            processEvents();
         if ( timeoutMs > 0 && waited >= timeoutMs )
         {
            try { P.kill(); } catch ( e ) {}
            // It demonstrably started; saying otherwise sent a timeout down the
            // same path as a missing binary.
            result.started = true;
            result.failure = "timeout";
            result.waitedMs = waited;
            harvest();
            return result;
         }
         if ( !P.isRunning )
            break;
      }
      result.started = true;
      result.exitCode = P.exitCode;
      result.failure = ( result.exitCode == 0 ) ? "" : "exit";
      harvest();
   }
   catch ( e )
   {
      // Program not found or failed to start.
      result.output = e.message || String( e );
   }
   return result;
}

// One curl invocation shared by every download in the script (survey cutouts,
// ffmpeg install): fetch url into outPath (removed first), following
// redirects, failing on HTTP errors. The process timeout is derived from
// curl's own --max-time so the two can never drift apart. Returns true when
// curl ran to success and wrote more than minBytes.
function curlDownload( url, outPath, maxTimeSec, minBytes, onTick )
{
   try { File.remove( outPath ); } catch ( e ) {}
   var curl = ( platformKind() == "windows" ) ? "curl.exe" : "curl";
   var r = runExternal( curl, [ "-f", "-s", "-S", "-L", "-o", outPath,
                                "--connect-timeout", "20",
                                "--max-time", String( maxTimeSec ), url ],
                        ( maxTimeSec + 60 )*1000, true, onTick );
   return r.started && r.exitCode == 0 && fileSize( outPath ) > minBytes;
}

function detectFfmpeg( userPath )
{
   var candidates = [];
   if ( userPath && userPath.length )
      candidates.push( userPath );
   candidates = candidates.concat( ffmpegCandidatePaths( platformKind(), getEnvironmentVariable ) );
   for ( var i = 0; i < candidates.length; ++i )
   {
      // An absolute candidate that does not exist is skipped without paying
      // the process-launch probe; bare names must go through PATH resolution.
      if ( candidates[ i ].indexOf( "/" ) >= 0 && !File.exists( candidates[ i ] ) )
         continue;
      var r = runExternal( candidates[ i ], [ "-version" ], 10000, false );
      if ( r.started && r.exitCode == 0 )
         return candidates[ i ];
   }
   return "";
}

// Download-and-install ffmpeg from the CaeloWorks mirror into the per-user
// install directory. Each platform build is tried in order; a candidate that
// does not pass `ffmpeg -version` (wrong CPU architecture, truncated or
// corrupt download) is removed and the next one is tried. Returns the
// installed path, or "" on failure.
function installFfmpegFromMirror()
{
   var kind = platformKind();
   var dir = ffmpegInstallDir( kind, getEnvironmentVariable );
   if ( !File.directoryExists( dir ) )
      try { File.createDirectory( dir, true ); } catch ( e ) {}
   var dest = dir + "/" + ffmpegInstalledName( kind );
   var names = ffmpegMirrorCandidates( kind );
   if ( kind != "windows" )
   {
      // Ask the machine its architecture so the native build downloads first.
      var uf = File.systemTempDirectory + "/sc-uname.txt";
      runExternal( "/bin/sh", [ "-c", "uname -m > \"" + uf + "\"" ], 5000, false );
      try { names = orderMirrorCandidatesByArch( names, File.readTextFile( uf ) ); } catch ( eu ) {}
      try { File.remove( uf ); } catch ( eu2 ) {}
   }
   for ( var c = 0; c < names.length; ++c )
   {
      // A static ffmpeg is tens of MB: anything small is an error body or a
      // truncated transfer, not worth the execution probe.
      if ( !curlDownload( FFMPEG_MIRROR_BASE + names[ c ], dest, 900, 1000000 ) )
         continue;
      if ( kind != "windows" )
         runExternal( "/bin/chmod", [ "+x", dest ], 5000, false );
      var v = runExternal( dest, [ "-version" ], 15000, true );
      if ( v.started && v.exitCode == 0 )
         return dest;
   }
   try { File.remove( dest ); } catch ( e2 ) {}
   return "";
}

// Always written next to the frames, so a failed or missing ffmpeg never
// strands the user: the exact command is one double-click away.
function writeEncodeScript( framesDir, ffmpegArgs )
{
   var isWin = ( platformKind() == "windows" );
   var scriptPath = framesDir + ( isWin ? "/encode.bat" : "/encode.sh" );
   File.writeTextFile( scriptPath, buildEncodeScriptText( isWin, ffmpegArgs ) );
   if ( !isWin )
      runExternal( "/bin/chmod", [ "+x", scriptPath ], 5000, false );
   return scriptPath;
}

// Reveal a file or folder in the OS file browser (best-effort, non-blocking).
function openInFileBrowser( path )
{
   var kind = platformKind();
   if ( kind == "windows" )
      runExternal( "explorer.exe", [ path.split( "/" ).join( "\\" ) ], 4000, false );
   else if ( kind == "macos" )
      runExternal( "open", [ path ], 4000, false );
   else
      runExternal( "xdg-open", [ path ], 4000, false );
}

// ============================================================================
// ENGINE
// ============================================================================

function Engine( cfg, frames )
{
   this.cfg = cfg;
   this.frames = sortFrames( frames );
   // Explicit user title, else the OBJECT keyword from the headers. Drives
   // both the burned-in overlay and the output file names.
   this.title = resolveTitle( cfg, this.frames );
   this.skipped = [];
   this.regDropped = [];     // subs dropped at registration (survives per-pass skip resets)
   this.colorActive = false; // set in run(): multi-filter RGB composite in effect
   this.paletteTag = "";     // palette id woven into the output name when colour is active
   this.rendered = 0;
   this.aborted = false;
   // Why a run stopped. errorKey is stable for automation, errorText is the
   // sentence a human reads — the console had it, the modal did not, so support
   // was quoting a message the user never saw.
   this.errorKey = "";
   this.errorText = "";
   this.lostFrames = 0;      // frames whose write did not land
   this.sigmaRef = 0;        // single-sub noise, the SNR reference (mono path)
   this.onProgress = null;   // optional (done, total, message, previewBmp?)
   this.shouldAbort = null;  // optional () -> true to cancel
}

// Report progress to a UI callback if one is attached (keeps the dialog alive).
// previewBmp, when given, is a thumbnail to show (a survey cutout or a frame).
Engine.prototype.progress = function( done, total, message, previewBmp )
{
   if ( this.onProgress )
      try { this.onProgress( done, total, message, previewBmp ); } catch ( e ) {}
};

Engine.prototype.baseName = function()
{
   var slug = slugify( this.title || "session" );
   var style = ( this.cfg.style == STYLE_ZOOM ) ? "zoom" : "stack";
   var tag = ( this.colorActive && this.paletteTag ) ? ( this.paletteTag.toLowerCase() + "-" ) : "";
   return slug + "-" + tag + style;
};

Engine.prototype.framesDir = function()
{
   return this.cfg.outputDir + "/" + this.baseName() + "-frames";
};

Engine.prototype.videoPath = function()
{
   return this.cfg.outputDir + "/" + this.baseName() + ".mp4";
};

Engine.prototype.checkAbort = function()
{
   processEvents();
   if ( console.abortRequested )
      this.aborted = true;
   if ( this.shouldAbort )
      try { if ( this.shouldAbort() ) this.aborted = true; } catch ( e ) {}
   return this.aborted;
};

// Open + optionally debayer one frame; returns the window or null.
Engine.prototype.openFrame = function( frame )
{
   var win = null;
   try
   {
      win = openFrameWindow( frame.path );
   }
   catch ( e )
   {
      win = null;
   }
   if ( win == null )
   {
      this.skipped.push( frame.name );
      return null;
   }
   return maybeDebayer( win, frame, this.cfg );
};

// Accumulate all frames into accWin (whose view process must be open).
// renderCallback(n, frameIndex, accImage), when given, is called after each
// successful accumulation. Returns the number of frames integrated.
Engine.prototype.accumulate = function( accWin, renderCallback )
{
   var n = 0;
   for ( var i = 0; i < this.frames.length; ++i )
   {
      if ( this.checkAbort() )
         break;
      var frame = this.frames[ i ];
      var win = this.openFrame( frame );
      if ( win == null )
         continue;
      var img = win.mainView.image;
      if ( accWin.mainView.image.width != img.width ||
           accWin.mainView.image.height != img.height ||
           accWin.mainView.image.numberOfChannels != img.numberOfChannels )
      {
         this.skipped.push( frame.name );
         win.forceClose();
         continue;
      }
      // The SNR reference is the noise of a SINGLE sub. It used to be re-measured
      // on the running mean whenever it was not yet positive, so a first sub that
      // did not measure made the reference the mean of k subs — noise s1/sqrt(k) —
      // and the rest of the video under-reported the gain by 10*log10(k) dB, 6 dB
      // at k = 4. Measured here, on the opened sub, and never rewritten once set.
      if ( this.cfg.ovShowSnr && !( this.sigmaRef > 0 ) )
         this.sigmaRef = estimateSigma( img );
      accWin.mainView.image.apply( img, ImageOp.Add );
      ++n;
      win.forceClose();
      if ( renderCallback )
         renderCallback( n, i, accWin.mainView.image );
      if ( ( n & 7 ) == 0 )
         gc();
   }
   return n;
};

// Geometry template from the first readable frame; null on total failure.
Engine.prototype.makeAccumulator = function( id )
{
   for ( var i = 0; i < this.frames.length; ++i )
   {
      var win = this.openFrame( this.frames[ i ] );
      if ( win == null )
         continue;
      var img = win.mainView.image;
      var acc = new ImageWindow( img.width, img.height, img.numberOfChannels,
                                 32, true, img.isColor, id );
      win.forceClose();
      acc.mainView.beginProcess( UndoFlag.NoSwapFile );
      acc.mainView.image.fill( 0 );
      acc.mainView.endProcess();
      return acc;
   }
   return null;
};

// A frame that never reached the disk used to count all the same: rendered is
// what decides whether to encode at all, and what the run reports. A full disk
// then produced a video short of the frames it claimed, and the sequence was
// deleted afterwards because ffmpeg had returned 0.
// Every frame_*.bmp of this target. The sequence directory is derived from the
// title, the palette and the style — no timestamp — so two runs of the same
// target land in the same place, and ffmpeg's image2 demuxer reads the contiguous
// run from 1 up to the first gap. A cancelled 500-frame render followed by a
// 180-frame one therefore encoded 500 frames, 320 of them from last time.
Engine.prototype.clearFrames = function()
{
   var dir = this.framesDir();
   var toRemove = [];
   var ff = new FileFind;
   if ( ff.begin( dir + "/frame_*" + FRAME_EXT ) )
      do { if ( ff.isFile ) toRemove.push( dir + "/" + ff.name ); }
      while ( ff.next() );
   for ( var i = 0; i < toRemove.length; ++i )
      try { File.remove( toRemove[ i ] ); } catch ( e ) {}
   return toRemove.length;
};

Engine.prototype.saveFrame = function( bmp, index )
{
   var path = this.framesDir() + "/" + frameFileName( index );
   var ok = false;
   try { bmp.save( path ); ok = File.exists( path ); } catch ( e ) { ok = false; }
   if ( !ok )
   {
      this.lostFrames = ( this.lostFrames || 0 ) + 1;
      if ( this.lostFrames == 1 )
         console.criticalln( tr( "run.frameLost", path ) );
      return "";
   }
   ++this.rendered;
   return path;
};

// --------------------------------------------------------------------------
// Registration (StarAlignment). Raw subs from a dithered, meridian-flipping
// session are not mutually aligned; the progressive stack needs them registered
// to a common reference first. StarAlignment's
// star-pattern matching is rotation-invariant, so one pass corrects the
// dithering translation AND the ~180° meridian flip together, across filters
// (faint OIII/SII subs match the same stars as the Ha reference). Registered
// frames are cached on disk (keyed by the reference file) so re-runs are cheap.

// Cache dir for a given reference file — under TEMP, namespaced by the
// reference so a different input set (hence a different reference) never
// reuses stale alignments.
// A short stable digest of a path. Not cryptographic — it only has to make two
// different absolute paths land on two different names. FNV-1a, twice, for 64
// bits of hex.
function pathKey( p )
{
   var s = String( p ), h1 = 0x811c9dc5, h2 = 0x1000193, i, c;
   for ( i = 0; i < s.length; ++i )
   {
      c = s.charCodeAt( i );
      h1 = ( ( h1 ^ c ) * 0x01000193 ) >>> 0;
      h2 = ( ( h2 ^ c ) * 0x85ebca6b ) >>> 0;
   }
   return ( "0000000" + h1.toString( 16 ) ).slice( -8 ) +
          ( "0000000" + h2.toString( 16 ) ).slice( -8 );
}

// Cache dir for a given reference file, under TEMP. Keyed on the reference's
// FULL path, not its base name: two nights that both start with Light_0001.fit
// used to share this directory, and existence alone is taken as proof an entry
// is valid — so the second night silently reused the first night's alignments.
Engine.prototype.regCacheDir = function( refPath )
{
   return File.systemTempDirectory + "/sc-reg/" +
          File.extractName( refPath ) + "-" + pathKey( refPath );
};

// Alignment reference: the first sub (shoot order) of the most-populated
// filter — a dense-star frame the faint narrowband subs match cleanly against.
function pickReference( frames )
{
   var filters = detectFilters( frames );
   var dom = "", best = -1;
   for ( var i = 0; i < filters.length; ++i )
      if ( filters[ i ].count > best ) { best = filters[ i ].count; dom = filters[ i ].filter; }
   for ( var j = 0; j < frames.length; ++j )
      if ( !dom.length || frames[ j ].filter == dom )
         return frames[ j ];
   return frames[ 0 ];
}
Engine.prototype.pickReference = function() { return pickReference( this.frames ); };

// Register this.frames to a common reference; returns a new frame list whose
// paths point at the registered copies (metadata preserved). Frames that fail
// to register are dropped (recorded in this.skipped). No-op if disabled.
Engine.prototype.registerFrames = function()
{
   var cfg = this.cfg;
   if ( !cfg.alignEnabled || this.frames.length < 2 )
      return this.frames;

   var ref = this.pickReference();
   var cacheDir = this.regCacheDir( ref.path );
   if ( !File.directoryExists( cacheDir ) )
      File.createDirectory( cacheDir, true );
   console.noteln( tr( "run.regRef", ref.name ) );

   // StarAlignment names its output <basename>_r.xisf in one output directory, so
   // two subs sharing a base name overwrite each other and the list below ends up
   // with two entries pointing at one file. Those get a directory of their own,
   // keyed on the full path. Unique names stay flat, and stay in one batch.
   var baseCount = {}, i, b;
   for ( i = 0; i < this.frames.length; ++i )
   {
      b = File.extractName( this.frames[ i ].path );
      baseCount[ b ] = ( baseCount[ b ] || 0 ) + 1;
   }
   function dirFor( fr )
   {
      var bn = File.extractName( fr.path );
      return ( baseCount[ bn ] > 1 ) ? ( cacheDir + "/" + pathKey( fr.path ) ) : cacheDir;
   }
   function outFor( fr )
   {
      return dirFor( fr ) + "/" + File.extractName( fr.path ) + "_r.xisf";
   }

   // Only (re)register subs whose registered output is missing (immutable
   // captures ⇒ existence is a sufficient cache key).
   var todo = [];
   for ( i = 0; i < this.frames.length; ++i )
      if ( !File.exists( outFor( this.frames[ i ] ) ) )
         todo.push( this.frames[ i ] );

   if ( todo.length )
   {
      console.noteln( tr( "run.registering", todo.length ) );
      this.progress( 0, todo.length, tr( "run.registering", todo.length ) );
      // StarAlignment writes an INTERPOLATED image: its output carries no Bayer
      // grid, and the registered frame list clears cfa accordingly. So debayering
      // can never fire on a registered sub, and an OSC session used to render as
      // a raw mosaic from end to end without a word. It has to happen first.
      var cfaDir = cacheDir + "/cfa", srcOf = {}, t, anyCfa = false;
      for ( t = 0; t < todo.length; ++t )
         if ( todo[ t ].cfa ) { anyCfa = true; break; }
      if ( cfg.debayer && ( anyCfa || ref.cfa ) )
      {
         if ( !File.directoryExists( cfaDir ) )
            File.createDirectory( cfaDir, true );
         // The reference too, or the targets would be matched against a mosaic.
         var pre = todo.slice();
         if ( ref.cfa )
            pre.push( ref );
         for ( t = 0; t < pre.length; ++t )
         {
            var cf = pre[ t ];
            if ( !cf.cfa || srcOf[ cf.path ] )
               continue;
            var cw = null;
            try { cw = openFrameWindow( cf.path ); } catch ( e ) { cw = null; }
            if ( cw == null )
               continue;
            var dw = maybeDebayer( cw, cf, cfg );
            if ( dw.mainView.image.isColor )
            {
               var dp = cfaDir + "/" + File.extractName( cf.path ) + ".xisf";
               try
               {
                  dw.saveAs( dp, false, false, false, false );
                  srcOf[ cf.path ] = dp;
               }
               catch ( e )
               {
                  console.warningln( "could not stage " + cf.name + " for registration: " +
                                     ( e.message || e ) );
               }
            }
            dw.forceClose();
         }
         console.noteln( tr( "run.debayered", Object.keys( srcOf ).length ) );
      }

      // One pass per output directory: everything with a unique base name shares
      // the flat one, and each homonym gets its own so they cannot overwrite.
      var groups = {};
      for ( t = 0; t < todo.length; ++t )
      {
         var gd = dirFor( todo[ t ] );
         if ( !groups[ gd ] ) groups[ gd ] = [];
         groups[ gd ].push( todo[ t ] );
      }
      for ( var gdir in groups )
      {
         if ( !File.directoryExists( gdir ) )
            File.createDirectory( gdir, true );
         var SA = new StarAlignment;
         SA.referenceImage        = srcOf[ ref.path ] || ref.path;
         SA.referenceIsFile       = true;                       // path is a file, not a view id
         // mode defaults to RegisterMatch (0); the enum constant isn't reliably
         // resolvable here, and setting it is unnecessary.
         SA.restrictToPreviews    = false;
         SA.generateDrizzleData   = false;
         SA.generateMasks         = false;
         SA.generateDistortionMaps = false;
         SA.distortionCorrection  = false;                      // similarity: translation + rotation
         SA.noGUIMessages         = true;
         SA.overwriteExistingFiles = true;
         SA.outputDirectory       = gdir;
         SA.outputExtension       = ".xisf";
         SA.outputPostfix         = "_r";
         var tlist = [];
         for ( t = 0; t < groups[ gdir ].length; ++t )
            tlist.push( [ true, true,
                          srcOf[ groups[ gdir ][ t ].path ] || groups[ gdir ][ t ].path ] );
         SA.targets = tlist;
         var ok = false;
         try { ok = SA.executeGlobal(); }
         catch ( e ) { console.criticalln( "StarAlignment failed: " + ( e.message || e ) ); }
         if ( !ok )
            console.warningln( "StarAlignment reported errors; using whatever registered outputs exist." );
      }
      // The staged copies exist only for this pass; the registered outputs are
      // the cache. Keeping them would double what a session leaves under TEMP.
      for ( var sp in srcOf )
         try { File.remove( srcOf[ sp ] ); } catch ( e ) {}
      try { if ( File.directoryExists( cfaDir ) ) File.removeDirectory( cfaDir ); } catch ( e ) {}
   }
   else
      console.noteln( tr( "run.regCached" ) );

   var out = [];
   for ( var k = 0; k < this.frames.length; ++k )
   {
      var fr = this.frames[ k ];
      var op = outFor( fr );
      if ( File.exists( op ) )
         out.push( { path: op, name: fr.name, dateObs: fr.dateObs, dateObsStr: fr.dateObsStr,
                     exposure: fr.exposure, object: fr.object, filter: fr.filter,
                     cfa: false, siteLat: fr.siteLat, siteLong: fr.siteLong } );
      else
         this.regDropped.push( fr.name + " (registration failed)" );
   }
   return out;
};

// --------------------------------------------------------------------------
// Progressive stack: cumulative mean rendered at computed indices.
Engine.prototype.runStacking = function()
{
   var cfg = this.cfg;
   var self = this;
   var N = this.frames.length;
   var indices = computeRenderIndices( N, cfg.fps, cfg.targetDuration );
   var renderSet = {};
   for ( var i = 0; i < indices.length; ++i )
      renderSet[ indices[ i ] ] = true;

   var stretch = null;

   // Pass 1 (final-stack stretch reference only): full integration, no render.
   if ( cfg.stretchRef == STRETCH_REF_FINAL )
   {
      console.writeln( tr( "run.pass1", N ) );
      var acc1 = this.makeAccumulator( "__sc_acc1" );
      if ( acc1 == null )
         return;
      this.skipped = [];
      acc1.mainView.beginProcess( UndoFlag.NoSwapFile );
      var n1 = this.accumulate( acc1, null );
      acc1.mainView.endProcess();
      if ( this.aborted || n1 == 0 )
      {
         acc1.forceClose();
         return;
      }
      var meanFinal = meanOf( acc1.mainView.image, n1, "__sc_meanF" );
      acc1.forceClose();
      stretch = computeStretchForImage( meanFinal.mainView.image, cfg.stretchLinked );
      meanFinal.forceClose();
      gc();
      console.writeln( tr( "run.pass1Done" ) );
   }

   // Render pass.
   var acc = this.makeAccumulator( "__sc_acc" );
   if ( acc == null )
      return;
   this.skipped = [];
   var cumExposure = 0;
   var meanExposure = 0;
   var outIndex = 0;
   var totalRenders = indices.length;
   var lastOv = null, geomW = 0, geomH = 0;

   acc.mainView.beginProcess( UndoFlag.NoSwapFile );
   var nTotal = this.accumulate( acc, function( n, frameIndex, accImg )
   {
      var frame = self.frames[ frameIndex ];
      cumExposure += frame.exposure;
      if ( frame.exposure > 0 )
         meanExposure = cumExposure/n;
      if ( !renderSet[ n ] )
         return;

      var mean = meanOf( accImg, n, "__sc_mean" );

      // Linear mean, before the stretch below. Noise estimation is not free, so
      // it only runs when the overlay asks for the figure.
      var sigma = cfg.ovShowSnr ? estimateSigma( mean.mainView.image ) : 0;

      var s = stretch;
      if ( s == null || cfg.stretchRef == STRETCH_REF_EACH )
      {
         var s2 = computeStretchForImage( mean.mainView.image, cfg.stretchLinked );
         if ( cfg.stretchRef == STRETCH_REF_FIRST && stretch == null )
            stretch = s2;
         s = s2;
      }
      mean.mainView.beginProcess( UndoFlag.NoSwapFile );
      applyStretchToView( mean.mainView, s );
      mean.mainView.endProcess();

      var ov = buildOverlayInfo( cfg, {
         index: n,
         total: N,
         cumulativeExposure: cumExposure,
         exposure: meanExposure,
         dateObs: frame.dateObs,
         sigmaFirst: self.sigmaRef,
         sigmaCurrent: sigma,
         title: self.title
      } );
      lastOv = ov;
      if ( !geomW ) { geomW = accImg.width; geomH = accImg.height; }
      var bmp = renderOutputBitmap( mean.mainView, cfg, ov );
      mean.forceClose();
      self.saveFrame( bmp, ++outIndex );
      self.progress( outIndex, totalRenders, tr( "run.render", outIndex, totalRenders, frame.name ),
                     ( ( outIndex & 3 ) == 0 ) ? bmp : null );
      console.writeln( tr( "run.render", outIndex, totalRenders, frame.name ) );
   } );
   acc.mainView.endProcess();

   // End reveal, the same tail the colour path renders. It had exactly one call
   // site, inside runStackingColor, so every mono session — OSC, DSLR, a single
   // filter, or Colour composite unticked — offered the presentation image, let
   // it be aligned, and then ignored it.
   //
   // Built from the complete integration rather than from the last rendered
   // frame: accumulate() only counts subs it could actually add, so a skipped sub
   // means the loop never reaches n == N and keying the reveal on that would drop
   // it again. The two differ only by the subs that were skipped.
   if ( !this.aborted && nTotal > 0 && geomW && revealTailFrames( cfg ) > 0 )
   {
      var fin = meanOf( acc.mainView.image, nTotal, "__sc_meanR" );
      var sR = ( stretch != null ) ? stretch
                                   : computeStretchForImage( fin.mainView.image, cfg.stretchLinked );
      fin.mainView.beginProcess( UndoFlag.NoSwapFile );
      applyStretchToView( fin.mainView, sR );
      fin.mainView.endProcess();
      var revealBase = renderOutputBitmap( fin.mainView, cfg, null );
      fin.forceClose();
      outIndex = this.renderStackReveal( revealBase, geomW, geomH, lastOv, outIndex, totalRenders );
   }
   acc.forceClose();
   gc();
};

// --------------------------------------------------------------------------
// MULTI-FILTER COLOUR rendering — SHO/HOO/… composites for the progressive stack.
//
// Subs are registered first (done in run()); each channel is stretched with a
// fixed per-channel transfer computed on that channel's full integration
// (honest, flicker-free), and RGB is assembled by writing each stretched mono
// channel into its slot with the 4-arg apply(image, op, point, channel) form
// (channel-selection reads/writes via first/lastSelectedChannel are unreliable
// under #engine v8; the explicit-channel apply is not).

// Resolve whether colour compositing applies to the current frames, and how.
// Active only when enabled and at least two distinct filters feed the channels.
function colorPlanFor( frames, cfg )
{
   var filters = detectFilters( frames );
   var map = resolveChannelMap( cfg, filters );
   var active = !!cfg.colorEnabled && mappedFilters( map ).length >= 2;
   return { active: active, map: map, filters: filters };
}

Engine.prototype.colorPlan = function()
{
   return colorPlanFor( this.frames, this.cfg );
};

// Assemble an RGB bitmap from up to three stretched mono channel images
// ({R,G,B}; nulls render black). Geometry is taken from any present channel.
function composeColorBitmap( chImages, cfg, ov )
{
   var ref = chImages.R || chImages.G || chImages.B;
   var w = ref.width, h = ref.height;
   var cw = new ImageWindow( w, h, 3, 32, true, true, "__sc_rgb" );
   cw.mainView.beginProcess( UndoFlag.NoSwapFile );
   var img = cw.mainView.image;
   img.fill( 0 );
   var keys = [ "R", "G", "B" ];
   for ( var c = 0; c < 3; ++c )
      if ( chImages[ keys[ c ] ] )
         img.apply( chImages[ keys[ c ] ], ImageOp.Mov, new Point( 0, 0 ), c );
   cw.mainView.endProcess();
   var bmp = renderOutputBitmap( cw.mainView, cfg, ov );
   cw.forceClose();
   return bmp;
}

// Full integration (mean) of every sub of one filter; null if none.
Engine.prototype.integrateFilter = function( filterName )
{
   var acc = null, n = 0;
   for ( var i = 0; i < this.frames.length; ++i )
   {
      if ( this.checkAbort() ) break;
      var fr = this.frames[ i ];
      if ( canonicalFilter( fr.filter ) != canonicalFilter( filterName ) ) continue;
      var win = this.openFrame( fr );
      if ( win == null ) continue;
      var im = win.mainView.image;
      if ( acc == null )
         acc = makeAccWindow( im.width, im.height, "__sc_int" );
      acc.mainView.beginProcess( UndoFlag.NoSwapFile );
      acc.mainView.image.apply( im, ImageOp.Add );
      acc.mainView.endProcess();
      win.forceClose();
      if ( ( ++n & 7 ) == 0 ) gc();
   }
   if ( acc == null || n == 0 ) { if ( acc ) acc.forceClose(); return null; }
   acc.mainView.beginProcess( UndoFlag.NoSwapFile );
   acc.mainView.image.apply( 1.0/n, ImageOp.Mul );
   acc.mainView.endProcess();
   return { win: acc, n: n };
};

// Fixed per-channel stretch (2-pass FINAL): integrate each mapped filter once,
// derive its transfer from the final mean. Distinct filters are integrated
// once and shared across channels (HOO: OIII feeds G and B with one stretch).
Engine.prototype.channelStretches = function( map )
{
   var distinct = mappedFilters( map );
   var byFilter = {};
   for ( var d = 0; d < distinct.length; ++d )
   {
      var r = this.integrateFilter( distinct[ d ] );
      byFilter[ distinct[ d ] ] = r ? computeStretchForImage( r.win.mainView.image, false ) : null;
      if ( r ) r.win.forceClose();
      gc();
   }
   return { R: map.R ? byFilter[ map.R ] : null,
            G: map.G ? byFilter[ map.G ] : null,
            B: map.B ? byFilter[ map.B ] : null };
};

// Progressive stack, colour: subs (shoot order) accumulate into per-channel
// means; the RGB composite builds over time. The displayed light grows with the
// integrated flux (STACK_RAMP_GAMMA), so it starts dark and reaches the optimal
// stretch exactly on the final frame. Rendering starts at the first frame where
// every mapped channel has at least one sub (no lone single-channel opening).
Engine.prototype.runStackingColor = function( map )
{
   var cfg = this.cfg;
   var N = this.frames.length;
   var keys = [ "R", "G", "B" ];

   // The cadence is spread over [firstFullN, N] so the first rendered frame is the
   // first full-colour one and the last is the complete integration. Same call the
   // dialog makes for its estimate — that is the point of it being a function.
   var plan = colorRenderPlan( this.frames, map, cfg.fps, cfg.targetDuration );
   var mappedFrames = plan.mappedFrames, renderSet = plan.renderSet;
   var totalRenders = plan.totalRenders, lastRender = plan.lastRender;

   console.writeln( tr( "run.pass1", N ) );
   var stretches = this.channelStretches( map );
   console.writeln( tr( "run.pass1Done" ) );

   var acc = { R: null, G: null, B: null }, cnt = { R: 0, G: 0, B: 0 };
   var outIndex = 0, cumExposure = 0, integrated = 0;
   var revealBase = null, lastOv = null, geomW = 0, geomH = 0;
   var sigFirst = {};   // filter -> noise of its first sub (the SNR reference)

   for ( var i = 0; i < N; ++i )
   {
      if ( this.checkAbort() ) break;
      var fr = this.frames[ i ];
      var chans = channelsFedBy( fr.filter, map );
      if ( !chans.length ) continue;
      var win = this.openFrame( fr );
      if ( win == null ) continue;
      ++integrated;
      var im = win.mainView.image;
      if ( !geomW ) { geomW = im.width; geomH = im.height; }
      // Single-sub noise of this filter, measured on its first sub and retried on
      // the next one while it does not come out positive — the same reference,
      // and the same retry, the mono path now takes in accumulate(). Noise
      // estimation is not free, so it only runs when the overlay asks for it.
      var frCanon = canonicalFilter( fr.filter );
      if ( cfg.ovShowSnr && !( sigFirst[ frCanon ] > 0 ) )
         sigFirst[ frCanon ] = estimateSigma( im );
      for ( var c = 0; c < chans.length; ++c )
      {
         var ch = chans[ c ];
         if ( acc[ ch ] == null )
            acc[ ch ] = makeAccWindow( im.width, im.height, "__sc_acc" + ch );
         acc[ ch ].mainView.beginProcess( UndoFlag.NoSwapFile );
         acc[ ch ].mainView.image.apply( im, ImageOp.Add );
         acc[ ch ].mainView.endProcess();
         cnt[ ch ]++;
      }
      win.forceClose();
      cumExposure += fr.exposure;

      var n = i + 1;
      if ( renderSet[ n ] )
      {
         // One global brightness factor (keeps SHO colour balanced as it grows).
         var ramp = Math.pow( integrated/mappedFrames, STACK_RAMP_GAMMA );
         var chImgs = { R: null, G: null, B: null }, mwByKey = {};
         var sigCur = {}, wByFilter = {};   // filter -> noise now, and channels fed
         for ( var k = 0; k < 3; ++k )
         {
            var key = keys[ k ];
            if ( acc[ key ] != null && cnt[ key ] > 0 && stretches[ key ] )
            {
               var mw = meanOf( acc[ key ].mainView.image, cnt[ key ], "__sc_m" + key );
               // Noise of the running mean, measured on the LINEAR data — before
               // the stretch and the ramp below, which would otherwise be what the
               // dB figure measures. Once per distinct filter (HOO feeds G and B
               // from one OIII mean), and only over the channels actually drawn.
               var fName = canonicalFilter( map[ key ] );
               wByFilter[ fName ] = ( wByFilter[ fName ] || 0 ) + 1;
               if ( cfg.ovShowSnr && sigCur[ fName ] === undefined )
                  sigCur[ fName ] = estimateSigma( mw.mainView.image );
               applyStretchToView( mw.mainView, stretches[ key ] );
               // Dim the *stretched* (balanced) channel by the global ramp: scaling
               // the linear signal instead would push the faint channels below their
               // black point and clip them, leaving a green-dominant buildup.
               mw.mainView.beginProcess( UndoFlag.NoSwapFile );
               mw.mainView.image.apply( ramp, ImageOp.Mul );
               mw.mainView.endProcess();
               chImgs[ key ] = mw.mainView.image;
               mwByKey[ key ] = mw;
            }
         }
         // Remove the dominant green (SCNR, average-neutral): cap the green channel
         // at the R/B neutral so it never exceeds it — kills the green cast typical
         // of SHO without touching genuinely green regions.
         if ( cfg.removeGreen && mwByKey.G && ( mwByKey.R || mwByKey.B ) )
         {
            var neutral;
            if ( mwByKey.R && mwByKey.B )
            {
               neutral = makeWorkWindow( mwByKey.R.mainView.image, "__sc_neu" );
               neutral.mainView.beginProcess( UndoFlag.NoSwapFile );
               neutral.mainView.image.apply( mwByKey.B.mainView.image, ImageOp.Add );
               neutral.mainView.image.apply( 0.5, ImageOp.Mul );
               neutral.mainView.endProcess();
            }
            else
               neutral = makeWorkWindow( ( mwByKey.R || mwByKey.B ).mainView.image, "__sc_neu" );
            mwByKey.G.mainView.beginProcess( UndoFlag.NoSwapFile );
            mwByKey.G.mainView.image.apply( neutral.mainView.image, ImageOp.Min );
            mwByKey.G.mainView.endProcess();
            neutral.forceClose();
         }
         var ent = [];
         for ( var fN in wByFilter )
            ent.push( { weight: wByFilter[ fN ],
                        sigmaFirst: sigFirst[ fN ], sigmaCurrent: sigCur[ fN ] } );
         var snr = compositeSnrSigmas( ent );
         // integrated, not n: a sub whose filter feeds no channel of this palette
         // is skipped and stays out of cumExposure, but n is its POSITION in the
         // list. Printing it put "200 x 120 s" — 6h40 — next to "4h00" on the same
         // line. The exposure is the running mean for the same reason: with two
         // filters at different exposures, fr.exposure flickers between them from
         // one frame to the next, where mono shows the mean and does not.
         var ov = buildOverlayInfo( cfg, {
            index: integrated, total: mappedFrames,
            cumulativeExposure: cumExposure,
            exposure: integrated > 0 ? cumExposure/integrated : fr.exposure,
            dateObs: fr.dateObs,
            sigmaFirst: snr.first, sigmaCurrent: snr.current, snrPartial: snr.partial,
            title: this.title } );
         var bmp = composeColorBitmap( chImgs, cfg, ov );
         // The LAST RENDERED position, not n == N. N is the last sub in shoot
         // order, and both skips above happen before n is computed: an SHO night
         // pulled in HOO ends on an SII sub every time, so the equality never held
         // and the whole end of the video — cross-fade, zoom, hold, the placement
         // the user aligned by hand — vanished without a word.
         if ( n == lastRender )
         {
            revealBase = composeColorBitmap( chImgs, cfg, null );
            lastOv = ov;
         }
         for ( var kc in mwByKey ) mwByKey[ kc ].forceClose();
         this.saveFrame( bmp, ++outIndex );
         this.progress( outIndex, totalRenders, tr( "run.render", outIndex, totalRenders, fr.name ),
                        ( ( outIndex & 3 ) == 0 ) ? bmp : null );
         console.writeln( tr( "run.render", outIndex, totalRenders, fr.name ) );
         if ( ( outIndex & 7 ) == 0 ) gc();
      }
   }
   for ( var kf = 0; kf < 3; ++kf )
      if ( acc[ keys[ kf ] ] ) acc[ keys[ kf ] ].forceClose();
   gc();

   // End reveal: cross-fade the final stack into the aligned presentation image
   // while zooming it to fill the frame (held afterwards by the encoder). The
   // base is overlay-free; the overlay is redrawn fixed on top of every reveal
   // frame so it does not zoom with the image.
   if ( !this.aborted && revealBase && geomW )
      this.renderStackReveal( revealBase, geomW, geomH, lastOv, outIndex, totalRenders );
   else if ( revealTailFrames( cfg ) > 0 && !this.aborted )
      this.skipped.push( "end reveal (no final composite to fade from)" );
};

// Append the end-reveal frames: over STACK_REVEAL_SEC, cross-fade the final
// stack composite (stackBmp, at output resolution) into the presentation image
// aligned onto the stack (stackReveal* config), while a view zoom carries that
// image from its stack-aligned placement to filling the video frame (contain
// fit, no crop). stackW/stackH are the sub/accumulator dimensions.
Engine.prototype.renderStackReveal = function( stackBmp, stackW, stackH, ov, outIndex, renderedSoFar )
{
   var cfg = this.cfg;
   if ( !cfg.stackRevealPath || !cfg.stackRevealPath.length )
      return outIndex;
   var reveal = loadFinishedBitmap( cfg.stackRevealPath );
   if ( reveal == null )
   {
      this.skipped.push( "presentation image unreadable" );
      return outIndex;
   }
   var rw = reveal.width, rh = reveal.height;
   var fmtDef = OUTPUT_FORMATS[ cfg.formatIndex ];
   var W = fmtDef.w, H = fmtDef.h;

   // stack px -> screen px (same cover mapping as renderOutputBitmap).
   var cover = computeCoverRect( stackW, stackH, W, H, cfg.fitMode );
   var sx = ( cover.x1 - cover.x0 )/stackW, sy = ( cover.y1 - cover.y0 )/stackH;
   function toScreen( x, y ) { return { x: cover.x0 + x*sx, y: cover.y0 + y*sy }; }

   // Reveal placement in stack px (shared with the align popup preview so what
   // was aligned is what renders), mapped to screen.
   // Rotation and mirrors used to be passed through whatever the flag said, so a
   // freshly chosen, correctly oriented image was rendered with the PREVIOUS
   // image's 180 degrees and horizontal flip. The not-aligned branch is a neutral
   // placement now: centred, contain-fit, no rotation, no mirror.
   var aligned = revealAligned( cfg, "stack" );
   var pl = revealPlacement( aligned ? cfg.stackRevealOffX : stackW/2,
                             aligned ? cfg.stackRevealOffY : stackH/2,
                             aligned ? cfg.stackRevealScale : ( stackW/rw ),
                             aligned ? cfg.stackRevealRot : 0,
                             aligned && cfg.stackRevealFlipH,
                             aligned && cfg.stackRevealFlipV,
                             rw/2, rh/2 );
   var cA  = toScreen( pl.c.x,  pl.c.y );
   var exA = toScreen( pl.ex.x, pl.ex.y );
   var eyA = toScreen( pl.ey.x, pl.ey.y );

   // Contain-fit factor that brings the reveal to fill the frame (one dimension
   // exact, no crop), zooming about the reveal centre toward the frame centre.
   var halfW = Math.sqrt( ( exA.x - cA.x )*( exA.x - cA.x ) + ( exA.y - cA.y )*( exA.y - cA.y ) );
   var halfH = Math.sqrt( ( eyA.x - cA.x )*( eyA.x - cA.x ) + ( eyA.y - cA.y )*( eyA.y - cA.y ) );
   var kFill = Math.min( ( W/2 )/Math.max( 1e-6, halfW ), ( H/2 )/Math.max( 1e-6, halfH ) );
   var fcx = W/2, fcy = H/2;

   // View zoom about the reveal centre toward the frame centre (loop-invariant
   // anchors captured once). e = eased progress, kView = current zoom factor.
   function V( px, py, e, kView )
   {
      return { x: cA.x + ( fcx - cA.x )*e + kView*( px - cA.x ),
               y: cA.y + ( fcy - cA.y )*e + kView*( py - cA.y ) };
   }
   // The fixed overlay is rendered once to a transparent layer and blitted on
   // each frame (unscaled), so it stays anchored while the image zooms under it.
   var ovBmp = null;
   if ( ov )
   {
      ovBmp = new Bitmap( W, H );
      ovBmp.fill( 0x00000000 );
      var og = new Graphics( ovBmp );
      og.antialiasing = true;
      drawOverlay( og, W, H, ov );
      og.end();
   }

   var tailFrames = revealTailFrames( cfg );
   // outIndex already carries the main loop's count, so reporting against
   // tailFrames alone read "Render 201 / 60 (reveal)" at 335%. The total is the
   // whole run: what has been written plus what this tail will write.
   var grandTotal = ( renderedSoFar || 0 ) + tailFrames;
   for ( var tf = 1; tf <= tailFrames; ++tf )
   {
      if ( this.checkAbort() ) break;
      var e = smootherstep01( tf/tailFrames );
      var a = e;                               // reveal alpha (cross-fade in)
      var kView = 1 + ( kFill - 1 )*e;         // zoom about the reveal centre
      var out = new Bitmap( W, H );
      out.fill( 0xFF000000 );
      var g = new Graphics( out );
      g.antialiasing = true;
      // The final stack (full-frame bmp) under the same view zoom, fading out.
      var tl = V( 0, 0, e, kView ), br = V( W, H, e, kView );
      g.opacity = 1 - a;
      g.drawScaledBitmap( new Rect( Math.round( tl.x ), Math.round( tl.y ),
                                    Math.round( br.x ), Math.round( br.y ) ), stackBmp );
      // The presentation image, aligned then zoomed to fill, fading in.
      var cV = V( cA.x, cA.y, e, kView ), exV = V( exA.x, exA.y, e, kView ), eyV = V( eyA.x, eyA.y, e, kView );
      blitOriented( g, cV, exV, eyV, rw, rh, reveal, a );
      if ( ovBmp )
      {
         g.opacity = 1;
         g.resetTransformation();
         g.drawBitmap( 0, 0, ovBmp );
      }
      g.end();
      this.saveFrame( out, ++outIndex );
      this.progress( outIndex, grandTotal, tr( "run.render", outIndex, grandTotal, "reveal" ),
                     ( ( tf & 1 ) == 0 ) ? out : null );
   }
   return outIndex;
};

// --------------------------------------------------------------------------
// Zoom Odyssey: whole sky -> constellation -> field -> the image revealing
// itself, driven by the plate solve of the final image.
Engine.prototype.runZoom = function()
{
   var cfg = this.cfg;

   var meta = scanFrameHeader( cfg.zoomImagePath );
   this.title = ( cfg.ovTitle && String( cfg.ovTitle ).trim().length )
                ? String( cfg.ovTitle ).trim() : ( meta.object || "" );

   var win = null;
   try { win = openFrameWindow( cfg.zoomImagePath ); } catch ( e ) { win = null; }
   if ( win == null )
   {
      this.fail( "zoom.errOpen", meta.name );
      this.skipped.push( meta.name );
      return;
   }
   var view = win.mainView;
   var imgW = view.image.width, imgH = view.image.height;

   var wcs = readImageWcs( view );
   if ( wcs == null )
   {
      win.forceClose();
      this.fail( "zoom.errUnsolved" );
      return;
   }
   if ( !File.directoryExists( this.framesDir() ) )
      File.createDirectory( this.framesDir(), true );
   this.clearFrames();

   // Revealed image. Two sources are supported: the solved image itself
   // (auto-stretched), or a separate finished image (JPEG/PNG/TIFF/…) inserted
   // as-is — the solved image then only provides the WCS, rescaled (or crop-
   // aligned) to the reveal image's pixel grid.
   var revealBmp, revealWcs, revealW, revealH;
   var separateReveal = cfg.zoomRevealPath && String( cfg.zoomRevealPath ).length > 0;
   if ( separateReveal )
   {
      win.forceClose();
      revealBmp = loadFinishedBitmap( cfg.zoomRevealPath );
      if ( revealBmp == null )
      {
         this.fail( "zoom.errReveal" );
         return;
      }
      revealW = revealBmp.width;
      revealH = revealBmp.height;
      if ( cfg.zoomRevealCropped && !revealAligned( cfg, "zoom" ) )
      {
         // zoomRevealScale defaults to 1.0 and nothing ever reset it, so ticking
         // the box and pressing Generate put the reveal centre on pixel (0,0) of
         // the solved image at 1 px = 1 px — a zoom ending a full degree off
         // target, self-consistent and therefore invisible.
         this.fail( "zoom.errCropNotAligned" );
         return;
      }
      revealWcs = ( cfg.zoomRevealCropped && revealAligned( cfg, "zoom" ) )
                  ? cropWcsCentered( wcs, cfg.zoomRevealOffX, cfg.zoomRevealOffY, cfg.zoomRevealScale,
                                     cfg.zoomRevealRot, cfg.zoomRevealFlipH, cfg.zoomRevealFlipV, revealW, revealH )
                  : scaleWcsToDims( wcs, imgW, imgH, revealW, revealH );
      console.writeln( tr( "zoom.revealFrom", File.extractName( cfg.zoomRevealPath ) +
                           File.extractExtension( cfg.zoomRevealPath ), revealW, revealH ) );
   }
   else
   {
      var stretch = computeStretchForImage( view.image, cfg.stretchLinked );
      applyStretchToView( view, stretch );
      revealBmp = view.image.render();
      win.forceClose();
      revealWcs = wcs;
      revealW = imgW;
      revealH = imgH;
   }
   gc();

   // The zoom targets the REVEAL image's framing (what actually fills the frame
   // at the end) — for a cropped reveal this is a sub-region of the solved one.
   var framing = wcsImageFraming( revealWcs, revealW, revealH );
   console.noteln( tr( "zoom.solved", formatAngle( framing.fovDeg ),
                       framing.centerRA.toFixed( 3 ), framing.centerDec.toFixed( 3 ) ) );

   var cat = loadZoomCatalogs();
   if ( !cat.ok )
      console.warningln( tr( "zoom.noCatalogs" ) );

   var P = framing.fovDeg;

   // Observer location: simulate the real sky from the shoot site (SITELAT/
   // SITELONG/DATE-OBS, or manual overrides). obs != null only when the target
   // was actually above the horizon at that place and time.
   var obs = null;
   if ( cfg.locationEnabled )
   {
      var lat = ( cfg.observerLat != 999 ) ? cfg.observerLat : meta.siteLat;
      var lon = ( cfg.observerLong != 999 ) ? cfg.observerLong : meta.siteLong;
      var epoch = ( cfg.observerDateUtc && cfg.observerDateUtc.length )
                  ? parseDateObs( cfg.observerDateUtc ) : meta.dateObs;
      if ( lat != null && lon != null && epoch != null && isFinite( lat ) && isFinite( lon ) )
      {
         var st = lstDeg( julianDate( epoch ), lon );
         var aa = raDecToAltAz( framing.centerRA, framing.centerDec, st, lat );
         if ( aa.alt > 3 )
         {
            obs = { lst: st, lat: lat, targetAlt: aa.alt, targetAz: aa.az };
            var card = ( ( gLanguage == "fr" ) ? CARDINALS_FR : CARDINALS_EN )[ Math.round( aa.az/45 )*45 % 360 ];
            console.noteln( tr( "zoom.location", aa.alt.toFixed( 0 ), card,
                                lat.toFixed( 2 ), lon.toFixed( 2 ) ) );
         }
         else
            console.warningln( tr( "zoom.belowHorizon" ) );
      }
   }

   // Real-sky survey bridge (CDS/Aladin hips2fits): a near cutout ~2.5x the
   // image field (so the photo reveals as a zoom-IN within it, never a
   // side-by-side comparison) and a wide one, fetched once at high resolution.
   // Their dense real stars carry the range where the bright-star catalog
   // thins, then the photo takes over. Best-effort — a failed fetch falls back
   // to the catalog stars.
   // The wide survey is fetched large (~50°) so real stars fill the frame early
   // — the bright-star catalog thins fast a few seconds into the zoom.
   var NEAR_PX = 3200, WIDE_PX = 2600;
   var nearFov = P*2.5;
   var wideFov = Math.max( 35, Math.min( 60, P*40 ) );
   var nearBmp = null, nearWcs = null, wideBmp = null, wideWcs = null;
   if ( cfg.hipsEnabled )
   {
      var self0 = this;
      var tick = function() { self0.progress( -1, 0, tr( "zoom.fetching" ) ); };
      this.progress( -1, 0, tr( "zoom.fetching" ) );
      console.writeln( tr( "zoom.fetching" ) );
      nearBmp = fetchHipsBitmap( cfg.hipsSurvey, framing.centerRA, framing.centerDec, nearFov, NEAR_PX, tick );
      if ( nearBmp )
      {
         nearWcs = makeSurveyWcs( framing.centerRA, framing.centerDec, nearFov, NEAR_PX );
         this.progress( -1, 0, tr( "zoom.fetchedNear" ), nearBmp );
      }
      wideBmp = fetchHipsBitmap( cfg.hipsSurvey, framing.centerRA, framing.centerDec, wideFov, WIDE_PX, tick );
      if ( wideBmp )
      {
         wideWcs = makeSurveyWcs( framing.centerRA, framing.centerDec, wideFov, WIDE_PX );
         this.progress( -1, 0, tr( "zoom.fetchedWide" ), wideBmp );
      }
      if ( !nearBmp && !wideBmp )
         console.warningln( tr( "zoom.hipsFailed" ) );
   }
   // Photo reveals within the still-larger near survey: start at ~1.6x the
   // image field so the survey (2.5x) is always bigger during the handoff.
   var photoWideMult = nearBmp ? 1.6 : 6;

   var fmt = OUTPUT_FORMATS[ cfg.formatIndex ];
   var W = fmt.w, H = fmt.h, unit = H/1080;

   // The REVEAL is the anchor: the camera ends locked to the image's OWN frame,
   // so the image finishes exactly upright/native and the sky (DSS2, stars) is
   // what's oriented around it. upVec = the image's up on the sky; endFov frames
   // it as Framing asks — filling the output and cropping the excess, or whole
   // with margins. No rotation term — the image is axis-aligned with the camera.
   var fC = raDecToVec( framing.centerRA, framing.centerDec );
   var topSky = wcsPixelToSky( revealWcs, revealW/2, 0 );      // image top-edge centre
   var topV = raDecToVec( topSky.ra, topSky.dec );
   var du = vdot( topV, fC );
   var upVec = vnorm( [ topV[0]-fC[0]*du, topV[1]-fC[1]*du, topV[2]-fC[2]*du ] );
   var endFov = zoomEndFov( P, revealW, revealH, W, H, cfg.fitMode );
   var camTarget = { centerRA: framing.centerRA, centerDec: framing.centerDec, fovDeg: endFov, upVec: upVec };

   // Field at which the near survey hands the frame over to the photo. The photo
   // ramps in on endFov, so that is what the handoff follows — P only happens to
   // be the same number when the output aspect matches the reveal's. Keyed to P,
   // a cropped 9:16 (endFov well under P) would drop the real sky a good second
   // before the photo shows up. Capped at the cutout's own size so the fade-out
   // can never start above the fade-in, whatever the aspect ratios.
   var nearOut = Math.min( endFov, nearFov );

   var startFov;
   if ( obs )
   {
      // Opening framing: target at 1/4 from the top, horizon just above the
      // bottom overlay.
      var sf = locationStartFraming( obs.targetAlt, W, H );
      obs.startFov = sf.fovDeg;
      obs.altC = sf.altCDeg;
      startFov = Math.max( sf.fovDeg, P*4 );
   }
   else
      startFov = Math.max( P*4, Math.min( 180, cfg.zoomStartFov || 180 ) );

   // Spread the camera roll all the way from the opening to where the photo
   // starts to appear (fov = endFov·photoWideMult), so it's a slow, gentle turn
   // instead of a fast one confined to the opening. tRoll = that fov's time,
   // found by numerically inverting the fov ease (smootherstep).
   var eReveal = ( startFov > endFov )
                 ? clamp01( 1 - Math.log( photoWideMult )/Math.log( startFov/endFov ) ) : 1;
   var rlo = 0, rhi = 1;
   for ( var rbi = 0; rbi < 40; ++rbi )
   {
      var rmid = ( rlo + rhi )/2;
      if ( smootherstep01( rmid ) < eReveal ) rlo = rmid; else rhi = rmid;
   }
   camTarget.tRoll = Math.max( 0.15, ( rlo + rhi )/2 );

   var N = Math.max( 2, Math.round( cfg.fps*cfg.targetDuration ) );
   var TAIL_FADE_SEC = 0.5;   // sky fades to black over the last 500 ms
   var tailFrac = Math.max( 1e-6, Math.min( 1, TAIL_FADE_SEC/cfg.targetDuration ) );
   var outIndex = 0;
   var PERF = { alloc: 0, sky: 0, survey: 0, photo: 0, labels: 0, overlay: 0, save: 0 };
   var tLoop0 = Date.now();

   for ( var i = 0; i < N; ++i )
   {
      if ( this.checkAbort() )
         break;
      var t = i/( N - 1 );
      var cam = obs ? zoomCameraLocation( t, camTarget, startFov, W, H, obs )
                    : zoomCameraAt( t, camTarget, startFov, W, H );
      var fov = cam.fovDeg;

      var _t0 = Date.now();
      var out = new Bitmap( W, H );
      out.fill( 0xFF05070D );
      var g = new Graphics( out );
      g.antialiasing = true;
      try { g.textAntialiasing = true; } catch ( e ) {}
      PERF.alloc += Date.now() - _t0;

      var pj = cameraProjector( cam );
      var ra = revealAlpha( fov, endFov, photoWideMult );
      // When the photo fully fills the frame, everything under it is invisible.
      var covered = ( ra >= 0.995 ) && revealCoversFrame( cam, revealWcs, revealW, revealH );

      if ( !covered )
      {
         _t0 = Date.now();
         // Wide-field cues, then catalog star dots — all UNDER the survey images.
         if ( !obs && cfg.ovShowHorizon )
            drawZoomHorizon( g, cam, unit );
         if ( cfg.ovShowGrid )
            drawEquatorialGrid( g, pj, cat.grid, unit );
         drawZoomStars( g, pj, cat.stars, unit );
         PERF.sky += Date.now() - _t0;

         _t0 = Date.now();
         // Real-sky survey layers (DSS2), covering the star dots with real stars.
         if ( wideBmp )
         {
            // Hands over to the NEAR cutout, not to the photo: the fade-out
            // bounds are that cutout's own size (nearFov = P*2.5, so 3P and 1.4P
            // are 1.2x and 0.56x of it), and stay keyed to P for that reason.
            var wa = fadeBand( fov, wideFov*2.8, wideFov*0.95, P*3, P*1.4 );
            if ( wa > 0 )
               drawZoomReveal( g, cam, wideWcs, WIDE_PX, WIDE_PX, wideBmp, wa );
         }
         if ( nearBmp )
         {
            var na = fadeBand( fov, nearFov*3, nearFov*1.2, nearOut*1.2, nearOut*0.85 );
            if ( na > 0 )
               drawZoomReveal( g, cam, nearWcs, NEAR_PX, NEAR_PX, nearBmp, na );
         }
         PERF.survey += Date.now() - _t0;

         _t0 = Date.now();
         // Constellation figures and all labels are drawn OVER the surveys.
         drawZoomConstellations( g, pj, cat.polys, unit );
         if ( cfg.ovConstNames )
            drawZoomConstellationNames( g, cam, cat.centroids, cat.labels, unit );
         if ( cfg.ovStarNames )
            drawZoomStarNames( g, cam, cat.stars, unit );
         // The real horizon + opaque ground go LAST, so nothing shows below it.
         // It belongs to the opening only: fade it out quickly so the big roll
         // (which sweeps the sky) can't bring it back into frame mid-zoom.
         if ( obs )
            drawLocationHorizon( g, cam, obs, unit, clamp01( ( 0.12 - t )/0.06 ) );
         PERF.labels += Date.now() - _t0;
      }

      // Over the final TAIL_FADE_SEC, fade every artificial sky layer (stars,
      // constellations, both surveys, horizon, background) to black — leaving
      // only the photo and the overlay for the held last frames.
      var skyFade = smoothstep01( ( 1 - t )/tailFrac );
      if ( skyFade < 1 )
      {
         g.opacity = 1;
         g.fillRect( new Rect( 0, 0, W, H ), new Brush( argb( 1 - skyFade, 0x000000 ) ) );
      }

      _t0 = Date.now();
      // Only the user's own image sits on top of everything.
      if ( ra > 0 )
         drawZoomReveal( g, cam, revealWcs, revealW, revealH, revealBmp, ra );
      PERF.photo += Date.now() - _t0;

      _t0 = Date.now();
      drawZoomOverlay( g, cam, cfg, this.title, t );
      g.end();
      PERF.overlay += Date.now() - _t0;

      _t0 = Date.now();
      this.saveFrame( out, ++outIndex );
      PERF.save += Date.now() - _t0;
      this.progress( outIndex, N, tr( "run.render", outIndex, N, formatAngle( fov ) ),
                     ( ( outIndex & 3 ) == 0 ) ? out : null );
      console.writeln( tr( "run.render", outIndex, N, formatAngle( fov ) ) );
      if ( ( outIndex & 7 ) == 0 )
         gc();
   }

   var tot = Math.max( 1, Date.now() - tLoop0 );
   console.noteln( "PERF zoom (" + outIndex + " frames, " + tot + " ms; per-frame avg): " +
      "alloc " + ( PERF.alloc/outIndex ).toFixed( 1 ) + " | sky " + ( PERF.sky/outIndex ).toFixed( 1 ) +
      " | survey " + ( PERF.survey/outIndex ).toFixed( 1 ) + " | labels " + ( PERF.labels/outIndex ).toFixed( 1 ) +
      " | photo " + ( PERF.photo/outIndex ).toFixed( 1 ) + " | overlay " + ( PERF.overlay/outIndex ).toFixed( 1 ) +
      " | save " + ( PERF.save/outIndex ).toFixed( 1 ) + " ms" );
   this.perf = PERF;
   this.perf.totalMs = tot;
   this.perf.frames = outIndex;
};

Engine.prototype.encode = function()
{
   var cfg = this.cfg;
   var framesPattern = this.framesDir() + "/frame_%05d" + FRAME_EXT;
   var args = buildFfmpegArgs( {
      fps: cfg.fps,
      framesPattern: framesPattern,
      crf: CRF_CHOICES[ cfg.crfIndex ],
      holdFirst: cfg.holdFirst,
      holdLast: cfg.holdLast,
      outputPath: this.videoPath()
   } );
   var scriptPath = writeEncodeScript( this.framesDir(), args );
   var ffmpeg = detectFfmpeg( cfg.ffmpegPath );
   if ( !ffmpeg.length )
   {
      console.warningln( tr( "run.encodeScript", scriptPath ) );
      return { encoded: false, scriptPath: scriptPath };
   }
   console.writeln( tr( "run.encoding" ) );
   this.progress( -1, 0, tr( "run.encoding" ) );
   var r = runExternal( ffmpeg, args, 0, true );
   // The written file is the ground truth — exit codes can lie (see above).
   if ( r.started && r.exitCode == 0 && File.exists( this.videoPath() ) )
   {
      console.noteln( tr( "run.encodeOk", this.videoPath() ) );
      // A lost frame means the sequence is short of what was counted; deleting it
      // would remove the only evidence and the only way to re-encode by hand.
      // A lost frame means the sequence is short of what was counted; deleting it
      // would remove the only evidence and the only way to re-encode by hand.
      if ( !cfg.keepFrames && !this.lostFrames )
         this.clearFrames();
      return { encoded: true, scriptPath: scriptPath, videoPath: this.videoPath() };
   }
   // Three ways to get here that used to collapse into one exit code.
   if ( r.failure == "notFound" || r.failure == "noStart" )
      console.warningln( tr( "run.encodeNoStart", ffmpeg, scriptPath ) );
   else if ( r.failure == "timeout" )
      console.warningln( tr( "run.encodeTimeout",
                             Math.round( r.waitedMs/1000 ), scriptPath ) );
   else
      console.warningln( tr( "run.encodeFail", r.exitCode, scriptPath ) );
   // What ffmpeg actually said, which used to be discarded with the process.
   // Last lines only: the banner is noise.
   var why = r.output;
   if ( why && why.length )
   {
      var lines = String( why ).split( "\n" );
      while ( lines.length && !lines[ lines.length - 1 ].length )
         lines.pop();
      console.warningln( tr( "run.encodeSaid",
                             lines.slice( Math.max( 0, lines.length - 6 ) ).join( "\n" ) ) );
   }
   return { encoded: false, scriptPath: scriptPath };
};

// Record why the run stops. The key is what automation matches on; the text is
// what the modal shows, so the dialog and the console can no longer say two
// different things about the same failure.
Engine.prototype.fail = function( key, arg )
{
   this.errorKey = key;
   this.errorText = ( arg === undefined ) ? tr( key ) : tr( key, arg );
};

Engine.prototype.run = function()
{
   var t0 = Date.now();
   var cfg = this.cfg;
   console.show();
   try { console.abortEnabled = true; } catch ( e ) {}
   var styleLabel = ( cfg.style == STYLE_ZOOM ) ? tr( "run.styleZoom" )
                                                : tr( "run.styleStacking" );
   var inputCount = ( cfg.style == STYLE_ZOOM ) ? 1 : this.frames.length;
   console.noteln( tr( "run.start", versionLabel(), inputCount, styleLabel ) );
   // Repeated here, next to the render it is about: a user can reach Generate
   // without ever looking at the notice in the window.
   if ( ( cfg.style == STYLE_ZOOM ) ? gRotPending.zoom : gRotPending.stack )
      console.warningln( tr( "align.rotStaleLog" ) );
   // Resolve the colour plan (filter→channel) before naming: the palette id is
   // woven into the output name. Filters survive registration, so decide now.
   var plan = { active: false, map: null };
   if ( cfg.style == STYLE_STACKING )
   {
      plan = this.colorPlan();
      this.colorActive = plan.active;
      this.paletteTag = plan.active ? cfg.palette : "";
   }

   // Zoom resolves its title (hence its output dir) from the image header
   // inside runZoom, so it creates its own directory there.
   if ( cfg.style != STYLE_ZOOM && !File.directoryExists( this.framesDir() ) )
      File.createDirectory( this.framesDir(), true );
   // Unconditional, and at the start: "Keep the frame sequence" means keep THIS
   // run's frames after encoding, never let the previous run's through.
   if ( cfg.style != STYLE_ZOOM )
      this.clearFrames();

   // Progressive stack: register to a common reference first (dithering + flip).
   if ( cfg.style == STYLE_STACKING )
      this.frames = this.registerFrames();

   if ( cfg.style == STYLE_ZOOM )
      this.runZoom();
   else
      plan.active ? this.runStackingColor( plan.map ) : this.runStacking();

   // Registration drops survive the per-pass skip resets in the render modes.
   this.skipped = this.regDropped.concat( this.skipped );
   var result = { ok: false, rendered: this.rendered, skipped: this.skipped.slice(),
                  aborted: this.aborted, videoPath: "", scriptPath: "",
                  framesDir: this.framesDir(), lostFrames: this.lostFrames,
                  errorKey: this.errorKey, error: this.errorText };

   if ( this.errorKey.length )
   {
      console.criticalln( this.errorText );
      return result;
   }
   if ( this.skipped.length )
      console.warningln( tr( "run.skipped", this.skipped.join( ", " ) ) );
   if ( this.lostFrames )
      console.criticalln( tr( "run.framesLost", this.lostFrames ) );
   if ( this.aborted )
   {
      console.warningln( tr( "run.aborted", this.rendered ) );
      result.errorKey = "run.aborted";
      result.error = tr( "run.aborted", this.rendered );
      return result;
   }
   if ( this.rendered == 0 )
   {
      result.errorKey = "result.nothing";
      result.error = tr( "result.nothing" );
      return result;
   }

   var enc = this.encode();
   result.ok = true;
   result.videoPath = enc.encoded ? enc.videoPath : "";
   result.scriptPath = enc.scriptPath || "";
   if ( cfg.keepFrames || !enc.encoded )
      console.writeln( tr( "run.framesKept", this.framesDir() ) );
   console.noteln( tr( "run.done", this.rendered, formatDuration( ( Date.now() - t0 )/1000 ) ) );
   return result;
};

// ============================================================================
// ZOOM ODYSSEY — frame rendering
// ============================================================================

function argb( alpha, rgb )
{
   var a = Math.round( clamp01( alpha )*255 );
   return ( a*0x1000000 ) + ( rgb & 0xFFFFFF );
}

// Stars from the bright-star catalog, deepening as we zoom in. Uses the frame
// projector and precomputed star vectors; the cull in projectVecPre skips
// off-screen stars before any projection math.
function drawZoomStars( g, pj, stars, unit )
{
   var magLimit = limitingMagnitude( pj.fovDeg );
   var W = pj.W, H = pj.H;
   for ( var i = 0; i < stars.length; ++i )
   {
      var st = stars[ i ];
      if ( st.mag > magLimit )
         continue;
      var p = projectVecPre( pj, st.v );
      if ( p == null || p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8 )
         continue;
      var r = starRadius( st.mag, magLimit, unit );
      if ( r <= 0 )
         continue;
      var a = 0.25 + 0.75*clamp01( ( magLimit - st.mag )/magLimit );
      g.brush = new Brush( argb( a, 0xFFFFFF ) );
      g.fillCircle( p.x, p.y, r );
   }
}

// Labels for the brightest named stars currently on screen (capped, so the
// famous anchors are named without cluttering the field).
function drawZoomStarNames( g, cam, stars, unit )
{
   var f = zoomFont( 15*unit, false );
   g.font = f;
   g.pen = new Pen( 0xB0EAF2FF );
   var magLimit = Math.min( limitingMagnitude( cam.fovDeg ), 3.2 );
   var drawn = 0;
   for ( var i = 0; i < stars.length && drawn < 14; ++i )
   {
      var st = stars[ i ];
      if ( !st.name || !st.name.length || st.mag > magLimit )
         continue;
      var p = projectToScreen( cam, st.ra, st.dec );
      if ( !p.front || p.x < 40 || p.x > cam.W - 40 || p.y < 30 || p.y > cam.H - 60 )
         continue;
      g.drawText( p.x + Math.round( 8*unit ), p.y - Math.round( 6*unit ), st.name );
      ++drawn;
   }
}

// French constellation names by IAU 3-letter code (the bundled labels are
// English). Latin names are shown as-is when no French form is listed.
var CONST_NAMES_FR = {
   AND:"Andromède", ANT:"Machine pneumatique", APS:"Oiseau de paradis", AQR:"Verseau",
   AQL:"Aigle", ARA:"Autel", ARI:"Bélier", AUR:"Cocher", BOO:"Bouvier", CAE:"Burin",
   CAM:"Girafe", CNC:"Cancer", CVN:"Chiens de chasse", CMA:"Grand Chien", CMI:"Petit Chien",
   CAP:"Capricorne", CAR:"Carène", CAS:"Cassiopée", CEN:"Centaure", CEP:"Céphée",
   CET:"Baleine", CHA:"Caméléon", CIR:"Compas", COL:"Colombe", COM:"Chevelure de Bérénice",
   CRA:"Couronne australe", CRB:"Couronne boréale", CRV:"Corbeau", CRT:"Coupe", CRU:"Croix du Sud",
   CYG:"Cygne", DEL:"Dauphin", DOR:"Dorade", DRA:"Dragon", EQU:"Petit Cheval", ERI:"Éridan",
   FOR:"Fourneau", GEM:"Gémeaux", GRU:"Grue", HER:"Hercule", HOR:"Horloge", HYA:"Hydre",
   HYI:"Hydre mâle", IND:"Indien", LAC:"Lézard", LEO:"Lion", LMI:"Petit Lion", LEP:"Lièvre",
   LIB:"Balance", LUP:"Loup", LYN:"Lynx", LYR:"Lyre", MEN:"Table", MIC:"Microscope",
   MON:"Licorne", MUS:"Mouche", NOR:"Règle", OCT:"Octant", OPH:"Ophiuchus", ORI:"Orion",
   PAV:"Paon", PEG:"Pégase", PER:"Persée", PHE:"Phénix", PIC:"Peintre", PSC:"Poissons",
   PSA:"Poisson austral", PUP:"Poupe", PYX:"Boussole", RET:"Réticule", SGE:"Flèche",
   SGR:"Sagittaire", SCO:"Scorpion", SCL:"Sculpteur", SCT:"Écu de Sobieski", SER:"Serpent",
   SEX:"Sextant", TAU:"Taureau", TEL:"Télescope", TRI:"Triangle", TRA:"Triangle austral",
   TUC:"Toucan", UMA:"Grande Ourse", UMI:"Petite Ourse", VEL:"Voiles", VIR:"Vierge",
   VOL:"Poisson volant", VUL:"Petit Renard"
};

// Constellation name labels at each constellation's centroid, in the UI language.
function drawZoomConstellationNames( g, cam, centroids, labels, unit )
{
   var alpha = constellationLabelAlpha( cam.fovDeg );
   if ( alpha <= 0 )
      return;
   var fr = ( gLanguage == "fr" );
   var f = zoomFont( 17*unit, false );
   g.font = f;
   g.pen = new Pen( argb( 0.7*alpha, 0x9FE4F5 ) );
   for ( var code in centroids )
   {
      var name = ( fr && CONST_NAMES_FR[ code ] ) ? CONST_NAMES_FR[ code ] : labels[ code ];
      if ( !name )
         continue;
      var c = centroids[ code ];
      var p = projectToScreen( cam, c.ra, c.dec );
      if ( !p.front || p.x < 20 || p.x > cam.W - 20 || p.y < 20 || p.y > cam.H - 40 )
         continue;
      g.drawText( p.x - Math.round( f.width( name )/2 ), p.y, name );
   }
}

// Stylized artificial horizon at wide fields — a clear ground + airglow band,
// a scale/orientation cue that fades as we zoom in (auto in v1; a decorative
// ground, not yet a location-accurate alt-az line). Full on the opening
// whole-sky frames, gone by ~30°.
function drawZoomHorizon( g, cam, unit )
{
   var fov = cam.fovDeg;
   var a = ( fov >= 90 ) ? 1 : ( fov <= 30 ? 0 : smoothstep01( ( fov - 30 )/60 ) );
   if ( a <= 0 )
      return;
   var W = cam.W, H = cam.H;
   var y0 = Math.round( H*0.72 );          // horizon line, above the title band
   var prevOp = g.opacity;
   g.opacity = a;
   // Airglow: a bright teal band just above the horizon fading upward.
   var glowH = Math.round( 90*unit );
   g.fillRect( new Rect( 0, y0 - Math.round( glowH*1.0 ), W, y0 ), new Brush( 0x14224D5C ) );
   g.fillRect( new Rect( 0, y0 - Math.round( glowH*0.55 ), W, y0 ), new Brush( 0x1E2E6E7E ) );
   g.fillRect( new Rect( 0, y0 - Math.round( glowH*0.22 ), W, y0 ), new Brush( 0x3341AEC4 ) );
   // Ground: an opaque gradient so it clearly reads as land.
   g.fillRect( new Rect( 0, y0, W, H ), new Brush( 0xCC0B1119 ) );
   g.fillRect( new Rect( 0, y0 + Math.round( ( H - y0 )*0.35 ), W, H ), new Brush( 0xE6070C12 ) );
   g.fillRect( new Rect( 0, y0 + Math.round( ( H - y0 )*0.7 ), W, H ), new Brush( 0xFF04070B ) );
   // Bright horizon line.
   g.pen = new Pen( argb( 0.85, 0x6FC7DA ), Math.max( 2, 2.5*unit ) );
   g.drawLine( 0, y0, W, y0 );
   g.opacity = prevOp;
}

var CARDINALS_EN = { 0:"N", 45:"NE", 90:"E", 135:"SE", 180:"S", 225:"SW", 270:"W", 315:"NW" };
var CARDINALS_FR = { 0:"N", 45:"NE", 90:"E", 135:"SE", 180:"S", 225:"SO", 270:"O", 315:"NO" };

// Location horizon — drawn FLAT (a horizontal line) by request, even though the
// true horizon is curved. Its height follows the projected central horizon
// point (in the target's azimuth), so it descends naturally as the camera
// lifts. Below it, an opaque black+blue ground hides every sky element. Cardinal
// points are placed at their real azimuth's screen X, sitting on the flat line.
function drawLocationHorizon( g, cam, obs, unit, fade )
{
   fade = ( fade === undefined ) ? 1 : fade;
   if ( fade <= 0 )
      return;
   var W = cam.W, H = cam.H;
   var hc = altAzToRaDec( 0, obs.targetAz, obs.lst, obs.lat );
   var pC = projectToScreen( cam, hc.ra, hc.dec );
   if ( !pC.front || pC.y <= -6*unit || pC.y >= H + 6*unit )
      return;                                   // horizon out of frame
   var yr = Math.round( pC.y );
   var prevOp = g.opacity;
   g.opacity = fade;

   // Airglow just above the horizon.
   g.brush = new Brush( 0x2222D3EE ); g.fillRect( new Rect( 0, Math.max( 0, yr - Math.round( 70*unit ) ), W, yr ) );
   g.brush = new Brush( 0x3341AEC4 ); g.fillRect( new Rect( 0, Math.max( 0, yr - Math.round( 22*unit ) ), W, yr ) );

   // Opaque ground: black first, then deep blue — nothing below the horizon.
   g.brush = new Brush( 0xFF000000 ); g.fillRect( new Rect( 0, yr, W, H ) );
   g.brush = new Brush( 0xFF0E2038 ); g.fillRect( new Rect( 0, yr, W, H ) );

   // Flat horizon line.
   g.pen = new Pen( argb( 0.9, 0x6FC7DA ), Math.max( 2, 3*unit ) );
   g.drawLine( 0, yr, W, yr );

   // Cardinal points at their real azimuth, on the flat line.
   var table = ( gLanguage == "fr" ) ? CARDINALS_FR : CARDINALS_EN;
   var f = zoomFont( 20*unit, true );
   g.font = f;
   g.pen = new Pen( argb( 0.95, 0xCDEAF2 ) );
   for ( var c in table )
   {
      var crd = altAzToRaDec( 0, parseFloat( c ), obs.lst, obs.lat );
      var cp = projectToScreen( cam, crd.ra, crd.dec );
      if ( cp.front && cp.x > 10 && cp.x < W - 30 )
         g.drawText( Math.round( cp.x - f.width( table[ c ] )/2 ), yr - Math.round( 8*unit ), table[ c ] );
   }
   g.opacity = prevOp;
}

// Equatorial coordinate grid (RA meridians + Dec parallels) in a distinct
// green, a wide-field cue that fades as we zoom in. Segments crossing behind
// the projection or wrapping across the sky are dropped.
// Draw a set of precomputed-vector polylines with the frame projector, skipping
// segments that cross behind the camera or wrap across the sky.
function drawVecPolylines( g, pj, polys, vectorOf )
{
   var maxSeg = pj.W*0.6, maxSeg2 = maxSeg*maxSeg;
   for ( var i = 0; i < polys.length; ++i )
   {
      var pts = polys[ i ], prev = null;
      for ( var j = 0; j < pts.length; ++j )
      {
         var p = projectVecPre( pj, vectorOf( pts[ j ] ) );
         if ( p != null && prev != null )
         {
            var dx = p.x - prev.x, dy = p.y - prev.y;
            if ( dx*dx + dy*dy < maxSeg2 )
               g.drawLine( prev.x, prev.y, p.x, p.y );
         }
         prev = p;
      }
   }
}

var VEC_SELF = function( v ) { return v; };
var VEC_OF   = function( pt ) { return pt.v; };

function drawEquatorialGrid( g, pj, grid, unit )
{
   var fov = pj.fovDeg;
   var a = ( fov >= 90 ) ? 1 : ( fov <= 25 ? 0 : smoothstep01( ( fov - 25 )/65 ) );
   if ( a <= 0 )
      return;
   g.pen = new Pen( argb( 0.28*a, 0x5FBF7F ), Math.max( 1, 1*unit ) );
   drawVecPolylines( g, pj, grid, VEC_SELF );
}

// Constellation figure lines, fading in around the constellation phase.
function drawZoomConstellations( g, pj, polys, unit )
{
   var alpha = constellationAlpha( pj.fovDeg );
   if ( alpha <= 0 )
      return;
   g.pen = new Pen( argb( 0.45*alpha, 0x7FD8F0 ), Math.max( 1, 1.3*unit ) );
   drawVecPolylines( g, pj, polys, VEC_OF );
}

// Reveal placement from the align state: centre, +x-edge midpoint and top-edge
// midpoint in background/placement pixels, via M = R·diag(scale·flip). Both the
// align popup preview and the stack/zoom renderers feed these (mapped to screen)
// to blitOriented, so what you align is pixel-identical to what renders — the
// geometry lives in ONE place instead of two mirror-image copies.
function revealPlacement( cx, cy, scale, rotDeg, flipH, flipV, halfW, halfH )
{
   var M = placementMatrix( scale, rotDeg, flipH, flipV );
   return {
      c:  { x: cx, y: cy },
      ex: { x: cx + M[ 0 ][ 0 ]*halfW, y: cy + M[ 1 ][ 0 ]*halfW },
      ey: { x: cx - M[ 0 ][ 1 ]*halfH, y: cy - M[ 1 ][ 1 ]*halfH }
   };
}

// Convert a StarAlignment transformation (outputData row, fields 11..19: a
// row-major 3x3 mapping BACKGROUND px -> REVEAL px) into the align-dialog
// placement model: reveal centre in background px, reveal->background scale,
// rotation and horizontal flip (any mirrored similarity decomposes as
// flipH + rotation, so flipV is always false here). The tiny projective
// terms of a star-field fit (h31,h32 ~ 1e-6) are ignored. Returns null on a
// degenerate or wildly out-of-range solution.
function saMatrixToAlignment( h, revealW, revealH )
{
   if ( !h || h.length < 9 || !isFinite( h[ 8 ] ) || Math.abs( h[ 8 ] ) < 1e-12 )
      return null;
   var a = h[ 0 ]/h[ 8 ], b = h[ 1 ]/h[ 8 ], c = h[ 2 ]/h[ 8 ],
       d = h[ 3 ]/h[ 8 ], e = h[ 4 ]/h[ 8 ], f = h[ 5 ]/h[ 8 ];
   var det = a*e - b*d;
   if ( !isFinite( det ) || Math.abs( det ) < 1e-12 )
      return null;
   // Invert the affine part: reveal px -> background px. Its determinant is
   // algebraically 1/det, so flip and scale come straight from det.
   var L00 = e/det, L01 = -b/det, L10 = -d/det, L11 = a/det;
   var t0 = -( L00*c + L01*f ), t1 = -( L10*c + L11*f );
   var flipH = det < 0;
   var fx = flipH ? -1 : 1;
   var scale = 1/Math.sqrt( Math.abs( det ) );
   if ( !( scale > 1e-4 && scale < 1e4 ) )
      return null;
   var rotDeg = rad2deg( Math.atan2( fx*L10, fx*L00 ) );
   return { cx: L00*revealW/2 + L01*revealH/2 + t0,
            cy: L10*revealW/2 + L11*revealH/2 + t1,
            scale: scale, rotDeg: rotDeg, flipH: flipH, flipV: false };
}

// One overlapping grid of half-size background tiles: any reveal region up
// to a quarter of the background lies fully inside at least one tile. Deep-
// crop reveals defeat a full-frame match — the reveal's stars go 8x fainter
// than the background's field-wide brightest-5000 cut over the same sky, so
// descriptor neighbourhoods never agree (measured: thousands of putative
// pairs, zero RANSAC inliers). Matching against tiles restores a symmetric
// star selection, which the matcher tolerates across a ~3x scale ratio.
function alignTileGrid( bgW, bgH )
{
   var w = Math.round( bgW/2 ), h = Math.round( bgH/2 );
   var tiles = [];
   for ( var j = 0; j < 3; ++j )
      for ( var i = 0; i < 3; ++i )
         tiles.push( { x: Math.min( Math.round( i*bgW/4 ), bgW - w ),
                       y: Math.min( Math.round( j*bgH/4 ), bgH - h ),
                       w: w, h: h } );
   return tiles;
}

// Translate a placement computed against a tile back to full-background px.
function offsetAlignment( al, dx, dy )
{
   return { cx: al.cx + dx, cy: al.cy + dy, scale: al.scale,
            rotDeg: al.rotDeg, flipH: al.flipH, flipV: al.flipV };
}

// Post-fit acceptance on a StarAlignment outputData row: enough matched
// pairs, a decent inlier ratio and a subpixel-grade rms error — this is what
// rejects the degenerate consensus a wrong-scale attempt can return.
function saQualityOk( row )
{
   return !!row && row.length > 9 && row[ 2 ] >= 12 && row[ 3 ] >= 0.5 &&
          row[ 7 ] <= 2.5;
}

// Rescale a placement recovered from a pre-shrunk reveal back to native px
// (the background side is never pre-scaled: tiles stay at native resolution).
function rescaleAlignment( al, revealFactor )
{
   return { cx: al.cx, cy: al.cy, scale: al.scale*revealFactor,
            rotDeg: al.rotDeg, flipH: al.flipH, flipV: al.flipV };
}

// Compute the reveal placement automatically by star-matching the reveal
// against the background, both given as the BITMAPS the align dialog shows —
// what you auto-align is exactly what you see. Stage A matches full frame
// against full frame (same-framing reveals, up to a ~3x scale ratio); stage
// B retries against the overlapping background tiles for deep-crop reveals
// (see alignTileGrid). Each attempt runs StarAlignment in OutputMatrix mode
// (we only need the transformation; the registered file it still writes is
// removed). The enum constants are not resolvable as globals but do live on
// the process INSTANCE (see the API notes in CHANGELOG). Polygon descriptors
// cannot match a mirrored reveal, so every stage is doubled with triangle
// similarity, which can. onProgress( i, n ) is called before each attempt.
// Returns the placement, or null when no star match passes the quality gate
// (starless or heavily processed reveals stay a manual job).
function autoAlignReveal( bgBmp, revealBmp, onProgress )
{
   var written = [];
   function savePng( bmp, tag )
   {
      var path = File.systemTempDirectory + "/sc-autoalign-" + tag + ".png";
      bmp.save( path );
      if ( written.indexOf( path ) < 0 )
         written.push( path );
      return path;
   }
   // One SA attempt; returns the placement in reference px, or null.
   function runSA( refPath, tgtPath, useTri, tgtW, tgtH )
   {
      var SA = new StarAlignment;
      try
      {
         SA.mode = ( typeof SA.OutputMatrix != "undefined" ) ? SA.OutputMatrix : 8;
         SA.referenceImage = refPath;
         SA.referenceIsFile = true;
         SA.targets = [ [ true, true, tgtPath ] ];
         SA.outputDirectory = File.systemTempDirectory;
         SA.overwriteExistingFiles = true;
         SA.useTriangles = useTri;
         if ( !SA.executeGlobal() )
            return null;
         var row = SA.outputData[ 0 ];
         try { if ( row[ 0 ] && row[ 0 ].length ) File.remove( row[ 0 ] ); } catch ( e0 ) {}
         if ( !saQualityOk( row ) )
            return null;
         return saMatrixToAlignment( row.slice( 11, 20 ), tgtW, tgtH );
      }
      catch ( e )
      {
         return null;
      }
   }
   var tiles = alignTileGrid( bgBmp.width, bgBmp.height );
   var step = 0, totalSteps = 2 + 2*tiles.length;
   function progress()
   {
      ++step;
      if ( onProgress )
         try { onProgress( step, totalSteps ); } catch ( ep ) {}
   }
   var result = null;
   try
   {
      var bgPath = savePng( bgBmp, "bg" );
      var rvPath = savePng( revealBmp, "rv" );
      // Stage A — full frame vs full frame.
      for ( var m = 0; m < 2 && result == null; ++m )
      {
         progress();
         result = runSA( bgPath, rvPath, m == 1, revealBmp.width, revealBmp.height );
      }
      // Stage B — background tiles, reveal scaled to the tile footprint.
      if ( result == null )
      {
         var fr = Math.min( 1, tiles[ 0 ].w/revealBmp.width, tiles[ 0 ].h/revealBmp.height );
         var rw = Math.max( 16, Math.round( revealBmp.width*fr ) );
         var rh = Math.max( 16, Math.round( revealBmp.height*fr ) );
         var rvSmall = ( fr == 1 ) ? rvPath : savePng( revealBmp.scaledTo( rw, rh ), "rv-tile" );
         var tilePaths = [];   // rendered once, reused by the triangles pass
         for ( var pass = 0; pass < 2 && result == null; ++pass )
            for ( var t = 0; t < tiles.length && result == null; ++t )
            {
               progress();
               var T = tiles[ t ];
               if ( tilePaths[ t ] == null )
               {
                  var tileBmp = new Bitmap( T.w, T.h );
                  var g = new Graphics( tileBmp );
                  g.drawBitmapRect( new Point( 0, 0 ), bgBmp, new Rect( T.x, T.y, T.x + T.w, T.y + T.h ) );
                  g.end();
                  tilePaths[ t ] = savePng( tileBmp, "tile" + t );
               }
               var al = runSA( tilePaths[ t ], rvSmall, pass == 1, rw, rh );
               if ( al != null )
                  result = offsetAlignment( rescaleAlignment( al, fr ), T.x, T.y );
            }
      }
   }
   finally
   {
      for ( var w2 = 0; w2 < written.length; ++w2 )
         try { File.remove( written[ w2 ] ); } catch ( e2 ) {}
   }
   return result;
}

// Draw a bitmap given the screen positions of its CENTER, its +x edge midpoint
// and its top edge midpoint — decomposes to a conformal translate/rotate/scale
// (with a parity flip) and blits. Shared by the zoom renderer and the alignment
// preview, so what you align is exactly what renders. An optional outline is
// drawn under the same transform, so it can never diverge from the image.
// Express a 2x2 as the three transformation calls PixInsight actually offers:
//   A = Rp(a1) . diag(sx,sy) . Rp(a2)
// where Rp is rotateTransformation — CLOCKWISE on screen, and it IGNORES negative
// angles, so both angles come back normalised into [0, 2pi). This is the SVD of A
// with the reflection carried by a negative sy, which is how a mirrored placement
// survives. A similarity comes back with sx == sy, so the conformal path below is
// the degenerate case of this one rather than a second implementation of it.
function decomposeAffine( ax, ay, bx, by )
{
   var E = ( ax + by )/2, F = ( ax - by )/2, G = ( ay + bx )/2, H = ( ay - bx )/2;
   var Q = Math.sqrt( E*E + H*H ), R = Math.sqrt( F*F + G*G );
   var a1s = Math.atan2( G, F ), a2s = Math.atan2( H, E );
   var TWO_PI = 2*Math.PI;
   return {
      a1: ( ( -( a2s + a1s )/2 % TWO_PI ) + TWO_PI ) % TWO_PI,
      sx: Q + R,
      sy: Q - R,
      a2: ( ( -( a2s - a1s )/2 % TWO_PI ) + TWO_PI ) % TWO_PI
   };
}

// The one placement primitive. Draws bmp — or the sub-rectangle srcRect of it —
// so that its own pixel (0,0), or srcRect's top-left, lands on (ox,oy) and its
// +x and +y axes follow (ax,ay) and (bx,by) screen pixels each. Everything that
// puts an image on the sky goes through here, so a placement can never diverge
// from the outline drawn around it or from a neighbouring tile of the same image.
function blitAffine( g, ox, oy, ax, ay, bx, by, w, h, bmp, srcRect, alpha, outlineColor )
{
   var d = decomposeAffine( ax, ay, bx, by );
   if ( !( Math.abs( d.sx ) > 0 ) )
      return;
   var prevOp = g.opacity;
   g.opacity = clamp01( alpha );
   g.resetTransformation();
   g.translateTransformation( ox, oy );
   g.rotateTransformation( d.a1 );
   g.scaleTransformation( d.sx, d.sy );
   g.rotateTransformation( d.a2 );
   if ( srcRect === undefined )
      g.drawBitmap( 0, 0, bmp );
   else
      g.drawBitmapRect( new Point( 0, 0 ), bmp, srcRect );
   if ( outlineColor !== undefined )
   {
      // Pen width is given in source pixels, so undo the placement's own scale to
      // keep the outline the same thickness on screen whatever the zoom.
      var lin = Math.sqrt( Math.abs( ax*by - bx*ay ) );
      g.opacity = 1;
      g.pen = new Pen( outlineColor, Math.max( 0.5, 2/( lin > 0 ? lin : 1 ) ) );
      g.brush = new Brush( 0x00000000 );
      g.drawRect( new Rect( 0, 0, w, h ) );
   }
   g.resetTransformation();
   g.opacity = prevOp;
}

function blitOriented( g, c, ex, ey, imgW, imgH, bmp, alpha, outlineColor )
{
   var ux = ( ex.x - c.x )/( imgW/2 ), uy = ( ex.y - c.y )/( imgW/2 );
   var scale = Math.sqrt( ux*ux + uy*uy );
   if ( !( scale > 0 ) )
      return;
   var wyx = ( ey.x - c.x )/( -imgH/2 ), wyy = ( ey.y - c.y )/( -imgH/2 );
   var flip = ( ux*wyy - uy*wyx < 0 ) ? -1 : 1;
   // The image's +x axis follows (ux,uy) and its +y axis the perpendicular, which
   // is what makes this conformal: one scale, one rotation, one parity. The y
   // anchor ey is read for its handedness only — its length and its exact
   // direction are what a similarity cannot honour, and what the tiled path below
   // exists to honour.
   var bx = -flip*uy, by = flip*ux;
   blitAffine( g, c.x - ( ux*imgW + bx*imgH )/2, c.y - ( uy*imgW + by*imgH )/2,
               ux, uy, bx, by, imgW, imgH, bmp, undefined, alpha, outlineColor );
}

// How far a straight-line placement bows off the truth: the projected footprint's
// edge midpoints against the chords between its corners, plus the centre against
// the corner mean. Zero for any linear map, and it grows as the square of the
// field — which is what makes the tile count below solvable instead of chosen.
// Returns -1 when any probe is behind the camera, i.e. "do not tile, fall back".
function revealSagitta( scr, imgW, imgH )
{
   var q = [ [ 0, 0 ], [ imgW, 0 ], [ imgW, imgH ], [ 0, imgH ] ];
   var p = [], k;
   for ( k = 0; k < 4; ++k )
   {
      p[ k ] = scr( q[ k ][ 0 ], q[ k ][ 1 ] );
      if ( !p[ k ].front )
         return -1;
   }
   var m = 0, dx, dy;
   for ( k = 0; k < 4; ++k )
   {
      var a = p[ k ], b = p[ ( k + 1 ) % 4 ];
      var qa = q[ k ], qb = q[ ( k + 1 ) % 4 ];
      var mid = scr( ( qa[ 0 ] + qb[ 0 ] )/2, ( qa[ 1 ] + qb[ 1 ] )/2 );
      if ( !mid.front )
         return -1;
      dx = mid.x - ( a.x + b.x )/2; dy = mid.y - ( a.y + b.y )/2;
      m = Math.max( m, Math.sqrt( dx*dx + dy*dy ) );
   }
   var c = scr( imgW/2, imgH/2 );
   if ( !c.front )
      return -1;
   dx = c.x - ( p[0].x + p[1].x + p[2].x + p[3].x )/4;
   dy = c.y - ( p[0].y + p[1].y + p[2].y + p[3].y )/4;
   return Math.max( m, Math.sqrt( dx*dx + dy*dy ) );
}

// Neighbouring tiles are fitted through corners they SHARE, so what is left of
// their disagreement is the second-order term, and it falls as 1/n^2. Measured
// over the whole zoom envelope, the worst seam is REVEAL_SEAM_K times the
// sagitta divided by n^2 — so the tile count is solved for the budget instead of
// picked, and tests/zoom.test.js checks the seam it actually produces rather than
// trusting the law. Quantised so the grid cannot change from one frame to the
// next; capped because past the cap the seam is long since invisible.
var REVEAL_SEAM_BUDGET_PX = 1;
var REVEAL_SEAM_K = 9;
var REVEAL_TILE_STEPS = [ 1, 2, 3, 4, 6, 8, 12, 16, 24, 32 ];

function revealTileCount( scr, imgW, imgH )
{
   var sag = revealSagitta( scr, imgW, imgH );
   if ( !( sag > 0 ) )
      return 1;
   var want = Math.sqrt( REVEAL_SEAM_K*sag/REVEAL_SEAM_BUDGET_PX );
   for ( var i = 0; i < REVEAL_TILE_STEPS.length; ++i )
      if ( REVEAL_TILE_STEPS[ i ] >= want )
         return REVEAL_TILE_STEPS[ i ];
   return REVEAL_TILE_STEPS[ REVEAL_TILE_STEPS.length - 1 ];
}

// The placement of every tile, as pure geometry: no graphics context, so the
// drift against the directly-projected sky and the seam between neighbours are
// both measurable in a test. Each tile's affine passes exactly through three
// corners of a grid every tile reads from, so two neighbours agree exactly at
// the corners they have in common.
// clipW/clipH, when given, drop the tiles that fall entirely outside the frame.
// Early in the fade band the cutout is nearly frame-filling and nothing is culled;
// late in it the cutout is a small patch and most of the grid is off screen, where
// tiling it would be paid for and never seen.
function revealTiles( scr, imgW, imgH, n, clipW, clipH )
{
   var cutX = function( k ) { return Math.floor( k*imgW/n ); };
   var cutY = function( k ) { return Math.floor( k*imgH/n ); };
   var P = [], i, j;
   for ( j = 0; j <= n; ++j )
   {
      P[ j ] = [];
      for ( i = 0; i <= n; ++i )
         P[ j ][ i ] = scr( cutX( i ), cutY( j ) );
   }
   var out = [];
   for ( j = 0; j < n; ++j )
      for ( i = 0; i < n; ++i )
      {
         var x0 = cutX( i ), x1 = cutX( i + 1 ), y0 = cutY( j ), y1 = cutY( j + 1 );
         var w = x1 - x0, h = y1 - y0;
         if ( w <= 0 || h <= 0 )
            continue;
         var A = P[ j ][ i ], B = P[ j ][ i + 1 ], C = P[ j + 1 ][ i ];
         // All four corners, so a tile straddling the horizon is dropped whole
         // rather than drawn from an extrapolated third corner.
         if ( !A.front || !B.front || !C.front || !P[ j + 1 ][ i + 1 ].front )
            continue;
         if ( clipW !== undefined )
         {
            // The drawn quad's corners: three read from the grid, the fourth the
            // affine's own image of the far corner. One pixel of margin covers the
            // difference between that and the grid's own fourth corner.
            var D = { x: B.x + C.x - A.x, y: B.y + C.y - A.y };
            var lo = Math.min( A.x, B.x, C.x, D.x ), hi = Math.max( A.x, B.x, C.x, D.x );
            if ( hi < -1 || lo > clipW + 1 )
               continue;
            lo = Math.min( A.y, B.y, C.y, D.y ); hi = Math.max( A.y, B.y, C.y, D.y );
            if ( hi < -1 || lo > clipH + 1 )
               continue;
         }
         out.push( { x0: x0, y0: y0, x1: x1, y1: y1,
                     ox: A.x, oy: A.y,
                     ax: ( B.x - A.x )/w, ay: ( B.y - A.y )/w,
                     bx: ( C.x - A.x )/h, by: ( C.y - A.y )/h } );
      }
   return out;
}

// Place the revealed image at its true on-sky position, orientation and scale.
// A small field measures no bow and takes the single conformal blit, which is the
// same call the alignment preview makes — so what you align is still exactly what
// renders. A wide survey cutout spans tens of degrees, where the composition of
// the cutout's gnomonic WCS with the stereographic camera is neither linear nor
// conformal: it shears and its scale is anisotropic, so ONE similarity cannot
// place it and the error lands as the survey drifting off the stars drawn over it.
// There the source is cut into tiles and each gets its own affine.
function drawZoomReveal( g, cam, wcs, imgW, imgH, bmp, alpha )
{
   function scr( px, py )
   {
      var s = wcsPixelToSky( wcs, px, py );
      return projectToScreen( cam, s.ra, s.dec );
   }
   var n = revealTileCount( scr, imgW, imgH );
   if ( n <= 1 )
   {
      var c = scr( imgW/2, imgH/2 );
      if ( !c.front )
         return;
      blitOriented( g, c, scr( imgW, imgH/2 ), scr( imgW/2, 0 ), imgW, imgH, bmp, alpha );
      return;
   }
   var tiles = revealTiles( scr, imgW, imgH, n, cam.W, cam.H );
   for ( var k = 0; k < tiles.length; ++k )
   {
      var t = tiles[ k ];
      blitAffine( g, t.ox, t.oy, t.ax, t.ay, t.bx, t.by, t.x1 - t.x0, t.y1 - t.y0,
                  bmp, new Rect( t.x0, t.y0, t.x1, t.y1 ), alpha );
   }
}

// True if the revealed image, projected, fully covers the frame — so the layers
// underneath (stars, constellations, surveys, ground) can be skipped entirely.
function pointInPoly( x, y, poly )
{
   var inside = false;
   for ( var i = 0, j = poly.length - 1; i < poly.length; j = i++ )
   {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ( ( ( yi > y ) != ( yj > y ) ) && ( x < ( xj - xi )*( y - yi )/( yj - yi ) + xi ) )
         inside = !inside;
   }
   return inside;
}

function revealCoversFrame( cam, wcs, imgW, imgH )
{
   function scr( px, py ) { var s = wcsPixelToSky( wcs, px, py ); return projectToScreen( cam, s.ra, s.dec ); }
   var q = [ scr( 0, 0 ), scr( imgW, 0 ), scr( imgW, imgH ), scr( 0, imgH ) ];
   for ( var i = 0; i < 4; ++i )
      if ( !q[ i ].front )
         return false;
   var fc = [ { x: 0, y: 0 }, { x: cam.W, y: 0 }, { x: cam.W, y: cam.H }, { x: 0, y: cam.H } ];
   for ( var c = 0; c < 4; ++c )
      if ( !pointInPoly( fc[ c ].x, fc[ c ].y, q ) )
         return false;
   return true;
}

function zoomFont( px, bold )
{
   var f = new Font( "Open Sans" );
   f.pixelSize = Math.round( px );
   if ( bold )
      try { f.bold = true; } catch ( e ) {}
   return f;
}

// Title / subtitle / distance / scale bar / signature / progress.
function drawZoomOverlay( g, cam, cfg, title, t )
{
   var W = cam.W, H = cam.H, u = H/1080;
   var margin = Math.round( 40*u );
   g.opacity = 1;

   var titleFont = zoomFont( 34*u, true );
   var subFont = zoomFont( 21*u, false );
   var smallFont = zoomFont( 16*u, false );

   var baseY = H - margin;
   var subParts = [];
   if ( cfg.ovSubtitle && cfg.ovSubtitle.length )
      subParts.push( cfg.ovSubtitle );
   if ( cfg.ovDistance && cfg.ovDistance.length )
      subParts.push( cfg.ovDistance );
   var subtitle = subParts.join( "  ·  " );

   if ( title && title.length )
   {
      g.font = titleFont;
      g.pen = new Pen( 0xFFFFFFFF );
      g.drawText( margin, baseY - ( subtitle.length ? Math.round( 34*u ) : 0 ), title );
   }
   if ( subtitle.length )
   {
      g.font = subFont;
      g.pen = new Pen( 0xD9FFFFFF );
      g.drawText( margin, baseY, subtitle );
   }
   if ( cfg.ovSignature && cfg.ovSignature.length )
   {
      g.font = smallFont;
      g.pen = new Pen( 0x99FFFFFF );
      g.drawText( W - margin - smallFont.width( cfg.ovSignature ), margin + Math.round( 16*u ), cfg.ovSignature );
   }
   if ( cfg.ovShowScale )
   {
      var bx1 = W - margin, by = H - margin;
      var sb = scaleBar( cam, bx1, by );
      var bx0 = bx1 - sb.lengthPx;
      var tick = Math.round( 6*u );
      g.pen = new Pen( 0xCCFFFFFF, Math.max( 1, 2*u ) );
      g.drawLine( bx0, by, bx1, by );
      g.drawLine( bx0, by - tick, bx0, by + tick );
      g.drawLine( bx1, by - tick, bx1, by + tick );
      g.font = smallFont;
      g.pen = new Pen( 0xCCFFFFFF );
      g.drawText( bx0, by - Math.round( 8*u ), sb.label );
   }
   if ( cfg.ovShowBar )
   {
      var bh = Math.max( 2, Math.round( 4*u ) );
      g.fillRect( new Rect( 0, H - bh, W, H ), new Brush( 0x33FFFFFF ) );
      g.fillRect( new Rect( 0, H - bh, Math.round( W*clamp01( t ) ), H ), new Brush( 0xB3FFFFFF ) );
   }
}

// ============================================================================
// DIALOG
// ============================================================================

class SessionCinemaDialog extends Dialog
{
   constructor( cfg, frames )
   {
      super();
      var self = this;
      this.cfg = cfg;
      this.frames = frames;
      this.wantsLanguageReload = false;
      this.wantsGenerate = false;
      // The title field auto-fills from the frames' OBJECT keyword until the
      // user types their own. A title loaded from a prior session counts as
      // user-owned so we never clobber it; but auto-derived titles are never
      // persisted (see persistableConfig), so stale target names can't leak
      // into a later session with different data.
      this.titleTouched = !!( cfg.ovTitle && cfg.ovTitle.length );
      this.autoTitle = "";
      this.settingTitleText = false;

      this.windowTitle = SC_TITLE + " " + SC_VERSION;
      this.userResizable = true;

      var labelWidth = this.font.width( "Animation length (s): MMM" );

      // ---- header: emblem + title + tagline ----
      this.emblem = this.makeEmblem();

      this.titleLabel = new Label( this );
      this.titleLabel.text = SC_TITLE;
      var tf = this.titleLabel.font;
      tf.bold = true;
      tf.pointSize = Math.round( this.font.pointSize*1.7 );
      this.titleLabel.font = tf;

      this.buildLabel = new Label( this );
      this.buildLabel.text = "v" + versionLabel();
      this.buildLabel.textAlignment = TextAlign.Left | TextAlign.VertCenter;

      this.taglineLabel = new Label( this );
      this.taglineLabel.useRichText = true;
      this.taglineLabel.wordWrapping = true;

      this.titleColumn = new VerticalSizer;
      this.titleColumn.add( this.titleLabel );
      this.titleColumn.add( this.buildLabel );

      this.headerSizer = new HorizontalSizer;
      this.headerSizer.spacing = 10;
      if ( this.emblem != null )
         this.headerSizer.add( this.emblem );
      this.headerSizer.add( this.titleColumn );
      this.headerSizer.addSpacing( 16 );
      this.headerSizer.add( this.taglineLabel, 100 );

      // ---- help ----
      this.helpLabel = new Label( this );
      this.helpLabel.text = tr( "help" );
      this.helpLabel.wordWrapping = true;
      this.helpLabel.frameStyle = FrameStyle.Box;
      this.helpLabel.margin = 8;
      this.helpLabel.minWidth = 620;

      // ---- frames group ----
      this.tree = new TreeBox( this );
      this.tree.numberOfColumns = 4;
      this.tree.setHeaderText( 0, tr( "frames.col.num" ) );
      this.tree.setHeaderText( 1, tr( "frames.col.name" ) );
      this.tree.setHeaderText( 2, tr( "frames.col.date" ) );
      this.tree.setHeaderText( 3, tr( "frames.col.exp" ) );
      this.tree.rootDecoration = false;
      this.tree.alternateRowColor = true;
      this.tree.multipleSelection = true;
      this.tree.minHeight = 160;
      this.tree.setColumnWidth( 0, 40 );
      this.tree.setColumnWidth( 1, 300 );
      this.tree.setColumnWidth( 2, 160 );

      this.addFilesButton = new PushButton( this );
      this.addFilesButton.text = tr( "frames.addFiles" );
      this.addFilesButton.onClick = () => this.onAddFiles();

      this.addFolderButton = new PushButton( this );
      this.addFolderButton.text = tr( "frames.addFolder" );
      this.addFolderButton.onClick = () => this.onAddFolder();

      this.removeButton = new PushButton( this );
      this.removeButton.text = tr( "frames.remove" );
      this.removeButton.onClick = () => this.onRemoveSelected();

      this.clearButton = new PushButton( this );
      this.clearButton.text = tr( "frames.clear" );
      this.clearButton.onClick = () => { this.frames = []; this.refreshTree(); };

      this.frameButtons = new HorizontalSizer;
      this.frameButtons.spacing = 6;
      this.frameButtons.add( this.addFilesButton );
      this.frameButtons.add( this.addFolderButton );
      this.frameButtons.addStretch();
      this.frameButtons.add( this.removeButton );
      this.frameButtons.add( this.clearButton );

      this.summaryLabel = new Label( this );
      this.summaryLabel.text = tr( "frames.summary.none" );

      this.framesGroup = new GroupBox( this );
      this.framesGroup.title = tr( "frames.title" );
      this.framesGroup.sizer = new VerticalSizer;
      this.framesGroup.sizer.margin = 8;
      this.framesGroup.sizer.spacing = 6;
      this.framesGroup.sizer.add( this.tree );
      this.framesGroup.sizer.add( this.frameButtons );
      this.framesGroup.sizer.add( this.summaryLabel );

      // The subs tab is the progressive stack; Zoom Odyssey is its own tab.
      this.stackNote = new Label( this );
      this.stackNote.text = tr( "style.stackNote" );
      this.stackNote.wordWrapping = true;
      this.stackNote.enabled = false;

      this.zoomNote = new Label( this );
      this.zoomNote.text = tr( "style.zoomNote" );
      this.zoomNote.wordWrapping = true;
      this.zoomNote.enabled = false;

      // Zoom Odyssey: the single solved image to reveal.
      this.zoomImageLabel = new Label( this );
      this.zoomImageLabel.text = tr( "zoom.image" );
      this.zoomImageLabel.minWidth = labelWidth;
      this.zoomImageEdit = new Edit( this );
      this.zoomImageEdit.text = cfg.zoomImagePath;
      this.zoomImageEdit.onTextUpdated = ( t ) =>
      {
         if ( t != self.cfg.zoomImagePath ) self.clearZoomPlacement();
         self.cfg.zoomImagePath = t; self.updateAlignEnabled();
      };
      this.zoomImageBrowse = new PushButton( this );
      this.zoomImageBrowse.text = tr( "out.browse" );
      this.zoomImageBrowse.onClick = () =>
      {
         var d = new OpenFileDialog;
         d.multipleSelections = false;
         d.caption = tr( "zoom.image" );
         d.filters = [ [ "FITS / XISF", "*.fit", "*.fits", "*.fts", "*.xisf" ] ];
         if ( d.execute() && d.fileNames.length )
         {
            self.cfg.zoomImagePath = d.fileNames[ 0 ];
            self.clearZoomPlacement();
            self.zoomImageEdit.text = d.fileNames[ 0 ];
            self.autofillLocationFromImage( d.fileNames[ 0 ] );
            self.updateAlignEnabled();
         }
      };
      this.zoomImageSizer = new HorizontalSizer;
      this.zoomImageSizer.spacing = 6;
      this.zoomImageSizer.add( this.zoomImageLabel );
      this.zoomImageSizer.add( this.zoomImageEdit, 100 );
      this.zoomImageSizer.add( this.zoomImageBrowse );

      this.zoomHint = new Label( this );
      this.zoomHint.text = tr( "zoom.imageHint" );
      this.zoomHint.wordWrapping = true;
      this.zoomHint.enabled = false;

      // Optional second source: the finished image inserted in the video.
      this.revealImageLabel = new Label( this );
      this.revealImageLabel.text = tr( "zoom.revealImage" );
      this.revealImageLabel.minWidth = labelWidth;
      this.revealImageEdit = new Edit( this );
      this.revealImageEdit.text = cfg.zoomRevealPath;
      this.revealImageEdit.onTextUpdated = ( t ) =>
      {
         if ( t != self.cfg.zoomRevealPath ) self.clearZoomPlacement();
         self.cfg.zoomRevealPath = t; self.updateAlignEnabled();
      };
      this.revealImageBrowse = new PushButton( this );
      this.revealImageBrowse.text = tr( "out.browse" );
      this.revealImageBrowse.onClick = () =>
      {
         var d = new OpenFileDialog;
         d.multipleSelections = false;
         d.caption = tr( "zoom.revealImage" );
         d.filters = [ [ tr( "zoom.revealFilter" ), "*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.fit", "*.fits", "*.fts", "*.xisf" ] ];
         if ( d.execute() && d.fileNames.length )
         {
            self.cfg.zoomRevealPath = d.fileNames[ 0 ];
            self.clearZoomPlacement();
            self.revealImageEdit.text = d.fileNames[ 0 ];
            self.updateAlignEnabled();
         }
      };
      this.revealClearButton = new PushButton( this );
      this.revealClearButton.text = tr( "zoom.revealClear" );
      this.revealClearButton.onClick = () =>
      {
         self.cfg.zoomRevealPath = "";
         self.clearZoomPlacement();
         self.revealImageEdit.text = "";
         self.updateAlignEnabled();
      };
      this.revealImageSizer = new HorizontalSizer;
      this.revealImageSizer.spacing = 6;
      this.revealImageSizer.add( this.revealImageLabel );
      this.revealImageSizer.add( this.revealImageEdit, 100 );
      this.revealImageSizer.add( this.revealImageBrowse );
      this.revealImageSizer.add( this.revealClearButton );

      this.revealHint = new Label( this );
      this.revealHint.text = tr( "zoom.revealHint" );
      this.revealHint.wordWrapping = true;
      this.revealHint.enabled = false;

      // Cropped reveal: align it visually onto the solved image.
      this.croppedCheck = new CheckBox( this );
      this.croppedCheck.text = tr( "zoom.cropped" );
      this.croppedCheck.checked = cfg.zoomRevealCropped;
      this.croppedCheck.onCheck = ( c ) =>
      {
         self.cfg.zoomRevealCropped = c;
         self.updateAlignEnabled();
      };
      this.alignButton = new PushButton( this );
      this.alignButton.text = tr( "zoom.align" );
      this.alignButton.onClick = () => this.onAlign();
      this.croppedSizer = new HorizontalSizer;
      this.croppedSizer.spacing = 6;
      this.croppedSizer.add( this.croppedCheck );
      this.croppedSizer.addSpacing( 12 );
      this.croppedSizer.add( this.alignButton );
      this.croppedSizer.addStretch();

      this.rotWarnZoom = this.makeRotWarning();

      // Input group for Zoom Odyssey — takes the place of the frame list.
      this.zoomGroup = new GroupBox( this );
      this.zoomGroup.title = tr( "zoom.inputTitle" );
      this.zoomGroup.sizer = new VerticalSizer;
      this.zoomGroup.sizer.margin = 8;
      this.zoomGroup.sizer.spacing = 6;
      this.zoomGroup.sizer.add( this.zoomImageSizer );
      this.zoomGroup.sizer.add( this.zoomHint );
      this.zoomGroup.sizer.add( this.revealImageSizer );
      this.zoomGroup.sizer.add( this.revealHint );
      this.zoomGroup.sizer.add( this.croppedSizer );
      this.zoomGroup.sizer.add( this.rotWarnZoom );

      this.stretchLabel = new Label( this );
      this.stretchLabel.text = tr( "stretch.label" );
      this.stretchLabel.minWidth = labelWidth;

      this.stretchCombo = new ComboBox( this );
      this.stretchCombo.addItem( tr( "stretch.final" ) );
      this.stretchCombo.addItem( tr( "stretch.first" ) );
      this.stretchCombo.addItem( tr( "stretch.each" ) );
      this.stretchCombo.currentItem = cfg.stretchRef;
      this.stretchCombo.onItemSelected = ( i ) => { self.cfg.stretchRef = i; };

      this.stretchSizer = new HorizontalSizer;
      this.stretchSizer.spacing = 6;
      this.stretchSizer.add( this.stretchLabel );
      this.stretchSizer.add( this.stretchCombo, 100 );

      this.linkedCheck = new CheckBox( this );
      this.linkedCheck.text = tr( "stretch.linked" );
      this.linkedCheck.checked = cfg.stretchLinked;
      this.linkedCheck.onCheck = ( c ) => { self.cfg.stretchLinked = c; };

      this.debayerCheck = new CheckBox( this );
      this.debayerCheck.text = tr( "debayer.check" );
      this.debayerCheck.checked = cfg.debayer;
      this.debayerCheck.onCheck = ( c ) => { self.cfg.debayer = c; };

      // ---- multi-filter colour controls (progressive stack) ----
      this.alignCheck = new CheckBox( this );
      this.alignCheck.text = tr( "seq.align" );
      this.alignCheck.checked = cfg.alignEnabled;
      this.alignCheck.onCheck = ( c ) => { self.cfg.alignEnabled = c; };

      this.colorCheck = new CheckBox( this );
      this.colorCheck.text = tr( "seq.color" );
      this.colorCheck.checked = cfg.colorEnabled;
      this.colorCheck.onCheck = ( c ) => { self.cfg.colorEnabled = c; self.updateColorEnabled(); };

      this.paletteLabel = new Label( this );
      this.paletteLabel.text = tr( "seq.palette" );
      this.paletteLabel.minWidth = labelWidth;
      this.paletteCombo = new ComboBox( this );
      for ( var pi = 0; pi < PALETTE_ORDER.length; ++pi )
      {
         var pk = PALETTE_ORDER[ pi ];
         this.paletteCombo.addItem( PALETTES[ pk ].label || pk );
         if ( pk == cfg.palette ) this.paletteCombo.currentItem = pi;
      }
      // A config saved with a palette no longer offered (LRGB, which was an exact
      // alias of RGB) must not leave the combo showing something else.
      if ( PALETTE_ORDER.indexOf( cfg.palette ) < 0 )
      {
         cfg.palette = ( cfg.palette == "LRGB" ) ? "RGB" : PALETTE_ORDER[ 0 ];
         this.paletteCombo.currentItem = PALETTE_ORDER.indexOf( cfg.palette );
      }
      this.paletteCombo.onItemSelected = ( i ) =>
      {
         self.cfg.palette = PALETTE_ORDER[ i ];
         self.applyPalette();
      };
      this.paletteSizer = new HorizontalSizer;
      this.paletteSizer.spacing = 6;
      this.paletteSizer.add( this.paletteLabel );
      this.paletteSizer.add( this.paletteCombo, 100 );

      // Three filter→channel combos (R / G / B), populated from detected filters.
      function makeChannelCombo( labelKey, chKey )
      {
         var lab = new Label( self );
         lab.text = tr( labelKey );
         lab.textAlignment = TextAlign.Right | TextAlign.VertCenter;
         var combo = new ComboBox( self );
         combo.onItemSelected = ( idx ) =>
         {
            var names = self.filterNames || [];
            self.cfg[ chKey ] = ( idx <= 0 ) ? CH_NONE : names[ idx - 1 ];
         };
         var sz = new HorizontalSizer;
         sz.spacing = 4;
         sz.add( lab );
         sz.add( combo, 100 );
         return { label: lab, combo: combo, sizer: sz };
      }
      this.chR = makeChannelCombo( "seq.chR", "chR" );
      this.chG = makeChannelCombo( "seq.chG", "chG" );
      this.chB = makeChannelCombo( "seq.chB", "chB" );
      this.channelsSizer = new HorizontalSizer;
      this.channelsSizer.spacing = 10;
      this.channelsSizer.add( this.chR.sizer, 100 );
      this.channelsSizer.add( this.chG.sizer, 100 );
      this.channelsSizer.add( this.chB.sizer, 100 );

      this.filterInfoLabel = new Label( this );
      this.filterInfoLabel.text = tr( "seq.noFilters" );
      this.filterInfoLabel.wordWrapping = true;
      try { this.filterInfoLabel.styleSheet = "QLabel { color: gray; }"; } catch ( e ) {}

      this.colorGroup = new GroupBox( this );
      this.colorGroup.title = tr( "seq.colorGroup" );
      this.colorGroup.sizer = new VerticalSizer;
      this.colorGroup.sizer.margin = 8;
      this.colorGroup.sizer.spacing = 6;
      this.removeGreenCheck = new CheckBox( this );
      this.removeGreenCheck.text = tr( "seq.removeGreen" );
      this.removeGreenCheck.checked = cfg.removeGreen;
      this.removeGreenCheck.onCheck = ( c ) => { self.cfg.removeGreen = c; };

      this.colorGroup.sizer.add( this.colorCheck );
      this.colorGroup.sizer.add( this.paletteSizer );
      this.colorGroup.sizer.add( this.channelsSizer );
      this.colorGroup.sizer.add( this.removeGreenCheck );
      this.colorGroup.sizer.add( this.filterInfoLabel );

      // ---- final "presentation image" revealed at the end of the stack ----
      this.stackRevealLabel = new Label( this );
      this.stackRevealLabel.text = tr( "seq.reveal" );
      this.stackRevealLabel.minWidth = labelWidth;
      this.stackRevealEdit = new Edit( this );
      this.stackRevealEdit.text = cfg.stackRevealPath;
      // Typing a path is not aligning it: the placement on screen belongs to the
      // image that was there before.
      this.stackRevealEdit.onTextUpdated = ( t ) =>
      {
         if ( t != self.cfg.stackRevealPath )
            self.clearStackPlacement();
         self.cfg.stackRevealPath = t;
         self.updateStackRevealEnabled();
      };
      this.stackRevealBrowse = new PushButton( this );
      this.stackRevealBrowse.text = tr( "frames.addFiles" );
      this.stackRevealBrowse.onClick = () =>
      {
         var d = new OpenFileDialog;
         d.multipleSelections = false;
         d.caption = tr( "seq.reveal" );
         d.filters = [ [ tr( "zoom.revealFilter" ), "*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.fit", "*.fits", "*.fts", "*.xisf" ] ];
         if ( d.execute() && d.fileNames.length )
         {
            self.cfg.stackRevealPath = d.fileNames[ 0 ];
            self.stackRevealEdit.text = d.fileNames[ 0 ];
            self.clearStackPlacement();
            self.updateStackRevealEnabled();
         }
      };
      this.stackRevealClearBtn = new PushButton( this );
      this.stackRevealClearBtn.text = tr( "zoom.revealClear" );
      this.stackRevealClearBtn.onClick = () =>
      {
         self.cfg.stackRevealPath = "";
         self.clearStackPlacement();
         self.stackRevealEdit.text = "";
         self.updateStackRevealEnabled();
      };
      this.stackAlignButton = new PushButton( this );
      this.stackAlignButton.text = tr( "zoom.align" );
      this.stackAlignButton.onClick = () => this.onAlignStack();

      this.stackRevealSizer = new HorizontalSizer;
      this.stackRevealSizer.spacing = 6;
      this.stackRevealSizer.add( this.stackRevealLabel );
      this.stackRevealSizer.add( this.stackRevealEdit, 100 );
      this.stackRevealSizer.add( this.stackRevealBrowse );
      this.stackRevealSizer.add( this.stackRevealClearBtn );
      this.stackRevealSizer.add( this.stackAlignButton );

      this.stackRevealHint = new Label( this );
      this.stackRevealHint.text = tr( "seq.revealHint" );
      this.stackRevealHint.wordWrapping = true;
      this.stackRevealHint.enabled = false;

      this.rotWarnStack = this.makeRotWarning();

      this.revealDurControl = new NumericControl( this );
      this.revealDurControl.label.text = tr( "seq.revealDur" );
      this.revealDurControl.label.minWidth = labelWidth;
      this.revealDurControl.setRange( 0.3, 10 );
      this.revealDurControl.setPrecision( 1 );
      this.revealDurControl.setValue( cfg.stackRevealSec );
      this.revealDurControl.onValueUpdated = ( v ) => { self.cfg.stackRevealSec = v; };
      this.revealDurSizer = new HorizontalSizer;
      this.revealDurSizer.add( this.revealDurControl );
      this.revealDurSizer.addStretch();

      this.stackRevealGroup = new GroupBox( this );
      this.stackRevealGroup.title = tr( "seq.revealGroup" );
      this.stackRevealGroup.sizer = new VerticalSizer;
      this.stackRevealGroup.sizer.margin = 8;
      this.stackRevealGroup.sizer.spacing = 6;
      this.stackRevealGroup.sizer.add( this.stackRevealSizer );
      this.stackRevealGroup.sizer.add( this.stackRevealHint );
      this.stackRevealGroup.sizer.add( this.rotWarnStack );
      this.stackRevealGroup.sizer.add( this.revealDurSizer );

      // Rendering options for the progressive stack.
      this.seqOptionsGroup = new GroupBox( this );
      this.seqOptionsGroup.title = tr( "stretch.groupTitle" );
      this.seqOptionsGroup.sizer = new VerticalSizer;
      this.seqOptionsGroup.sizer.margin = 8;
      this.seqOptionsGroup.sizer.spacing = 6;
      this.seqOptionsGroup.sizer.add( this.stretchSizer );
      this.seqOptionsGroup.sizer.add( this.linkedCheck );
      this.seqOptionsGroup.sizer.add( this.debayerCheck );
      this.seqOptionsGroup.sizer.add( this.alignCheck );
      this.seqOptionsGroup.sizer.add( this.colorGroup );
      this.seqOptionsGroup.sizer.add( this.stackRevealGroup );

      // ---- overlay group ----
      this.titleLabel = new Label( this );
      this.titleLabel.text = tr( "overlay.videoTitle" );
      this.titleLabel.minWidth = labelWidth;
      this.titleEdit = new Edit( this );
      this.titleEdit.text = cfg.ovTitle;
      try { this.titleEdit.placeholderText = tr( "overlay.videoTitle.hint" ); } catch ( e ) {}
      this.titleEdit.onTextUpdated = ( t ) =>
      {
         if ( self.settingTitleText )   // programmatic auto-fill, not a user edit
            return;
         self.cfg.ovTitle = t;
         self.titleTouched = true;
      };
      this.titleSizer = new HorizontalSizer;
      this.titleSizer.spacing = 6;
      this.titleSizer.add( this.titleLabel );
      this.titleSizer.add( this.titleEdit, 100 );

      this.counterCheck = new CheckBox( this );
      this.counterCheck.text = tr( "overlay.counter" );
      this.counterCheck.checked = cfg.ovShowCounter;
      this.counterCheck.onCheck = ( c ) => { self.cfg.ovShowCounter = c; };

      this.exposureCheck = new CheckBox( this );
      this.exposureCheck.text = tr( "overlay.exposure" );
      this.exposureCheck.checked = cfg.ovShowExposure;
      this.exposureCheck.onCheck = ( c ) => { self.cfg.ovShowExposure = c; };

      this.timeCheck = new CheckBox( this );
      this.timeCheck.text = tr( "overlay.time" );
      this.timeCheck.checked = cfg.ovShowTime;
      this.timeCheck.onCheck = ( c ) => { self.cfg.ovShowTime = c; };

      this.snrCheck = new CheckBox( this );
      this.snrCheck.text = tr( "overlay.snr" );
      this.snrCheck.checked = cfg.ovShowSnr;
      this.snrCheck.onCheck = ( c ) => { self.cfg.ovShowSnr = c; };

      this.barCheck = new CheckBox( this );
      this.barCheck.text = tr( "overlay.bar" );
      this.barCheck.checked = cfg.ovShowBar;
      this.barCheck.onCheck = ( c ) => { self.cfg.ovShowBar = c; };

      this.checksRow1 = new HorizontalSizer;
      this.checksRow1.spacing = 12;
      this.checksRow1.add( this.counterCheck );
      this.checksRow1.add( this.exposureCheck );
      this.checksRow1.add( this.barCheck );
      this.checksRow1.addStretch();

      this.scaleCheck = new CheckBox( this );
      this.scaleCheck.text = tr( "overlay.scale" );
      this.scaleCheck.checked = cfg.ovShowScale;
      this.scaleCheck.onCheck = ( c ) => { self.cfg.ovShowScale = c; };

      this.checksRow2 = new HorizontalSizer;
      this.checksRow2.spacing = 12;
      this.checksRow2.add( this.timeCheck );
      this.checksRow2.add( this.snrCheck );
      this.checksRow2.add( this.scaleCheck );
      this.checksRow2.addStretch();

      // Zoom Odyssey sky options.
      this.constNamesCheck = new CheckBox( this );
      this.constNamesCheck.text = tr( "zoom.constNames" );
      this.constNamesCheck.checked = cfg.ovConstNames;
      this.constNamesCheck.onCheck = ( c ) => { self.cfg.ovConstNames = c; };

      this.starNamesCheck = new CheckBox( this );
      this.starNamesCheck.text = tr( "zoom.starNames" );
      this.starNamesCheck.checked = cfg.ovStarNames;
      this.starNamesCheck.onCheck = ( c ) => { self.cfg.ovStarNames = c; };

      this.horizonCheck = new CheckBox( this );
      this.horizonCheck.text = tr( "zoom.horizon" );
      this.horizonCheck.checked = cfg.ovShowHorizon;
      this.horizonCheck.onCheck = ( c ) => { self.cfg.ovShowHorizon = c; };

      this.gridCheck = new CheckBox( this );
      this.gridCheck.text = tr( "zoom.grid" );
      this.gridCheck.checked = cfg.ovShowGrid;
      this.gridCheck.onCheck = ( c ) => { self.cfg.ovShowGrid = c; };

      this.hipsCheck = new CheckBox( this );
      this.hipsCheck.text = tr( "zoom.hips" );
      this.hipsCheck.checked = cfg.hipsEnabled;
      this.hipsCheck.onCheck = ( c ) => { self.cfg.hipsEnabled = c; };

      this.locationCheck = new CheckBox( this );
      this.locationCheck.text = tr( "zoom.location.opt" );
      this.locationCheck.toolTip = tr( "zoom.location.hint" );
      this.locationCheck.checked = cfg.locationEnabled;
      this.locationCheck.onCheck = ( c ) =>
      {
         self.cfg.locationEnabled = c;
         self.updateLocationEnabled();
      };

      this.checksRow3 = new HorizontalSizer;
      this.checksRow3.spacing = 12;
      this.checksRow3.add( this.constNamesCheck );
      this.checksRow3.add( this.starNamesCheck );
      this.checksRow3.add( this.horizonCheck );
      this.checksRow3.add( this.gridCheck );
      this.checksRow3.add( this.hipsCheck );
      this.checksRow3.addStretch();

      // Shoot-location fields (auto-filled from the solved image headers).
      function coordEdit( value, hint )
      {
         var e = new Edit( self );
         e.text = ( value == 999 || value == null ) ? "" : String( value );
         e.setFixedWidth( self.font.width( "-180.0000" ) + 12 );
         try { e.placeholderText = hint; } catch ( ex ) {}
         return e;
      }
      this.latLabel = new Label( this );
      this.latLabel.text = tr( "zoom.lat" );
      this.latEdit = coordEdit( cfg.observerLat, "43.60" );
      this.latEdit.onTextUpdated = ( t ) => { self.cfg.observerLat = t.length ? parseFloat( t ) : 999; };
      this.lonLabel = new Label( this );
      this.lonLabel.text = tr( "zoom.lon" );
      this.lonEdit = coordEdit( cfg.observerLong, "5.48" );
      this.lonEdit.onTextUpdated = ( t ) => { self.cfg.observerLong = t.length ? parseFloat( t ) : 999; };
      this.dateLabel = new Label( this );
      this.dateLabel.text = tr( "zoom.date" );
      this.dateEdit = new Edit( this );
      this.dateEdit.text = cfg.observerDateUtc;
      try { this.dateEdit.placeholderText = tr( "zoom.date.hint" ); } catch ( ex ) {}
      this.dateEdit.onTextUpdated = ( t ) => { self.cfg.observerDateUtc = t; };

      // Pick a raw/calibrated sub to fill lat/lon/UTC (integrated masters often
      // drop SITELAT/SITELONG; the subs keep them).
      this.fromSubButton = new PushButton( this );
      this.fromSubButton.text = tr( "zoom.fromSub" );
      this.fromSubButton.toolTip = tr( "zoom.fromSub.hint" );
      this.fromSubButton.onClick = () => this.onReadSubLocation();

      this.locationSizer = new HorizontalSizer;
      this.locationSizer.spacing = 6;
      this.locationSizer.add( this.locationCheck );
      this.locationSizer.addSpacing( 12 );
      this.locationSizer.add( this.latLabel );
      this.locationSizer.add( this.latEdit );
      this.locationSizer.add( this.lonLabel );
      this.locationSizer.add( this.lonEdit );
      this.locationSizer.add( this.dateLabel );
      this.locationSizer.add( this.dateEdit, 100 );
      this.locationSizer.addSpacing( 8 );
      this.locationSizer.add( this.fromSubButton );

      // Everything zoom-specific that is not a source image lives in its own
      // group, mirroring the source-images group above it.
      this.zoomRenderGroup = new GroupBox( this );
      this.zoomRenderGroup.title = tr( "zoom.renderTitle" );
      this.zoomRenderGroup.sizer = new VerticalSizer;
      this.zoomRenderGroup.sizer.margin = 8;
      this.zoomRenderGroup.sizer.spacing = 6;
      this.zoomRenderGroup.sizer.add( this.checksRow3 );
      this.zoomRenderGroup.sizer.add( this.locationSizer );

      this.subtitleLabel = new Label( this );
      this.subtitleLabel.text = tr( "overlay.subtitle" );
      this.subtitleLabel.minWidth = labelWidth;
      this.subtitleEdit = new Edit( this );
      this.subtitleEdit.text = cfg.ovSubtitle;
      try { this.subtitleEdit.placeholderText = tr( "overlay.subtitle.hint" ); } catch ( e ) {}
      this.subtitleEdit.onTextUpdated = ( t ) => { self.cfg.ovSubtitle = t; };
      this.distanceLabel = new Label( this );
      this.distanceLabel.text = tr( "overlay.distance" );
      this.distanceEdit = new Edit( this );
      this.distanceEdit.text = cfg.ovDistance;
      try { this.distanceEdit.placeholderText = tr( "overlay.distance.hint" ); } catch ( e ) {}
      this.distanceEdit.onTextUpdated = ( t ) => { self.cfg.ovDistance = t; };
      this.subtitleSizer = new HorizontalSizer;
      this.subtitleSizer.spacing = 6;
      this.subtitleSizer.add( this.subtitleLabel );
      this.subtitleSizer.add( this.subtitleEdit, 60 );
      this.subtitleSizer.addSpacing( 12 );
      this.subtitleSizer.add( this.distanceLabel );
      this.subtitleSizer.add( this.distanceEdit, 40 );

      this.signatureLabel = new Label( this );
      this.signatureLabel.text = tr( "overlay.signature" );
      this.signatureLabel.minWidth = labelWidth;
      this.signatureEdit = new Edit( this );
      this.signatureEdit.text = cfg.ovSignature;
      try { this.signatureEdit.placeholderText = tr( "overlay.signature.hint" ); } catch ( e ) {}
      this.signatureEdit.onTextUpdated = ( t ) => { self.cfg.ovSignature = t; };
      this.signatureSizer = new HorizontalSizer;
      this.signatureSizer.spacing = 6;
      this.signatureSizer.add( this.signatureLabel );
      this.signatureSizer.add( this.signatureEdit, 100 );

      this.overlayGroup = new GroupBox( this );
      this.overlayGroup.title = tr( "overlay.title" );
      this.overlayGroup.sizer = new VerticalSizer;
      this.overlayGroup.sizer.margin = 8;
      this.overlayGroup.sizer.spacing = 6;
      this.overlayGroup.sizer.add( this.titleSizer );
      this.overlayGroup.sizer.add( this.checksRow1 );
      this.overlayGroup.sizer.add( this.checksRow2 );
      this.overlayGroup.sizer.add( this.subtitleSizer );
      this.overlayGroup.sizer.add( this.signatureSizer );

      // ---- video group ----
      this.formatLabel = new Label( this );
      this.formatLabel.text = tr( "video.format" );
      this.formatLabel.minWidth = labelWidth;
      this.formatCombo = new ComboBox( this );
      for ( var i = 0; i < OUTPUT_FORMATS.length; ++i )
         this.formatCombo.addItem( OUTPUT_FORMATS[ i ].label );
      this.formatCombo.currentItem = cfg.formatIndex;
      this.formatCombo.onItemSelected = ( idx ) => { self.cfg.formatIndex = idx; self.updateThumbSize(); };
      this.formatSizer = new HorizontalSizer;
      this.formatSizer.spacing = 6;
      this.formatSizer.add( this.formatLabel );
      this.formatSizer.add( this.formatCombo, 100 );

      this.fitLabel = new Label( this );
      this.fitLabel.text = tr( "video.fit" );
      this.fitLabel.minWidth = labelWidth;
      this.fitCombo = new ComboBox( this );
      this.fitCombo.addItem( tr( "video.fit.crop" ) );
      this.fitCombo.addItem( tr( "video.fit.letterbox" ) );
      this.fitCombo.currentItem = cfg.fitMode;
      this.fitCombo.onItemSelected = ( idx ) => { self.cfg.fitMode = idx; };
      this.fitSizer = new HorizontalSizer;
      this.fitSizer.spacing = 6;
      this.fitSizer.add( this.fitLabel );
      this.fitSizer.add( this.fitCombo, 100 );

      this.fpsLabel = new Label( this );
      this.fpsLabel.text = tr( "video.fps" );
      this.fpsLabel.minWidth = labelWidth;
      this.fpsSpin = new SpinBox( this );
      this.fpsSpin.minValue = 12;
      this.fpsSpin.maxValue = 60;
      this.fpsSpin.value = cfg.fps;
      this.fpsSpin.onValueUpdated = ( v ) => { self.cfg.fps = v; self.updateEstimate(); };

      this.durationLabel = new Label( this );
      this.durationLabel.text = tr( "video.duration" );
      this.durationSpin = new SpinBox( this );
      this.durationSpin.minValue = 3;
      this.durationSpin.maxValue = 120;
      this.durationSpin.value = cfg.targetDuration;
      this.durationSpin.onValueUpdated = ( v ) => { self.cfg.targetDuration = v; self.updateEstimate(); };

      this.fpsSizer = new HorizontalSizer;
      this.fpsSizer.spacing = 6;
      this.fpsSizer.add( this.fpsLabel );
      this.fpsSizer.add( this.fpsSpin );
      this.fpsSizer.addSpacing( 16 );
      this.fpsSizer.add( this.durationLabel );
      this.fpsSizer.add( this.durationSpin );
      this.fpsSizer.addStretch();

      this.holdFirstLabel = new Label( this );
      this.holdFirstLabel.text = tr( "video.holdFirst" );
      this.holdFirstLabel.minWidth = labelWidth;
      this.holdFirstSpin = new SpinBox( this );
      this.holdFirstSpin.minValue = 0;
      this.holdFirstSpin.maxValue = 10;
      this.holdFirstSpin.value = Math.round( cfg.holdFirst );
      this.holdFirstSpin.onValueUpdated = ( v ) => { self.cfg.holdFirst = v; self.updateEstimate(); };

      this.holdLastLabel = new Label( this );
      this.holdLastLabel.text = tr( "video.holdLast" );
      this.holdLastSpin = new SpinBox( this );
      this.holdLastSpin.minValue = 0;
      this.holdLastSpin.maxValue = 15;
      this.holdLastSpin.value = Math.round( cfg.holdLast );
      this.holdLastSpin.onValueUpdated = ( v ) => { self.cfg.holdLast = v; self.updateEstimate(); };

      this.holdSizer = new HorizontalSizer;
      this.holdSizer.spacing = 6;
      this.holdSizer.add( this.holdFirstLabel );
      this.holdSizer.add( this.holdFirstSpin );
      this.holdSizer.addSpacing( 16 );
      this.holdSizer.add( this.holdLastLabel );
      this.holdSizer.add( this.holdLastSpin );
      this.holdSizer.addStretch();

      this.qualityLabel = new Label( this );
      this.qualityLabel.text = tr( "video.quality" );
      this.qualityLabel.minWidth = labelWidth;
      this.qualityCombo = new ComboBox( this );
      var qualityWords = [ tr( "video.quality.best" ), tr( "video.quality.good" ),
                           tr( "video.quality.balanced" ), tr( "video.quality.small" ) ];
      for ( var q = 0; q < CRF_CHOICES.length; ++q )
         this.qualityCombo.addItem( tr( "video.quality.item", CRF_CHOICES[ q ], qualityWords[ q ] ) );
      this.qualityCombo.currentItem = cfg.crfIndex;
      this.qualityCombo.onItemSelected = ( idx ) => { self.cfg.crfIndex = idx; };
      this.qualitySizer = new HorizontalSizer;
      this.qualitySizer.spacing = 6;
      this.qualitySizer.add( this.qualityLabel );
      this.qualitySizer.add( this.qualityCombo, 100 );

      this.estimateLabel = new Label( this );
      this.estimateLabel.text = "";

      this.videoGroup = new GroupBox( this );
      this.videoGroup.title = tr( "video.title" );
      this.videoGroup.sizer = new VerticalSizer;
      this.videoGroup.sizer.margin = 8;
      this.videoGroup.sizer.spacing = 6;
      this.videoGroup.sizer.add( this.formatSizer );
      this.videoGroup.sizer.add( this.fitSizer );
      this.videoGroup.sizer.add( this.fpsSizer );
      this.videoGroup.sizer.add( this.holdSizer );
      this.videoGroup.sizer.add( this.qualitySizer );
      this.videoGroup.sizer.add( this.estimateLabel );

      // ---- output group ----
      this.outLabel = new Label( this );
      this.outLabel.text = tr( "out.dir" );
      this.outLabel.minWidth = labelWidth;
      this.outEdit = new Edit( this );
      this.outEdit.text = cfg.outputDir;
      this.outEdit.onTextUpdated = ( t ) => { self.cfg.outputDir = t; };
      this.outBrowse = new PushButton( this );
      this.outBrowse.text = tr( "out.browse" );
      this.outBrowse.onClick = () =>
      {
         var d = new GetDirectoryDialog;
         if ( self.cfg.outputDir.length )
            d.initialPath = self.cfg.outputDir;
         if ( d.execute() )
         {
            self.cfg.outputDir = d.directory;
            self.outEdit.text = d.directory;
         }
      };
      this.outSizer = new HorizontalSizer;
      this.outSizer.spacing = 6;
      this.outSizer.add( this.outLabel );
      this.outSizer.add( this.outEdit, 100 );
      this.outSizer.add( this.outBrowse );

      this.keepFramesCheck = new CheckBox( this );
      this.keepFramesCheck.text = tr( "out.keepFrames" );
      this.keepFramesCheck.checked = cfg.keepFrames;
      this.keepFramesCheck.onCheck = ( c ) => { self.cfg.keepFrames = c; };

      this.ffmpegLabel = new Label( this );
      this.ffmpegLabel.text = tr( "out.ffmpeg" );
      this.ffmpegLabel.minWidth = labelWidth;
      this.ffmpegEdit = new Edit( this );
      this.ffmpegEdit.text = cfg.ffmpegPath;
      this.ffmpegEdit.onTextUpdated = ( t ) => { self.cfg.ffmpegPath = t; };
      this.ffmpegBrowse = new PushButton( this );
      this.ffmpegBrowse.text = tr( "out.browse" );
      this.ffmpegBrowse.onClick = () =>
      {
         var d = new OpenFileDialog;
         d.multipleSelections = false;
         d.caption = tr( "out.ffmpeg" );
         if ( platformKind() == "windows" )
            d.filters = [ [ "ffmpeg", "*.exe" ], [ tr( "out.allFiles" ), "*" ] ];
         else
            d.filters = [ [ tr( "out.allFiles" ), "*" ] ];
         if ( d.execute() && d.fileNames.length )
         {
            self.cfg.ffmpegPath = d.fileNames[ 0 ];
            self.ffmpegEdit.text = d.fileNames[ 0 ];
            self.onDetectFfmpeg();
         }
      };
      this.ffmpegDetect = new PushButton( this );
      this.ffmpegDetect.text = tr( "out.detect" );
      this.ffmpegDetect.onClick = () => this.onDetectFfmpeg();
      // Only shown while ffmpeg is missing (setFfmpegSection toggles it).
      this.ffmpegInstall = new PushButton( this );
      this.ffmpegInstall.text = tr( "out.install" );
      this.ffmpegInstall.visible = false;
      this.ffmpegInstall.onClick = () => this.onInstallFfmpeg();
      this.ffmpegSizer = new HorizontalSizer;
      this.ffmpegSizer.spacing = 6;
      this.ffmpegSizer.add( this.ffmpegLabel );
      this.ffmpegSizer.add( this.ffmpegEdit, 100 );

      this.ffmpegStatus = new Label( this );
      this.ffmpegStatus.text = "";
      this.ffmpegStatus.wordWrapping = true;

      // The path row would be cramped with three buttons on it: they live on
      // their own row, under the path and its status line.
      this.ffmpegButtonsSizer = new HorizontalSizer;
      this.ffmpegButtonsSizer.spacing = 6;
      this.ffmpegButtonsSizer.addStretch();
      this.ffmpegButtonsSizer.add( this.ffmpegBrowse );
      this.ffmpegButtonsSizer.add( this.ffmpegDetect );
      this.ffmpegButtonsSizer.add( this.ffmpegInstall );

      // Everything ffmpeg lives in a collapsible sub-section: a one-line
      // clickable header carrying the essential state, and a body that only
      // needs to be open while something is wrong or in progress.
      // (pjsr/SectionBar.jsh is not loadable under #engine v8 — see the
      // TextAlign note at the top — so this is a minimal hand-rolled one.)
      this.ffmpegHeader = new Label( this );
      this.ffmpegHeader.onMousePress = () =>
         self.setFfmpegSection( self.ffmpegState, !self.ffmpegSectionExpanded );

      this.ffmpegBody = new Control( this );
      this.ffmpegBody.sizer = new VerticalSizer;
      this.ffmpegBody.sizer.spacing = 6;
      this.ffmpegBody.sizer.add( this.ffmpegSizer );
      this.ffmpegBody.sizer.add( this.ffmpegStatus );
      this.ffmpegBody.sizer.add( this.ffmpegButtonsSizer );

      this.outGroup = new GroupBox( this );
      this.outGroup.title = tr( "out.title" );
      this.outGroup.sizer = new VerticalSizer;
      this.outGroup.sizer.margin = 8;
      this.outGroup.sizer.spacing = 6;
      this.outGroup.sizer.add( this.outSizer );
      this.outGroup.sizer.add( this.keepFramesCheck );
      this.outGroup.sizer.add( this.ffmpegHeader );
      this.outGroup.sizer.add( this.ffmpegBody );

      // ---- bottom row ----
      this.langLabel = new Label( this );
      this.langLabel.text = tr( "lang.label" );
      this.langCombo = new ComboBox( this );
      this.langCombo.addItem( "English" );
      this.langCombo.addItem( "Français" );
      this.langCombo.currentItem = ( gLanguage == "fr" ) ? 1 : 0;
      this.langCombo.onItemSelected = ( i2 ) =>
      {
         var lang = ( i2 == 1 ) ? "fr" : "en";
         if ( lang != gLanguage )
         {
            gLanguage = lang;
            self.cfg.language = lang;
            self.wantsLanguageReload = true;
            self.ok();
         }
      };

      this.generateButton = new PushButton( this );
      this.generateButton.text = tr( "btn.generate" );
      this.generateButton.defaultButton = true;
      this.generateButton.onClick = () => this.onGenerate();

      this.closeButton = new PushButton( this );
      this.closeButton.text = tr( "btn.close" );
      this.closeButton.onClick = () => this.cancel();

      this.statusLabel = new Label( this );
      this.statusLabel.text = "";
      this.statusLabel.textAlignment = 0x82;   // vert-center, left

      // ---- progress panel: thumbnail + spinner + bar (full width, above buttons) ----
      this.thumbCtrl = new Control( this );
      this.thumbCtrl.setFixedSize( 176, 99 );
      this.thumbCtrl.__bmp = null;
      this.thumbCtrl.onPaint = function()
      {
         var g = new Graphics( this );
         g.fillRect( 0, 0, this.width, this.height, new Brush( 0xFF0A0E16 ) );
         if ( this.__bmp != null )
            try { g.drawScaledBitmap( new Rect( 0, 0, this.width, this.height ), this.__bmp ); } catch ( e ) {}
         g.pen = new Pen( 0xFF334155, 1 );
         g.drawRect( new Rect( 0, 0, this.width - 1, this.height - 1 ) );
         g.end();
      };

      this.progressStatus = new Label( this );
      this.progressStatus.text = tr( "prog.idle" );
      this.progressStatus.textAlignment = TextAlign.Left | TextAlign.VertCenter;

      this.progressBar = new Control( this );
      this.progressBar.setFixedHeight( 16 );
      this.progressBar.__frac = 0;
      this.progressBar.__indet = false;
      this.progressBar.__phase = 0;
      this.progressBar.onPaint = function()
      {
         var g = new Graphics( this );
         var w = this.width, h = this.height;
         g.fillRect( 0, 0, w, h, new Brush( 0xFF1E293B ) );
         if ( this.__indet )
         {
            var cw = Math.round( w*0.28 );
            var span = w + cw;
            var x = ( ( this.__phase % span ) ) - cw;
            g.fillRect( Math.max( 0, x ), 0, Math.min( w, x + cw ), h, new Brush( 0xFF22D3EE ) );
         }
         else
            g.fillRect( 0, 0, Math.round( w*clamp01( this.__frac ) ), h, new Brush( 0xFF22D3EE ) );
         g.pen = new Pen( 0xFF334155, 1 );
         g.drawRect( new Rect( 0, 0, w - 1, h - 1 ) );
         g.end();
      };

      this.pauseButton = new PushButton( this );
      this.pauseButton.text = tr( "prog.pause" );
      this.pauseButton.enabled = false;
      this.pauseButton.onClick = () =>
      {
         self._paused = !self._paused;
         self.pauseButton.text = self._paused ? tr( "prog.resume" ) : tr( "prog.pause" );
      };
      this.cancelButton = new PushButton( this );
      this.cancelButton.text = tr( "prog.cancel" );
      this.cancelButton.enabled = false;
      this.cancelButton.onClick = () => { self._cancel = true; self._paused = false; };

      this.progressButtons = new HorizontalSizer;
      this.progressButtons.spacing = 6;
      this.progressButtons.addStretch();
      this.progressButtons.add( this.pauseButton );
      this.progressButtons.add( this.cancelButton );

      this.progressInfo = new VerticalSizer;
      this.progressInfo.spacing = 6;
      this.progressInfo.addStretch();
      this.progressInfo.add( this.progressBar );
      this.progressInfo.add( this.progressStatus );    // full-width status line under the bar
      this.progressInfo.add( this.progressButtons );   // pause/cancel on their own line
      this.progressInfo.addStretch();

      this.progressPanel = new GroupBox( this );
      this.progressPanel.title = tr( "prog.title" );
      this.progressPanel.sizer = new HorizontalSizer;
      this.progressPanel.sizer.margin = 8;
      this.progressPanel.sizer.spacing = 10;
      this.progressPanel.sizer.add( this.thumbCtrl );
      this.progressPanel.sizer.add( this.progressInfo, 100 );

      // The New Instance triangle: drag it to the workspace to save the current
      // settings as a process icon, like any PixInsight script.
      this.newInstanceButton = new ToolButton( this );
      try { this.newInstanceButton.icon = this.scaledResource( ":/process-interface/new-instance.png" ); } catch ( e ) {}
      try { this.newInstanceButton.setScaledFixedSize( 24, 24 ); } catch ( e ) {}
      this.newInstanceButton.toolTip = tr( "btn.newInstance" );
      this.newInstanceButton.onMousePress = () =>
      {
         self.newInstanceButton.hasFocus = true;
         // persistableConfig(), not the live cfg: an auto-derived title is not a
         // choice, and a process icon carrying it relabels every later session
         // dragged onto it — including the output file names.
         exportParameters( self.persistableConfig() );
         self.newInstanceButton.pushed = false;
         self.newInstance();
      };

      this.bottomSizer = new HorizontalSizer;
      this.bottomSizer.spacing = 6;
      this.bottomSizer.add( this.newInstanceButton );
      this.bottomSizer.addSpacing( 8 );
      this.bottomSizer.add( this.langLabel );
      this.bottomSizer.add( this.langCombo );
      this.bottomSizer.addStretch();
      this.bottomSizer.add( this.generateButton );
      this.bottomSizer.add( this.closeButton );

      // Button icons (PixInsight core resources; silently skipped if a resource
      // is unavailable, so the button still works with its text label).
      var self2 = this;
      function setIcon( btn, path ) { try { if ( btn ) btn.icon = self2.scaledResource( path ); } catch ( e ) {} }
      setIcon( this.addFilesButton,      ":/icons/add.png" );
      setIcon( this.addFolderButton,     ":/icons/folder.png" );
      setIcon( this.removeButton,        ":/icons/remove.png" );
      setIcon( this.clearButton,         ":/icons/clear.png" );
      setIcon( this.outBrowse,           ":/icons/folder-open.png" );
      setIcon( this.ffmpegBrowse,        ":/icons/document-open.png" );
      setIcon( this.ffmpegDetect,        ":/icons/search.png" );
      setIcon( this.ffmpegInstall,       ":/icons/install.png" );
      setIcon( this.zoomImageBrowse,     ":/icons/document-open.png" );
      setIcon( this.fromSubButton,       ":/icons/star.png" );
      setIcon( this.revealImageBrowse,   ":/icons/document-open.png" );
      setIcon( this.revealClearButton,   ":/icons/delete.png" );
      setIcon( this.alignButton,         ":/icons/picture.png" );
      setIcon( this.stackRevealBrowse,   ":/icons/document-open.png" );
      setIcon( this.stackRevealClearBtn, ":/icons/delete.png" );
      setIcon( this.stackAlignButton,    ":/icons/picture.png" );
      setIcon( this.pauseButton,         ":/icons/pause.png" );
      setIcon( this.cancelButton,        ":/icons/stop.png" );
      setIcon( this.generateButton,      ":/icons/power.png" );
      setIcon( this.closeButton,         ":/icons/close.png" );

      // ---- mode tabs: progressive stack vs Zoom Odyssey ----
      this.sequencePage = this.makePage( [ this.stackNote,
                                           this.framesGroup, this.seqOptionsGroup ] );
      this.zoomPage = this.makePage( [ this.zoomNote, this.zoomGroup, this.zoomRenderGroup ] );

      this.tabBox = new TabBox( this );
      this.tabBox.addPage( this.zoomPage, tr( "tab.zoom" ) );
      this.tabBox.addPage( this.sequencePage, tr( "tab.sequence" ) );
      try { this.tabBox.setPageIcon( 0, this.scaledResource( ":/icons/zoom.png" ) ); } catch ( e ) {}
      try { this.tabBox.setPageIcon( 1, this.scaledResource( ":/icons/camera.png" ) ); } catch ( e ) {}
      this.tabBox.currentPageIndex = ( cfg.style == STYLE_ZOOM ) ? 0 : 1;
      this.tabBox.onPageSelected = ( idx ) =>
      {
         self.cfg.style = ( idx == 0 ) ? STYLE_ZOOM : STYLE_STACKING;
         self.updateStyleDependents();
      };

      // Two columns to keep the window short: inputs (tabs) on the left, the
      // shared overlay/video/output settings stacked on the right.
      this.rightColumn = new VerticalSizer;
      this.rightColumn.spacing = 8;
      this.rightColumn.add( this.overlayGroup );
      this.rightColumn.add( this.videoGroup );
      this.rightColumn.add( this.outGroup );
      this.rightColumn.add( this.progressPanel );
      this.rightColumn.addStretch();

      this.columnsSizer = new HorizontalSizer;
      this.columnsSizer.spacing = 8;
      this.columnsSizer.add( this.tabBox, 58 );
      this.columnsSizer.add( this.rightColumn, 42 );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 8;
      this.sizer.add( this.headerSizer );
      this.sizer.add( this.helpLabel );
      this.sizer.add( this.columnsSizer, 100 );
      this.sizer.add( this.bottomSizer );

      this.updateRotWarnings();   // before adjustToContents: the notice takes room
      this.adjustToContents();
      this.autofillTitle();   // frames may already be loaded (e.g. language reload)
      this.refreshTree();
      this.updateThumbSize();
      this.updateStyleDependents();
      this.onDetectFfmpeg();
   }

   // Header emblem: the script icon, drawn into a fixed-size Control. Located
   // from this file's own directory or the installed rsc path; null if absent.
   // Notice for an alignment saved under the old rotation convention. Hidden and
   // empty unless there is something to say (see updateRotWarnings).
   makeRotWarning()
   {
      var l = new Label( this );
      l.wordWrapping = true;
      l.visible = false;
      try { l.styleSheet = "QLabel { color: #d08a30; }"; } catch ( e ) {}
      return l;
   }

   makeEmblem()
   {
      var here = ( File.extractDrive( #__FILE__ ) + File.extractDirectory( #__FILE__ ) ).split( "\\" ).join( "/" );
      var root = piInstallRoot();
      var candidates = [ here + "/assets/SessionCinema.svg",
                         here + "/SessionCinema.svg",
                         root + "/rsc/icons/script/SessionCinema/SessionCinema.svg" ];
      var bmp = null;
      for ( var i = 0; i < candidates.length && bmp == null; ++i )
      {
         try
         {
            if ( File.exists( candidates[ i ] ) )
            {
               var b = new Bitmap( candidates[ i ] );
               bmp = ( typeof b.scaledTo == "function" ) ? b.scaledTo( 44, 44 ) : b;
            }
         }
         catch ( e ) { bmp = null; }
      }
      if ( bmp == null )
         return null;
      var ctrl = new Control( this );
      ctrl.setFixedSize( 44, 44 );
      ctrl.__bmp = bmp;
      ctrl.onPaint = function()
      {
         var g = new Graphics( this );
         try { g.drawBitmap( 0, 0, this.__bmp ); } catch ( e ) {}
         g.end();
      };
      return ctrl;
   }

   // A tab page Control from a list of widgets/sizers.
   makePage( items )
   {
      var page = new Control( this );
      page.sizer = new VerticalSizer;
      page.sizer.margin = 8;
      page.sizer.spacing = 8;
      for ( var i = 0; i < items.length; ++i )
         page.sizer.add( items[ i ], ( items[ i ] == this.framesGroup ) ? 100 : 0 );
      page.sizer.addStretch();
      return page;
   }

   // Size the progress thumbnail to the chosen output aspect ratio.
   updateThumbSize()
   {
      var fmt = OUTPUT_FORMATS[ this.cfg.formatIndex ];
      var scale = Math.min( 176/fmt.w, 140/fmt.h );
      try { this.thumbCtrl.setFixedSize( Math.round( fmt.w*scale ), Math.round( fmt.h*scale ) ); } catch ( e ) {}
      this.thumbCtrl.repaint();
   }

   // Mode-specific tagline shown in the header.
   updateTagline()
   {
      var key = ( this.cfg.style == STYLE_ZOOM ) ? "tagline.zoom" : "tagline.stacking";
      this.taglineLabel.text = "<i>" + tr( key ) + "</i>";
   }

   refreshTree()
   {
      this.tree.clear();
      var totalExp = 0;
      for ( var i = 0; i < this.frames.length; ++i )
      {
         var f = this.frames[ i ];
         var node = new TreeBoxNode( this.tree );
         node.setText( 0, String( i + 1 ) );
         node.setText( 1, f.name );
         node.setText( 2, ( f.dateObs !== null && f.dateObs !== undefined )
                          ? new Date( f.dateObs*1000 ).toISOString().substring( 0, 19 ).split( "T" ).join( " " )
                          : "—" );
         node.setText( 3, f.exposure > 0 ? String( Math.round( f.exposure*10 )/10 ) : "—" );
         totalExp += f.exposure;
      }
      this.summaryLabel.text = this.frames.length
         ? tr( "frames.summary", this.frames.length, formatDuration( totalExp ) )
         : tr( "frames.summary.none" );
      this.updateEstimate();
      this.refreshFilterMapping();
      this.checkStackPlacementStillApplies();
      this.updateStackRevealEnabled();
   }

   // A placement made on one night applied silently to another: the sub list can
   // be swapped wholesale while the stackReveal* keys sit there, and the reveal
   // then lands on a stack it was never aligned to. The reference the alignment
   // was made against is stored with it and compared here.
   checkStackPlacementStillApplies()
   {
      if ( !revealAligned( this.cfg, "stack" ) || !this.cfg.stackRevealFor.length )
         return;
      var now = this.revealReferenceKey();
      if ( !now.length || now == this.cfg.stackRevealFor )
      {
         this.placementStale = false;
         return;
      }
      this.clearStackPlacement();
      this.placementStale = true;
      console.warningln( tr( "align.placementStale" ) );
   }

   // Repopulate the filter→channel combos from the filters present in the loaded
   // subs, reflecting the current cfg.chR/chG/chB selection.
   refreshFilterMapping()
   {
      if ( !this.chR )
         return;
      var filters = detectFilters( this.frames );
      var names = filters.map( ( f ) => f.filter );
      this.filterNames = names;
      // Show the EFFECTIVE mapping (palette resolved against present filters,
      // honouring explicit overrides), and persist it so it is explicit.
      var eff = resolveChannelMap( this.cfg, filters );
      // An explicit (none) survives the refresh; anything else is replaced by the
      // effective mapping so the saved config says what will actually render.
      this.cfg.chR = ( this.cfg.chR == CH_NONE ) ? CH_NONE : eff.R;
      this.cfg.chG = ( this.cfg.chG == CH_NONE ) ? CH_NONE : eff.G;
      this.cfg.chB = ( this.cfg.chB == CH_NONE ) ? CH_NONE : eff.B;
      var slots = [ [ this.chR, this.cfg.chR ], [ this.chG, this.cfg.chG ],
                    [ this.chB, this.cfg.chB ] ];
      for ( var s = 0; s < slots.length; ++s )
      {
         var combo = slots[ s ][ 0 ].combo, cur = slots[ s ][ 1 ];
         combo.clear();
         combo.addItem( tr( "seq.chNone" ) );
         var sel = 0;
         for ( var i = 0; i < names.length; ++i )
         {
            combo.addItem( names[ i ] );
            if ( names[ i ] == cur ) sel = i + 1;
         }
         combo.currentItem = sel;
      }
      this.filterInfoLabel.text = names.length ? tr( "seq.filtersFound", names.join( ", " ) )
                                               : tr( "seq.noFilters" );
      this.updateColorEnabled();
   }

   // Fill cfg.chR/chG/chB from the chosen palette resolved against the detected
   // filters, then refresh the combos.
   applyPalette()
   {
      var filters = detectFilters( this.frames );
      var m = resolveChannelMap( { palette: this.cfg.palette, chR: "", chG: "", chB: "" }, filters );
      this.cfg.chR = m.R; this.cfg.chG = m.G; this.cfg.chB = m.B;
      this.refreshFilterMapping();
   }

   // Enable/disable the palette + channel controls (colour on, subs mode only).
   updateColorEnabled()
   {
      if ( !this.colorGroup )
         return;
      var on = !!this.cfg.colorEnabled && this.cfg.style != STYLE_ZOOM;
      var ctrls = [ this.paletteLabel, this.paletteCombo,
                    this.chR.label, this.chR.combo, this.chG.label, this.chG.combo,
                    this.chB.label, this.chB.combo, this.removeGreenCheck ];
      for ( var i = 0; i < ctrls.length; ++i )
         ctrls[ i ].enabled = on;
   }

   // The "Align…" button only makes sense once a presentation image is chosen.
   updateStackRevealEnabled()
   {
      if ( this.stackAlignButton )
         this.stackAlignButton.enabled = this.cfg.stackRevealPath.length > 0 && this.frames.length > 0;
      this.updateRotWarnings();
   }

   updateEstimate()
   {
      var count, seconds;
      if ( this.cfg.style == STYLE_ZOOM )
      {
         count = Math.max( 2, Math.round( this.cfg.fps*this.cfg.targetDuration ) );
         seconds = count/this.cfg.fps + this.cfg.holdFirst + this.cfg.holdLast;
         this.estimateLabel.text = tr( "video.estimate", count, formatDuration( seconds ), this.cfg.fps );
         return;
      }
      var N = this.frames.length;
      if ( N == 0 )
      {
         this.estimateLabel.text = "";
         return;
      }
      // The same plan the engine renders from, so the number under the button is
      // the number that comes out — colour cadence included, and the end reveal,
      // which the estimate never counted in either mode.
      var cp = colorPlanFor( this.frames, this.cfg );
      var plan = plannedFrameCount( this.frames, this.cfg, cp.active ? cp.map : null );
      var seconds = plan.total/this.cfg.fps + this.cfg.holdFirst + this.cfg.holdLast;
      var text = tr( "video.estimate", plan.total, formatDuration( seconds ), this.cfg.fps );
      // Colour skips the subs before every channel has one. That is a defensible
      // choice; leaving the user to discover it after the render is not.
      if ( plan.firstFullN > 1 )
         text += "  " + tr( "video.estimateFrom", plan.firstFullN );
      this.estimateLabel.text = text;
   }

   updateStyleDependents()
   {
      var isStack = ( this.cfg.style == STYLE_STACKING );
      var isZoom = ( this.cfg.style == STYLE_ZOOM );
      this.stackNote.visible = isStack;
      this.updateTagline();
      // Per-style overlay items.
      this.snrCheck.enabled = isStack;
      this.timeCheck.enabled = !isZoom;    // UT clock of the current sub
      this.counterCheck.enabled = !isZoom;
      this.exposureCheck.enabled = !isZoom;
      this.scaleCheck.enabled = isZoom;
      this.constNamesCheck.enabled = isZoom;
      this.starNamesCheck.enabled = isZoom;
      this.horizonCheck.enabled = isZoom;
      this.gridCheck.enabled = isZoom;
      this.hipsCheck.enabled = isZoom;
      this.locationCheck.enabled = isZoom;
      this.updateLocationEnabled();
      this.subtitleLabel.enabled = isZoom;
      this.subtitleEdit.enabled = isZoom;
      this.distanceLabel.enabled = isZoom;
      this.distanceEdit.enabled = isZoom;
      this.updateAlignEnabled();
      this.debayerCheck.enabled = !isZoom;
      this.alignCheck.enabled = !isZoom;
      this.updateColorEnabled();
      this.durationSpin.enabled = isStack || isZoom;
      this.durationLabel.enabled = isStack || isZoom;
      this.updateEstimate();
   }

   // Fill the shoot-location fields from a solved image's headers, unless the
   // user has already entered values.
   autofillLocationFromImage( path )
   {
      var meta = scanFrameHeader( path );
      if ( meta.siteLat != null && ( this.cfg.observerLat == 999 || !this.latEdit.text.length ) )
      {
         this.cfg.observerLat = meta.siteLat;
         this.latEdit.text = meta.siteLat.toFixed( 4 );
      }
      if ( meta.siteLong != null && ( this.cfg.observerLong == 999 || !this.lonEdit.text.length ) )
      {
         this.cfg.observerLong = meta.siteLong;
         this.lonEdit.text = meta.siteLong.toFixed( 4 );
      }
   }

   updateLocationEnabled()
   {
      var on = this.cfg.locationEnabled && ( this.cfg.style == STYLE_ZOOM );
      this.latLabel.enabled = on; this.latEdit.enabled = on;
      this.lonLabel.enabled = on; this.lonEdit.enabled = on;
      this.dateLabel.enabled = on; this.dateEdit.enabled = on;
      this.fromSubButton.enabled = on;
   }

   // Pick a sub and fill lat/lon/UTC from its headers.
   onReadSubLocation()
   {
      var d = new OpenFileDialog;
      d.multipleSelections = false;
      d.caption = tr( "zoom.fromSub" );
      d.filters = [ [ "FITS / XISF", "*.fit", "*.fits", "*.fts", "*.xisf" ] ];
      if ( !d.execute() || !d.fileNames.length )
         return;
      var meta = scanFrameHeader( d.fileNames[ 0 ] );
      var filled = 0;
      if ( meta.siteLat != null )
      {
         this.cfg.observerLat = meta.siteLat;
         this.latEdit.text = meta.siteLat.toFixed( 4 );
         ++filled;
      }
      if ( meta.siteLong != null )
      {
         this.cfg.observerLong = meta.siteLong;
         this.lonEdit.text = meta.siteLong.toFixed( 4 );
         ++filled;
      }
      if ( meta.dateObsStr && meta.dateObsStr.length )
      {
         this.cfg.observerDateUtc = meta.dateObsStr;
         this.dateEdit.text = meta.dateObsStr;
         ++filled;
      }
      if ( filled == 0 )
         ( new MessageBox( tr( "zoom.subNoData" ), tr( "err.title" ), StdIcon.Warning, StdButton.Ok ) ).execute();
   }

   // Fill the (untouched) title field with the OBJECT keyword read from the
   // loaded frames, so an untitled video is labeled with the actual target.
   autofillTitle()
   {
      if ( this.titleTouched )
         return;
      var obj = dominantObject( this.frames );
      if ( !obj.length || obj == this.autoTitle )
         return;
      this.autoTitle = obj;
      this.settingTitleText = true;
      this.titleEdit.text = obj;
      this.settingTitleText = false;
      this.cfg.ovTitle = obj;
   }

   addPaths( paths )
   {
      var known = {};
      for ( var i = 0; i < this.frames.length; ++i )
         known[ this.frames[ i ].path ] = true;
      var fresh = [];
      for ( var j = 0; j < paths.length; ++j )
         if ( !known[ paths[ j ] ] && isFramePath( paths[ j ] ) )
            fresh.push( paths[ j ] );
      for ( var k = 0; k < fresh.length; ++k )
      {
         this.summaryLabel.text = tr( "frames.scanning", k + 1, fresh.length );
         processEvents();
         this.frames.push( scanFrameHeader( fresh[ k ] ) );
      }
      this.frames = sortFrames( this.frames );
      this.autofillTitle();
      this.refreshTree();
   }

   // Config to persist: an auto-derived title is dropped so it never becomes a
   // stale hand-typed name in a later session with different data, and the
   // version stamp reflects whether an unchecked rotation is still riding along.
   persistableConfig()
   {
      var c = {};
      for ( var k in this.cfg )
         c[ k ] = this.cfg[ k ];
      if ( !this.titleTouched )
         c.ovTitle = "";
      return stampConfig( c, gRotPending );
   }

   // A rotation the user has just re-established through the alignment popup is
   // in the current convention by construction — the doubt on it is over. Once
   // no doubt is left, the config (and any process icon dragged out of it) can
   // be stamped.
   rotChecked( which )
   {
      gRotPending[ which ] = false;
      gRotPending.any = gRotPending.zoom || gRotPending.stack;
      stampConfig( this.cfg, gRotPending );
      this.updateRotWarnings();
   }

   // Show the stale-rotation notice next to the alignment it applies to, and
   // only where that rotation would actually be used — an unused stored value is
   // noise, and a notice that cries wolf is one the user learns to ignore.
   updateRotWarnings()
   {
      if ( !this.rotWarnZoom || !this.rotWarnStack )
         return;
      var deg = function( r ) { return String( Math.round( r*10 )/10 ); };
      var zoom = gRotPending.zoom && this.cfg.zoomRevealCropped;
      var stack = gRotPending.stack && this.cfg.stackRevealPath.length > 0;
      this.rotWarnZoom.text = zoom ? tr( "align.rotStale", deg( this.cfg.zoomRevealRot ) ) : "";
      this.rotWarnZoom.visible = zoom;
      var stackText = stack ? tr( "align.rotStale", deg( this.cfg.stackRevealRot ) )
                            : ( this.placementStale ? tr( "align.placementStale" ) : "" );
      this.rotWarnStack.text = stackText;
      this.rotWarnStack.visible = stackText.length > 0;
   }

   onAddFiles()
   {
      var d = new OpenFileDialog;
      d.multipleSelections = true;
      d.caption = tr( "frames.addFiles" );
      d.filters = [ [ "FITS / XISF", "*.fit", "*.fits", "*.fts", "*.xisf" ] ];
      if ( d.execute() )
         this.addPaths( d.fileNames );
   }

   onAddFolder()
   {
      var d = new GetDirectoryDialog;
      d.caption = tr( "frames.addFolder" );
      if ( d.execute() )
         this.addPaths( findFramesInDirectory( d.directory ) );
   }

   onRemoveSelected()
   {
      var keep = [];
      for ( var i = 0; i < this.tree.numberOfChildren; ++i )
         if ( !this.tree.child( i ).selected )
            keep.push( this.frames[ i ] );
      this.frames = keep;
      this.refreshTree();
   }

   // Single owner of the zoom align-button state: enabled only when the
   // cropped-reveal mode is on and BOTH images are chosen, whatever order
   // the user set them in.
   updateAlignEnabled()
   {
      this.alignButton.enabled = this.cfg.zoomRevealCropped &&
         this.cfg.zoomRevealPath.length > 0 && this.cfg.zoomImagePath.length > 0;
      this.updateRotWarnings();
   }

   // Single owner of the ffmpeg sub-section state: header text (arrow +
   // status emoji), body visibility, and the install button (only offered
   // while ffmpeg is missing). state: "ok" | "missing" | "busy".
   setFfmpegSection( state, expanded )
   {
      this.ffmpegState = state;
      this.ffmpegSectionExpanded = expanded;
      var key = ( state == "ok" ) ? "out.ffmpegHeaderOk" :
                ( state == "busy" ) ? "out.ffmpegHeaderBusy" : "out.ffmpegHeaderMissing";
      this.ffmpegHeader.text = ( expanded ? "▾  " : "▸  " ) + tr( key );
      this.ffmpegBody.visible = expanded;
      this.ffmpegInstall.visible = ( state != "ok" );
      this.adjustToContents();
   }

   onDetectFfmpeg()
   {
      var found = detectFfmpeg( this.cfg.ffmpegPath );
      if ( found.length )
      {
         this.cfg.ffmpegPath = found;
         this.ffmpegEdit.text = found;
         this.ffmpegStatus.text = tr( "out.ffmpegFound", found );
      }
      else
         this.ffmpegStatus.text = tr( "out.ffmpegMissing" );
      this.setFfmpegSection( found.length ? "ok" : "missing", found.length == 0 );
   }

   onInstallFfmpeg()
   {
      var dir = ffmpegInstallDir( platformKind(), getEnvironmentVariable );
      if ( ( new MessageBox( tr( "out.installConfirm", FFMPEG_MIRROR_BASE, dir ),
                             SC_TITLE, StdIcon.Question,
                             StdButton.Yes, StdButton.No ) ).execute() != StdButton.Yes )
         return;
      this.ffmpegStatus.text = tr( "out.installing", FFMPEG_MIRROR_BASE );
      this.setFfmpegSection( "busy", true );
      this.ffmpegBody.enabled = false;   // one switch for every ffmpeg control
      processEvents();
      var path = "";
      try
      {
         path = installFfmpegFromMirror();
      }
      finally
      {
         this.ffmpegBody.enabled = true;
      }
      if ( path.length )
      {
         this.cfg.ffmpegPath = path;
         this.ffmpegEdit.text = path;
         this.ffmpegStatus.text = tr( "out.installDone", path );
         this.setFfmpegSection( "ok", false );
      }
      else
      {
         this.ffmpegStatus.text = tr( "out.installFail" );
         this.setFfmpegSection( "missing", true );
      }
   }

   validate( needOutput )
   {
      if ( this.cfg.style == STYLE_ZOOM )
      {
         if ( !this.cfg.zoomImagePath.length || !File.exists( this.cfg.zoomImagePath ) )
         {
            ( new MessageBox( tr( "err.noZoomImage" ), tr( "err.title" ),
                              StdIcon.Error, StdButton.Ok ) ).execute();
            return false;
         }
      }
      else if ( this.frames.length < 2 )
      {
         ( new MessageBox( tr( "err.noFrames" ), tr( "err.title" ),
                           StdIcon.Error, StdButton.Ok ) ).execute();
         return false;
      }
      if ( needOutput && !this.cfg.outputDir.length )
      {
         ( new MessageBox( tr( "err.noOutput" ), tr( "err.title" ),
                           StdIcon.Error, StdButton.Ok ) ).execute();
         return false;
      }
      return true;
   }

   // Open the visual alignment popup to place a differently-cropped reveal
   // image onto the solved image.
   onAlign()
   {
      if ( !this.cfg.zoomImagePath.length || !this.cfg.zoomRevealPath.length )
         return;
      withBusyButton( this.alignButton, tr( "align.opening" ), () => this.doAlign() );
   }

   doAlign()
   {
      console.show();
      console.writeln( tr( "align.loading" ) );
      processEvents();
      // Solved image, auto-stretched, as the alignment background.
      var solvedBmp = null;
      try
      {
         var w = openFrameWindow( this.cfg.zoomImagePath );
         if ( w != null )
         {
            applyStretchToView( w.mainView, computeStretchForImage( w.mainView.image, this.cfg.stretchLinked ) );
            solvedBmp = w.mainView.image.render();
            w.forceClose();
         }
      }
      catch ( e )
      {
      }
      var revealBmp = loadFinishedBitmap( this.cfg.zoomRevealPath );
      if ( solvedBmp == null || revealBmp == null )
      {
         ( new MessageBox( tr( "align.loadFailed" ), tr( "err.title" ), StdIcon.Error, StdButton.Ok ) ).execute();
         return;
      }
      var c = this.cfg;
      var dlg = new AlignDialog( solvedBmp, revealBmp, alignInit( !revealAligned( c, "zoom" ),
         c.zoomRevealOffX, c.zoomRevealOffY, c.zoomRevealScale, c.zoomRevealRot, c.zoomRevealFlipH, c.zoomRevealFlipV ) );
      if ( dlg.execute() && dlg.accepted )
      {
         this.cfg.zoomRevealOffX = dlg.cx;   // stored as the reveal centre in solved px
         this.cfg.zoomRevealOffY = dlg.cy;
         this.cfg.zoomRevealScale = dlg.scale;
         this.cfg.zoomRevealRot = dlg.rotDeg;
         this.cfg.zoomRevealFlipH = dlg.flipH;
         this.cfg.zoomRevealFlipV = dlg.flipV;
         this.cfg.zoomRevealAligned = true;
         this.cfg.zoomRevealCropped = true;
         this.croppedCheck.checked = true;
         this.rotChecked( "zoom" );
      }
   }

   // The sub list a stack placement belongs to. The alignment is made against the
   // registration reference, so the reference identifies the target: swap the subs
   // for another night and the saved placement is describing a different image.
   // A placement belongs to the image it was made on. Changing that image — typed,
   // browsed or cleared — discards it rather than applying it to the next one.
   clearStackPlacement()
   {
      var c = this.cfg;
      c.stackRevealAligned = false; c.stackRevealFor = "";
      c.stackRevealScale = 0; c.stackRevealOffX = 0; c.stackRevealOffY = 0;
      c.stackRevealRot = 0; c.stackRevealFlipH = false; c.stackRevealFlipV = false;
      this.updateRotWarnings();
   }

   clearZoomPlacement()
   {
      var c = this.cfg;
      c.zoomRevealAligned = false;
      c.zoomRevealScale = 0; c.zoomRevealOffX = 0; c.zoomRevealOffY = 0;
      c.zoomRevealRot = 0; c.zoomRevealFlipH = false; c.zoomRevealFlipV = false;
      this.updateRotWarnings();
   }

   revealReferenceKey()
   {
      if ( !this.frames.length )
         return "";
      var ref = pickReference( sortFrames( this.frames ) );
      return ref ? pathKey( ref.path ) : "";
   }

   // Open the alignment popup for the progressive-stack presentation image,
   // placed onto the registration reference sub (which shares the stack's
   // orientation). Stores the placement in the stackReveal* config.
   onAlignStack()
   {
      if ( !this.cfg.stackRevealPath.length || this.frames.length < 1 )
         return;
      withBusyButton( this.stackAlignButton, tr( "align.opening" ), () => this.doAlignStack() );
   }

   doAlignStack()
   {
      console.show();
      console.writeln( tr( "align.loading" ) );
      processEvents();
      // Reference sub (dominant filter, first in shoot order), auto-stretched.
      var ref = pickReference( sortFrames( this.frames ) );
      var bgBmp = null;
      try
      {
         var w = openFrameWindow( ref.path );
         if ( w != null )
         {
            applyStretchToView( w.mainView, computeStretchForImage( w.mainView.image, this.cfg.stretchLinked ) );
            bgBmp = w.mainView.image.render();
            w.forceClose();
         }
      }
      catch ( e ) {}
      var revealBmp = loadFinishedBitmap( this.cfg.stackRevealPath );
      if ( bgBmp == null || revealBmp == null )
      {
         ( new MessageBox( tr( "align.loadFailed" ), tr( "err.title" ), StdIcon.Error, StdButton.Ok ) ).execute();
         return;
      }
      var c = this.cfg;
      var dlg = new AlignDialog( bgBmp, revealBmp, alignInit( !revealAligned( c, "stack" ),
         c.stackRevealOffX, c.stackRevealOffY, c.stackRevealScale, c.stackRevealRot, c.stackRevealFlipH, c.stackRevealFlipV ) );
      if ( dlg.execute() && dlg.accepted )
      {
         this.cfg.stackRevealOffX = dlg.cx;
         this.cfg.stackRevealOffY = dlg.cy;
         this.cfg.stackRevealScale = dlg.scale;
         this.cfg.stackRevealRot = dlg.rotDeg;
         this.cfg.stackRevealFlipH = dlg.flipH;
         this.cfg.stackRevealFlipV = dlg.flipV;
         this.cfg.stackRevealAligned = true;
         this.cfg.stackRevealFor = this.revealReferenceKey();
         this.stackRevealEdit.text = this.cfg.stackRevealPath;
         this.rotChecked( "stack" );
      }
   }

   // Enable/disable the controls while a generation runs (the dialog stays open).
   setBusy( busy )
   {
      this.generateButton.enabled = !busy;
      this.closeButton.enabled = !busy;
      this.tabBox.enabled = !busy;
      this.overlayGroup.enabled = !busy;
      this.videoGroup.enabled = !busy;
      this.outGroup.enabled = !busy;
   }

   // Generation runs inline so the dialog stays open, shows live progress, and
   // ends on a result popup with links. The window closes only on Close.
   onGenerate()
   {
      if ( !this.validate( true ) )
         return;
      saveConfig( this.persistableConfig() );

      var self = this;
      this._paused = false;
      this._cancel = false;
      this.setBusy( true );
      this.pauseButton.enabled = true;
      this.cancelButton.enabled = true;
      this.pauseButton.text = tr( "prog.pause" );
      console.show();

      var SPIN = [ "◐", "◓", "◑", "◒" ];
      this._spin = 0;
      var engine = new Engine( this.cfg, this.frames );
      engine.shouldAbort = () => self._cancel;
      engine.onProgress = ( done, total, msg, previewBmp ) =>
      {
         self._spin = ( self._spin + 1 ) % SPIN.length;
         var g = SPIN[ self._spin ];
         if ( done >= 0 && total > 0 )
         {
            self.progressBar.__indet = false;
            self.progressBar.__frac = done/total;
            // The bar was clamped in onPaint and the text was not, which is why it
            // could read 335% while the bar sat full.
            self.progressStatus.text = g + "   " + msg +
               "   (" + Math.round( 100*clamp01( done/total ) ) + "%)";
         }
         else
         {
            self.progressBar.__indet = true;
            self.progressBar.__phase += 14;
            self.progressStatus.text = g + "   " + msg;
         }
         if ( previewBmp != null )
         {
            self.thumbCtrl.__bmp = previewBmp;
            self.thumbCtrl.repaint();
         }
         self.progressBar.repaint();
         processEvents();
         // Pause blocks the engine here, between steps, until resumed/cancelled.
         while ( self._paused && !self._cancel )
         {
            self.progressStatus.text = tr( "prog.paused" );
            self.progressBar.repaint();
            processEvents();
         }
      };

      var result = null, error = "";
      try
      {
         result = engine.run();
      }
      catch ( e )
      {
         error = e.message || String( e );
      }

      this.setBusy( false );
      this.pauseButton.enabled = false;
      this.cancelButton.enabled = false;
      this.progressBar.__indet = false;
      this.progressBar.__frac = ( result && result.ok ) ? 1 : 0;
      this.progressBar.repaint();
      this.progressStatus.text = self._cancel ? tr( "prog.cancelled" )
                              : ( result && result.rendered > 0 ) ? tr( "prog.done" )
                              : ( result && result.error ) ? result.error : tr( "result.nothing" );

      if ( error.length )
      {
         ( new MessageBox( tr( "run.error", error ), tr( "err.title" ),
                           StdIcon.Error, StdButton.Ok ) ).execute();
         return;
      }
      if ( result )
         ( new SessionCinemaResultDialog( result, this.cfg ) ).execute();
   }
}

// ============================================================================
// RESULT DIALOG — end-of-run summary with links; the main dialog stays open.
// ============================================================================

class SessionCinemaResultDialog extends Dialog
{
   constructor( result, cfg )
   {
      super();
      var self = this;
      this.windowTitle = tr( "result.title" );

      var lines = [];
      if ( result.aborted )
         lines.push( tr( "result.aborted", result.rendered ) );
      else if ( !result.ok || result.rendered == 0 )
      {
         lines.push( ( result.error && result.error.length ) ? result.error
                                                            : tr( "result.nothing" ) );
         if ( result.skipped && result.skipped.length )
            lines.push( tr( "result.skipped", result.skipped.length ) );
      }
      else
      {
         lines.push( tr( "result.rendered", result.rendered ) );
         if ( result.videoPath && result.videoPath.length )
            lines.push( tr( "result.video", result.videoPath ) );
         else if ( result.scriptPath && result.scriptPath.length )
            lines.push( tr( "result.script", result.scriptPath ) );
         if ( result.skipped && result.skipped.length )
            lines.push( tr( "result.skipped", result.skipped.length ) );
      }

      this.info = new Label( this );
      this.info.text = lines.join( "\n" );
      this.info.wordWrapping = true;
      this.info.minWidth = 460;
      this.info.margin = 8;
      this.info.frameStyle = FrameStyle.Box;

      this.buttons = new HorizontalSizer;
      this.buttons.spacing = 6;

      if ( result.videoPath && result.videoPath.length )
      {
         this.openVideoButton = new PushButton( this );
         this.openVideoButton.text = tr( "result.openVideo" );
         this.openVideoButton.onClick = () => openInFileBrowser( result.videoPath );
         this.buttons.add( this.openVideoButton );
      }
      if ( result.framesDir && result.framesDir.length )
      {
         this.openFolderButton = new PushButton( this );
         this.openFolderButton.text = tr( "result.openFolder" );
         this.openFolderButton.onClick = () =>
            openInFileBrowser( cfg.outputDir.length ? cfg.outputDir : result.framesDir );
         this.buttons.add( this.openFolderButton );
      }
      this.buttons.addStretch();

      this.closeButton = new PushButton( this );
      this.closeButton.text = tr( "btn.close" );
      this.closeButton.defaultButton = true;
      this.closeButton.onClick = () => self.ok();
      this.buttons.add( this.closeButton );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 8;
      this.sizer.add( this.info );
      this.sizer.add( this.buttons );
      this.adjustToContents();
      this.setFixedSize();
   }
}

// ============================================================================
// ALIGN DIALOG — visually place a differently-cropped reveal image onto a
// background (the solved image for zoom, the stack reference sub for stacking).
// ============================================================================

// Initial AlignDialog placement from a mode's stored reveal fields; a fresh
// (never-aligned) reveal starts centred/unit-fit (undefined centre, scale 0).
function alignInit( fresh, offX, offY, scale, rotDeg, flipH, flipV )
{
   return {
      cx: fresh ? undefined : offX,
      cy: fresh ? undefined : offY,
      scale: fresh ? 0 : scale,
      rotDeg: fresh ? 0 : rotDeg,
      flipH: !fresh && flipH,
      flipV: !fresh && flipV
   };
}

// Run a slow UI action behind a button: swap its text for a busy label,
// disable it, and restore both whatever happens. The action may keep
// mutating button.text (progress); the finally rolls it back.
function withBusyButton( button, busyText, action )
{
   var oldText = button.text;
   button.text = busyText;
   button.enabled = false;
   processEvents();
   try
   {
      action();
   }
   finally
   {
      button.text = oldText;
      button.enabled = true;
   }
}

class AlignDialog extends Dialog
{
   constructor( solvedBmp, revealBmp, init )
   {
      super();
      var self = this;
      this.windowTitle = tr( "align.title" );
      this.userResizable = true;
      this.solvedBmp = solvedBmp;
      this.revealBmp = revealBmp;
      this.solvedW = solvedBmp.width;
      this.solvedH = solvedBmp.height;
      this.revealW = revealBmp.width;
      this.revealH = revealBmp.height;

      // Alignment state: the reveal CENTRE lands at (cx,cy) in background px so
      // rotation pivots on the centre. The caller supplies the initial placement
      // (fresh → centred, unit-fit); this dialog is agnostic to which mode uses it.
      init = init || {};
      this.cx = ( init.cx !== undefined ) ? init.cx : this.solvedW/2;
      this.cy = ( init.cy !== undefined ) ? init.cy : this.solvedH/2;
      this.scale = ( init.scale > 0 ) ? init.scale : ( this.solvedW/this.revealW );
      this.rotDeg = init.rotDeg || 0;
      this.flipH = !!init.flipH;
      this.flipV = !!init.flipV;
      this.overlay = 0.6;
      this.accepted = false;

      // View (pan/zoom of the whole preview). zoom=1 fits the solved image.
      this.zoom = 1;
      this.panX = null;   // computed on first paint to centre the image
      this.panY = null;

      this.help = new Label( this );
      this.help.useRichText = true;
      this.help.wordWrapping = true;
      this.help.text = tr( "align.help" );

      // solved-px -> screen-px given the current fit/zoom/pan.
      this.fit = function() { return Math.min( self.canvas.width/self.solvedW, self.canvas.height/self.solvedH ); };
      this.ps = function() { return self.fit()*self.zoom; };
      this.S = function( X, Y ) { return { x: X*self.ps() + self.panX, y: Y*self.ps() + self.panY }; };

      // ---- interactive canvas ----
      this.canvas = new Control( this );
      this.canvas.setScaledMinSize( 640, 400 );
      this.canvas.__mode = null;
      this.canvas.onPaint = function()
      {
         var g = new Graphics( this );
         g.fillRect( 0, 0, this.width, this.height, new Brush( 0xFF0A0E16 ) );
         if ( self.panX == null )
         {
            self.panX = ( this.width - self.solvedW*self.ps() )/2;
            self.panY = ( this.height - self.solvedH*self.ps() )/2;
         }
         var ps = self.ps();
         var o = self.S( 0, 0 );
         g.antialiasing = true;
         g.drawScaledBitmap( new Rect( Math.round( o.x ), Math.round( o.y ),
                                       Math.round( o.x + self.solvedW*ps ), Math.round( o.y + self.solvedH*ps ) ), self.solvedBmp );

         // Reveal centre + axis endpoints in solved px (shared with the renderer).
         var pl = revealPlacement( self.cx, self.cy, self.scale, self.rotDeg, self.flipH, self.flipV,
                                   self.revealW/2, self.revealH/2 );
         var cS = self.S( pl.c.x, pl.c.y ), exS = self.S( pl.ex.x, pl.ex.y ), eyS = self.S( pl.ey.x, pl.ey.y );
         blitOriented( g, cS, exS, eyS, self.revealW, self.revealH, self.revealBmp, self.overlay, 0xFF22D3EE );
         g.end();
      };
      this.canvas.onMousePress = function( x, y, button, buttonState, modifiers )
      {
         this.__mode = self.panMode ? "pan" : "reveal";
         this.__start = { x: x, y: y, cx: self.cx, cy: self.cy, panX: self.panX, panY: self.panY };
      };
      this.canvas.onMouseMove = function( x, y, buttonState, modifiers )
      {
         if ( this.__mode == null )
            return;
         if ( this.__mode == "pan" )
         {
            self.panX = this.__start.panX + ( x - this.__start.x );
            self.panY = this.__start.panY + ( y - this.__start.y );
         }
         else
         {
            var ps = self.ps();
            self.cx = this.__start.cx + ( x - this.__start.x )/ps;
            self.cy = this.__start.cy + ( y - this.__start.y )/ps;
         }
         this.repaint();
      };
      this.canvas.onMouseRelease = function( x, y, button, buttonState, modifiers ) { this.__mode = null; };
      this.canvas.onMouseWheel = function( x, y, delta, buttonState, modifiers )
      {
         var oldPs = self.ps();
         var sx = ( x - self.panX )/oldPs, sy = ( y - self.panY )/oldPs;   // solved px under cursor
         self.zoom = Math.max( 0.2, Math.min( 30, self.zoom*( delta > 0 ? 1.2 : 1/1.2 ) ) );
         var newPs = self.ps();
         self.panX = x - sx*newPs;
         self.panY = y - sy*newPs;
         this.repaint();
      };

      // ---- controls ----
      this.scaleControl = new NumericControl( this );
      this.scaleControl.label.text = tr( "align.scale" );
      this.scaleControl.setRange( 0.05, 10 );
      this.scaleControl.setPrecision( 4 );
      this.scaleControl.setValue( this.scale );
      this.scaleControl.onValueUpdated = ( v ) => { self.scale = v; self.canvas.repaint(); };

      // Rotation as 0..360 (all-positive, so the slider never has to deliver
      // negative values); -10° is simply 350°.
      this.rotDeg = ( ( this.rotDeg % 360 ) + 360 ) % 360;
      this.rotControl = new NumericControl( this );
      this.rotControl.label.text = tr( "align.rotation" );
      this.rotControl.setRange( 0, 360 );
      this.rotControl.setPrecision( 2 );
      this.rotControl.setValue( this.rotDeg );
      this.rotControl.onValueUpdated = ( v ) => { self.rotDeg = v; self.canvas.repaint(); };

      this.opacityControl = new NumericControl( this );
      this.opacityControl.label.text = tr( "align.opacity" );
      this.opacityControl.setRange( 0.1, 1 );
      this.opacityControl.setPrecision( 2 );
      this.opacityControl.setValue( this.overlay );
      this.opacityControl.onValueUpdated = ( v ) => { self.overlay = v; self.canvas.repaint(); };

      this.flipHButton = new PushButton( this );
      this.flipHButton.text = tr( "align.flipH" );
      this.flipHButton.onClick = () => { self.flipH = !self.flipH; self.canvas.repaint(); };
      this.flipVButton = new PushButton( this );
      this.flipVButton.text = tr( "align.flipV" );
      this.flipVButton.onClick = () => { self.flipV = !self.flipV; self.canvas.repaint(); };
      function nudgeRot( d )
      {
         self.applyPlacement( self.cx, self.cy, self.scale, self.rotDeg + d, self.flipH, self.flipV );
      }
      this.rotM90Button = new PushButton( this );
      this.rotM90Button.text = tr( "align.rotM90" );
      this.rotM90Button.onClick = () => nudgeRot( -90 );
      this.rot90Button = new PushButton( this );
      this.rot90Button.text = tr( "align.rot90" );
      this.rot90Button.onClick = () => nudgeRot( 90 );

      this.fitButton = new PushButton( this );
      this.fitButton.text = tr( "align.fit" );
      this.fitButton.toolTip = tr( "align.fitHint" );
      this.fitButton.onClick = () =>
         self.applyPlacement( self.solvedW/2, self.solvedH/2,
                              self.solvedW/self.revealW, 0, false, false );

      // Automatic placement by star-matching the two bitmaps shown here.
      this.autoButton = new PushButton( this );
      this.autoButton.text = tr( "align.auto" );
      this.autoButton.toolTip = tr( "align.autoHint" );
      this.autoButton.onClick = () =>
      {
         var al = null;
         withBusyButton( self.autoButton, tr( "align.autoBusy" ), () =>
         {
            al = autoAlignReveal( self.solvedBmp, self.revealBmp, ( i, n ) =>
            {
               self.autoButton.text = tr( "align.autoBusy" ) + " " + i + "/" + n;
               processEvents();
            } );
         } );
         if ( al == null )
         {
            ( new MessageBox( tr( "align.autoFail" ), tr( "align.title" ),
                              StdIcon.Warning, StdButton.Ok ) ).execute();
            return;
         }
         self.applyPlacement( al.cx, al.cy, al.scale, al.rotDeg, al.flipH, al.flipV );
      };

      this.panMode = false;
      this.panButton = new PushButton( this );
      this.panButton.text = tr( "align.move" );
      this.panButton.toolTip = tr( "align.panHint" );
      this.panButton.onClick = () =>
      {
         self.panMode = !self.panMode;
         self.panButton.text = self.panMode ? tr( "align.pan" ) : tr( "align.move" );
      };

      this.resetViewButton = new PushButton( this );
      this.resetViewButton.text = tr( "align.resetView" );
      this.resetViewButton.toolTip = tr( "align.resetViewHint" );
      this.resetViewButton.onClick = () =>
      {
         self.zoom = 1; self.panX = null; self.panY = null;   // recentred on next paint
         self.canvas.repaint();
      };

      this.okButton = new PushButton( this );
      this.okButton.text = tr( "btn.ok" );
      this.okButton.defaultButton = true;
      this.okButton.onClick = () => { self.accepted = true; self.ok(); };

      this.cancelButton = new PushButton( this );
      this.cancelButton.text = tr( "btn.cancel" );
      this.cancelButton.onClick = () => self.cancel();

      this.ctrlSizer = new HorizontalSizer;
      this.ctrlSizer.spacing = 8;
      this.ctrlSizer.add( this.scaleControl, 100 );
      this.ctrlSizer.addSpacing( 12 );
      this.ctrlSizer.add( this.rotControl, 100 );
      this.ctrlSizer.addSpacing( 12 );
      this.ctrlSizer.add( this.opacityControl, 100 );

      this.ctrlSizer2 = new HorizontalSizer;
      this.ctrlSizer2.spacing = 6;
      this.ctrlSizer2.add( this.autoButton );
      this.ctrlSizer2.add( this.flipHButton );
      this.ctrlSizer2.add( this.flipVButton );
      this.ctrlSizer2.add( this.rotM90Button );
      this.ctrlSizer2.add( this.rot90Button );
      this.ctrlSizer2.addStretch();
      this.ctrlSizer2.add( this.panButton );
      this.ctrlSizer2.add( this.resetViewButton );
      this.ctrlSizer2.add( this.fitButton );

      this.buttons = new HorizontalSizer;
      this.buttons.spacing = 6;
      this.buttons.addStretch();
      this.buttons.add( this.okButton );
      this.buttons.add( this.cancelButton );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 8;
      this.sizer.add( this.help );
      this.sizer.add( this.canvas, 100 );
      this.sizer.add( this.ctrlSizer );
      this.sizer.add( this.ctrlSizer2 );
      this.sizer.add( this.buttons );
      this.setScaledMinSize( 720, 620 );
      this.resize( 900, 760 );
   }

   // Apply a placement, sync the sliders (rotation normalized to 0..360) and
   // repaint — the one path Fit, Auto and the rotation nudges go through.
   applyPlacement( cx, cy, scale, rotDeg, flipH, flipV )
   {
      this.cx = cx;
      this.cy = cy;
      this.scale = scale;
      this.rotDeg = ( ( rotDeg % 360 ) + 360 ) % 360;
      this.flipH = flipH;
      this.flipV = flipV;
      this.scaleControl.setValue( this.scale );
      this.rotControl.setValue( this.rotDeg );
      this.canvas.repaint();
   }
}

// ============================================================================
// HEADLESS HOOK — SESSIONCINEMA_AUTORUN=/path/to/config.json runs the engine
// without a dialog and writes <outputDir>/sessioncinema-result.json. This is
// the automation entry used by the two-gate validation runs (PJSR-NOTES §8).
// ============================================================================

function runHeadless( cfgPath )
{
   var result = { ok: false, rendered: 0, skipped: [], videoPath: "", scriptPath: "",
                  framesDir: "", aborted: false, warnings: [], errorKey: "", error: "" };
   // Known before the config is even parsed, so a config that cannot be read
   // still produces a file saying so. Overridden below once outputDir is known.
   var marker = File.extractDrive( cfgPath ) + File.extractDirectory( cfgPath ) +
                "/sessioncinema-result.json";
   try
   {
      var raw = File.readTextFile( cfgPath );
      var user = JSON.parse( raw );
      var cfg = {};
      for ( var k in DEFAULT_CONFIG )
         cfg[ k ] = user.hasOwnProperty( k ) ? user[ k ] : DEFAULT_CONFIG[ k ];
      gLanguage = cfg.language || "en";
      // No dialog to carry the notice here, so an unstamped rotation is reported
      // in the console AND in the result file — automation reads the file.
      gRotPending = rotationsNeedingCheck( cfg );
      if ( gRotPending.any )
      {
         console.warningln( tr( "align.rotStaleLog" ) );
         result.warnings.push( tr( "align.rotStaleLog" ) );
      }
      // An empty outputDir would put the marker on the filesystem root, where the
      // write throws and the failure being diagnosed is the one that vanishes.
      if ( user.marker )
         marker = user.marker;
      else if ( cfg.outputDir && String( cfg.outputDir ).length )
         marker = cfg.outputDir + "/sessioncinema-result.json";
      var frames = [];
      var files = user.files || [];
      for ( var i = 0; i < files.length; ++i )
         frames.push( scanFrameHeader( files[ i ] ) );
      var engine = new Engine( cfg, frames );
      var r = engine.run();
      result.ok = r.ok;
      result.rendered = r.rendered;
      result.skipped = r.skipped;
      result.videoPath = r.videoPath;
      result.framesDir = r.framesDir;
      result.scriptPath = r.scriptPath;
      result.aborted = r.aborted;
      result.errorKey = r.errorKey;
      if ( r.error && r.error.length )
         result.error = r.error;
      // ok:true with an empty videoPath read as a success to every harness. Say
      // it: frames exist, no video, and here is the script that encodes them.
      if ( r.lostFrames )
         result.warnings.push( tr( "run.framesLost", r.lostFrames ) );
      if ( r.ok && !( r.videoPath && r.videoPath.length ) )
         result.warnings.push( tr( "result.script", r.scriptPath || result.framesDir ) );
      if ( engine.perf )
         result.perf = engine.perf;
   }
   catch ( e )
   {
      result.errorKey = "run.error";
      result.error = e.message || String( e );
   }
   // The result file is the ONLY channel automation has. It was written into a
   // directory nothing had created yet, so a run that failed early wrote nothing
   // at all — the one case a harness most needs to read.
   if ( marker.length )
      try
      {
         var dir = File.extractDrive( marker ) + File.extractDirectory( marker );
         if ( dir.length && !File.directoryExists( dir ) )
            File.createDirectory( dir, true );
         File.writeTextFile( marker, JSON.stringify( result ) );
      }
      catch ( e2 )
      {
         console.criticalln( "could not write " + marker + ": " + ( e2.message || e2 ) );
      }
}

// ============================================================================
function main()
{
   ensureMinimumVersion( 1, 9, 4 );

   var autorun = getEnvironmentVariable( "SESSIONCINEMA_AUTORUN" );
   if ( autorun && autorun.length )
   {
      runHeadless( autorun );
      return;
   }

   var cfg = loadConfig();
   importParameters( cfg );   // a launched process icon overrides saved settings
   gLanguage = cfg.language || "en";

   // Reveal rotations saved before the convention changed cannot be recognised,
   // so they are announced instead of guessed. The flag is deliberately NOT part
   // of cfg: it must not be persisted, only the missing stamp is (stampConfig).
   gRotPending = rotationsNeedingCheck( cfg );
   if ( gRotPending.any )
   {
      console.show();
      console.warningln( tr( "align.rotStaleLog" ) );
   }

   // Generation runs inside the dialog (it stays open, shows progress, ends on
   // a result popup). Here we only loop to rebuild the dialog on a live language
   // switch; otherwise execute() returns when the user closes the window.
   var frames = [];
   for ( ;; )
   {
      var dialog = new SessionCinemaDialog( cfg, frames );
      dialog.execute();
      frames = dialog.frames;
      if ( dialog.wantsLanguageReload )
      {
         // Drop any auto-derived title so the reopened dialog re-derives it
         // (and its touched-state) cleanly from the same frames.
         cfg = dialog.persistableConfig();
         continue;
      }
      cfg = dialog.cfg;
      saveConfig( dialog.persistableConfig() );
      return;
   }
}

main();
