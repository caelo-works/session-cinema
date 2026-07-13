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
