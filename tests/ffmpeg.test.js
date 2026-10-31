// ffmpeg discovery (find on disk, never launch a guess), legacy install dir,
// and what the script may launch or download at all (CPD Program Rules v1.0).
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

function envGetter( vars )
{
   return ( name ) => ( vars[ name ] || "" );
}

const winEnv = envGetter( {
   LOCALAPPDATA: "C:\\Users\\astro\\AppData\\Local",
   ProgramData: "C:\\ProgramData",
   USERPROFILE: "C:\\Users\\astro"
} );
const macEnv = envGetter( { HOME: "/Users/astro" } );
const linuxEnv = envGetter( { HOME: "/home/astro" } );

// Installed binary name
assert.strictEqual( M.ffmpegInstalledName( "windows" ), "ffmpeg.exe" );
assert.strictEqual( M.ffmpegInstalledName( "macos" ), "ffmpeg" );
assert.strictEqual( M.ffmpegInstalledName( "linux" ), "ffmpeg" );

// Legacy install dir (written by 1.1.0 to 1.2.1; never written, offered or run now)
assert.strictEqual( M.legacyFfmpegDir( "windows", winEnv ),
                    "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg" );
// LOCALAPPDATA missing -> derived from USERPROFILE
assert.strictEqual(
   M.legacyFfmpegDir( "windows", envGetter( { USERPROFILE: "C:\\Users\\astro" } ) ),
   "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg" );
assert.strictEqual( M.legacyFfmpegDir( "macos", macEnv ),
                    "/Users/astro/Library/Application Support/CaeloWorks/ffmpeg" );
assert.strictEqual( M.legacyFfmpegDir( "linux", linuxEnv ),
                    "/home/astro/.local/share/caeloworks/ffmpeg" );
// XDG_DATA_HOME wins over the ~/.local/share default
assert.strictEqual(
   M.legacyFfmpegDir( "linux", envGetter( { HOME: "/home/astro", XDG_DATA_HOME: "/data/xdg" } ) ),
   "/data/xdg/caeloworks/ffmpeg" );

// Candidate paths: every PATH directory, then package managers. Never the
// legacy auto-install. Absolute only: finding one must never need a launch.
{
   const env = envGetter( {
      LOCALAPPDATA: "C:\\Users\\astro\\AppData\\Local",
      ProgramData: "C:\\ProgramData",
      USERPROFILE: "C:\\Users\\astro",
      PATH: "C:\\Windows\\system32;\"C:\\Program Files\\ffmpeg\\bin\";;relative\\dir;C:\\tools\\"
   } );
   const c = M.ffmpegCandidatePaths( "windows", env );
   assert.strictEqual( c[ 0 ], "C:/Windows/system32/ffmpeg.exe", "PATH first, in order" );
   assert.strictEqual( c[ 1 ], "C:/Program Files/ffmpeg/bin/ffmpeg.exe", "quotes stripped" );
   assert.strictEqual( c[ 2 ], "C:/tools/ffmpeg.exe", "relative and empty entries skipped, trailing slash trimmed" );
   assert.ok( !c.some( p => /caeloworks\/ffmpeg/i.test( p ) ), "legacy auto-install never offered" );
   assert.ok( c.includes( "C:/Users/astro/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe" ), "winget" );
   assert.ok( c.includes( "C:/ProgramData/chocolatey/bin/ffmpeg.exe" ), "chocolatey" );
   assert.ok( c.includes( "C:/Users/astro/scoop/shims/ffmpeg.exe" ), "scoop" );
   assert.ok( c.includes( "C:/ffmpeg/bin/ffmpeg.exe" ), "legacy manual location" );
}
{
   const c = M.ffmpegCandidatePaths( "macos", envGetter( { HOME: "/Users/astro", PATH: "/opt/homebrew/bin:/usr/bin:bin" } ) );
   assert.strictEqual( c[ 0 ], "/opt/homebrew/bin/ffmpeg" );
   assert.strictEqual( new Set( c ).size, c.length, "PATH and known locations do not repeat" );
   assert.ok( !c.includes( "/Users/astro/Library/Application Support/CaeloWorks/ffmpeg/ffmpeg" ), "legacy not offered" );
   assert.ok( c.includes( "/opt/local/bin/ffmpeg" ), "MacPorts" );
   assert.ok( c.includes( "/usr/local/bin/ffmpeg" ), "Homebrew (Intel)" );
   assert.ok( !c.includes( "/snap/bin/ffmpeg" ), "snap is Linux-only" );
}
{
   const c = M.ffmpegCandidatePaths( "linux", linuxEnv );
   assert.ok( !c.includes( "/home/astro/.local/share/caeloworks/ffmpeg/ffmpeg" ), "legacy not offered" );
   assert.ok( c.includes( "/usr/bin/ffmpeg" ) );
   assert.ok( c.includes( "/snap/bin/ffmpeg" ), "snap" );
   assert.ok( c.includes( "/home/linuxbrew/.linuxbrew/bin/ffmpeg" ), "Linuxbrew" );
}
for ( const p of [ "windows", "macos", "linux" ] )
{
   const c = M.ffmpegCandidatePaths( p, envGetter( {} ) );
   assert.ok( c.length >= 2 );
   assert.strictEqual( new Set( c ).size, c.length, "no duplicates on " + p );
   for ( const path of c )
   {
      assert.ok( !path.includes( "\\" ), "forward slashes only: " + path );
      assert.ok( p == "windows" ? /^[A-Za-z]:\//.test( path ) : path.startsWith( "/" ),
                 "absolute, so it can be checked without running it: " + path );
      assert.ok( !path.startsWith( "/CaeloWorks" ) && !path.includes( "//" ),
                 "no dangling root from missing env: " + path );
   }
}
// The legacy copy is excluded whichever way it arrives (CPD Program Rules 5.1, 5.2).
{
   // Through PATH, even spelt differently.
   const env = envGetter( {
      LOCALAPPDATA: "C:\\Users\\astro\\AppData\\Local",
      PATH: "C:\\Users\\Astro\\AppData\\Local\\caeloworks\\FFMPEG\\;C:\\tools"
   } );
   const c = M.ffmpegCandidatePaths( "windows", env );
   assert.strictEqual( c[ 0 ], "C:/tools/ffmpeg.exe", "legacy PATH entry dropped" );
   assert.ok( !c.some( p => /caeloworks\/ffmpeg/i.test( p ) ) );
   const lin = M.ffmpegCandidatePaths( "linux",
      envGetter( { HOME: "/home/astro", PATH: "/home/astro/.local/share/caeloworks/ffmpeg:/usr/bin" } ) );
   assert.strictEqual( lin[ 0 ], "/usr/bin/ffmpeg", "legacy PATH entry dropped on Linux" );

   // Saved setting or browsed file.
   assert.strictEqual( M.legacyFfmpegPath( "windows", winEnv ),
                       "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg/ffmpeg.exe" );
   assert.ok( M.isLegacyFfmpeg( "C:\\Users\\astro\\AppData\\Local\\CaeloWorks\\ffmpeg\\ffmpeg.exe", "windows", winEnv ) );
   assert.ok( M.isLegacyFfmpeg( "c:/users/ASTRO/appdata/local/caeloworks/ffmpeg/FFMPEG.EXE", "windows", winEnv ),
              "Windows paths compare without case" );
   assert.ok( M.isLegacyFfmpeg( "/users/astro/library/application support/caeloworks/ffmpeg/ffmpeg", "macos", macEnv ),
              "macOS paths compare without case" );
   assert.ok( M.isLegacyFfmpeg( "/home/astro/.local/share/caeloworks/ffmpeg/ffmpeg", "linux", linuxEnv ) );
   assert.ok( !M.isLegacyFfmpeg( "/home/astro/.local/share/CaeloWorks/ffmpeg/ffmpeg", "linux", linuxEnv ),
              "Linux is case-sensitive: another file" );
   for ( const other of [ "", null, undefined, "/usr/bin/ffmpeg", "C:/ffmpeg/bin/ffmpeg.exe",
                          "/home/astro/.local/share/caeloworks/ffmpeg" ] )
      assert.ok( !M.isLegacyFfmpeg( other, "linux", linuxEnv ), "not legacy: " + other );
}

// No mirror URL anywhere in the code or the docs, and the legacy copy is
// never launched: verifyFfmpeg refuses it before runExternal.
{
   const fs = require( "fs" ), path = require( "path" );
   const root = path.join( __dirname, ".." );
   const files = [ "pjsr/SessionCinema.js", "README.md", "CHANGELOG.md" ]
      .concat( fs.readdirSync( path.join( root, "docs" ) ).map( f => "docs/" + f ) );
   for ( const f of files )
      assert.ok( !/caelo\.works\/ffmpeg|ffmpeg-(windows|macos|linux)-(x64|arm64)/.test( fs.readFileSync( path.join( root, f ), "utf8" ) ),
                 "mirror URL left in " + f );
   assert.ok( !fs.existsSync( path.join( root, "docs", "ffmpeg-mirror.md" ) ), "mirror contract removed" );
   const SRC = fs.readFileSync( path.join( root, "pjsr", "SessionCinema.js" ), "utf8" );
   const verify = SRC.slice( SRC.indexOf( "function verifyFfmpeg" ) );
   assert.ok( verify.indexOf( "isLegacyFfmpeg" ) < verify.indexOf( "runExternal" ), "legacy refused before any launch" );
}

// findFfmpegOnDisk only asks the file system.
{
   const seen = [];
   const exists = p => { seen.push( p ); return p == "/b/ffmpeg"; };
   assert.strictEqual( M.findFfmpegOnDisk( [ "/a/ffmpeg", "/b/ffmpeg", "/c/ffmpeg" ], exists ), "/b/ffmpeg" );
   assert.deepStrictEqual( seen, [ "/a/ffmpeg", "/b/ffmpeg" ], "stops at the first hit" );
   assert.strictEqual( M.findFfmpegOnDisk( [ "/a" ], () => { throw new Error( "x" ); } ), "" );
}

// --- what the script may launch and download (CPD Program Rules 5.2, 5.3, 6.3)
{
   const SRC = require( "fs" ).readFileSync( require( "path" ).join( __dirname, "..", "pjsr", "SessionCinema.js" ), "utf8" );
   // Every program launched is the user's ffmpeg or the OS file browser on a click.
   const launched = [ ...SRC.matchAll( /runExternal\(\s*([^,]+),/g ) ].map( m => m[ 1 ].trim() );
   const allowed = [ "program", "path", "ffmpeg", "\"explorer.exe\"", "\"open\"", "\"xdg-open\"" ];
   for ( const p of launched )
      assert.ok( allowed.includes( p ), "unexpected program launched: runExternal( " + p + ", …" );
   assert.ok( !/\bcurl\b/.test( SRC.replace( /^\s*\/\/.*$/gm, "" ) ), "no curl: downloads go through NetworkTransfer" );
   assert.ok( !/MIRROR|caelo\.works\/ffmpeg|installFfmpeg/.test( SRC ), "no ffmpeg mirror left" );
   // Only HTTPS, and the URL builder agrees.
   assert.ok( M.isHttpsUrl( "https://alasky.cds.unistra.fr/x" ) );
   for ( const u of [ "http://alasky.cds.unistra.fr/x", "HTTPS:/x", "ftp://x", "", null, "https:///x" ] )
      assert.ok( !M.isHttpsUrl( u ), "refused: " + u );
   assert.ok( M.isHttpsUrl( M.hips2fitsUrl( "CDS/P/DSS2/color", 10, 20, 1.5, 512 ) ) );
   assert.ok( M.isNoNetworkError( "NetworkTransfer::Download(): Could not resolve host: x.invalid" ) );
   assert.ok( M.isNoNetworkError( "Failed to connect to x port 443" ) );
   assert.ok( !M.isNoNetworkError( "schannel: CertGetCertificateChain trust error CERT_TRUST_REVOCATION_STATUS_UNKNOWN" ),
              "a TLS hiccup is retried, it does not switch the bridge off" );
   // The encode script is not made executable, so it is run through sh.
   assert.strictEqual( M.encodeCommand( "/out/f/encode.sh" ), "sh \"/out/f/encode.sh\"" );
   assert.strictEqual( M.encodeCommand( "C:/out/f/encode.bat" ), "C:/out/f/encode.bat" );
}

console.log( "ffmpeg.test.js OK" );

// --- the fallback script calls a binary that exists --------------------------
{
   const args = [ "-y", "-framerate", "30", "-i", "/tmp/f/frame_%05d.bmp", "/tmp/out.mp4" ];

   // Bare "ffmpeg" fails wherever it is not on PATH — including the copy the
   // Install button puts in the script's own data directory.
   const withPath = M.buildEncodeScriptText( false, args, "/home/a/.local/share/x/ffmpeg" );
   assert.ok( withPath.indexOf( "/home/a/.local/share/x/ffmpeg" ) >= 0,
      "the known ffmpeg path must be in the script" );
   assert.ok( withPath.indexOf( "set -e" ) >= 0,
      "a POSIX script must stop on failure, not report success" );

   const noPath = M.buildEncodeScriptText( false, args, "" );
   assert.ok( noPath.indexOf( "ffmpeg" ) >= 0, "without one, fall back to the name" );

   // Windows: the file is written UTF-8 by a Qt toolkit, so the console has to be
   // told, or every accented path becomes mojibake and then is not found.
   const bat = M.buildEncodeScriptText( true, args, "C:/tools/ffmpeg.exe" );
   assert.ok( bat.indexOf( "chcp 65001" ) >= 0, "encode.bat must set its code page" );
   assert.ok( bat.indexOf( "%%" ) >= 0, "and still escape the frame pattern" );
}

// --- a latitude typed the way half of Europe writes one ----------------------
{
   assert.strictEqual( M.parseCoord( "43.60" ), 43.6 );
   assert.strictEqual( M.parseCoord( "43,60" ), 43.6, "parseFloat stopped at the comma and gave 43" );
   assert.strictEqual( M.parseCoord( " -7,25 " ), -7.25 );
   assert.strictEqual( M.parseCoord( "" ), null );
   assert.strictEqual( M.parseCoord( "north" ), null );
}

// A POSIX shell expands $ and backticks inside double quotes; cmd does not.
{
   const q = M.buildEncodeScriptText( false, [ "/tmp/a$b`c`/frame_%05d.bmp" ], "ffmpeg" );
   assert.ok( q.indexOf( "$b" ) >= 0, "the path is still there" );
   assert.ok( q.indexOf( "\"/tmp/a$b" ) < 0,
      "but not inside double quotes, where the shell would expand it" );
   const w = M.buildEncodeScriptText( true, [ "C:/a b/frame_%05d.bmp" ], "ffmpeg.exe" );
   assert.ok( w.indexOf( "\"C:/a b/frame_%%05d.bmp\"" ) >= 0, "cmd keeps double quotes" );
}

// --- the partial video keeps its extension -----------------------------------
//
// ffmpeg picks its muxer from the extension. Writing to "X.mp4.part" made it
// refuse the output outright — "Unable to choose an output format" — so the
// safeguard against leaving a truncated video under the final name stopped every
// encode instead. Measured on a real run before this: exit -22, no video at all.
{
   const ext = p => p.slice( p.lastIndexOf( "." ) );
   for ( const final of [ "C:/out/my-target-zoom.mp4",
                          "/home/a/Videos/ngc 6888.mp4",
                          "C:/out/v1.2/thing.mp4" ] )
   {
      const part = M.partialVideoPath( final );
      assert.strictEqual( ext( part ), ext( final ),
         `the partial file must keep the extension: ${part}` );
      assert.notStrictEqual( part, final, "and must not be the final name" );
      assert.ok( part.indexOf( "part" ) >= 0, "and must say it is partial" );
   }
   // A directory with a dot in it and a file without an extension: the dot that
   // matters is the one after the last separator.
   assert.strictEqual( M.partialVideoPath( "C:/out/v1.2/render" ), "C:/out/v1.2/render.part" );
}

console.log( "ffmpeg.test.js OK (encode script, coordinates)" );
