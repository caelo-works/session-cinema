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
   ffmpegPath:      ""
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
      "stretch.label":     "Screen stretch:",
      "stretch.final":     "Fixed, computed on the final stack (2 passes — honest noise progression)",
      "stretch.first":     "Fixed, computed on the first frame (1 pass, faster)",
      "stretch.each":      "Auto-stretch each rendered frame (brightness may pump)",
      "stretch.linked":    "Linked RGB channels",
      "debayer.check":     "Debayer CFA frames (auto-detected via BAYERPAT)",

      "overlay.title":     "Overlay",
      "overlay.videoTitle": "Title:",
      "overlay.videoTitle.hint": "e.g. M 42 — Orion Nebula",
      "overlay.counter":   "Frame counter",
      "overlay.exposure":  "Cumulative exposure",
      "overlay.time":      "UT clock (timelapse)",
      "overlay.snr":       "Measured SNR gain (stacking)",
      "overlay.bar":       "Progress bar",
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
      "err.noOutput":      "Choose an output folder.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 frames, style: %3",
      "run.styleTimelapse": "timelapse",
      "run.styleStacking": "progressive stack",
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
      "stretch.label":     "Étirement d'affichage :",
      "stretch.final":     "Fixe, calculé sur le stack final (2 passes — progression du bruit honnête)",
      "stretch.first":     "Fixe, calculé sur la première brute (1 passe, plus rapide)",
      "stretch.each":      "Auto-stretch à chaque image rendue (la luminosité peut pomper)",
      "stretch.linked":    "Canaux RGB liés",
      "debayer.check":     "Dématriçage des brutes CFA (détection via BAYERPAT)",

      "overlay.title":     "Habillage",
      "overlay.videoTitle": "Titre :",
      "overlay.videoTitle.hint": "ex. M 42 — Nébuleuse d'Orion",
      "overlay.counter":   "Compteur d'images",
      "overlay.exposure":  "Exposition cumulée",
      "overlay.time":      "Horloge TU (timelapse)",
      "overlay.snr":       "Gain de SNR mesuré (empilement)",
      "overlay.bar":       "Barre de progression",
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
      "err.noOutput":      "Choisissez un dossier de sortie.",
      "err.title":         "Session Cinema",

      "run.start":         "Session Cinema %1 — %2 brutes, style : %3",
      "run.styleTimelapse": "timelapse",
      "run.styleStacking": "empilement progressif",
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
//         sigmaFirst, sigmaCurrent }
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
      title: cfg.ovTitle || "",
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

// Robust noise estimate (scaled MAD) on the central half of the image.
function estimateSigma( img )
{
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
   var cmd = shellQuote( "ffmpeg" );
   for ( var i = 0; i < ffmpegArgs.length; ++i )
      cmd += " " + shellQuote( ffmpegArgs[ i ] );
   var text = isWin ? ( "@echo off\r\n" + cmd + "\r\npause\r\n" )
                    : ( "#!/bin/sh\n" + cmd + "\n" );
   File.writeTextFile( scriptPath, text );
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
   this.skipped = [];
   this.rendered = 0;
   this.aborted = false;
}

Engine.prototype.baseName = function()
{
   var slug = slugify( this.cfg.ovTitle || "session" );
   var style = ( this.cfg.style == STYLE_TIMELAPSE ) ? "timelapse" : "stack";
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
         sigmaCurrent: 0
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
         sigmaCurrent: sigma
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
   if ( r.started && r.exitCode == 0 )
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
   console.noteln( tr( "run.start", SC_VERSION,
                       this.frames.length,
                       cfg.style == STYLE_TIMELAPSE ? tr( "run.styleTimelapse" )
                                                    : tr( "run.styleStacking" ) ) );
   if ( !File.directoryExists( this.framesDir() ) )
      File.createDirectory( this.framesDir(), true );

   if ( cfg.style == STYLE_TIMELAPSE )
      this.runTimelapse();
   else
      this.runStacking();

   var result = { ok: false, rendered: this.rendered, skipped: this.skipped.slice(),
                  aborted: this.aborted, videoPath: "", scriptPath: "",
                  framesDir: this.framesDir() };

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
      sigmaCurrent: 1/Math.sqrt( mid + 1 )
   } );
   var bmp = renderOutputBitmap( win.mainView, this.cfg, ov );
   win.forceClose();
   var path = ( this.cfg.outputDir.length ? this.cfg.outputDir
                                          : File.systemTempDirectory ) + "/SessionCinema-preview.png";
   bmp.save( path );
   return path;
};

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

      this.stackNote = new Label( this );
      this.stackNote.text = tr( "style.stackNote" );
      this.stackNote.wordWrapping = true;
      this.stackNote.enabled = false;

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
      this.titleEdit.onTextUpdated = ( t ) => { self.cfg.ovTitle = t; };
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

      this.checksRow2 = new HorizontalSizer;
      this.checksRow2.spacing = 12;
      this.checksRow2.add( this.timeCheck );
      this.checksRow2.add( this.snrCheck );
      this.checksRow2.addStretch();

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
      var N = this.frames.length;
      if ( N == 0 )
      {
         this.estimateLabel.text = "";
         return;
      }
      var count, seconds;
      if ( this.cfg.style == STYLE_TIMELAPSE )
      {
         count = N;
         seconds = N/this.cfg.fps;
      }
      else
      {
         var idx = computeRenderIndices( N, this.cfg.fps, this.cfg.targetDuration );
         count = idx.length;
         seconds = count/this.cfg.fps;
      }
      seconds += this.cfg.holdFirst + this.cfg.holdLast;
      this.estimateLabel.text = tr( "video.estimate", count, formatDuration( seconds ), this.cfg.fps );
   }

   updateStyleDependents()
   {
      var isStack = ( this.cfg.style == STYLE_STACKING );
      this.stackNote.visible = isStack;
      this.snrCheck.enabled = isStack;
      this.timeCheck.enabled = !isStack;
      this.durationSpin.enabled = isStack;
      this.durationLabel.enabled = isStack;
      this.updateEstimate();
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
      this.refreshTree();
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
      if ( this.frames.length < 2 )
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
      saveConfig( this.cfg );
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
      saveConfig( this.cfg );
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
      cfg = dialog.cfg;
      if ( dialog.wantsLanguageReload )
         continue;
      if ( !accepted || !dialog.wantsGenerate )
         return;
      saveConfig( cfg );
      var engine = new Engine( cfg, frames );
      engine.run();
      return;
   }
}

main();
