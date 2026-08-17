// Overlay content: only measured facts, formatted compactly.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

// formatDuration
assert.strictEqual( M.formatDuration( 58 ), "58 s" );
assert.strictEqual( M.formatDuration( 90 ), "2 min" );
assert.strictEqual( M.formatDuration( 34*60 ), "34 min" );
assert.strictEqual( M.formatDuration( 2*3600 + 4*60 ), "2h04" );
assert.strictEqual( M.formatDuration( 10*3600 + 30*60 ), "10h30" );

// formatSnrGainDb — sqrt(N) law: 100 frames -> exactly +20 dB
assert.strictEqual( M.formatSnrGainDb( 1, 0.1 ), "+20.0 dB" );
assert.strictEqual( M.formatSnrGainDb( 1, 1 ), "+0.0 dB" );
assert.strictEqual( M.formatSnrGainDb( 1, 1/Math.sqrt( 10 ) ), "+10.0 dB" );
assert.strictEqual( M.formatSnrGainDb( 0, 1 ), "" );
assert.strictEqual( M.formatSnrGainDb( 1, 0 ), "" );

// formatClockUT
assert.strictEqual( M.formatClockUT( Date.UTC( 2026, 6, 3, 22, 47, 13 )/1000 ), "22:47:13" );
assert.strictEqual( M.formatClockUT( Date.UTC( 2026, 0, 1, 0, 5, 9 )/1000 ), "00:05:09" );

// slugify
assert.strictEqual( M.slugify( "M 42 — Nébuleuse d'Orion" ), "m-42-nebuleuse-d-orion" );
assert.strictEqual( M.slugify( "" ), "session" );
assert.strictEqual( M.slugify( "___" ), "session" );

// buildOverlayInfo — stacking style
{
   const cfg = Object.assign( {}, M.DEFAULT_CONFIG,
      { ovTitle: "M 42", ovSignature: "@astro", style: M.STYLE_STACKING } );
   const ov = M.buildOverlayInfo( cfg, {
      style: M.STYLE_STACKING, index: 128, total: 300,
      cumulativeExposure: 128*120, exposure: 120,
      dateObs: null, sigmaFirst: 1, sigmaCurrent: 1/Math.sqrt( 128 )
   } );
   assert.strictEqual( ov.title, "M 42" );
   assert.ok( ov.subLeft.includes( "128 × 120 s" ), ov.subLeft );
   assert.ok( ov.subLeft.includes( "4h16" ), ov.subLeft );
   assert.ok( ov.subLeft.includes( "SNR +21.1 dB" ), ov.subLeft );
   assert.strictEqual( ov.right, "128/300" );
   assert.strictEqual( ov.signature, "@astro" );
   assert.ok( Math.abs( ov.progress - 128/300 ) < 1e-12 );
}

// info.title (the OBJECT-derived title injected by the engine) overrides cfg.ovTitle
{
   const cfg = Object.assign( {}, M.DEFAULT_CONFIG, { ovTitle: "" } );
   const ov = M.buildOverlayInfo( cfg, {
      style: M.STYLE_STACKING, index: 1, total: 10,
      cumulativeExposure: 60, exposure: 60, dateObs: null,
      sigmaFirst: 1, sigmaCurrent: 1, title: "M 16 - Eagle Nebula"
   } );
   assert.strictEqual( ov.title, "M 16 - Eagle Nebula" );
   // no info.title -> falls back to cfg.ovTitle
   const ov2 = M.buildOverlayInfo( Object.assign( {}, M.DEFAULT_CONFIG, { ovTitle: "Typed" } ), {
      style: M.STYLE_STACKING, index: 1, total: 10,
      cumulativeExposure: 60, exposure: 60, dateObs: null, sigmaFirst: 1, sigmaCurrent: 1
   } );
   assert.strictEqual( ov2.title, "Typed" );
}

// buildOverlayInfo — the current sub's UT clock rides alongside the counter on
// the right.
{
   const cfg = Object.assign( {}, M.DEFAULT_CONFIG, { ovTitle: "" } );
   const ov = M.buildOverlayInfo( cfg, {
      style: M.STYLE_STACKING, index: 42, total: 300,
      cumulativeExposure: 42*30, exposure: 30,
      dateObs: Date.UTC( 2026, 6, 3, 23, 59, 1 )/1000,
      sigmaFirst: 1, sigmaCurrent: 1/Math.sqrt( 42 )
   } );
   assert.ok( ov.right.includes( "UT 23:59:01" ), ov.right );
   assert.ok( ov.right.includes( "42/300" ), ov.right );
   assert.strictEqual( ov.title, "" );
}

// everything off -> empty overlay, hidden progress bar
{
   const cfg = Object.assign( {}, M.DEFAULT_CONFIG, {
      ovTitle: "", ovSignature: "", ovShowCounter: false, ovShowExposure: false,
      ovShowTime: false, ovShowSnr: false, ovShowBar: false
   } );
   const ov = M.buildOverlayInfo( cfg, {
      style: M.STYLE_STACKING, index: 10, total: 20,
      cumulativeExposure: 100, exposure: 10, dateObs: null, sigmaFirst: 1, sigmaCurrent: 0.5
   } );
   assert.strictEqual( ov.title, "" );
   assert.strictEqual( ov.subLeft, "" );
   assert.strictEqual( ov.right, "" );
   assert.strictEqual( ov.progress, -1 );
}

// unusable sigma -> the overlay SAYS the figure is missing. It must never look
// like the user simply did not ask for it (that is what made the colour bug
// invisible for a whole release).
{
   const cfg = Object.assign( {}, M.DEFAULT_CONFIG, { ovTitle: "x" } );
   const ov = M.buildOverlayInfo( cfg, {
      style: M.STYLE_STACKING, index: 1, total: 10,
      cumulativeExposure: 60, exposure: 60, dateObs: null, sigmaFirst: 0, sigmaCurrent: 0
   } );
   assert.ok( ov.subLeft.includes( "SNR " + M.SNR_UNAVAILABLE ), ov.subLeft );
   // ...but a box left unticked stays silent.
   const off = M.buildOverlayInfo( Object.assign( {}, cfg, { ovShowSnr: false } ), {
      style: M.STYLE_STACKING, index: 1, total: 10,
      cumulativeExposure: 60, exposure: 60, dateObs: null, sigmaFirst: 0, sigmaCurrent: 0
   } );
   assert.ok( !off.subLeft.includes( "SNR" ), off.subLeft );
}

// compositeSnrSigmas — the colour composite's dB figure, from noise measured per
// filter. A balanced session must give back the mono law exactly: n subs spread
// over F filters read the same sqrt(n) gain as the same n subs stacked mono,
// otherwise "colour on" and "colour off" would tell the user two different
// stories about the same night.
{
   const s = 0.004;                       // single-sub noise, identical per filter
   for ( const F of [ 2, 3 ] )
      for ( const n of [ 9, 36, 164 ] )
      {
         const entries = [];
         for ( let f = 0; f < F; ++f )     // n/F subs in each channel
            entries.push( { weight: 1, sigmaFirst: s, sigmaCurrent: s/Math.sqrt( n/F ) } );
         const r = M.compositeSnrSigmas( entries );
         assert.ok( Math.abs( r.first - s ) < 1e-12, `F=${F} n=${n}: ${r.first}` );
         assert.strictEqual( M.formatSnrGainDb( r.first, r.current ),
                             M.formatSnrGainDb( 1, 1/Math.sqrt( n ) ),
                             `F=${F} n=${n} must read like a mono stack of ${n} subs` );
      }
}

// compositeSnrSigmas — a filter feeding two channels (OIII -> G and B in HOO) is
// counted twice and correlated with itself, so the composite is slightly noisier
// than the same subs would be in mono. Slightly: it must stay in the same ballpark.
{
   const s = 0.004, n = 100;              // 50 Ha + 50 OIII
   const r = M.compositeSnrSigmas( [
      { weight: 1, sigmaFirst: s, sigmaCurrent: s/Math.sqrt( n/2 ) },
      { weight: 2, sigmaFirst: s, sigmaCurrent: s/Math.sqrt( n/2 ) } ] );
   const gain = 20*Math.log( r.first/r.current )/Math.LN10;
   const mono = 20*Math.log( Math.sqrt( n ) )/Math.LN10;
   assert.ok( gain < mono, `HOO cannot beat mono: ${gain} vs ${mono}` );
   assert.ok( mono - gain < 1, `but not by much: ${mono - gain} dB` );
}

// compositeSnrSigmas — an unmeasurable filter drops out of both sums (the ratio
// stays coherent); with nothing measurable left the caller gets zeros, which the
// overlay turns into "SNR —" rather than into silence.
{
   const s = 0.004;
   const good = { weight: 1, sigmaFirst: s, sigmaCurrent: s/10 };
   assert.deepStrictEqual(
      M.compositeSnrSigmas( [ good, { weight: 1, sigmaFirst: 0, sigmaCurrent: s } ] ),
      M.compositeSnrSigmas( [ good ] ), "a filter with no first-sub noise drops out" );
   assert.deepStrictEqual(
      M.compositeSnrSigmas( [ good, { weight: 0, sigmaFirst: s, sigmaCurrent: s } ] ),
      M.compositeSnrSigmas( [ good ] ), "so does a filter feeding no channel" );
   assert.deepStrictEqual( M.compositeSnrSigmas( [] ), { first: 0, current: 0 } );
   assert.deepStrictEqual( M.compositeSnrSigmas( [ { weight: 1, sigmaFirst: 0, sigmaCurrent: 0 } ] ),
                           { first: 0, current: 0 } );
   assert.strictEqual( M.formatSnrGainDb( 0, 0 ), "" );
}

console.log( "overlay.test.js OK" );
