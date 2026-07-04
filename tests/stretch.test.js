// Auto-stretch math: midtones transfer function and STF parameter derivation.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

// mtf fixed points
assert.strictEqual( M.mtf( 0.3, 0 ), 0 );
assert.strictEqual( M.mtf( 0.3, 1 ), 1 );
// mtf(m, m) == 0.5 for any midtones balance m in (0,1)
for ( const m of [ 0.1, 0.25, 0.5, 0.9 ] )
   assert.ok( Math.abs( M.mtf( m, m ) - 0.5 ) < 1e-12, "mtf(m,m)=0.5 for m=" + m );
// identity at m = 0.5
for ( const x of [ 0.1, 0.42, 0.9 ] )
   assert.ok( Math.abs( M.mtf( 0.5, x ) - x ) < 1e-12 );
// monotonic in x
assert.ok( M.mtf( 0.2, 0.3 ) < M.mtf( 0.2, 0.6 ) );

// computeAutoStretch on a typical linear dark-sky frame
{
   const median = 0.01, mad = 0.001;
   const s = M.computeAutoStretch( median, mad );
   const expectedC0 = median - 2.8*1.4826*mad;
   assert.ok( Math.abs( s.c0 - expectedC0 ) < 1e-12, "shadows clip at median - 2.8 sigma" );
   assert.ok( s.m > 0 && s.m < 1 );
   // the stretched median must land on the 0.25 target background
   const stretchedMedian = M.mtf( s.m, median - s.c0 );
   assert.ok( Math.abs( stretchedMedian - 0.25 ) < 1e-9, "target background 0.25" );
}

// degenerate inputs stay usable
{
   const s0 = M.computeAutoStretch( 0.01, 0 ); // flat image: no clipping
   assert.strictEqual( s0.c0, 0 );
   assert.ok( s0.m > 0 && s0.m < 1 );
   const s1 = M.computeAutoStretch( 0, 0 );
   assert.strictEqual( s1.c0, 0 );
   assert.ok( s1.m > 0 && s1.m < 1 );
   const s2 = M.computeAutoStretch( 0.5, 0.4 ); // clip would go negative
   assert.ok( s2.c0 >= 0 && s2.c0 <= 1 );
}

// clamp01
assert.strictEqual( M.clamp01( -1 ), 0 );
assert.strictEqual( M.clamp01( 2 ), 1 );
assert.strictEqual( M.clamp01( 0.5 ), 0.5 );

console.log( "stretch.test.js OK" );
