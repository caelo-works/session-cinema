// FITS keyword parsing: DATE-OBS, exposure, CFA detection, frame ordering.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

// parseDateObs
assert.strictEqual( M.parseDateObs( "2026-07-03T22:47:13" ), Date.UTC( 2026, 6, 3, 22, 47, 13 )/1000 );
assert.strictEqual( M.parseDateObs( "2026-07-03 22:47:13.500" ), Date.UTC( 2026, 6, 3, 22, 47, 13 )/1000 + 0.5 );
assert.strictEqual( M.parseDateObs( "2026-07-03" ), Date.UTC( 2026, 6, 3 )/1000 );
assert.strictEqual( M.parseDateObs( "2026-07-03T22:47" ), Date.UTC( 2026, 6, 3, 22, 47 )/1000 );
assert.strictEqual( M.parseDateObs( "'2026-07-03T22:47:13'" ), null ); // quotes must be stripped first
assert.strictEqual( M.parseDateObs( M.kwValue( "'2026-07-03T22:47:13'" ) ), Date.UTC( 2026, 6, 3, 22, 47, 13 )/1000 );
assert.strictEqual( M.parseDateObs( "garbage" ), null );
assert.strictEqual( M.parseDateObs( "" ), null );
assert.strictEqual( M.parseDateObs( null ), null );

// kwValue
assert.strictEqual( M.kwValue( "'M 42     '" ), "M 42" );
assert.strictEqual( M.kwValue( "  120.  " ), "120." );
assert.strictEqual( M.kwValue( undefined ), "" );

// frameMetaFromKeywords
{
   const meta = M.frameMetaFromKeywords( {
      "DATE-OBS": "'2026-07-03T22:47:13'",
      "EXPTIME": "120.0",
      "OBJECT": "'M 42'",
      "FILTER": "'Ha'",
      "BAYERPAT": "'RGGB'"
   } );
   assert.strictEqual( meta.dateObs, Date.UTC( 2026, 6, 3, 22, 47, 13 )/1000 );
   assert.strictEqual( meta.exposure, 120 );
   assert.strictEqual( meta.object, "M 42" );
   assert.strictEqual( meta.filter, "Ha" );
   assert.strictEqual( meta.cfa, true );
}
{
   const meta = M.frameMetaFromKeywords( { "EXPOSURE": "30", "BAYERPAT": "'NONE'" } );
   assert.strictEqual( meta.exposure, 30 );
   assert.strictEqual( meta.cfa, false );
   assert.strictEqual( meta.dateObs, null );
}
{
   const meta = M.frameMetaFromKeywords( {} );
   assert.strictEqual( meta.exposure, 0 );
   assert.strictEqual( meta.cfa, false );
}

// sortFrames: chronological, undated last in path order, stable across nights
{
   const t0 = Date.UTC( 2026, 6, 3, 23, 0, 0 )/1000;
   const frames = [
      { path: "b/frame2.fits", dateObs: t0 + 60 },
      { path: "z/undated1.fits", dateObs: null },
      { path: "a/frame3.fits", dateObs: t0 + 7*24*3600 }, // second night
      { path: "c/frame1.fits", dateObs: t0 },
      { path: "a/undated0.fits", dateObs: null }
   ];
   const s = M.sortFrames( frames );
   assert.deepStrictEqual( s.map( f => f.path ),
      [ "c/frame1.fits", "b/frame2.fits", "a/frame3.fits", "a/undated0.fits", "z/undated1.fits" ] );
   // input must not be mutated
   assert.strictEqual( frames[ 0 ].path, "b/frame2.fits" );
}

console.log( "headers.test.js OK" );
