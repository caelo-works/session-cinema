// Multi-filter colour helpers: canonical filters, palettes, channel mapping.
const assert = require( "assert" );
const M = require( "./build/module.js" );

let n = 0;
function ok( cond, msg ) { assert.ok( cond, msg ); ++n; }
function eq( a, b, msg ) { assert.deepStrictEqual( a, b, msg ); ++n; }

// --- canonicalFilter ---
eq( M.canonicalFilter( "H" ), "Ha", "H -> Ha" );
eq( M.canonicalFilter( "Ha" ), "Ha" );
eq( M.canonicalFilter( "H-alpha" ), "Ha" );
eq( M.canonicalFilter( "O" ), "OIII", "O -> OIII" );
eq( M.canonicalFilter( "OIII" ), "OIII" );
eq( M.canonicalFilter( "S" ), "SII", "S -> SII" );
eq( M.canonicalFilter( "SII" ), "SII" );
eq( M.canonicalFilter( "Red" ), "R" );
eq( M.canonicalFilter( "Lum" ), "L" );
eq( M.canonicalFilter( "ZWO-NB" ), "ZWONB", "unknown passes through uppercased/stripped" );
eq( M.canonicalFilter( "" ), "" );

// --- detectFilters: first-appearance order + counts ---
function F( filter ) { return { filter: filter }; }
const seq = [ F("H"), F("O"), F("S"), F("H"), F("S"), F("O"), F("H") ];
eq( M.detectFilters( seq ), [ {filter:"H",count:3}, {filter:"O",count:2}, {filter:"S",count:2} ] );
eq( M.detectFilters( [ F(""), F("H"), F("  ") ] ), [ {filter:"H",count:1} ], "blank filters ignored" );

// --- resolveChannelMap: palette SHO against H/O/S ---
const filters = M.detectFilters( seq );
let map = M.resolveChannelMap( { palette:"SHO", chR:"", chG:"", chB:"" }, filters );
eq( map, { R:"S", G:"H", B:"O" }, "SHO: S->R, H->G, O->B (actual filter names)" );

// HOO: OIII feeds both G and B
map = M.resolveChannelMap( { palette:"HOO", chR:"", chG:"", chB:"" }, filters );
eq( map, { R:"H", G:"O", B:"O" }, "HOO: H->R, O->G, O->B" );

// explicit overrides win when present
map = M.resolveChannelMap( { palette:"SHO", chR:"O", chG:"H", chB:"S" }, filters );
eq( map, { R:"O", G:"H", B:"S" }, "explicit chR/chG/chB override the palette" );

// override ignored when the named filter is absent -> falls back to palette role
map = M.resolveChannelMap( { palette:"SHO", chR:"NOPE", chG:"", chB:"" }, filters );
eq( map, { R:"S", G:"H", B:"O" }, "absent override falls back to palette" );

// a filter missing from the set leaves that channel empty
const hoOnly = M.detectFilters( [ F("H"), F("O") ] );
map = M.resolveChannelMap( { palette:"SHO", chR:"", chG:"", chB:"" }, hoOnly );
eq( map, { R:"", G:"H", B:"O" }, "SHO with no SII -> R channel empty" );

// --- channelsFedBy / mappedFilters ---
eq( M.channelsFedBy( "O", { R:"H", G:"O", B:"O" } ), [ "G", "B" ], "O feeds both G and B in HOO" );
eq( M.channelsFedBy( "X", { R:"H", G:"O", B:"O" } ), [] );
eq( M.mappedFilters( { R:"S", G:"H", B:"O" } ).sort(), [ "H", "O", "S" ] );
eq( M.mappedFilters( { R:"H", G:"O", B:"O" } ).sort(), [ "H", "O" ], "distinct filters only" );

console.log( "OK color.test.js (" + n + " assertions)" );

// --- (none) on a channel means none ------------------------------------------
//
// "" is what an unset channel is AND what "take it from the palette" is, so
// choosing (none) had no way to say so and the palette refilled the channel.
{
   const filters = [ { filter: "Ha", count: 10 }, { filter: "OIII", count: 10 },
                     { filter: "SII", count: 10 } ];
   const base = { palette: "SHO", chR: "", chG: "", chB: "" };
   const full = M.resolveChannelMap( base, filters );
   assert.strictEqual( full.R, "SII" );
   assert.strictEqual( full.G, "Ha" );
   assert.strictEqual( full.B, "OIII" );

   const noBlue = M.resolveChannelMap(
      { palette: "SHO", chR: "", chG: "", chB: M.CH_NONE }, filters );
   assert.strictEqual( noBlue.B, "", "an explicit (none) must leave the channel empty" );
   assert.strictEqual( noBlue.R, "SII", "the other channels are untouched" );
   assert.strictEqual( noBlue.G, "Ha" );

   // Still a colour composite: two filters feed channels.
   assert.strictEqual( M.mappedFilters( noBlue ).length, 2 );

   // The sentinel cannot be a FILTER value read from a header.
   assert.ok( M.CH_NONE.charAt( 0 ) === "!" );
}

console.log( "color.test.js OK (channel none)" );

// --- one filter, however it is spelled ---------------------------------------
{
   const frames = [];
   for ( let i = 0; i < 60; ++i ) frames.push( { filter: "Ha" } );
   for ( let i = 0; i < 60; ++i ) frames.push( { filter: "HA" } );
   for ( let i = 0; i < 120; ++i ) frames.push( { filter: "OIII" } );

   const filters = M.detectFilters( frames );
   assert.strictEqual( filters.length, 2, "two spellings of Ha are one filter" );
   assert.strictEqual( filters[ 0 ].filter, "Ha", "the first spelling seen is the label" );
   assert.strictEqual( filters[ 0 ].count, 120, "and it carries every sub" );

   const map = M.resolveChannelMap( { palette: "HOO", chR: "", chG: "", chB: "" }, filters );
   for ( const spelling of [ "Ha", "HA", "H", "H_alpha" ] )
      assert.deepStrictEqual( M.channelsFedBy( spelling, map ), [ "R" ],
         `${spelling} must feed the same channel as Ha` );

   // Every sub reaches a channel — none silently dropped.
   let fed = 0;
   for ( const f of frames ) if ( M.channelsFedBy( f.filter, map ).length ) ++fed;
   assert.strictEqual( fed, frames.length );
}

// --- LRGB is not offered, and an old config still renders the same -----------
{
   assert.ok( M.PALETTE_ORDER.indexOf( "LRGB" ) < 0, "LRGB must not be offered" );
   const filters = [ { filter: "R", count: 5 }, { filter: "G", count: 5 },
                     { filter: "B", count: 5 }, { filter: "L", count: 5 } ];
   const asRgb  = M.resolveChannelMap( { palette: "RGB",  chR: "", chG: "", chB: "" }, filters );
   const asLrgb = M.resolveChannelMap( { palette: "LRGB", chR: "", chG: "", chB: "" }, filters );
   assert.deepStrictEqual( asLrgb, asRgb, "a config saved with LRGB renders as RGB" );
}

console.log( "color.test.js OK (filter spellings, LRGB)" );
