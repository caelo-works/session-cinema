/*
 * SessionCinema.js — entry point.
 *
 * Session Cinema turns one or more nights of raw light frames into videos:
 * a sky timelapse (clouds, meteors, field rotation) or a "watch your stack
 * build itself" progressive-integration movie, with sober, honest overlays
 * (frame count, cumulative exposure, measured SNR gain) ready for sharing.
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

#feature-id    Utilities > Session Cinema
#feature-icon  @script_icons_dir/SessionCinema.svg
#feature-info  Turn a night of raw subs into a timelapse or a progressive \
               live-stacking video with sober scientific overlays (frame \
               count, cumulative exposure, measured SNR gain).

#define SC_VERSION "0.1.0"
#define SC_TITLE   "Session Cinema"

// Stamped by scripts/build-update-package.sh at packaging time.
#define SESSIONCINEMA_BUILD "__BUILD__"

/* beautify ignore:end */

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

var STYLE_TIMELAPSE = 0;   // one video frame per sub: clouds, meteors, rotation
var STYLE_STACKING  = 1;   // cumulative mean integration, 1..N subs
var STYLE_ZOOM      = 2;   // "you are here": whole sky -> constellation -> image

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
   language:        "en",
   style:           STYLE_STACKING,
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
   ovShowTime:      true,        // timelapse: UT clock from DATE-OBS
   ovShowSnr:       true,        // stacking: measured noise-based SNR gain
   ovShowBar:       true,
   ovSignature:     "",
   outputDir:       "",
   keepFrames:      false,
   ffmpegPath:      "",
   // Zoom Odyssey
   zoomImagePath:   "",          // solved final image to reveal
   zoomStartFov:    180,         // whole-sky field of view (deg) at t=0
   ovShowScale:     true,        // angular scale bar
   ovSubtitle:      "",          // free subtitle, e.g. the constellation name
   ovDistance:      ""           // free distance label, e.g. "5000 ly"
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
      "style.timelapse":   "Timelapse — one video frame per sub (clouds, meteors, field rotation)",
      "style.stacking":    "Progressive stack — watch the integration build from 1 to N subs",
      "style.stackNote":   "Stacking mode expects registered frames (e.g. the registered output of WBPP). " +
                           "Unregistered subs will show as drifting stars, not a clean stack.",
      "style.zoom":        "Zoom Odyssey — \"you are here\": whole sky → constellation → your image reveals itself",
      "style.zoomNote":    "Needs one plate-solved image (a WBPP master is already solved). " +
                           "Its embedded WCS drives the zoom; the sky is drawn from PixInsight's bundled catalogs.",
      "zoom.image":        "Final image:",
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
      "overlay.time":      "UT clock (timelapse)",
      "overlay.snr":       "Measured SNR gain (stacking)",
      "overlay.bar":       "Progress bar",
      "overlay.scale":     "Angular scale bar (zoom)",
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

      "out.title":         "Output",
      "out.dir":           "Folder:",
      "out.browse":        "Browse…",
      "out.keepFrames":    "Keep the PNG frame sequence",
      "out.ffmpeg":        "ffmpeg:",
      "out.detect":        "Detect",
      "out.ffmpegFound":   "ffmpeg found: %1",
      "out.ffmpegMissing": "ffmpeg not found — the PNG sequence and an encoding script will be generated instead.",

      "btn.preview":       "Preview frame",
      "btn.generate":      "Generate",
      "btn.close":         "Close",
      "lang.label":        "Language:",

      "err.noFrames":      "Add at least 2 light frames.",
      "err.noZoomImage":   "Choose a plate-solved final image for Zoom Odyssey.",
      "err.noOutput":      "Choose an output folder.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 frames, style: %3",
      "run.styleTimelapse": "timelapse",
      "run.styleStacking": "progressive stack",
      "run.styleZoom":     "zoom odyssey",
      "zoom.solved":       "Plate solve read: field %1, center RA %2° Dec %3°.",
      "zoom.noCatalogs":   "Star/constellation catalogs not found in the PixInsight install — the sky will be sparse.",
      "zoom.errUnsolved":  "This image has no astrometric solution. Solve it first (Script > Image Analysis > ImageSolver), then run Session Cinema again.",
      "run.pass1":         "Pass 1 of 2 — integrating %1 frames to compute the reference stretch…",
      "run.pass1Done":     "Reference stretch computed on the final stack.",
      "run.render":        "Rendered %1 / %2 (%3)",
      "run.skipped":       "Skipped (unreadable or geometry mismatch): %1",
      "run.aborted":       "Aborted by user. %1 frame(s) were rendered.",
      "run.encoding":      "Encoding video with ffmpeg…",
      "run.encodeOk":      "Video written: %1",
      "run.encodeFail":    "ffmpeg failed (exit code %1). The PNG sequence and %2 are left for manual encoding.",
      "run.encodeScript":  "ffmpeg not available — PNG sequence kept, run %1 to encode.",
      "run.framesKept":    "Frame sequence: %1",
      "run.done":          "Done. %1 frame(s) rendered in %2.",
      "run.previewDone":   "Preview written and opened: %1"
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
      "style.timelapse":   "Timelapse — une image vidéo par brute (nuages, météores, rotation de champ)",
      "style.stacking":    "Empilement progressif — l'intégration se construit de 1 à N brutes",
      "style.stackNote":   "Le mode empilement attend des brutes alignées (ex. la sortie registered de WBPP). " +
                           "Des brutes non alignées donneront des étoiles qui dérivent, pas un empilement propre.",
      "style.zoom":        "Zoom Odyssey — « tu es ici » : ciel entier → constellation → ton image se révèle",
      "style.zoomNote":    "Nécessite une image résolue astrométriquement (un master WBPP l'est déjà). " +
                           "Son WCS embarqué pilote le zoom ; le ciel est tracé depuis les catalogues fournis avec PixInsight.",
      "zoom.image":        "Image finale :",
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
      "overlay.time":      "Horloge TU (timelapse)",
      "overlay.snr":       "Gain de SNR mesuré (empilement)",
      "overlay.bar":       "Barre de progression",
      "overlay.scale":     "Barre d'échelle angulaire (zoom)",
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

      "out.title":         "Sortie",
      "out.dir":           "Dossier :",
      "out.browse":        "Parcourir…",
      "out.keepFrames":    "Conserver la séquence PNG",
      "out.ffmpeg":        "ffmpeg :",
      "out.detect":        "Détecter",
      "out.ffmpegFound":   "ffmpeg trouvé : %1",
      "out.ffmpegMissing": "ffmpeg introuvable — la séquence PNG et un script d'encodage seront générés.",

      "btn.preview":       "Aperçu d'une image",
      "btn.generate":      "Générer",
      "btn.close":         "Fermer",
      "lang.label":        "Langue :",

      "err.noFrames":      "Ajoutez au moins 2 brutes.",
      "err.noZoomImage":   "Choisissez une image finale résolue astrométriquement pour Zoom Odyssey.",
      "err.noOutput":      "Choisissez un dossier de sortie.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 brutes, style : %3",
      "run.styleTimelapse": "timelapse",
      "run.styleStacking": "empilement progressif",
      "run.styleZoom":     "zoom odyssey",
      "zoom.solved":       "Solve astrométrique lu : champ %1, centre AD %2° Déc %3°.",
      "zoom.noCatalogs":   "Catalogues d'étoiles/constellations introuvables dans l'install PixInsight — le ciel sera clairsemé.",
      "zoom.errUnsolved":  "Cette image n'a pas de solution astrométrique. Résolvez-la d'abord (Script > Image Analysis > ImageSolver), puis relancez Session Cinema.",
      "run.pass1":         "Passe 1 sur 2 — intégration des %1 brutes pour calculer l'étirement de référence…",
      "run.pass1Done":     "Étirement de référence calculé sur le stack final.",
      "run.render":        "Rendu %1 / %2 (%3)",
      "run.skipped":       "Ignorées (illisibles ou géométrie différente) : %1",
      "run.aborted":       "Interrompu par l'utilisateur. %1 image(s) rendues.",
      "run.encoding":      "Encodage de la vidéo avec ffmpeg…",
      "run.encodeOk":      "Vidéo écrite : %1",
      "run.encodeFail":    "Échec ffmpeg (code %1). La séquence PNG et %2 restent disponibles pour un encodage manuel.",
      "run.encodeScript":  "ffmpeg indisponible — séquence PNG conservée, lancez %1 pour encoder.",
      "run.framesKept":    "Séquence d'images : %1",
      "run.done":          "Terminé. %1 image(s) rendues en %2.",
      "run.previewDone":   "Aperçu écrit et ouvert : %1"
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
   if ( info.style == STYLE_STACKING )
   {
      var parts = [];
      if ( cfg.ovShowCounter )
         parts.push( info.index + ( info.exposure > 0 ? " × " + Math.round( info.exposure ) + " s" : "" ) );
      if ( cfg.ovShowExposure && info.cumulativeExposure > 0 )
         parts.push( formatDuration( info.cumulativeExposure ) );
      if ( cfg.ovShowSnr )
      {
         var db = formatSnrGainDb( info.sigmaFirst, info.sigmaCurrent );
         if ( db.length )
            parts.push( "SNR " + db );
      }
      if ( parts.length )
         subLeft.push( parts.join( "  ·  " ) );
      if ( cfg.ovShowCounter )
         right.push( info.index + "/" + info.total );
   }
   else
   {
      var tparts = [];
      if ( cfg.ovShowTime && info.dateObs !== null && info.dateObs !== undefined )
         tparts.push( "UT " + formatClockUT( info.dateObs ) );
      if ( cfg.ovShowCounter )
         tparts.push( info.index + "/" + info.total );
      if ( tparts.length )
         right.push( tparts.join( "  ·  " ) );
      if ( cfg.ovShowExposure && info.cumulativeExposure > 0 )
         subLeft.push( formatDuration( info.cumulativeExposure ) );
   }
   return {
      title: ( info.title !== undefined ) ? info.title : ( cfg.ovTitle || "" ),
      subLeft: subLeft.join( "  ·  " ),
      right: right.join( "  ·  " ),
      signature: cfg.ovSignature || "",
      progress: cfg.ovShowBar ? ( info.total > 0 ? info.index/info.total : 0 ) : -1
   };
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
   var meta = { dateObs: null, exposure: 0, object: "", filter: "", cfa: false };
   meta.dateObs = parseDateObs( kwValue( map[ "DATE-OBS" ] ) );
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

// Camera: looking at (ra0,dec0), showing fovDeg across the width, rolled by
// rollDeg, onto a WxH frame. RA increases to the left (sky-chart convention),
// north is up.
function makeCamera( ra0, dec0, fovDeg, rollDeg, W, H )
{
   return { ra0: ra0, dec0: dec0, fovDeg: fovDeg, rollDeg: rollDeg, W: W, H: H };
}

// Stereographic projection of a sky point to screen pixels — stable from an
// all-sky view down to a fraction of a degree. Returns { x, y, front }.
function projectToScreen( cam, ra, dec )
{
   var a0 = deg2rad( cam.ra0 ), d0 = deg2rad( cam.dec0 );
   var a = deg2rad( ra ), d = deg2rad( dec );
   var da = a - a0;
   var cosc = Math.sin( d0 )*Math.sin( d ) + Math.cos( d0 )*Math.cos( d )*Math.cos( da );
   var k = 2/( 1 + cosc );
   var xp = k*Math.cos( d )*Math.sin( da );                                          // east +
   var yp = k*( Math.cos( d0 )*Math.sin( d ) - Math.sin( d0 )*Math.cos( d )*Math.cos( da ) ); // north +
   var rEdge = 2*Math.tan( deg2rad( cam.fovDeg/2 )/2 );
   var s = ( cam.W/2 )/rEdge;
   var cr = Math.cos( deg2rad( cam.rollDeg ) ), sr = Math.sin( deg2rad( cam.rollDeg ) );
   var rx = xp*cr - yp*sr;
   var ry = xp*sr + yp*cr;
   return {
      x: cam.W/2 - s*rx,     // higher RA (east) to the left
      y: cam.H/2 - s*ry,     // north up
      front: cosc > -0.2
   };
}

// Camera along the zoom at normalized time t in [0,1]: center fixed on the
// target, FOV shrinking log-linearly (a "powers of ten" feel), north kept up
// so the image drops in at its true orientation on reveal.
function zoomCameraAt( t, target, startFovDeg, W, H )
{
   var e = smoothstep01( t );
   var fov = Math.exp( Math.log( startFovDeg )*( 1 - e ) + Math.log( target.fovDeg )*e );
   return makeCamera( target.centerRA, target.centerDec, fov, 0, W, H );
}

// Opacity of the real-image reveal as the FOV approaches the image field. The
// image starts appearing several times wider than its own field: its dense,
// real stars bridge the range where the bright-star catalog runs thin, so the
// zoom never crosses an empty gap — and every star shown there is genuine.
function revealAlpha( fovDeg, imageFovDeg )
{
   var wide = imageFovDeg*6;
   if ( fovDeg <= imageFovDeg ) return 1;
   if ( fovDeg >= wide ) return 0;
   return smoothstep01( ( wide - fovDeg )/( wide - imageFovDeg ) );
}

// Opacity of the constellation figures: absent on the whole-sky shot, strongest
// at medium fields, gone once we dive into the target field.
function constellationAlpha( fovDeg )
{
   var inA = 120, inB = 70, outA = 12, outB = 6;
   if ( fovDeg >= inA ) return 0;
   if ( fovDeg > inB ) return smoothstep01( ( inA - fovDeg )/( inA - inB ) );
   if ( fovDeg >= outA ) return 1;
   if ( fovDeg > outB ) return smoothstep01( ( fovDeg - outB )/( outA - outB ) );
   return 0;
}

// Limiting magnitude shown at a given FOV: brighter-only wide, deeper closer in
// (NamedStars runs out near mag 7).
function limitingMagnitude( fovDeg )
{
   var f = Math.min( 60, Math.max( 5, fovDeg ) );
   return 5.5 + 1.5*smoothstep01( ( 60 - f )/55 );
}

// Dot radius (px) for a star of given magnitude at the given magnitude limit.
function starRadius( mag, magLimit, unit )
{
   var b = magLimit - mag;
   if ( b <= 0 ) return 0;
   return Math.max( 0.4*unit, 0.5*unit*Math.pow( b, 0.7 ) );
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
function scaleBar( fovDeg, W )
{
   var ang = niceAngle( fovDeg*0.25 );
   return { label: formatAngle( ang ), lengthPx: ang*( W/fovDeg ) };
}

// NamedStars.csv / Messier.csv share "id,alpha(deg),delta(deg),magnitude,..."
// -> [{ ra, dec, mag }], optionally magnitude-limited.
function parseStarCatalog( csvText, maxMag )
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
      out.push( { ra: ra, dec: dec, mag: mag } );
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
                 dateObs: null, exposure: 0, object: "", filter: "", cfa: false };
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
         frame.exposure = meta.exposure;
         frame.object = meta.object;
         frame.filter = meta.filter;
         frame.cfa = meta.cfa;
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

// Load the bundled catalogs once. Returns { stars, polys, ok }.
var gZoomCatalogs = null;
function loadZoomCatalogs()
{
   if ( gZoomCatalogs != null )
      return gZoomCatalogs;
   var root = piInstallRoot();
   var cat = { root: root, stars: [], polys: [], ok: false };
   if ( root.length )
   {
      cat.stars = parseStarCatalog( readTextFileSafe( root + "/include/pjsr/astrometry/NamedStars.csv" ), 7.0 );
      var linesText = readTextFileSafe( root + "/src/scripts/AnnotateImage/ConstellationLines.json" );
      if ( linesText.length )
         try { cat.polys = parseConstellationLines( linesText ); } catch ( e ) {}
      cat.ok = cat.stars.length > 0;
   }
   gZoomCatalogs = cat;
   return cat;
}

// Overlay renderer. All facts come precomputed in `ov` (buildOverlayInfo).
function drawOverlay( g, W, H, ov )
{
   var u = H/1080;
   var margin = Math.round( 40*u );
   var hasBottom = ov.title.length || ov.subLeft.length || ov.right.length;

   if ( hasBottom )
   {
      // Pseudo-gradient scrim: three stacked translucent bands.
      var scrimTop = H - Math.round( 150*u );
      g.fillRect( new Rect( 0, scrimTop, W, H ), new Brush( 0x26000000 ) );
      g.fillRect( new Rect( 0, scrimTop + Math.round( 50*u ), W, H ), new Brush( 0x33000000 ) );
      g.fillRect( new Rect( 0, scrimTop + Math.round( 100*u ), W, H ), new Brush( 0x40000000 ) );
   }

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

function frameFileName( index )
{
   var s = String( index );
   while ( s.length < 5 )
      s = "0" + s;
   return "frame_" + s + ".png";
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
function runExternal( program, args, timeoutMs, keepUiAlive )
{
   var result = { started: false, exitCode: -1 };
   try
   {
      var P = new ExternalProcess;
      P.start( program, args );
      // A program that fails to launch still reports exitCode 0 (Qt trap):
      // require an actual start before trusting anything else.
      try
      {
         if ( !P.waitForStarted( 5000 ) )
            return result;
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
         if ( keepUiAlive )
            processEvents();
         if ( timeoutMs > 0 && waited >= timeoutMs )
         {
            try { P.kill(); } catch ( e ) {}
            return result;
         }
         if ( !P.isRunning )
            break;
      }
      result.started = true;
      result.exitCode = P.exitCode;
   }
   catch ( e )
   {
      // Program not found or failed to start.
   }
   return result;
}

function detectFfmpeg( userPath )
{
   var candidates = [];
   if ( userPath && userPath.length )
      candidates.push( userPath );
   if ( platformKind() == "windows" )
   {
      candidates.push( "ffmpeg.exe" );
      candidates.push( "ffmpeg" );
      candidates.push( "C:/ffmpeg/bin/ffmpeg.exe" );
   }
   else
   {
      candidates.push( "ffmpeg" );
      candidates.push( "/usr/bin/ffmpeg" );
      candidates.push( "/usr/local/bin/ffmpeg" );
      candidates.push( "/opt/homebrew/bin/ffmpeg" );
   }
   for ( var i = 0; i < candidates.length; ++i )
   {
      var r = runExternal( candidates[ i ], [ "-version" ], 10000, false );
      if ( r.started && r.exitCode == 0 )
         return candidates[ i ];
   }
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
   this.rendered = 0;
   this.aborted = false;
}

Engine.prototype.baseName = function()
{
   var slug = slugify( this.title || "session" );
   var style = ( this.cfg.style == STYLE_TIMELAPSE ) ? "timelapse"
             : ( this.cfg.style == STYLE_ZOOM ) ? "zoom" : "stack";
   return slug + "-" + style;
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

Engine.prototype.saveFrame = function( bmp, index )
{
   var path = this.framesDir() + "/" + frameFileName( index );
   bmp.save( path );
   ++this.rendered;
   return path;
};

// --------------------------------------------------------------------------
// Timelapse: each sub is stretched and rendered as one video frame.
Engine.prototype.runTimelapse = function()
{
   var cfg = this.cfg;
   var fixedStretch = null;
   var cumExposure = 0;
   var outIndex = 0;
   for ( var i = 0; i < this.frames.length; ++i )
   {
      if ( this.checkAbort() )
         break;
      var frame = this.frames[ i ];
      var win = this.openFrame( frame );
      if ( win == null )
         continue;
      var stretch;
      if ( cfg.stretchRef == STRETCH_REF_EACH )
         stretch = computeStretchForImage( win.mainView.image, cfg.stretchLinked );
      else
      {
         if ( fixedStretch == null )
            fixedStretch = computeStretchForImage( win.mainView.image, cfg.stretchLinked );
         stretch = fixedStretch;
      }
      applyStretchToView( win.mainView, stretch );
      cumExposure += frame.exposure;
      var ov = buildOverlayInfo( cfg, {
         style: STYLE_TIMELAPSE,
         index: i + 1,
         total: this.frames.length,
         cumulativeExposure: cumExposure,
         exposure: frame.exposure,
         dateObs: frame.dateObs,
         sigmaFirst: 0,
         sigmaCurrent: 0,
         title: this.title
      } );
      var bmp = renderOutputBitmap( win.mainView, cfg, ov );
      win.forceClose();
      this.saveFrame( bmp, ++outIndex );
      console.writeln( tr( "run.render", outIndex, this.frames.length, frame.name ) );
      if ( ( outIndex & 7 ) == 0 )
         gc();
   }
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
      var meanFinal = makeWorkWindow( acc1.mainView.image, "__sc_meanF" );
      acc1.forceClose();
      meanFinal.mainView.beginProcess( UndoFlag.NoSwapFile );
      meanFinal.mainView.image.apply( 1.0/n1, ImageOp.Mul );
      meanFinal.mainView.endProcess();
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
   var sigmaFirst = 0;
   var cumExposure = 0;
   var meanExposure = 0;
   var outIndex = 0;
   var totalRenders = indices.length;

   acc.mainView.beginProcess( UndoFlag.NoSwapFile );
   this.accumulate( acc, function( n, frameIndex, accImg )
   {
      var frame = self.frames[ frameIndex ];
      cumExposure += frame.exposure;
      if ( frame.exposure > 0 )
         meanExposure = cumExposure/n;
      if ( !renderSet[ n ] )
         return;

      var mean = makeWorkWindow( accImg, "__sc_mean" );
      mean.mainView.beginProcess( UndoFlag.NoSwapFile );
      mean.mainView.image.apply( 1.0/n, ImageOp.Mul );
      mean.mainView.endProcess();

      var sigma = estimateSigma( mean.mainView.image );
      if ( n == 1 || sigmaFirst <= 0 )
         sigmaFirst = sigma;

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
         style: STYLE_STACKING,
         index: n,
         total: N,
         cumulativeExposure: cumExposure,
         exposure: meanExposure,
         dateObs: frame.dateObs,
         sigmaFirst: sigmaFirst,
         sigmaCurrent: sigma,
         title: self.title
      } );
      var bmp = renderOutputBitmap( mean.mainView, cfg, ov );
      mean.forceClose();
      self.saveFrame( bmp, ++outIndex );
      console.writeln( tr( "run.render", outIndex, totalRenders, frame.name ) );
   } );
   acc.mainView.endProcess();
   acc.forceClose();
   gc();
};

// --------------------------------------------------------------------------
// Zoom Odyssey: whole sky -> constellation -> field -> the image revealing
// itself, driven by the plate solve of the final image.
Engine.prototype.runZoom = function()
{
   var cfg = this.cfg;
   this.zoomError = "";

   var meta = scanFrameHeader( cfg.zoomImagePath );
   this.title = ( cfg.ovTitle && String( cfg.ovTitle ).trim().length )
                ? String( cfg.ovTitle ).trim() : ( meta.object || "" );

   var win = null;
   try { win = openFrameWindow( cfg.zoomImagePath ); } catch ( e ) { win = null; }
   if ( win == null )
   {
      this.zoomError = "open";
      this.skipped.push( meta.name );
      return;
   }
   var view = win.mainView;
   var imgW = view.image.width, imgH = view.image.height;

   var wcs = readImageWcs( view );
   if ( wcs == null )
   {
      win.forceClose();
      this.zoomError = "unsolved";
      return;
   }
   var framing = wcsImageFraming( wcs, imgW, imgH );
   console.noteln( tr( "zoom.solved", formatAngle( framing.fovDeg ),
                       framing.centerRA.toFixed( 3 ), framing.centerDec.toFixed( 3 ) ) );
   if ( !File.directoryExists( this.framesDir() ) )
      File.createDirectory( this.framesDir(), true );

   // Revealed image: a stretched copy rendered once to a bitmap.
   var stretch = computeStretchForImage( view.image, cfg.stretchLinked );
   applyStretchToView( view, stretch );
   var revealBmp = view.image.render();
   win.forceClose();
   gc();

   var cat = loadZoomCatalogs();
   if ( !cat.ok )
      console.warningln( tr( "zoom.noCatalogs" ) );

   var fmt = OUTPUT_FORMATS[ cfg.formatIndex ];
   var W = fmt.w, H = fmt.h, unit = H/1080;
   var startFov = Math.max( framing.fovDeg*4, Math.min( 180, cfg.zoomStartFov || 180 ) );
   var N = Math.max( 2, Math.round( cfg.fps*cfg.targetDuration ) );
   var outIndex = 0;

   for ( var i = 0; i < N; ++i )
   {
      if ( this.checkAbort() )
         break;
      var t = i/( N - 1 );
      var cam = zoomCameraAt( t, framing, startFov, W, H );

      var out = new Bitmap( W, H );
      out.fill( 0xFF05070D );
      var g = new Graphics( out );
      g.antialiasing = true;
      try { g.textAntialiasing = true; } catch ( e ) {}

      drawZoomStars( g, cam, cat.stars, unit );
      drawZoomConstellations( g, cam, cat.polys, unit );
      var ra = revealAlpha( cam.fovDeg, framing.fovDeg );
      if ( ra > 0 )
         drawZoomReveal( g, cam, wcs, imgW, imgH, revealBmp, ra );
      drawZoomOverlay( g, cam, cfg, this.title, t );
      g.end();

      this.saveFrame( out, ++outIndex );
      console.writeln( tr( "run.render", outIndex, N, formatAngle( cam.fovDeg ) ) );
      if ( ( outIndex & 7 ) == 0 )
         gc();
   }
};

Engine.prototype.encode = function()
{
   var cfg = this.cfg;
   var framesPattern = this.framesDir() + "/frame_%05d.png";
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
   var r = runExternal( ffmpeg, args, 0, true );
   // The written file is the ground truth — exit codes can lie (see above).
   if ( r.started && r.exitCode == 0 && File.exists( this.videoPath() ) )
   {
      console.noteln( tr( "run.encodeOk", this.videoPath() ) );
      if ( !cfg.keepFrames )
      {
         var toRemove = [];
         var ff = new FileFind;
         if ( ff.begin( this.framesDir() + "/frame_*.png" ) )
            do
            {
               if ( ff.isFile )
                  toRemove.push( this.framesDir() + "/" + ff.name );
            }
            while ( ff.next() );
         for ( var i = 0; i < toRemove.length; ++i )
            try { File.remove( toRemove[ i ] ); } catch ( e ) {}
      }
      return { encoded: true, scriptPath: scriptPath, videoPath: this.videoPath() };
   }
   console.warningln( tr( "run.encodeFail", r.exitCode, scriptPath ) );
   return { encoded: false, scriptPath: scriptPath };
};

Engine.prototype.run = function()
{
   var t0 = Date.now();
   var cfg = this.cfg;
   console.show();
   try { console.abortEnabled = true; } catch ( e ) {}
   var styleLabel = ( cfg.style == STYLE_TIMELAPSE ) ? tr( "run.styleTimelapse" )
                  : ( cfg.style == STYLE_ZOOM ) ? tr( "run.styleZoom" )
                  : tr( "run.styleStacking" );
   var inputCount = ( cfg.style == STYLE_ZOOM ) ? 1 : this.frames.length;
   console.noteln( tr( "run.start", SC_VERSION, inputCount, styleLabel ) );
   // Zoom resolves its title (hence its output dir) from the image header
   // inside runZoom, so it creates its own directory there.
   if ( cfg.style != STYLE_ZOOM && !File.directoryExists( this.framesDir() ) )
      File.createDirectory( this.framesDir(), true );

   if ( cfg.style == STYLE_TIMELAPSE )
      this.runTimelapse();
   else if ( cfg.style == STYLE_ZOOM )
      this.runZoom();
   else
      this.runStacking();

   var result = { ok: false, rendered: this.rendered, skipped: this.skipped.slice(),
                  aborted: this.aborted, videoPath: "", scriptPath: "",
                  framesDir: this.framesDir() };

   if ( this.zoomError == "unsolved" )
   {
      console.criticalln( tr( "zoom.errUnsolved" ) );
      return result;
   }
   if ( this.skipped.length )
      console.warningln( tr( "run.skipped", this.skipped.join( ", " ) ) );
   if ( this.aborted )
   {
      console.warningln( tr( "run.aborted", this.rendered ) );
      return result;
   }
   if ( this.rendered == 0 )
      return result;

   var enc = this.encode();
   result.ok = true;
   result.videoPath = enc.encoded ? enc.videoPath : "";
   result.scriptPath = enc.scriptPath || "";
   if ( cfg.keepFrames || !enc.encoded )
      console.writeln( tr( "run.framesKept", this.framesDir() ) );
   console.noteln( tr( "run.done", this.rendered, formatDuration( ( Date.now() - t0 )/1000 ) ) );
   return result;
};

// Render a single overlay preview (middle frame) without touching the video.
Engine.prototype.preview = function()
{
   var mid = Math.floor( this.frames.length/2 );
   var frame = this.frames[ mid ];
   var win = this.openFrame( frame );
   if ( win == null )
      return "";
   var stretch = computeStretchForImage( win.mainView.image, this.cfg.stretchLinked );
   applyStretchToView( win.mainView, stretch );
   var cumExposure = 0;
   for ( var i = 0; i <= mid; ++i )
      cumExposure += this.frames[ i ].exposure;
   var ov = buildOverlayInfo( this.cfg, {
      style: this.cfg.style,
      index: mid + 1,
      total: this.frames.length,
      cumulativeExposure: cumExposure,
      exposure: frame.exposure,
      dateObs: frame.dateObs,
      sigmaFirst: 1,
      sigmaCurrent: 1/Math.sqrt( mid + 1 ),
      title: this.title
   } );
   var bmp = renderOutputBitmap( win.mainView, this.cfg, ov );
   win.forceClose();
   var path = ( this.cfg.outputDir.length ? this.cfg.outputDir
                                          : File.systemTempDirectory ) + "/SessionCinema-preview.png";
   bmp.save( path );
   return path;
};

// ============================================================================
// ZOOM ODYSSEY — frame rendering
// ============================================================================

function argb( alpha, rgb )
{
   var a = Math.round( clamp01( alpha )*255 );
   return ( a*0x1000000 ) + ( rgb & 0xFFFFFF );
}

// Stars from the bright-star catalog, deepening as we zoom in.
function drawZoomStars( g, cam, stars, unit )
{
   var magLimit = limitingMagnitude( cam.fovDeg );
   for ( var i = 0; i < stars.length; ++i )
   {
      var st = stars[ i ];
      if ( st.mag > magLimit )
         continue;
      var p = projectToScreen( cam, st.ra, st.dec );
      if ( !p.front || p.x < -8 || p.x > cam.W + 8 || p.y < -8 || p.y > cam.H + 8 )
         continue;
      var r = starRadius( st.mag, magLimit, unit );
      if ( r <= 0 )
         continue;
      var a = 0.25 + 0.75*clamp01( ( magLimit - st.mag )/magLimit );
      g.brush = new Brush( argb( a, 0xFFFFFF ) );
      g.fillCircle( p.x, p.y, r );
   }
}

// Constellation figure lines, fading in around the constellation phase.
function drawZoomConstellations( g, cam, polys, unit )
{
   var alpha = constellationAlpha( cam.fovDeg );
   if ( alpha <= 0 )
      return;
   g.pen = new Pen( argb( 0.45*alpha, 0x7FD8F0 ), Math.max( 1, 1.3*unit ) );
   var maxSeg = cam.W*0.6;   // drop segments that wrap across the whole sky
   for ( var i = 0; i < polys.length; ++i )
   {
      var pts = polys[ i ];
      var prev = null;
      for ( var j = 0; j < pts.length; ++j )
      {
         var p = projectToScreen( cam, pts[ j ].ra, pts[ j ].dec );
         if ( p.front && prev != null )
         {
            var dx = p.x - prev.x, dy = p.y - prev.y;
            if ( dx*dx + dy*dy < maxSeg*maxSeg )
               g.drawLine( prev.x, prev.y, p.x, p.y );
         }
         prev = p.front ? p : null;
      }
   }
}

// Place the revealed image at its true on-sky position, orientation and scale.
// The projection is conformal, so a translate/rotate/scale (with a parity flip)
// reproduces it faithfully over the ~1° image field.
function drawZoomReveal( g, cam, wcs, imgW, imgH, bmp, alpha )
{
   function scr( px, py )
   {
      var s = wcsPixelToSky( wcs, px, py );
      return projectToScreen( cam, s.ra, s.dec );
   }
   var c  = scr( imgW/2, imgH/2 );
   var ex = scr( imgW, imgH/2 );
   var ey = scr( imgW/2, 0 );
   var ux = ( ex.x - c.x )/( imgW/2 ), uy = ( ex.y - c.y )/( imgW/2 );
   var scale = Math.sqrt( ux*ux + uy*uy );
   if ( !( scale > 0 ) || !c.front )
      return;
   var angle = Math.atan2( uy, ux );
   var wyx = ( ey.x - c.x )/( -imgH/2 ), wyy = ( ey.y - c.y )/( -imgH/2 );
   var flip = ( ux*wyy - uy*wyx < 0 ) ? -1 : 1;
   var prevOp = g.opacity;
   g.opacity = clamp01( alpha );
   g.resetTransformation();
   g.translateTransformation( c.x, c.y );
   g.rotateTransformation( angle );
   g.scaleTransformation( scale, scale*flip );
   g.drawBitmap( -imgW/2, -imgH/2, bmp );
   g.resetTransformation();
   g.opacity = prevOp;
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

   var scrimTop = H - Math.round( 150*u );
   g.fillRect( new Rect( 0, scrimTop, W, H ), new Brush( 0x26000000 ) );
   g.fillRect( new Rect( 0, scrimTop + Math.round( 50*u ), W, H ), new Brush( 0x33000000 ) );
   g.fillRect( new Rect( 0, scrimTop + Math.round( 100*u ), W, H ), new Brush( 0x40000000 ) );

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
      var sb = scaleBar( cam.fovDeg, W );
      var bx1 = W - margin, bx0 = bx1 - sb.lengthPx, by = H - margin;
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

      // ---- style group ----
      this.styleTimelapseRadio = new RadioButton( this );
      this.styleTimelapseRadio.text = tr( "style.timelapse" );
      this.styleTimelapseRadio.checked = ( cfg.style == STYLE_TIMELAPSE );
      this.styleTimelapseRadio.onCheck = ( checked ) =>
      {
         if ( checked )
         {
            self.cfg.style = STYLE_TIMELAPSE;
            self.updateStyleDependents();
         }
      };

      this.styleStackingRadio = new RadioButton( this );
      this.styleStackingRadio.text = tr( "style.stacking" );
      this.styleStackingRadio.checked = ( cfg.style == STYLE_STACKING );
      this.styleStackingRadio.onCheck = ( checked ) =>
      {
         if ( checked )
         {
            self.cfg.style = STYLE_STACKING;
            self.updateStyleDependents();
         }
      };

      this.styleZoomRadio = new RadioButton( this );
      this.styleZoomRadio.text = tr( "style.zoom" );
      this.styleZoomRadio.checked = ( cfg.style == STYLE_ZOOM );
      this.styleZoomRadio.onCheck = ( checked ) =>
      {
         if ( checked )
         {
            self.cfg.style = STYLE_ZOOM;
            self.updateStyleDependents();
         }
      };

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
      this.zoomImageEdit.onTextUpdated = ( t ) => { self.cfg.zoomImagePath = t; };
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
            self.zoomImageEdit.text = d.fileNames[ 0 ];
         }
      };
      this.zoomImageSizer = new HorizontalSizer;
      this.zoomImageSizer.spacing = 6;
      this.zoomImageSizer.add( this.zoomImageLabel );
      this.zoomImageSizer.add( this.zoomImageEdit, 100 );
      this.zoomImageSizer.add( this.zoomImageBrowse );

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

      this.styleGroup = new GroupBox( this );
      this.styleGroup.title = tr( "style.title" );
      this.styleGroup.sizer = new VerticalSizer;
      this.styleGroup.sizer.margin = 8;
      this.styleGroup.sizer.spacing = 6;
      this.styleGroup.sizer.add( this.styleTimelapseRadio );
      this.styleGroup.sizer.add( this.styleStackingRadio );
      this.styleGroup.sizer.add( this.stackNote );
      this.styleGroup.sizer.add( this.styleZoomRadio );
      this.styleGroup.sizer.add( this.zoomNote );
      this.styleGroup.sizer.add( this.zoomImageSizer );
      this.styleGroup.sizer.add( this.stretchSizer );
      this.styleGroup.sizer.add( this.linkedCheck );
      this.styleGroup.sizer.add( this.debayerCheck );

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
      this.formatCombo.onItemSelected = ( idx ) => { self.cfg.formatIndex = idx; };
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
      this.ffmpegDetect = new PushButton( this );
      this.ffmpegDetect.text = tr( "out.detect" );
      this.ffmpegDetect.onClick = () => this.onDetectFfmpeg();
      this.ffmpegSizer = new HorizontalSizer;
      this.ffmpegSizer.spacing = 6;
      this.ffmpegSizer.add( this.ffmpegLabel );
      this.ffmpegSizer.add( this.ffmpegEdit, 100 );
      this.ffmpegSizer.add( this.ffmpegDetect );

      this.ffmpegStatus = new Label( this );
      this.ffmpegStatus.text = "";
      this.ffmpegStatus.wordWrapping = true;

      this.outGroup = new GroupBox( this );
      this.outGroup.title = tr( "out.title" );
      this.outGroup.sizer = new VerticalSizer;
      this.outGroup.sizer.margin = 8;
      this.outGroup.sizer.spacing = 6;
      this.outGroup.sizer.add( this.outSizer );
      this.outGroup.sizer.add( this.keepFramesCheck );
      this.outGroup.sizer.add( this.ffmpegSizer );
      this.outGroup.sizer.add( this.ffmpegStatus );

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

      this.previewButton = new PushButton( this );
      this.previewButton.text = tr( "btn.preview" );
      this.previewButton.onClick = () => this.onPreview();

      this.generateButton = new PushButton( this );
      this.generateButton.text = tr( "btn.generate" );
      this.generateButton.defaultButton = true;
      this.generateButton.onClick = () => this.onGenerate();

      this.closeButton = new PushButton( this );
      this.closeButton.text = tr( "btn.close" );
      this.closeButton.onClick = () => this.cancel();

      this.bottomSizer = new HorizontalSizer;
      this.bottomSizer.spacing = 6;
      this.bottomSizer.add( this.langLabel );
      this.bottomSizer.add( this.langCombo );
      this.bottomSizer.addStretch();
      this.bottomSizer.add( this.previewButton );
      this.bottomSizer.addSpacing( 12 );
      this.bottomSizer.add( this.generateButton );
      this.bottomSizer.add( this.closeButton );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 8;
      this.sizer.add( this.helpLabel );
      this.sizer.add( this.framesGroup, 100 );
      this.sizer.add( this.styleGroup );
      this.sizer.add( this.overlayGroup );
      this.sizer.add( this.videoGroup );
      this.sizer.add( this.outGroup );
      this.sizer.add( this.bottomSizer );

      this.adjustToContents();
      this.autofillTitle();   // frames may already be loaded (e.g. language reload)
      this.refreshTree();
      this.updateStyleDependents();
      this.onDetectFfmpeg();
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
      var count2, seconds2;
      if ( this.cfg.style == STYLE_TIMELAPSE )
      {
         count2 = N;
         seconds2 = N/this.cfg.fps;
      }
      else
      {
         var idx = computeRenderIndices( N, this.cfg.fps, this.cfg.targetDuration );
         count2 = idx.length;
         seconds2 = count2/this.cfg.fps;
      }
      seconds2 += this.cfg.holdFirst + this.cfg.holdLast;
      this.estimateLabel.text = tr( "video.estimate", count2, formatDuration( seconds2 ), this.cfg.fps );
   }

   updateStyleDependents()
   {
      var isStack = ( this.cfg.style == STYLE_STACKING );
      var isZoom = ( this.cfg.style == STYLE_ZOOM );
      this.stackNote.visible = isStack;
      this.zoomNote.visible = isZoom;
      // Frame list is irrelevant to Zoom Odyssey; it works from one solved image.
      this.zoomImageLabel.visible = isZoom;
      this.zoomImageEdit.visible = isZoom;
      this.zoomImageBrowse.visible = isZoom;
      this.framesGroup.visible = !isZoom;
      // Per-style overlay items.
      this.snrCheck.enabled = isStack;
      this.timeCheck.enabled = !isStack && !isZoom;
      this.counterCheck.enabled = !isZoom;
      this.exposureCheck.enabled = !isZoom;
      this.scaleCheck.enabled = isZoom;
      this.subtitleLabel.enabled = isZoom;
      this.subtitleEdit.enabled = isZoom;
      this.distanceLabel.enabled = isZoom;
      this.distanceEdit.enabled = isZoom;
      this.debayerCheck.enabled = !isZoom;
      this.durationSpin.enabled = isStack || isZoom;
      this.durationLabel.enabled = isStack || isZoom;
      // Preview renders a middle sub; meaningless for a zoom (one image only).
      if ( this.previewButton )
         this.previewButton.enabled = !isZoom;
      this.updateEstimate();
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
   // stale hand-typed name in a later session with different data.
   persistableConfig()
   {
      var c = {};
      for ( var k in this.cfg )
         c[ k ] = this.cfg[ k ];
      if ( !this.titleTouched )
         c.ovTitle = "";
      return c;
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

   onPreview()
   {
      if ( !this.validate( false ) )
         return;
      saveConfig( this.persistableConfig() );
      var engine = new Engine( this.cfg, this.frames );
      var path = engine.preview();
      if ( path.length )
      {
         console.show();
         console.noteln( tr( "run.previewDone", path ) );
         try
         {
            var ws = ImageWindow.open( path );
            if ( ws && ws.length )
               ws[ 0 ].show();
         }
         catch ( e )
         {
         }
      }
   }

   onGenerate()
   {
      if ( !this.validate( true ) )
         return;
      saveConfig( this.persistableConfig() );
      this.wantsGenerate = true;
      this.ok();
   }
}

// ============================================================================
// HEADLESS HOOK — SESSIONCINEMA_AUTORUN=/path/to/config.json runs the engine
// without a dialog and writes <outputDir>/sessioncinema-result.json. This is
// the automation entry used by the two-gate validation runs (PJSR-NOTES §8).
// ============================================================================

function runHeadless( cfgPath )
{
   var result = { ok: false, rendered: 0, skipped: [], videoPath: "", framesDir: "", error: "" };
   var marker = "";
   try
   {
      var raw = File.readTextFile( cfgPath );
      var user = JSON.parse( raw );
      var cfg = {};
      for ( var k in DEFAULT_CONFIG )
         cfg[ k ] = user.hasOwnProperty( k ) ? user[ k ] : DEFAULT_CONFIG[ k ];
      gLanguage = cfg.language || "en";
      marker = user.marker || ( cfg.outputDir + "/sessioncinema-result.json" );
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
   }
   catch ( e )
   {
      result.error = e.message || String( e );
   }
   if ( marker.length )
      try { File.writeTextFile( marker, JSON.stringify( result ) ); } catch ( e2 ) {}
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
   gLanguage = cfg.language || "en";

   var frames = [];
   for ( ;; )
   {
      var dialog = new SessionCinemaDialog( cfg, frames );
      var accepted = dialog.execute();
      frames = dialog.frames;
      if ( dialog.wantsLanguageReload )
      {
         // Drop any auto-derived title so the reopened dialog re-derives it
         // (and its touched-state) cleanly from the same frames.
         cfg = dialog.persistableConfig();
         continue;
      }
      cfg = dialog.cfg;
      if ( !accepted || !dialog.wantsGenerate )
         return;
      saveConfig( dialog.persistableConfig() );
      var engine = new Engine( cfg, frames );
      engine.run();
      return;
   }
}

main();
