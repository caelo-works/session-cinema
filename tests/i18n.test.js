// i18n: language tables must be complete and placeholder-consistent.
"use strict";
const assert = require( "assert" );
const M = require( "./build/module.js" );

const langs = Object.keys( M.STRINGS );
assert.ok( langs.includes( "en" ) && langs.includes( "fr" ) );

const enKeys = Object.keys( M.STRINGS.en ).sort();
for ( const lang of langs )
{
   const keys = Object.keys( M.STRINGS[ lang ] ).sort();
   assert.deepStrictEqual( keys, enKeys, "key set mismatch for '" + lang + "'" );
}

// Placeholders %1..%9 must be the same set in every language
function placeholders( s )
{
   const found = new Set();
   for ( let i = 1; i <= 9; ++i )
      if ( s.includes( "%" + i ) )
         found.add( i );
   return [ ...found ].sort().join( "," );
}
for ( const key of enKeys )
   for ( const lang of langs )
      assert.strictEqual( placeholders( M.STRINGS[ lang ][ key ] ), placeholders( M.STRINGS.en[ key ] ),
                          "placeholder mismatch for '" + key + "' in '" + lang + "'" );

// tr() substitution and fallback
M.setLanguage( "fr" );
assert.strictEqual( M.tr( "out.ffmpegFound", "/usr/bin/ffmpeg" ), "ffmpeg trouvé : /usr/bin/ffmpeg" );
assert.strictEqual( M.tr( "nonexistent.key" ), "nonexistent.key" );
M.setLanguage( "en" );
assert.strictEqual( M.tr( "run.done", 300, "2 min" ), "Done. 300 frame(s) rendered in 2 min." );
M.setLanguage( "xx" ); // unknown language falls back to English
assert.strictEqual( M.tr( "btn.generate" ), "Generate" );
M.setLanguage( "en" );

console.log( "i18n.test.js OK" );

// --- the label column is measured on the labels it actually holds ------------
//
// It used to be sized on one hard-coded English string, so the column stayed
// straight only while every label fitted inside it. In French one does not.
{
   assert.ok( M.LABEL_COLUMN_KEYS.length >= 20 );
   for ( const lang of [ "en", "fr" ] )
      for ( const k of M.LABEL_COLUMN_KEYS )
         assert.ok( typeof M.STRINGS[ lang ][ k ] === "string" && M.STRINGS[ lang ][ k ].length,
            `${lang}.${k} is in the label column list but not in the string table` );

   // The one that overflowed, and the reference it overflowed: French really is
   // the longer of the two here, which is the whole reason the column has to be
   // measured rather than assumed.
   assert.ok( M.STRINGS.fr[ "video.holdFirst" ].length >
              M.STRINGS.en[ "video.holdFirst" ].length,
      "the French label is the long one — measuring is not optional" );
}

console.log( "i18n.test.js OK (label column)" );
