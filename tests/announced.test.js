// Announced against produced.
//
// Every other file here checks a function against its own formula. This one
// checks a number the USER READS against the number the product actually
// makes — the class of assertion whose absence let six displayed figures ship
// wrong through three releases. A test that says scaleBar computes what
// scaleBar computes cannot notice that the bar labelled 30 degrees spans 20.
//
// The shape is always the same: produce the thing, read the label, compare.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

function near( a, b, eps, what )
{
   assert.ok( Math.abs( a - b ) <= eps,
      `${what}: ${a} vs ${b} (tolerance ${eps})` );
}

// --- an independent way back from the screen to the sky ---------------------
//
// To ask "how much sky does this bar cover" the test has to undo the projection
// the renderer applied. Writing that inverse is only trustworthy if it is
// checked against the forward function rather than against itself, so it is
// round-tripped first and every later assertion rests on that.

function screenToVec( cam, x, y )
{
   const s = ( cam.W/2 )/( 2*Math.tan( ( cam.fovDeg/2 )*Math.PI/180/2 ) );
   const rx = ( cam.W/2 - x )/s, ry = ( cam.H/2 - y )/s;
   const cr = Math.cos( cam.rollDeg*Math.PI/180 ), sr = Math.sin( cam.rollDeg*Math.PI/180 );
   const xp = rx*cr + ry*sr, yp = -rx*sr + ry*cr;
   const rho = Math.hypot( xp, yp );
   const theta = 2*Math.atan( rho/2 );          // stereographic: rho = 2 tan(theta/2)
   const sin = Math.sin( theta ), z = Math.cos( theta );
   const ux = rho > 0 ? xp/rho : 0, uy = rho > 0 ? yp/rho : 0;
   const xc = sin*ux, yc = sin*uy;
   return [ xc*cam.r[0] + yc*cam.u[0] + z*cam.f[0],
            xc*cam.r[1] + yc*cam.u[1] + z*cam.f[1],
            xc*cam.r[2] + yc*cam.u[2] + z*cam.f[2] ];
}

function sepDeg( a, b )
{
   const d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
   return Math.acos( Math.max( -1, Math.min( 1, d ) ) )*180/Math.PI;
}

{
   // The inverse must land back on the pixel the forward projection produced,
   // otherwise nothing below means anything.
   let worst = 0;
   for ( const fov of [ 12, 60, 120, 168 ] )
      for ( const roll of [ 0, 37, 211 ] )
      {
         const cam = M.makeCamera( 83.8, -5.4, fov, roll, 1920, 1080 );
         for ( const x of [ 40, 400, 960, 1500, 1880 ] )
            for ( const y of [ 30, 300, 540, 900, 1050 ] )
            {
               const v = screenToVec( cam, x, y );
               const dec = Math.asin( Math.max( -1, Math.min( 1, v[2] ) ) )*180/Math.PI;
               let ra = Math.atan2( v[1], v[0] )*180/Math.PI;
               if ( ra < 0 ) ra += 360;
               const p = M.projectToScreen( cam, ra, dec );
               worst = Math.max( worst, Math.hypot( p.x - x, p.y - y ) );
            }
      }
   assert.ok( worst < 1e-6,
      `the test's own screen-to-sky inverse does not round-trip (${worst} px)` );
}

// --- the scale bar spans the angle its label states -------------------------
//
// scaleBar sizes the bar with W/fovDeg pixels per degree, which is the scale a
// LINEAR projection would have. The renderer is stereographic: the scale grows
// away from the centre, and drawZoomOverlay puts the bar in the bottom-right
// corner, the furthest point from it. So the bar is measured where it is drawn.

{
   const MARGIN_U = 40;                          // drawZoomOverlay: margin = 40*(H/1080)
   let worstRatio = 1;
   for ( const [ W, H ] of [ [ 1920, 1080 ], [ 1080, 1920 ], [ 1080, 1080 ] ] )
      for ( const fov of [ 4, 12, 30, 60, 100, 140, 168 ] )
         for ( const roll of [ 0, 29 ] )
         {
            const cam = M.makeCamera( 83.8, -5.4, fov, roll, W, H );
            const margin = Math.round( MARGIN_U*( H/1080 ) );
            const by = H - margin, bx1 = W - margin;
            const sb = M.scaleBar( cam, bx1, by );
            const bx0 = bx1 - sb.lengthPx;
            const spanned = sepDeg( screenToVec( cam, bx0, by ), screenToVec( cam, bx1, by ) );

            // The label is what the user reads; formatAngle rounds it, so the
            // claim is only ever as precise as the string.
            const claimed = parseFloat( sb.label );
            const stated = sb.label.indexOf( "\u00B0" ) >= 0 ? claimed          // degree
                         : sb.label.indexOf( "\u2032" ) >= 0 ? claimed/60       // prime
                         : claimed/3600;                                        // double prime
            const ratio = Math.max( stated/spanned, spanned/stated );
            if ( ratio > worstRatio )
               worstRatio = ratio;
         }
   // 2% covers what formatAngle's rounding can add on its own.
   assert.ok( worstRatio <= 1.02,
      `the scale bar is off by up to ${( ( worstRatio - 1 )*100 ).toFixed( 1 )}% ` +
      `between what it spans and what it says` );
}

// --- formatting bounds do not slip a digit ----------------------------------
//
// Every one of these is a boundary the rounding crosses. They are pinned because
// a caption that reads "60 min" or "0h60" is the kind of thing nobody notices in
// review and everybody notices in a video.

assert.strictEqual( M.formatDuration( 59.4 ), "59 s" );
assert.strictEqual( M.formatDuration( 59.6 ), "1 min" );
assert.strictEqual( M.formatDuration( 3569 ), "59 min" );
assert.strictEqual( M.formatDuration( 3599 ), "1h00" );
assert.strictEqual( M.formatDuration( 3660 ), "1h01" );
assert.strictEqual( M.formatDuration( 86399 ), "24h00" );
assert.strictEqual( M.formatDuration( 0 ), "0 s" );

// A bad sub raises the noise. The doctrine is that the figure then goes DOWN in
// front of the user rather than being hidden, so the negative path is pinned.
assert.strictEqual( M.formatSnrGainDb( 1, 2 ), "-6.0 dB" );
assert.strictEqual( M.formatSnrGainDb( 2, 1 ), "+6.0 dB" );
assert.strictEqual( M.formatSnrGainDb( 1, 1 ), "+0.0 dB" );

// --- sidereal time has an absolute anchor -----------------------------------
//
// The alt-az chain rests on gmstDeg, and the only check on it tolerates 1.5
// degrees — about four minutes of time, enough to move the horizon and the
// cardinal points in the opening. J2000.0 is the published anchor.
near( M.gmstDeg( 2451545.0 ), 280.46061837, 1e-6, "GMST at J2000.0" );

console.log( "announced.test.js OK" );
