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
