// ffmpeg discovery candidates, auto-install locations and mirror contract.
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

// Mirror contract: fixed names, one per platform/arch, preferred arch first
assert.ok( M.FFMPEG_MIRROR_BASE.startsWith( "https://" ) );
assert.ok( M.FFMPEG_MIRROR_BASE.endsWith( "/" ), "base joins with a bare file name" );
assert.deepStrictEqual( M.ffmpegMirrorCandidates( "windows" ), [ "ffmpeg-windows-x64.exe" ] );
assert.deepStrictEqual( M.ffmpegMirrorCandidates( "macos" ),
                        [ "ffmpeg-macos-arm64", "ffmpeg-macos-x64" ] );
assert.deepStrictEqual( M.ffmpegMirrorCandidates( "linux" ),
                        [ "ffmpeg-linux-x64", "ffmpeg-linux-arm64" ] );
for ( const p of [ "windows", "macos", "linux" ] )
   for ( const n of M.ffmpegMirrorCandidates( p ) )
      assert.ok( /^ffmpeg-[a-z0-9-]+(\.exe)?$/.test( n ), "url-safe file name: " + n );

// Installed binary name
assert.strictEqual( M.ffmpegInstalledName( "windows" ), "ffmpeg.exe" );
assert.strictEqual( M.ffmpegInstalledName( "macos" ), "ffmpeg" );
assert.strictEqual( M.ffmpegInstalledName( "linux" ), "ffmpeg" );

// Install dir: per-user, forward slashes, CaeloWorks-branded
assert.strictEqual( M.ffmpegInstallDir( "windows", winEnv ),
                    "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg" );
// LOCALAPPDATA missing -> derived from USERPROFILE
assert.strictEqual(
   M.ffmpegInstallDir( "windows", envGetter( { USERPROFILE: "C:\\Users\\astro" } ) ),
   "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg" );
assert.strictEqual( M.ffmpegInstallDir( "macos", macEnv ),
                    "/Users/astro/Library/Application Support/CaeloWorks/ffmpeg" );
assert.strictEqual( M.ffmpegInstallDir( "linux", linuxEnv ),
                    "/home/astro/.local/share/caeloworks/ffmpeg" );
// XDG_DATA_HOME wins over the ~/.local/share default
assert.strictEqual(
   M.ffmpegInstallDir( "linux", envGetter( { HOME: "/home/astro", XDG_DATA_HOME: "/data/xdg" } ) ),
   "/data/xdg/caeloworks/ffmpeg" );

// Candidate paths: PATH first, then a previous auto-install, then managers
{
   const c = M.ffmpegCandidatePaths( "windows", winEnv );
   assert.strictEqual( c[ 0 ], "ffmpeg.exe" );
   assert.ok( c.includes( "C:/Users/astro/AppData/Local/CaeloWorks/ffmpeg/ffmpeg.exe" ),
              "previous auto-install probed" );
   assert.ok( c.includes( "C:/Users/astro/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe" ), "winget" );
   assert.ok( c.includes( "C:/ProgramData/chocolatey/bin/ffmpeg.exe" ), "chocolatey" );
   assert.ok( c.includes( "C:/Users/astro/scoop/shims/ffmpeg.exe" ), "scoop" );
   assert.ok( c.includes( "C:/ffmpeg/bin/ffmpeg.exe" ), "legacy manual location" );
   for ( const p of c )
      assert.ok( !p.includes( "\\" ), "forward slashes only: " + p );
}
{
   const c = M.ffmpegCandidatePaths( "macos", macEnv );
   assert.strictEqual( c[ 0 ], "ffmpeg" );
   assert.ok( c.includes( "/Users/astro/Library/Application Support/CaeloWorks/ffmpeg/ffmpeg" ) );
   assert.ok( c.includes( "/opt/homebrew/bin/ffmpeg" ), "Homebrew (Apple Silicon)" );
   assert.ok( c.includes( "/opt/local/bin/ffmpeg" ), "MacPorts" );
   assert.ok( c.includes( "/usr/local/bin/ffmpeg" ), "Homebrew (Intel)" );
   assert.ok( !c.includes( "/snap/bin/ffmpeg" ), "snap is Linux-only" );
}
{
   const c = M.ffmpegCandidatePaths( "linux", linuxEnv );
   assert.strictEqual( c[ 0 ], "ffmpeg" );
   assert.ok( c.includes( "/home/astro/.local/share/caeloworks/ffmpeg/ffmpeg" ) );
   assert.ok( c.includes( "/usr/bin/ffmpeg" ) );
   assert.ok( c.includes( "/snap/bin/ffmpeg" ), "snap" );
   assert.ok( c.includes( "/home/linuxbrew/.linuxbrew/bin/ffmpeg" ), "Linuxbrew" );
}
// Missing env vars never produce broken paths, and lists stay duplicate-free
for ( const p of [ "windows", "macos", "linux" ] )
{
   const c = M.ffmpegCandidatePaths( p, envGetter( {} ) );
   assert.ok( c.length >= 4 );
   assert.strictEqual( new Set( c ).size, c.length, "no duplicates on " + p );
   for ( const path of c )
      assert.ok( !path.startsWith( "/CaeloWorks" ) && !path.includes( "//" ),
                 "no dangling root from missing env: " + path );
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
