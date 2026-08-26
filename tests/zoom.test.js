// Zoom Odyssey math: WCS gnomonic, stereographic camera, path, catalogs.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

const near = ( a, b, eps, msg ) => assert.ok( Math.abs( a - b ) <= ( eps || 1e-6 ), ( msg || "" ) + " got " + a + " want " + b );

// --- WCS: synthetic 1"/px TAN solve, RA axis flipped (standard orientation) ---
{
   // cd in deg/px: x pixel -> -1"/px in RA-tangent, y pixel -> +1"/px in Dec
   const s = 1/3600;
   const wcs = M.makeWcs( 100, 20, 1920, 1080, [ [ -s, 0 ], [ 0, s ] ] );
   const c = M.wcsPixelToSky( wcs, 1920, 1080 );
   near( c.ra, 100, 1e-9, "center RA" );
   near( c.dec, 20, 1e-9, "center Dec" );

   const fr = M.wcsImageFraming( wcs, 3840, 2160 );
   near( fr.centerRA, 100, 1e-6, "framing centerRA" );
   near( fr.centerDec, 20, 1e-6, "framing centerDec" );
   near( fr.pixScaleArcsec, 1, 1e-6, "pixel scale 1 arcsec" );
   near( fr.fovDeg, 3840/3600, 1e-4, "fov = width * scale" );
   near( fr.rollDeg, 0, 1e-6, "axis-aligned -> roll 0" );

   // cd11 < 0 is the standard orientation: +x pixel is WEST (lower RA);
   // cd22 > 0 makes +y NORTH (higher Dec).
   const west = M.wcsPixelToSky( wcs, 1920 + 3600, 1080 );
   assert.ok( west.ra < 100, "standard orientation: +x -> lower RA (west)" );
   const north = M.wcsPixelToSky( wcs, 1920, 1080 + 3600 );
   assert.ok( north.dec > 20, "+y -> higher Dec (north)" );
   near( north.dec, 21, 1e-3, "1 deg north" );
}

// --- stereographic camera projection ---
{
   const cam = M.makeCamera( 100, 20, 60, 0, 1920, 1080 );
   const ctr = M.projectToScreen( cam, 100, 20 );
   near( ctr.x, 960, 1e-6, "center x" );
   near( ctr.y, 540, 1e-6, "center y" );
   assert.ok( ctr.front );

   const east = M.projectToScreen( cam, 105, 20 );   // higher RA -> left
   assert.ok( east.x < 960, "higher RA projects left" );
   assert.ok( east.y <= 540 + 1e-6, "constant-dec parallel curves up in stereographic" );

   const north = M.projectToScreen( cam, 100, 25 );  // higher Dec -> up (smaller y)
   assert.ok( north.y < 540, "higher Dec projects up" );

   // half the FOV (30 deg) north lands exactly W/2 px from center (isotropic scale)
   const edge = M.projectToScreen( cam, 100, 20 + 30 );
   near( edge.y, 540 - 960, 1e-3, "half-FOV maps to half the frame width in px" );

   // behind the projection point
   const back = M.projectToScreen( cam, 100 + 180, -20 );
   assert.strictEqual( back.front, false );
}

// --- observer-frame astronomy (alt-az) ---
{
   // vector round-trip
   const v = M.raDecToVec( 274.65, -13.86 );
   const rd = M.vecToRaDec( v );
   near( rd.ra, 274.65, 1e-9, "vec RA round-trip" );
   near( rd.dec, -13.86, 1e-9, "vec Dec round-trip" );

   // alt-az <-> ra-dec round-trip
   const lst = 120.0, lat = 43.6;
   const aa = M.raDecToAltAz( 200, 30, lst, lat );
   const back = M.altAzToRaDec( aa.alt, aa.az, lst, lat );
   near( back.ra, 200, 1e-6, "altaz round-trip RA" );
   near( back.dec, 30, 1e-6, "altaz round-trip Dec" );

   // zenith (alt 90) maps to (ra=lst, dec=lat)
   const z = M.altAzToRaDec( 90, 0, lst, lat );
   near( z.dec, lat, 1e-6, "zenith dec = latitude" );

   // REAL DATA: M 16 from lat 43.597 N, long 5.480 E at DATE-OBS
   // 2026-06-17T21:47:01.5 UTC. Headers recorded CENTALT 24.09, CENTAZ 141.99.
   const epoch = Date.UTC( 2026, 5, 17, 21, 47, 1 )/1000 + 0.5;
   const jd = M.julianDate( epoch );
   const st = M.lstDeg( jd, 5.479892 );
   const altaz = M.raDecToAltAz( 274.65, -13.862, st, 43.596928 );
   assert.ok( Math.abs( altaz.alt - 24.09 ) < 1.0, "M16 altitude ~24.09, got " + altaz.alt.toFixed( 2 ) );
   assert.ok( Math.abs( altaz.az - 141.99 ) < 1.5, "M16 azimuth ~141.99, got " + altaz.az.toFixed( 2 ) );
}

// --- location opening: target at 1/4 from the top, horizon at ~85% height ---
{
   const W = 1920, H = 1080;
   const lst = 100, lat = 43.6, targetAlt = 24, targetAz = 142;
   const sf = M.locationStartFraming( targetAlt, W, H );
   assert.ok( sf.fovDeg > 20 && sf.fovDeg < 150, "reasonable start fov: " + sf.fovDeg );

   const tRd = M.altAzToRaDec( targetAlt, targetAz, lst, lat );
   const target = { centerRA: tRd.ra, centerDec: tRd.dec, fovDeg: 1.2 };
   const obs = { lst: lst, lat: lat, targetAlt: targetAlt, targetAz: targetAz,
                 startFov: sf.fovDeg, altC: sf.altCDeg };

   // t = 0: target at 0.25·H, horizon (below target) at 0.85·H, both centered in x.
   const cam0 = M.zoomCameraLocation( 0, target, sf.fovDeg, W, H, obs );
   const pT = M.projectToScreen( cam0, tRd.ra, tRd.dec );
   near( pT.x, W/2, 2, "target horizontally centered at start" );
   near( pT.y, 0.25*H, 0.02*H, "target at 1/4 from the top" );
   const hRd = M.altAzToRaDec( 0, targetAz, lst, lat );
   const pH = M.projectToScreen( cam0, hRd.ra, hRd.dec );
   near( pH.y, 0.85*H, 0.02*H, "horizon just above the bottom overlay" );
   assert.ok( pH.y > pT.y, "horizon below target" );

   // t >= 0.4: target centered (before the surveys dominate).
   const cam4 = M.zoomCameraLocation( 0.4, target, sf.fovDeg, W, H, obs );
   const pT4 = M.projectToScreen( cam4, tRd.ra, tRd.dec );
   near( pT4.x, W/2, 1.5, "target centered x at t=0.4" );
   near( pT4.y, H/2, 1.5, "target centered y at t=0.4" );

   // t = 1: equatorial target camera — the reveal lands centered and aligned.
   const cam1 = M.zoomCameraLocation( 1, target, sf.fovDeg, W, H, obs );
   const pT1 = M.projectToScreen( cam1, tRd.ra, tRd.dec );
   near( pT1.x, W/2, 1e-6, "end centered x" );
   near( pT1.y, H/2, 1e-6, "end centered y" );
   near( cam1.fovDeg, target.fovDeg, 1e-9, "end fov = image field" );
   // north up at the end: a point 1° north of target projects straight up
   const pN = M.projectToScreen( cam1, tRd.ra, tRd.dec + 1 );
   near( pN.x, W/2, 0.5, "north is up at the end (x)" );
   assert.ok( pN.y < H/2, "north is up at the end (y)" );

   // very high target: solver falls back gracefully, target still at 1/4
   const sfHigh = M.locationStartFraming( 80, W, H );
   assert.ok( sfHigh.fovDeg <= 150, "fov clamped for high targets" );
}

// --- fast projector must be identical to projectToScreen for on-screen points ---
{
   const cams = [
      M.makeCamera( 100, 20, 60, 0, 1920, 1080 ),
      M.makeCamera( 274.65, -13.86, 8, 12, 1920, 1080 ),
      M.makeCameraFromBasis( M.raDecToVec( 40, 55 ), [ 0, 0, 1 ], 120, 0, 1080, 1920 )
   ];
   for ( const cam of cams )
   {
      const pj = M.cameraProjector( cam );
      for ( const [ ra, dec ] of [ [ 100, 20 ], [ 103, 22 ], [ 95, 18 ], [ 40, 55 ], [ 274.65, -13.86 ], [ 275, -13 ], [ 12, 8 ] ] )
      {
         const slow = M.projectToScreen( cam, ra, dec );
         const fast = M.projectVecPre( pj, M.raDecToVec( ra, dec ) );
         const onScreen = slow.front && slow.x > -8 && slow.x < cam.W + 8 && slow.y > -8 && slow.y < cam.H + 8;
         if ( onScreen )
         {
            assert.ok( fast != null, "on-screen point must not be culled" );
            near( fast.x, slow.x, 1e-6, "fast x == slow x" );
            near( fast.y, slow.y, 1e-6, "fast y == slow y" );
         }
      }
   }
}

// smootherstep: endpoints and midpoint, monotone
assert.strictEqual( M.smootherstep01( 0 ), 0 );
assert.strictEqual( M.smootherstep01( 1 ), 1 );
near( M.smootherstep01( 0.5 ), 0.5, 1e-9 );
assert.ok( M.smootherstep01( 0.3 ) < M.smootherstep01( 0.7 ), "monotone" );

// --- camera path ---
{
   const target = { centerRA: 100, centerDec: 20, fovDeg: 1.07, rollDeg: 12 };
   const c0 = M.zoomCameraAt( 0, target, 180, 1920, 1080 );
   const c1 = M.zoomCameraAt( 1, target, 180, 1920, 1080 );
   near( c0.fovDeg, 180, 1e-6, "starts at whole sky" );
   near( c1.fovDeg, 1.07, 1e-4, "ends at image field" );
   const cm = M.zoomCameraAt( 0.5, target, 180, 1920, 1080 );
   assert.ok( cm.fovDeg < 180 && cm.fovDeg > 1.07, "monotone zoom" );
   assert.strictEqual( c0.rollDeg, 0, "north kept up" );
}

// --- opacity ramps ---
{
   assert.strictEqual( M.revealAlpha( 1, 1 ), 1 );
   assert.strictEqual( M.revealAlpha( 6, 1 ), 0 );
   assert.ok( M.revealAlpha( 3, 1 ) > 0 && M.revealAlpha( 3, 1 ) < 1 );
   assert.ok( M.revealAlpha( 2, 1 ) > M.revealAlpha( 4, 1 ), "reveal grows as fov shrinks" );
   // constellations present from the whole-sky view (calmer), full mid-field, gone deep
   assert.ok( M.constellationAlpha( 180 ) > 0 && M.constellationAlpha( 180 ) < 1, "present but calm at whole sky" );
   assert.strictEqual( M.constellationAlpha( 30 ), 1 );
   assert.strictEqual( M.constellationAlpha( 3 ), 0 );
   assert.ok( M.constellationLabelAlpha( 180 ) === 0, "no names on the whole-sky shot" );
   assert.ok( M.constellationLabelAlpha( 30 ) > 0, "names in the constellation phase" );
   assert.ok( M.limitingMagnitude( 5 ) > M.limitingMagnitude( 120 ), "deeper when zoomed in" );
}

// fadeBand over a decreasing quantity (fov)
{
   assert.strictEqual( M.fadeBand( 100, 90, 40, 20, 10 ), 0, "0 above inStart" );
   assert.strictEqual( M.fadeBand( 40, 90, 40, 20, 10 ), 1, "1 at inFull" );
   assert.strictEqual( M.fadeBand( 30, 90, 40, 20, 10 ), 1, "1 in hold band" );
   assert.strictEqual( M.fadeBand( 10, 90, 40, 20, 10 ), 0, "0 at outEnd" );
   assert.ok( M.fadeBand( 65, 90, 40, 20, 10 ) > 0 && M.fadeBand( 65, 90, 40, 20, 10 ) < 1, "ramping in" );
   assert.ok( M.fadeBand( 15, 90, 40, 20, 10 ) > 0 && M.fadeBand( 15, 90, 40, 20, 10 ) < 1, "ramping out" );
}

// makeSurveyWcs round-trips its center and scale like a TAN cutout
{
   const w = M.makeSurveyWcs( 274.7, -13.8, 2.0, 1600 );
   const c = M.wcsPixelToSky( w, 800, 800 );
   near( c.ra, 274.7, 1e-6, "survey center RA" );
   near( c.dec, -13.8, 1e-6, "survey center Dec" );
   const fr = M.wcsImageFraming( w, 1600, 1600 );
   near( fr.fovDeg, 2.0, 1e-4, "survey fov" );
   // +x is west (east-left), +y is south (north-up)
   assert.ok( M.wcsPixelToSky( w, 1600, 800 ).ra < 274.7, "survey +x -> lower RA (west)" );
   assert.ok( M.wcsPixelToSky( w, 800, 0 ).dec > -13.8, "survey top -> higher Dec (north)" );
}

// scaleWcsToDims: a WCS rescaled to a different-resolution image of the SAME
// field maps corresponding pixels to the same sky (e.g. solved master -> JPEG).
{
   const s = 1/3600;
   const solved = M.makeWcs( 100, 20, 1920, 1080, [ [ -s, 0 ], [ 0, s ] ] );
   const jpg = M.scaleWcsToDims( solved, 3840, 2160, 1920, 1080 );   // half-res JPEG
   // center of each maps to the same sky point
   const cS = M.wcsPixelToSky( solved, 1920, 1080 );
   const cJ = M.wcsPixelToSky( jpg, 960, 540 );
   near( cJ.ra, cS.ra, 1e-9, "same center RA after rescale" );
   near( cJ.dec, cS.dec, 1e-9, "same center Dec after rescale" );
   // a corner maps to the same sky in both grids
   const kS = M.wcsPixelToSky( solved, 3840, 2160 );
   const kJ = M.wcsPixelToSky( jpg, 1920, 1080 );
   near( kJ.ra, kS.ra, 1e-9, "same corner RA" );
   near( kJ.dec, kS.dec, 1e-9, "same corner Dec" );
   // the rescaled field width is unchanged
   near( M.wcsImageFraming( jpg, 1920, 1080 ).fovDeg,
         M.wcsImageFraming( solved, 3840, 2160 ).fovDeg, 1e-9, "same field width" );
}

// cropWcs: a reveal image mapped by solvedPixel = offset + revealPixel*scale
// lands on the sky the alignment implies.
{
   const s = 1/3600;
   const solved = M.makeWcs( 100, 20, 1920, 1080, [ [ -s, 0 ], [ 0, s ] ] );
   const offX = 300, offY = 150, scale = 0.5;
   const rev = M.cropWcs( solved, offX, offY, scale );
   // reveal pixel (rx,ry) must map to the sky at solved pixel (offX+rx*scale, offY+ry*scale)
   for ( const [ rx, ry ] of [ [ 0, 0 ], [ 400, 220 ], [ 1000, 640 ] ] )
   {
      const a = M.wcsPixelToSky( rev, rx, ry );
      const b = M.wcsPixelToSky( solved, offX + rx*scale, offY + ry*scale );
      near( a.ra, b.ra, 1e-9, "cropWcs RA at " + rx + "," + ry );
      near( a.dec, b.dec, 1e-9, "cropWcs Dec at " + rx + "," + ry );
   }
   // scale 1, offset 0 is the identity
   const id = M.cropWcs( solved, 0, 0, 1 );
   const c1 = M.wcsPixelToSky( id, 500, 500 ), c2 = M.wcsPixelToSky( solved, 500, 500 );
   near( c1.ra, c2.ra, 1e-12 ); near( c1.dec, c2.dec, 1e-12 );

   // cropWcs with rotation + flip: revealPixel maps to solved(offset + R(rot)·S·F·revealPixel)
   // — the SAME R(+θ) convention as the popup preview (revealPlacement), so what
   // the user aligns is what renders. Measured end-to-end against DSS2 (a 32°
   // reveal renders as a 2·θ-rotated ghost under the old negated convention).
   const rot = 30, fh = true, fv = false, sc = 0.7, ox = 400, oy = 250;
   const rc = M.cropWcs( solved, ox, oy, sc, rot, fh, fv );
   const th = rot*Math.PI/180, cc = Math.cos( th ), ss = Math.sin( th );
   const fxs = -1, fys = 1;
   for ( const [ rx, ry ] of [ [ 0, 0 ], [ 640, 360 ], [ 100, 900 ] ] )
   {
      const mx = cc*( sc*fxs*rx ) - ss*( sc*fys*ry );
      const my = ss*( sc*fxs*rx ) + cc*( sc*fys*ry );
      const a = M.wcsPixelToSky( rc, rx, ry );
      const b = M.wcsPixelToSky( solved, ox + mx, oy + my );
      near( a.ra, b.ra, 1e-9, "crop rot/flip RA at " + rx + "," + ry );
      near( a.dec, b.dec, 1e-9, "crop rot/flip Dec at " + rx + "," + ry );
   }

   // cropWcsCentered: rotation pivots on the reveal centre. The centre pixel
   // maps to (cx,cy); at 0 rotation it's cropWcs with offset = centre - scale*half.
   const rW = 1280, rH = 720, cx = 1500, cy = 1000;
   const cen = M.cropWcsCentered( solved, cx, cy, sc, rot, fh, fv, rW, rH );
   const mid = M.wcsPixelToSky( cen, rW/2, rH/2 );
   const want = M.wcsPixelToSky( solved, cx, cy );
   near( mid.ra, want.ra, 1e-9, "reveal centre lands at (cx,cy)" );
   near( mid.dec, want.dec, 1e-9, "reveal centre lands at (cx,cy)" );
   // equivalence to offset form (same R(+θ) convention)
   const th2 = rot*Math.PI/180, cc2 = Math.cos( th2 ), ss2 = Math.sin( th2 );
   const mxh = cc2*( sc*(-1)*rW/2 ) - ss2*( sc*1*rH/2 );
   const myh = ss2*( sc*(-1)*rW/2 ) + cc2*( sc*1*rH/2 );
   const off = M.cropWcs( solved, cx - mxh, cy - myh, sc, rot, fh, fv );
   const A = M.wcsPixelToSky( cen, 200, 300 ), B = M.wcsPixelToSky( off, 200, 300 );
   near( A.ra, B.ra, 1e-12 ); near( A.dec, B.dec, 1e-12 );
}

// constellation centroids from border segments (x in degrees)
{
   const borders = JSON.stringify( [
      { c1: "AAA", c2: "BBB", pol: [ { x: 10, y: 20 }, { x: 12, y: 22 } ] },
      { c1: "AAA", c2: "CCC", pol: [ { x: 8, y: 18 } ] }
   ] );
   const cen = M.constellationCentroids( borders );
   assert.ok( cen.AAA && cen.BBB && cen.CCC );
   near( cen.BBB.ra, 11, 0.5, "BBB centroid RA ~ mean of its two points" );
   assert.ok( cen.AAA.dec > 17 && cen.AAA.dec < 23, "AAA centroid dec in range" );
}

// hips2fits URL points at the CDS/Aladin service with the right params
{
   const u = M.hips2fitsUrl( "CDS/P/DSS2/color", 274.7, -13.8, 1.5, 1600 );
   assert.ok( u.indexOf( "alasky.cds.unistra.fr" ) > 0, "CDS host" );
   assert.ok( u.indexOf( "hips2fits" ) > 0 );
   assert.ok( u.indexOf( "projection=TAN" ) > 0 );
   assert.ok( u.indexOf( "ra=274.7" ) > 0 && u.indexOf( "dec=-13.8" ) > 0 );
   assert.ok( u.indexOf( "fov=1.5" ) > 0 && u.indexOf( "width=1600" ) > 0 );
}

// --- scale bar / angle formatting ---
assert.strictEqual( M.formatAngle( 1 ), "1°" );
assert.strictEqual( M.formatAngle( 0.5 ), "30′" );
assert.strictEqual( M.formatAngle( 15/60 ), "15′" );
assert.strictEqual( M.formatAngle( 0.5/60 ), "30″" );
assert.strictEqual( M.niceAngle( 40 ), 30 );
assert.strictEqual( M.niceAngle( 0.9 ), 0.5 );
// scaleBar itself is checked in tests/announced.test.js, against the sky its bar
// actually covers rather than against its own formula. Asserting here that it
// computes what it computes is what let a bar labelled 30 degrees span 10.

// --- angular separation ---
near( M.angularSepDeg( 100, 20, 100, 20 ), 0, 1e-9 );
near( M.angularSepDeg( 0, 0, 180, 0 ), 180, 1e-6 );
// Betelgeuse (88.79,7.41) to Rigel (78.63,-8.20) ~ 18.6 deg
near( M.angularSepDeg( 88.793, 7.407, 78.634, -8.202 ), 18.65, 0.2, "Betelgeuse-Rigel" );

// --- catalog parsers ---
{
   const csv = "id,alpha,delta,magnitude,x\n" +
               "alf Ori,88.792939,7.407064,0.42,z\n" +
               "faint,10,10,9.9,z\n";
   const all = M.parseStarCatalog( csv );
   assert.strictEqual( all.length, 2 );
   near( all[0].ra, 88.792939, 1e-6 );
   near( all[0].dec, 7.407064, 1e-6 );
   near( all[0].mag, 0.42, 1e-6 );
   const bright = M.parseStarCatalog( csv, 6 );
   assert.strictEqual( bright.length, 1, "magnitude limit drops the faint star" );
}
{
   // ConstellationLines: x in hours -> degrees (Betelgeuse vertex 5.9194h)
   const json = JSON.stringify( [ { pol: [ { x: 5.919444, y: 7.4 }, { x: 5.6794, y: -1.95 } ] },
                                  { pol: [ { x: 1.0, y: 0 } ] } ] );
   const polys = M.parseConstellationLines( json );
   assert.strictEqual( polys.length, 1, "single-point polylines dropped" );
   near( polys[0][0].ra, 5.919444*15, 1e-4, "hours -> degrees" );
   near( polys[0][0].dec, 7.4, 1e-6 );
}

// --- zoomEndFov: the final framing must obey Framing, not always contain ------
//
// The camera fov is HORIZONTAL (it spans W). An image of angular width P and
// pixel aspect revealW:revealH lands in a W:H frame with
//   width  filled when fov = P
//   height filled when fov = P*(revealH/revealW)*(W/H)
// so "fill" takes the smaller of the two and "fit" the larger.
{
   const P = 1.2;                                   // 1.2 deg wide plate solve
   const [ rw, rh ] = [ 6000, 4000 ];               // a 3:2 reveal

   // matching aspect -> the two candidates collapse: both modes agree, and the
   // value is the one the pre-fix build produced. This is the regression guard:
   // an existing 3:2 render must not move by a single frame.
   // Exactly, not to within a rounding step: the camera path of an existing
   // render must not move at all, and Math.min/max over two float expressions
   // would not promise that.
   for ( const mode of [ M.FIT_CROP, M.FIT_LETTERBOX ] )
   {
      assert.strictEqual( M.zoomEndFov( P, rw, rh, 3000, 2000, mode ), P,
                          "aspect match: fill and fit are the same framing" );
      // 16:9 output, 16:9 reveal — the case that hid the bug for a whole release
      assert.strictEqual( M.zoomEndFov( P, 1920, 1080, 1920, 1080, mode ), P );
      assert.strictEqual( M.zoomEndFov( P, 6000, 3375, 3840, 2160, mode ), P, "4K" );
   }

   // 9:16 output, 16:9 reveal: fit contains the whole image (the letterboxed
   // render), fill crops it. Fill must be the SMALLER field, by a lot.
   const fit = M.zoomEndFov( P, 1920, 1080, 1080, 1920, M.FIT_LETTERBOX );
   const fill = M.zoomEndFov( P, 1920, 1080, 1080, 1920, M.FIT_CROP );
   near( fit, P, 1e-12, "fit on a landscape reveal is constrained by the width" );
   near( fill, P*( 1080/1920 )*( 1080/1920 ), 1e-12 );
   assert.ok( fill < fit/3, `fill must crop hard here: ${fill} vs ${fit}` );

   // What the two modes MEAN, checked as coverage of the output frame rather
   // than as formulas: with the camera at fov, the image spans P/fov of the
   // width and (P*rh/rw)/(fov*H/W) of the height.
   const spans = ( fov, W, H ) => ( { x: P/fov, y: ( P*1080/1920 )/( fov*H/W ) } );
   {
      const s = spans( fill, 1080, 1920 );
      assert.ok( s.x > 1 - 1e-9 && s.y > 1 - 1e-9, `fill leaves no gap: ${JSON.stringify( s )}` );
      near( Math.min( s.x, s.y ), 1, 1e-9, "fill touches exactly one axis" );
   }
   {
      const s = spans( fit, 1080, 1920 );
      assert.ok( s.x < 1 + 1e-9 && s.y < 1 + 1e-9, `fit crops nothing: ${JSON.stringify( s )}` );
      near( Math.max( s.x, s.y ), 1, 1e-9, "fit touches exactly one axis" );
      assert.ok( s.y < 0.35, `fit on 9:16 is mostly black — that is the bug: ${s.y}` );
   }

   // 1:1 output is the other advertised format that differs from any usual reveal
   near( M.zoomEndFov( P, rw, rh, 1080, 1080, M.FIT_CROP ), P*( 2/3 ), 1e-12 );
   near( M.zoomEndFov( P, rw, rh, 1080, 1080, M.FIT_LETTERBOX ), P, 1e-12 );
}

console.log( "zoom.test.js OK" );

// --- the wide survey reveal: measured drift, measured seams ---------------
//
// A survey cutout spanning tens of degrees is placed by composing the cutout's
// gnomonic WCS with the stereographic camera. That composition is neither linear
// nor conformal, so a single similarity cannot express it and the cutout drifts
// off the stars drawn over it. The reveal answers by cutting the source into
// tiles with one affine each. Two properties have to hold, and neither of them is
// about how many draw calls happen:
//
//   drift — how far a source pixel lands from where its own sky position projects
//   seam  — how far two neighbouring tiles disagree about the edge they share
//
// The second is the one that bites: trading an invisible drift for a visible grid
// of cracks across the sky would be a worse product, not a better one.
{
   const WIDE = 2600;

   // PixInsight's rotateTransformation is CLOCKWISE and ignores negative angles.
   const Rp = t => [ [ Math.cos( t ), Math.sin( t ) ], [ -Math.sin( t ), Math.cos( t ) ] ];

   // 1. the decomposition is exact, and stays inside what the API accepts
   {
      let worst = 0, lo = Infinity, hi = -Infinity;
      let seed = 12345;
      const rnd = () => { seed = ( seed*1103515245 + 12345 ) & 0x7fffffff; return seed/0x7fffffff*4 - 2; };
      for ( let k = 0; k < 20000; ++k )
      {
         const ax = rnd(), ay = rnd(), bx = rnd(), by = rnd();
         const d = M.decomposeAffine( ax, ay, bx, by );
         const R1 = Rp( d.a1 ), R2 = Rp( d.a2 );
         // Rp(a1) . diag(sx,sy) . Rp(a2)
         const m00 = R1[0][0]*d.sx*R2[0][0] + R1[0][1]*d.sy*R2[1][0];
         const m01 = R1[0][0]*d.sx*R2[0][1] + R1[0][1]*d.sy*R2[1][1];
         const m10 = R1[1][0]*d.sx*R2[0][0] + R1[1][1]*d.sy*R2[1][0];
         const m11 = R1[1][0]*d.sx*R2[0][1] + R1[1][1]*d.sy*R2[1][1];
         worst = Math.max( worst, Math.abs( m00 - ax ), Math.abs( m01 - bx ),
                                  Math.abs( m10 - ay ), Math.abs( m11 - by ) );
         lo = Math.min( lo, d.a1, d.a2 ); hi = Math.max( hi, d.a1, d.a2 );
      }
      assert.ok( worst < 1e-9, `decomposeAffine does not reconstruct its input (worst ${worst})` );
      assert.ok( lo >= 0 && hi < 2*Math.PI,
         `rotateTransformation ignores negative angles: got ${lo} .. ${hi}, must be [0, 2pi)` );
   }

   // 2. a mirrored placement survives as a negative y scale, and a similarity
   //    comes back conformal — the single-blit path is the degenerate case of the
   //    tiled one, not a second implementation of it
   {
      const m = M.decomposeAffine( 1, 0, 0, -1 );
      assert.ok( m.sy < 0, "a mirrored placement must decompose to a negative y scale" );
      const s = 0.7152, nx = 0.9962, ny = -0.0872;      // a rotated, unmirrored similarity
      const c = M.decomposeAffine( s*nx, s*ny, -s*ny, s*nx );
      near( c.sx, c.sy, 1e-9, "a similarity must decompose to equal axis scales" );
   }

   // 2b. the conformal path is unchanged. blitOriented now goes through the same
   //     primitive, so prove the matrix it builds is the one it used to hand to
   //     translate/rotate/scale: columns (ux,uy) and flip*perp(u), against
   //     Rp(angle) . diag(scale, scale*flip) with angle = -atan2(uy,ux).
   {
      let seed = 777;
      const rnd = () => { seed = ( seed*1103515245 + 12345 ) & 0x7fffffff; return seed/0x7fffffff; };
      let worst = 0;
      for ( let k = 0; k < 5000; ++k )
      {
         const scale = 0.05 + rnd()*3, dir = rnd()*2*Math.PI, flip = rnd() < 0.5 ? -1 : 1;
         const ux = scale*Math.cos( dir ), uy = scale*Math.sin( dir );
         const angle = ( 2*Math.PI - Math.atan2( uy, ux ) ) % ( 2*Math.PI );
         const R = Rp( angle );
         const oldA = [ [ R[0][0]*scale, R[0][1]*scale*flip ],
                        [ R[1][0]*scale, R[1][1]*scale*flip ] ];
         const newA = [ [ ux, -flip*uy ], [ uy, flip*ux ] ];
         worst = Math.max( worst, Math.abs( oldA[0][0] - newA[0][0] ), Math.abs( oldA[0][1] - newA[0][1] ),
                                  Math.abs( oldA[1][0] - newA[1][0] ), Math.abs( oldA[1][1] - newA[1][1] ) );
      }
      assert.ok( worst < 1e-12,
         `the conformal placement changed: the alignment preview and the stack reveal ` +
         `would no longer agree with the renderer (worst ${worst})` );
   }

   // 3. small fields cost nothing: a sub-degree image measures no bow and takes the
   //    single blit, and a few-degree survey needs a handful of tiles, not a grid
   {
      const scrOf = ( cam, wcs ) => ( px, py ) => {
         const sky = M.wcsPixelToSky( wcs, px, py );
         return M.projectToScreen( cam, sky.ra, sky.dec );
      };
      for ( const [ fov, px, cap ] of [ [ 0.8, 4000, 1 ], [ 1.5, 4000, 1 ],
                                        [ 3.0, 4000, 2 ], [ 7.5, 3200, 4 ] ] )
         for ( const mult of [ 0.95, 1.2, 2.0 ] )
         {
            const cam = M.makeCamera( 274.7, -13.8, fov*mult, 11, 1920, 1080 );
            const wcs = M.makeSurveyWcs( 274.7, -13.8, fov, px );
            const n = M.revealTileCount( scrOf( cam, wcs ), px, px );
            assert.ok( n <= cap,
               `a ${fov} degree field asked for ${n}x${n} tiles, more than the ${cap} it needs` );
         }
   }

   // 4. the wide survey, over the whole band it is visible in: fadeBand keeps it
   //    on screen between 0.95x and 2.8x its own field, at any roll
   {
      const single = ( scr, w, h ) => {          // the placement before tiling
         const c = scr( w/2, h/2 ), ex = scr( w, h/2 ), ey = scr( w/2, 0 );
         const ux = ( ex.x - c.x )/( w/2 ), uy = ( ex.y - c.y )/( w/2 );
         const wyx = ( ey.x - c.x )/( -h/2 ), wyy = ( ey.y - c.y )/( -h/2 );
         const flip = ( ux*wyy - uy*wyx < 0 ) ? -1 : 1;
         return ( sx, sy ) => {
            const a = sx - w/2, b = sy - h/2;
            return { x: c.x + ux*a - flip*uy*b, y: c.y + uy*a + flip*ux*b };
         };
      };
      const affine = t => ( sx, sy ) =>
         ( { x: t.ox + t.ax*( sx - t.x0 ) + t.bx*( sy - t.y0 ),
             y: t.oy + t.ay*( sx - t.x0 ) + t.by*( sy - t.y0 ) } );

      let worstSeam = 0, worstAfter = 0, worstBefore = 0, worstN = 0;
      for ( const wideFov of [ 35, 45, 60 ] )
         for ( const mult of [ 0.95, 1.2, 1.6, 2.2, 2.8 ] )
            for ( const roll of [ 0, 17, 73, 195 ] )
            {
               const cam = M.makeCamera( 274.7, -13.8, wideFov*mult, roll, 1920, 1080 );
               const wcs = M.makeSurveyWcs( 274.7, -13.8, wideFov, WIDE );
               const scr = ( px, py ) => {
                  const sky = M.wcsPixelToSky( wcs, px, py );
                  return M.projectToScreen( cam, sky.ra, sky.dec );
               };
               const n = M.revealTileCount( scr, WIDE, WIDE );
               assert.ok( n > 1, `a ${wideFov} degree cutout at ${( wideFov*mult ).toFixed( 0 )} degrees must tile` );
               worstN = Math.max( worstN, n );

               const tiles = M.revealTiles( scr, WIDE, WIDE, n );
               assert.strictEqual( tiles.length, n*n,
                  "every tile must be placed when nothing is culled" );

               // Culling must never drop a tile that shows: compare against the
               // uncut list, tile by tile, on the tile's own drawn quad.
               const kept = new Set( M.revealTiles( scr, WIDE, WIDE, n, 1920, 1080 )
                                      .map( t => `${t.x0},${t.y0}` ) );
               for ( const t of tiles )
               {
                  const q = [ [ t.x0, t.y0 ], [ t.x1, t.y0 ], [ t.x0, t.y1 ], [ t.x1, t.y1 ] ]
                     .map( ( [ sx, sy ] ) => ( { x: t.ox + t.ax*( sx - t.x0 ) + t.bx*( sy - t.y0 ),
                                                 y: t.oy + t.ay*( sx - t.x0 ) + t.by*( sy - t.y0 ) } ) );
                  const onScreen = Math.max( ...q.map( p => p.x ) ) >= 0 &&
                                   Math.min( ...q.map( p => p.x ) ) <= 1920 &&
                                   Math.max( ...q.map( p => p.y ) ) >= 0 &&
                                   Math.min( ...q.map( p => p.y ) ) <= 1080;
                  if ( onScreen )
                     assert.ok( kept.has( `${t.x0},${t.y0}` ),
                        `culling dropped a tile that is on screen (${t.x0},${t.y0})` );
               }
               const index = new Map();
               tiles.forEach( t => index.set( `${t.x0},${t.y0}`, t ) );

               // drift: a source pixel against its own projected sky position
               const before = single( scr, WIDE, WIDE );
               for ( const t of tiles )
               {
                  const f = affine( t );
                  for ( const [ sx, sy ] of [ [ t.x0, t.y0 ], [ t.x1, t.y0 ], [ t.x0, t.y1 ],
                                              [ t.x1, t.y1 ], [ ( t.x0 + t.x1 )/2, ( t.y0 + t.y1 )/2 ] ] )
                  {
                     const k = scr( sx, sy ), g = f( sx, sy ), b = before( sx, sy );
                     worstAfter  = Math.max( worstAfter,  Math.hypot( g.x - k.x, g.y - k.y ) );
                     worstBefore = Math.max( worstBefore, Math.hypot( b.x - k.x, b.y - k.y ) );
                  }
               }

               // seam: the two tiles sharing an edge, sampled along the whole edge
               for ( const t of tiles )
               {
                  const right = index.get( `${t.x1},${t.y0}` );
                  const below = index.get( `${t.x0},${t.y1}` );
                  const fa = affine( t );
                  if ( right )
                  {
                     const fb = affine( right );
                     for ( let q = 0; q <= 8; ++q )
                     {
                        const y = t.y0 + q*( t.y1 - t.y0 )/8;
                        const a = fa( t.x1, y ), b = fb( t.x1, y );
                        worstSeam = Math.max( worstSeam, Math.hypot( a.x - b.x, a.y - b.y ) );
                     }
                  }
                  if ( below )
                  {
                     const fb = affine( below );
                     for ( let q = 0; q <= 8; ++q )
                     {
                        const x = t.x0 + q*( t.x1 - t.x0 )/8;
                        const a = fa( x, t.y1 ), b = fb( x, t.y1 );
                        worstSeam = Math.max( worstSeam, Math.hypot( a.x - b.x, a.y - b.y ) );
                     }
                  }
               }
            }

      // The seam is the budget the tile count is solved for. This is the assertion
      // that keeps REVEAL_SEAM_K honest: if the law ever stops holding, this fails
      // rather than the product growing a visible grid nobody measured.
      assert.ok( worstSeam <= M.REVEAL_SEAM_BUDGET_PX,
         `neighbouring tiles disagree by ${worstSeam.toFixed( 3 )} px, over the ` +
         `${M.REVEAL_SEAM_BUDGET_PX} px budget the tile count is solved for` );
      // And the drift the tiling exists to remove really is removed.
      assert.ok( worstAfter < worstBefore/8,
         `tiling must cut the drift by at least 8x: ${worstBefore.toFixed( 1 )} px -> ` +
         `${worstAfter.toFixed( 1 )} px` );
      assert.ok( worstAfter < 2,
         `the survey still lands ${worstAfter.toFixed( 2 )} px off the stars drawn over it` );

      console.log( `zoom reveal: worst drift ${worstBefore.toFixed( 1 )} px -> ` +
                   `${worstAfter.toFixed( 2 )} px, worst seam ${worstSeam.toFixed( 3 )} px, ` +
                   `up to ${worstN}x${worstN} tiles` );
   }
}

console.log( "zoom.test.js OK (reveal placement)" );

// --- a reveal delivered at another aspect is a crop, not a squash ------------
{
   // 6000x4000 solved at 1"/px = 1.6667 deg across, exported 16:9 as 6000x3375.
   const solved = M.makeWcs( 274.7, -13.8, 3000, 2000,
      [ [ -1/3600, 0 ], [ 0, -1/3600 ] ] );
   const before = M.wcsImageFraming( M.scaleWcsToDims( solved, 6000, 4000, 6000, 3375 ),
                                     6000, 3375 );
   const after = M.wcsImageFraming( M.scaleWcsCropped( solved, 6000, 4000, 6000, 3375 ),
                                    6000, 3375 );
   near( before.fovDeg, 1.8144, 1e-3, "the old scaling inflated the field" );
   near( after.fovDeg, 6000/3600, 1e-9, "one factor keeps the true field" );
   // The centre must not move: a centred crop is still centred on the target.
   near( after.centerRA, 274.7, 1e-9, "centre RA" );
   near( after.centerDec, -13.8, 1e-9, "centre dec" );

   // Matching aspects: identical to the old behaviour.
   const a = M.scaleWcsCropped( solved, 6000, 4000, 3000, 2000 );
   const b = M.scaleWcsToDims( solved, 6000, 4000, 3000, 2000 );
   for ( const k of [ "refRA", "refDec", "refX", "refY" ] )
      near( a[ k ], b[ k ], 1e-9, `matching aspect: ${k}` );
   near( a.cd[ 0 ][ 0 ], b.cd[ 0 ][ 0 ], 1e-12 );
   near( a.cd[ 1 ][ 1 ], b.cd[ 1 ][ 1 ], 1e-12 );

   // A crop that preserves the height instead.
   const tall = M.wcsImageFraming( M.scaleWcsCropped( solved, 6000, 4000, 4500, 4000 ),
                                   4500, 4000 );
   near( tall.fovDeg, 4500/3600, 1e-9, "width cropped, pixel scale unchanged" );
}

console.log( "zoom.test.js OK (cropped reveal)" );

// --- the opening field ---------------------------------------------------
{
   // Sky mode: never past a full-sky 180, whatever the plate solve.
   assert.strictEqual( M.zoomStartFov( 74, 0, 180 ), 180,
      "a 74 degree solve used to open at 296" );
   assert.strictEqual( M.zoomStartFov( 74, 0, 0 ), 180 );
   assert.strictEqual( M.zoomStartFov( 1.5, 0, 180 ), 180 );
   // A narrow field still gets its P*4 floor.
   assert.strictEqual( M.zoomStartFov( 2, 0, 6 ), 8 );
   assert.strictEqual( M.zoomStartFov( 2, 0, 40 ), 40 );

   // Location mode: the solved framing is the constraint, nothing overrides it.
   const sf = M.locationStartFraming( 20, 1920, 1080 );
   assert.ok( sf.fovDeg > 0 );
   assert.strictEqual( M.zoomStartFov( 20, sf.fovDeg, 180 ), sf.fovDeg,
      "P*4 used to win the max and open on a field altC was not solved for" );
}

console.log( "zoom.test.js OK (opening field)" );

// --- the imagery in the video is credited ------------------------------------
{
   const c = M.surveyCredit( "CDS/P/DSS2/color" );
   assert.ok( c.indexOf( "DSS2" ) >= 0, c );
   assert.ok( c.indexOf( "STScI" ) >= 0, "DSS is STScI's, and they ask to be named" );
   assert.ok( c.indexOf( "CDS" ) >= 0, "the service is CDS hips2fits" );

   // Another survey: still credited, and not credited to STScI.
   const p = M.surveyCredit( "CDS/P/PanSTARRS/DR1/color-z-zg-g" );
   assert.ok( p.indexOf( "PanSTARRS" ) >= 0, p );
   assert.ok( p.indexOf( "STScI" ) < 0, "do not credit a survey to the wrong institute" );
   assert.ok( p.indexOf( "CDS" ) >= 0 );

   assert.strictEqual( M.surveyCredit( "" ), "", "no survey, no claim" );

   // The two acknowledgements are quoted, not reworded, and live where a user
   // publishing a video will find them.
   const fs = require( "fs" ), path = require( "path" );
   for ( const f of [ "README.md", "docs/support-kb.md" ] )
   {
      const t = fs.readFileSync( path.join( __dirname, "..", f ), "utf8" );
      assert.ok( t.indexOf( "hips2fits, a service provided by CDS" ) >= 0,
         `${f} must carry the CDS acknowledgement verbatim` );
      assert.ok( t.indexOf( "U.S. Government grant NAG W-2166" ) >= 0,
         `${f} must carry the STScI acknowledgement verbatim` );
   }
}

console.log( "zoom.test.js OK (survey credit)" );
