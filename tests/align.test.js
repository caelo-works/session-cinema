// StarAlignment matrix -> align-dialog placement decomposition.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

const RW = 512, RH = 340;

// The production reveal->background linear map — the single source of truth
// consumed by the preview, the WCS render and the SA decomposition alike.
const placementMatrix = M.placementMatrix;

// Independent spot-check of the matrix itself (R(+θ)·diag(fx,fy)·scale),
// so the shared helper cannot silently change convention under everyone.
{
   const m = placementMatrix( 2, 30, false, false );
   const c = Math.sqrt( 3 )/2;
   assert.ok( Math.abs( m[ 0 ][ 0 ] - 2*c ) < 1e-12 && Math.abs( m[ 1 ][ 0 ] - 1 ) < 1e-12,
              "R(+30deg): x-axis image rotates by +30deg (y down)" );
   // Element by element, not deepStrictEqual: that distinguishes 0 from -0, and
   // the -0s here come out of -scale*fy*Math.sin(0) and carry no geometric
   // meaning. Pulling the flip factor out of the product — a rewrite with no
   // behaviour change — used to turn this red.
   const f = placementMatrix( 1, 0, true, false );
   const want = [ [ -1, 0 ], [ 0, 1 ] ];
   for ( let r = 0; r < 2; ++r )
      for ( let c = 0; c < 2; ++c )
         assert.ok( Math.abs( f[ r ][ c ] - want[ r ][ c ] ) < 1e-12,
            `flipH negates x only: [${r}][${c}] is ${f[ r ][ c ]}` );
}

// Build the 3x3 StarAlignment-style matrix (background px -> reveal px) for
// a ground-truth placement {cx, cy, scale, rotDeg, flipH, flipV}.
function saMatrixFor( p )
{
   const A = placementMatrix( p.scale, p.rotDeg, p.flipH, p.flipV );
   // reveal -> background: x_bg = A*(x_rev - centre_rev) + (cx,cy)
   const t = [ p.cx - ( A[ 0 ][ 0 ]*RW/2 + A[ 0 ][ 1 ]*RH/2 ),
               p.cy - ( A[ 1 ][ 0 ]*RW/2 + A[ 1 ][ 1 ]*RH/2 ) ];
   const d = A[ 0 ][ 0 ]*A[ 1 ][ 1 ] - A[ 0 ][ 1 ]*A[ 1 ][ 0 ];
   const iA = [ [ A[ 1 ][ 1 ]/d, -A[ 0 ][ 1 ]/d ], [ -A[ 1 ][ 0 ]/d, A[ 0 ][ 0 ]/d ] ];
   return [ iA[ 0 ][ 0 ], iA[ 0 ][ 1 ], -( iA[ 0 ][ 0 ]*t[ 0 ] + iA[ 0 ][ 1 ]*t[ 1 ] ),
            iA[ 1 ][ 0 ], iA[ 1 ][ 1 ], -( iA[ 1 ][ 0 ]*t[ 0 ] + iA[ 1 ][ 1 ]*t[ 1 ] ),
            0, 0, 1 ];
}

function closeTo( a, b, tol, msg )
{
   assert.ok( Math.abs( a - b ) < ( tol || 1e-9 ), msg + ": " + a + " vs " + b );
}

const CASES = [
   { cx: 812.4, cy: 590.7, scale: 0.85, rotDeg: 15, flipH: false, flipV: false },
   { cx: 300.0, cy: 220.5, scale: 1.10, rotDeg: -32, flipH: true, flipV: false },
   { cx: 512.0, cy: 512.0, scale: 2.50, rotDeg: 179.5, flipH: false, flipV: false },
   { cx: 100.0, cy: 900.0, scale: 0.31, rotDeg: 0, flipH: false, flipV: false },
   // flipV ground truth: must come back as the EQUIVALENT flipH + rotation
   { cx: 640.0, cy: 480.0, scale: 1.00, rotDeg: 40, flipH: false, flipV: true }
];

for ( const p of CASES )
{
   const rec = M.saMatrixToAlignment( saMatrixFor( p ), RW, RH );
   assert.ok( rec, "decomposition succeeds" );
   closeTo( rec.cx, p.cx, 1e-6, "cx" );
   closeTo( rec.cy, p.cy, 1e-6, "cy" );
   closeTo( rec.scale, p.scale, 1e-9, "scale" );
   assert.strictEqual( rec.flipV, false, "auto placement never uses flipV" );
   // The parameterisation may differ (flipV vs flipH+rot): compare the maps.
   const A = placementMatrix( p.scale, p.rotDeg, p.flipH, p.flipV );
   const B = placementMatrix( rec.scale, rec.rotDeg, rec.flipH, rec.flipV );
   for ( let i = 0; i < 2; ++i )
      for ( let j = 0; j < 2; ++j )
         closeTo( B[ i ][ j ], A[ i ][ j ], 1e-9, "map[" + i + "][" + j + "]" );
   // Round-trip through revealPlacement: same centre and axis endpoints.
   const pa = M.revealPlacement( p.cx, p.cy, p.scale, p.rotDeg, p.flipH, p.flipV, RW/2, RH/2 );
   const pb = M.revealPlacement( rec.cx, rec.cy, rec.scale, rec.rotDeg, rec.flipH, rec.flipV, RW/2, RH/2 );
   for ( const k of [ "c", "ex" ] )   // ey differs in sign convention under flip equivalence
   {
      closeTo( pb[ k ].x, pa[ k ].x, 1e-6, "placement " + k + ".x" );
      closeTo( pb[ k ].y, pa[ k ].y, 1e-6, "placement " + k + ".y" );
   }
}

// A homography with tiny projective terms (real SA output) still decomposes
{
   const h = saMatrixFor( CASES[ 0 ] );
   h[ 6 ] = 6.2e-7; h[ 7 ] = -3.9e-7;
   const rec = M.saMatrixToAlignment( h, RW, RH );
   assert.ok( rec, "tiny projective terms tolerated" );
   closeTo( rec.scale, 0.85, 1e-3, "scale under projective noise" );
   closeTo( rec.rotDeg, 15, 0.1, "rotation under projective noise" );
}

// Tile grid: 9 half-size tiles, in bounds, 50% overlap, full coverage
{
   const BW = 3790, BH = 2111;
   const tiles = M.alignTileGrid( BW, BH );
   assert.strictEqual( tiles.length, 9 );
   for ( const t of tiles )
   {
      assert.ok( t.x >= 0 && t.y >= 0 && t.x + t.w <= BW && t.y + t.h <= BH, "tile in bounds" );
      assert.strictEqual( t.w, Math.round( BW/2 ) );
      assert.strictEqual( t.h, Math.round( BH/2 ) );
   }
   // any quarter-size region is fully contained in at least one tile
   for ( let cx = 0; cx <= 4; ++cx )
      for ( let cy = 0; cy <= 4; ++cy )
      {
         const rx = cx*( BW - BW/4 )/4, ry = cy*( BH - BH/4 )/4;
         const inside = tiles.some( t => rx >= t.x && ry >= t.y &&
            rx + BW/4 <= t.x + t.w && ry + BH/4 <= t.y + t.h );
         assert.ok( inside, "quarter region at (" + rx + "," + ry + ") covered" );
      }
   // odd sizes stay in bounds too
   for ( const t of M.alignTileGrid( 333, 217 ) )
      assert.ok( t.x >= 0 && t.y >= 0 && t.x + t.w <= 333 && t.y + t.h <= 217 );
}

// Tile-space placement translates back to full-background px
{
   const al = { cx: 100, cy: 50, scale: 0.5, rotDeg: -32, flipH: true, flipV: false };
   const r = M.offsetAlignment( al, 948, 528 );
   assert.deepStrictEqual( r, { cx: 1048, cy: 578, scale: 0.5, rotDeg: -32, flipH: true, flipV: false } );
}

// Quality gate: the synthetic-fit shape passes, degenerate consensus fails
{
   // Twenty columns, because that is what the production path needs: the next
   // thing it does with an accepted row is saMatrixToAlignment( row.slice(11,20) ).
   // A ten-column row used to pass this gate and then return null there, so the
   // fixture validated a shape the code traverses without ever arriving.
   //
   // Layout, from a StarAlignment.outputData row captured on PixInsight:
   //   0 path  1 drizzle  2 pairs  3 inlier ratio  4 ?  5 ?  6 ?  7 rms
   //   8 ?  9 ?  10 ?  11..19 the 3x3 as a,b,tx, c,d,ty, 0,0,1
   const good = [ "out.xisf", "", 63, 0.984, 1, 0.91, 0.92, 0.38, 0.19, 0.60,
                  0, 1, 0, 0, 0, 1, 0, 0, 0, 1 ];
   assert.ok( M.saQualityOk( good ) );
   // The point of the twenty: an accepted row really does yield a placement.
   assert.ok( M.saMatrixToAlignment( good.slice( 11, 20 ), 512, 340 ) != null,
      "a row this gate accepts must produce a matrix, not null three lines later" );
   assert.ok( !M.saQualityOk( good.slice( 0, 10 ) ),
      "and a row too short to produce one must be refused here, not there" );
   assert.ok( !M.saQualityOk( good.slice( 0, 2 ).concat( [ 8 ], good.slice( 3 ) ) ), "too few pairs" );
   assert.ok( !M.saQualityOk( good.slice( 0, 3 ).concat( [ 0.3 ], good.slice( 4 ) ) ), "low inlier ratio" );
   assert.ok( !M.saQualityOk( good.slice( 0, 7 ).concat( [ 6.5 ], good.slice( 8 ) ) ), "rms too high" );
   assert.ok( !M.saQualityOk( null ) );
}

// Rescaling a placement recovered from a pre-shrunk reveal
{
   const al = { cx: 300, cy: 200, scale: 0.97, rotDeg: 12, flipH: true, flipV: false };
   const r = M.rescaleAlignment( al, 1/3 );
   closeTo( r.cx, 300, 1e-9, "centre stays in native background px" );
   closeTo( r.cy, 200, 1e-9, "centre stays in native background px" );
   closeTo( r.scale, 0.97/3, 1e-9, "scale rescaled by the reveal factor" );
   assert.strictEqual( r.rotDeg, 12 );
   assert.strictEqual( r.flipH, true );
   assert.deepStrictEqual( M.rescaleAlignment( al, 1 ), al, "factor 1 is the identity" );
}

// Mirror candidates reordered by machine architecture
{
   const linux = [ "ffmpeg-linux-x64", "ffmpeg-linux-arm64" ];
   assert.deepStrictEqual( M.orderMirrorCandidatesByArch( linux, "aarch64\n" ),
                           [ "ffmpeg-linux-arm64", "ffmpeg-linux-x64" ], "arm machine gets arm first" );
   assert.deepStrictEqual( M.orderMirrorCandidatesByArch( linux, "x86_64\n" ), linux, "x64 keeps order" );
   assert.deepStrictEqual( M.orderMirrorCandidatesByArch( linux, "" ), linux, "unknown keeps order" );
   const mac = [ "ffmpeg-macos-arm64", "ffmpeg-macos-x64" ];
   assert.deepStrictEqual( M.orderMirrorCandidatesByArch( mac, "arm64" ), mac, "already-native order untouched" );
   assert.deepStrictEqual( M.orderMirrorCandidatesByArch( mac, "x86_64" ),
                           [ "ffmpeg-macos-x64", "ffmpeg-macos-arm64" ], "Intel Mac gets x64 first" );
}

// Cross-path consistency: the WCS render path (cropWcsCentered) must place
// every reveal pixel on the same sky as the popup preview (revealPlacement).
// This is the invariant "what you align is what renders".
{
   const s = 1/3600;
   const solved = M.makeWcs( 100, 20, 1920, 1080, [ [ -s, 0 ], [ 0, s ] ] );
   for ( const p of CASES )
   {
      const rev = M.cropWcsCentered( solved, p.cx, p.cy, p.scale, p.rotDeg,
                                     p.flipH, p.flipV, RW, RH );
      const A = placementMatrix( p.scale, p.rotDeg, p.flipH, p.flipV );
      for ( const [ rx, ry ] of [ [ 0, 0 ], [ RW, 0 ], [ RW/2, RH/2 ], [ 137, 291 ] ] )
      {
         const sx = p.cx + A[ 0 ][ 0 ]*( rx - RW/2 ) + A[ 0 ][ 1 ]*( ry - RH/2 );
         const sy = p.cy + A[ 1 ][ 0 ]*( rx - RW/2 ) + A[ 1 ][ 1 ]*( ry - RH/2 );
         const a = M.wcsPixelToSky( rev, rx, ry );
         const b = M.wcsPixelToSky( solved, sx, sy );
         closeTo( a.ra, b.ra, 1e-9, "render==preview RA at " + rx + "," + ry );
         closeTo( a.dec, b.dec, 1e-9, "render==preview Dec at " + rx + "," + ry );
      }
   }
}

// Degenerate inputs -> null
assert.strictEqual( M.saMatrixToAlignment( [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ], RW, RH ), null );
assert.strictEqual( M.saMatrixToAlignment( [ 1, 0, 0, 1, 0, 0, 0, 0, 1 ], RW, RH ), null, "singular linear part" );
assert.strictEqual( M.saMatrixToAlignment( null, RW, RH ), null );
assert.strictEqual( M.saMatrixToAlignment( [ 1, 0, 0, 0, 1, 0, 0, 0, 1e-15 ], RW, RH ), null, "h33 ~ 0" );

// --- rotations saved under the pre-1.1.0 convention --------------------------
//
// 1.1.0 flipped the sign of the STORED reveal rotation and nothing recorded
// which convention a saved number belongs to, so a 1.0.0 alignment renders 2*θ
// off. The value cannot be repaired blind (negating it would break every 1.1.0
// config in the same silent way), so what is locked here is the reporting: the
// doubt must be raised, and must SURVIVE until the user settles it.
{
   assert.strictEqual( M.rotationNeedsCheck( "", 32.2 ), true, "unstamped + rotation" );
   assert.strictEqual( M.rotationNeedsCheck( "", -32.2 ), true, "sign does not matter" );
   assert.strictEqual( M.rotationNeedsCheck( undefined, 328 ), true, "key absent entirely" );
   assert.strictEqual( M.rotationNeedsCheck( "1.1.1", 328 ), false, "stamped: trusted" );
   // 0 is the same angle in both conventions — the reason most users never saw this
   assert.strictEqual( M.rotationNeedsCheck( "", 0 ), false );
   assert.strictEqual( M.rotationNeedsCheck( "", -0 ), false );

   // A rotation is only doubted where it is actually APPLIED. The notice used to
   // fire on a placement nothing reads, with no way to dismiss it.
   const stale = { cfgVersion: "", zoomRevealRot: 328, stackRevealRot: 0,
                   zoomRevealCropped: true, zoomRevealAligned: true, zoomRevealScale: 1,
                   stackRevealPath: "", stackRevealAligned: false, stackRevealScale: 0 };
   const pending = M.rotationsNeedingCheck( stale );
   assert.deepStrictEqual( pending, { zoom: true, stack: false, any: true },
                           "only the alignment that carries a rotation is doubted" );

   // Same rotation, but the crop box is off: nothing reads it, so nothing to say.
   const unused = Object.assign( {}, stale, { zoomRevealCropped: false } );
   assert.deepStrictEqual( M.rotationsNeedingCheck( unused ), { zoom: false, stack: false, any: false },
                           "a rotation the render never applies must not raise a notice" );

   // And a stack rotation with no presentation image is equally unused.
   const noImage = { cfgVersion: "", zoomRevealRot: 0, stackRevealRot: 180,
                     zoomRevealCropped: false, zoomRevealAligned: false, zoomRevealScale: 0,
                     stackRevealPath: "", stackRevealAligned: true, stackRevealScale: 1 };
   assert.strictEqual( M.rotationsNeedingCheck( noImage ).stack, false );
   assert.strictEqual( M.rotationsNeedingCheck(
      Object.assign( {}, noImage, { stackRevealPath: "/tmp/final.jpg" } ) ).stack, true );

   // THE property this design rests on: saving while the doubt is open must NOT
   // stamp the config, or the next launch would trust a value nobody checked and
   // the warning would vanish after one session.
   const saved = M.stampConfig( Object.assign( {}, stale ), pending );
   assert.strictEqual( saved.cfgVersion, "" );
   assert.deepStrictEqual( M.rotationsNeedingCheck( saved ), pending, "doubt survives a restart" );
   assert.strictEqual( saved.zoomRevealRot, 328, "and the value itself is never touched" );

   // Once the user redoes that alignment, the doubt is over and the stamp lands.
   const settled = M.stampConfig( Object.assign( {}, stale ),
                                  { zoom: false, stack: false, any: false } );
   assert.ok( /^[0-9]+\.[0-9]+\.[0-9]+/.test( settled.cfgVersion ), settled.cfgVersion );
   assert.deepStrictEqual( M.rotationsNeedingCheck( settled ),
                           { zoom: false, stack: false, any: false } );

   // A fresh install starts unstamped but with no rotation, so it says nothing.
   assert.strictEqual( M.rotationsNeedingCheck( M.DEFAULT_CONFIG ).any, false );
   assert.strictEqual( M.DEFAULT_CONFIG.cfgVersion, "",
      "the default must NOT claim a stamp: it is what an old config looks like" );
}

console.log( "align.test.js OK" );

// --- one definition of "aligned" ---------------------------------------------
//
// It used to be a scale sentinel on one side, nothing at all on the other, and a
// partial application of the first inside the engine.
{
   const stackOnly = { stackRevealAligned: true, stackRevealScale: 1.4,
                       zoomRevealAligned: false, zoomRevealScale: 1.0 };
   assert.strictEqual( M.revealAligned( stackOnly, "stack" ), true );
   assert.strictEqual( M.revealAligned( stackOnly, "zoom" ), false,
      "zoomRevealScale defaults to 1.0 — a scale is not evidence of an alignment" );

   // The flag alone is not enough either: a cleared placement has scale 0.
   assert.strictEqual(
      M.revealAligned( { stackRevealAligned: true, stackRevealScale: 0 }, "stack" ), false );
   // Nor is a scale alone.
   assert.strictEqual(
      M.revealAligned( { stackRevealAligned: false, stackRevealScale: 2 }, "stack" ), false );

   // The neutral placement the engine falls back to: centred, contain-fit, no
   // rotation, no mirror. It used to inherit the previous image's orientation.
   const stackW = 4000, stackH = 3000, rw = 2000, rh = 1000;
   const neutral = M.revealPlacement( stackW/2, stackH/2, stackW/rw, 0, false, false, rw/2, rh/2 );
   const close = ( a, b, what ) => assert.ok( Math.abs( a - b ) < 1e-9,
      `${what}: ${a} vs ${b}` );
   close( neutral.c.x, stackW/2, "neutral centre x" );
   close( neutral.c.y, stackH/2, "neutral centre y" );
   close( neutral.ex.y, neutral.c.y, "no rotation: the x axis stays horizontal" );
   assert.ok( neutral.ex.x > neutral.c.x, "and it is not mirrored" );
}

console.log( "align.test.js OK (one aligned)" );

// --- a stamp is a certificate only if we recognise it ------------------------
//
// The convention changed in 1.1.0 and was stamped from 1.1.1 on. The old test was
// a presence test: any truthy value of any type vouched for the rotation, so a
// hand-written headless config saying "1.0.0" — a version that wrote the OTHER
// convention — silenced exactly the warning it should have raised.
{
   assert.strictEqual( M.rotationNeedsCheck( "1.0.0", 90 ), true,
      "1.0.0 wrote the other convention: it certifies nothing" );
   assert.strictEqual( M.rotationNeedsCheck( "1.1.0", 90 ), true,
      "1.1.0 changed the convention but did not stamp" );
   assert.strictEqual( M.rotationNeedsCheck( "1.1.1", 90 ), false );
   assert.strictEqual( M.rotationNeedsCheck( "1.2.0", 90 ), false );
   assert.strictEqual( M.rotationNeedsCheck( "2.0.0", 90 ), false );
   assert.strictEqual( M.rotationNeedsCheck( "yes", 90 ), true, "not a version" );
   assert.strictEqual( M.rotationNeedsCheck( 1, 90 ), true, "not a version either" );
   assert.strictEqual( M.rotationNeedsCheck( "", 90 ), true );
   // A rotation of zero is the same angle in both conventions, whatever the stamp.
   assert.strictEqual( M.rotationNeedsCheck( "1.0.0", 0 ), false );
}

// --- one type filter, for both ways a config comes in ------------------------
{
   const D = M.DEFAULT_CONFIG;
   // The headless path had no filter at all: a non-empty string is truthy.
   const r = M.sanitizeConfig( { colorEnabled: "false", debayer: "no", fps: 30 } );
   assert.strictEqual( r.cfg.colorEnabled, D.colorEnabled, "a string is not a boolean" );
   assert.strictEqual( r.cfg.debayer, D.debayer );
   assert.strictEqual( r.cfg.fps, 30, "a valid value still gets through" );
   assert.strictEqual( r.rejected.length, 2 );

   // An index out of range is not a type error and is just as fatal.
   const idx = M.sanitizeConfig( { formatIndex: 4, crfIndex: 9 } );
   assert.strictEqual( idx.cfg.formatIndex, D.formatIndex, "formatIndex 4 threw on fmtDef.w" );
   assert.strictEqual( idx.cfg.crfIndex, D.crfIndex, "crfIndex 9 went undefined into ffmpeg" );
   assert.strictEqual( idx.rejected.length, 2 );
   assert.ok( M.sanitizeConfig( { formatIndex: 3 } ).rejected.length === 0, "3 is valid" );
   assert.ok( M.sanitizeConfig( { formatIndex: 1.5 } ).rejected.length === 1, "and 1.5 is not" );

   // The two numbers the engine divides by.
   assert.strictEqual( M.sanitizeConfig( { fps: 0 } ).cfg.fps, D.fps );
   assert.strictEqual( M.sanitizeConfig( { targetDuration: 0 } ).cfg.targetDuration,
                       D.targetDuration );

   // Nothing at all is a fresh install, not a rejection.
   assert.deepStrictEqual( M.sanitizeConfig( null ).rejected, [] );
   assert.strictEqual( M.sanitizeConfig( null ).cfg.fps, D.fps );
}

console.log( "align.test.js OK (stamp, config filter)" );

// --- what an exported process icon may carry ---------------------------------
//
// Everything in DEFAULT_CONFIG used to be exported by design, which put the
// observer's coordinates — read from the headers without being asked for, to four
// decimals — inside every icon posted on a forum.
{
   const D = M.DEFAULT_CONFIG;
   for ( const k of [ "observerLat", "observerLong", "observerDateUtc", "language" ] )
      assert.ok( M.PERSONAL_KEYS[ k ], `${k} identifies the recipient or the site: keep it local` );

   // The sentinel matters: a trimmed icon must fall back to "read the headers",
   // not to zero, which is a real place in the Gulf of Guinea.
   assert.strictEqual( D.observerLat, 999 );
   assert.strictEqual( D.observerLong, 999 );

   // And the rest of the recipe still travels, or the icon would be pointless.
   for ( const k of [ "style", "fps", "targetDuration", "formatIndex", "palette",
                      "ovShowSnr", "stackRevealPath" ] )
      assert.ok( !M.PERSONAL_KEYS[ k ], `${k} is part of the recipe and must travel` );
}

console.log( "align.test.js OK (what an icon carries)" );
