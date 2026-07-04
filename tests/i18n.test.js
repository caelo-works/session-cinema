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
