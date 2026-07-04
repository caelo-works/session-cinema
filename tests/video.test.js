// Render cadence, output geometry and the ffmpeg command line.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

// computeRenderIndices: few frames -> render all
assert.deepStrictEqual( M.computeRenderIndices( 5, 30, 12 ), [ 1, 2, 3, 4, 5 ] );
assert.deepStrictEqual( M.computeRenderIndices( 0, 30, 12 ), [] );

// many frames -> about fps*duration renders, strictly increasing, ends at N
{
   const idx = M.computeRenderIndices( 1000, 30, 12 );
   assert.strictEqual( idx[ 0 ], 1 );
   assert.strictEqual( idx[ idx.length - 1 ], 1000 );
   assert.ok( Math.abs( idx.length - 360 ) <= 2, "about 360 renders, got " + idx.length );
   for ( let i = 1; i < idx.length; ++i )
      assert.ok( idx[ i ] > idx[ i - 1 ], "strictly increasing" );
}

// exact fit boundary
{
   const idx = M.computeRenderIndices( 360, 30, 12 );
   assert.strictEqual( idx.length, 360 );
}

// computeCoverRect — crop fills, letterbox fits
{
   // 4:3 source into 16:9 frame, crop: width matches, height overflows
   const r = M.computeCoverRect( 4000, 3000, 1920, 1080, M.FIT_CROP );
   assert.strictEqual( r.x0, 0 );
   assert.strictEqual( r.x1, 1920 );
   assert.ok( r.y0 < 0 && r.y1 > 1080, "crop overflows vertically" );
   assert.strictEqual( ( r.y0 + r.y1 ), 1080, "vertically centered" );
}
{
   const r = M.computeCoverRect( 4000, 3000, 1920, 1080, M.FIT_LETTERBOX );
   assert.ok( r.x0 >= 0 && r.x1 <= 1920 && r.y0 >= 0 && r.y1 <= 1080, "letterbox stays inside" );
   assert.strictEqual( r.y0, 0 );
   assert.ok( r.x0 > 0, "pillarboxed horizontally" );
}
{
   // same aspect: exact cover either way
   const a = M.computeCoverRect( 3840, 2160, 1920, 1080, M.FIT_CROP );
   assert.deepStrictEqual( a, { x0: 0, y0: 0, x1: 1920, y1: 1080 } );
}

// buildFfmpegArgs
{
   const args = M.buildFfmpegArgs( {
      fps: 30, framesPattern: "/out/f-frames/frame_%05d.png", crf: 18,
      holdFirst: 1, holdLast: 3, outputPath: "/out/m42-stack.mp4"
   } );
   assert.strictEqual( args[ 0 ], "-y" );
   assert.ok( args.includes( "libx264" ) );
   assert.ok( args.includes( "yuv420p" ), "yuv420p required for social players" );
   const vf = args[ args.indexOf( "-vf" ) + 1 ];
   assert.strictEqual( vf, "tpad=start_mode=clone:start_duration=1:stop_mode=clone:stop_duration=3" );
   assert.strictEqual( args[ args.length - 1 ], "/out/m42-stack.mp4" );
   assert.strictEqual( args[ args.indexOf( "-crf" ) + 1 ], "18" );
}
{
   const args = M.buildFfmpegArgs( {
      fps: 25, framesPattern: "p", crf: 20, holdFirst: 0, holdLast: 0, outputPath: "o"
   } );
   assert.ok( !args.includes( "-vf" ), "no tpad filter without holds" );
}

// shellQuote
assert.strictEqual( M.shellQuote( 'a "b" c' ), '"a \\"b\\" c"' );

// buildEncodeScriptText — .bat doubles every literal % (cmd.exe expansion)
{
   const args = [ "-i", "C:/out/frames/frame_%05d.png", "C:/out/video.mp4" ];
   const bat = M.buildEncodeScriptText( true, args );
   assert.ok( bat.includes( "frame_%%05d.png" ), bat );
   assert.ok( !bat.split( "%%" ).join( "" ).includes( "%" ), "no lone % left in the .bat" );
   assert.ok( bat.startsWith( "@echo off\r\n" ) );
   const sh = M.buildEncodeScriptText( false, args );
   assert.ok( sh.includes( "frame_%05d.png" ), sh );
   assert.ok( sh.startsWith( "#!/bin/sh\n" ) );
}

// frameFileName
assert.strictEqual( M.frameFileName( 1 ), "frame_00001.png" );
assert.strictEqual( M.frameFileName( 12345 ), "frame_12345.png" );

console.log( "video.test.js OK" );
