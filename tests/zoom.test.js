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
{
   const b = M.scaleBar( 60, 1920 );
   assert.strictEqual( b.label, "15°" );        // niceAngle(15) for target 15
   near( b.lengthPx, 15*(1920/60), 1e-6, "bar length" );
}

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

console.log( "zoom.test.js OK" );
