// StarAlignment matrix -> align-dialog placement decomposition.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

const RW = 512, RH = 340;

// Linear part of the reveal->background map used by revealPlacement:
// scale * [ [fx*cos, -fy*sin], [fx*sin, fy*cos] ]
function placementMatrix( scale, rotDeg, flipH, flipV )
{
   const th = rotDeg*Math.PI/180, c = Math.cos( th ), s = Math.sin( th );
   const fx = flipH ? -1 : 1, fy = flipV ? -1 : 1;
   return [ [ scale*fx*c, -scale*fy*s ], [ scale*fx*s, scale*fy*c ] ];
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
   const good = [ "out.xisf", "", 63, 0.984, 1, 0.91, 0.92, 0.38, 0.19, 0.60 ];
   assert.ok( M.saQualityOk( good ) );
   assert.ok( !M.saQualityOk( good.slice( 0, 2 ).concat( [ 8 ], good.slice( 3 ) ) ), "too few pairs" );
   assert.ok( !M.saQualityOk( good.slice( 0, 3 ).concat( [ 0.3 ], good.slice( 4 ) ) ), "low inlier ratio" );
   assert.ok( !M.saQualityOk( good.slice( 0, 7 ).concat( [ 6.5 ], good.slice( 8 ) ) ), "rms too high" );
   assert.ok( !M.saQualityOk( null ) );
}

// Rescaling a placement recovered between pre-scaled images
{
   const al = { cx: 300, cy: 200, scale: 0.97, rotDeg: 12, flipH: true, flipV: false };
   const r = M.rescaleAlignment( al, 1/3, 0.5 );
   closeTo( r.cx, 600, 1e-9, "cx rescaled by 1/bgFactor" );
   closeTo( r.cy, 400, 1e-9, "cy rescaled by 1/bgFactor" );
   closeTo( r.scale, 0.97*( 1/3 )/0.5, 1e-9, "scale rescaled by fr/fb" );
   assert.strictEqual( r.rotDeg, 12 );
   assert.strictEqual( r.flipH, true );
   const id = M.rescaleAlignment( al, 1, 1 );
   assert.deepStrictEqual( id, al, "native factors are the identity" );
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

console.log( "align.test.js OK" );
