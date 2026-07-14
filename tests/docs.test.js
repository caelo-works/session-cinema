// The support KB must not rot. It is the document a support agent quotes to a
// user, so a stale label or a stale version number in it is worse than no
// document at all: it makes support confidently wrong.
//
// This test enforces two things mechanically, because a rule that lives only in
// a README gets skipped on the day the release is in a hurry:
//
//   1. docs/support-kb.md declares the SAME version as SC_VERSION. Bump the
//      script without revisiting the KB and this fails.
//   2. Every label in the KB's EN/FR lookup table is still a real string in the
//      script's own table — in both languages. Rename a group box and forget the
//      KB, and this fails.
"use strict";
const assert = require( "assert" );
const fs = require( "fs" );
const path = require( "path" );
const M = require( "./build/module.js" );

const ROOT = path.join( __dirname, ".." );
const KB = fs.readFileSync( path.join( ROOT, "docs", "support-kb.md" ), "utf8" );
const SRC = fs.readFileSync( path.join( ROOT, "pjsr", "SessionCinema.js" ), "utf8" );

// --- 1. the KB is written for the version that ships ------------------------

const version = /^#define\s+SC_VERSION\s+"([^"]+)"/m.exec( SRC );
assert.ok( version, "could not read #define SC_VERSION from pjsr/SessionCinema.js" );

const declared = /Applies to \*\*([0-9][^*]*)\*\*/.exec( KB );
assert.ok( declared,
   "docs/support-kb.md must say which version it applies to: `Applies to **X.Y.Z**`" );

assert.strictEqual( declared[ 1 ], version[ 1 ],
   `docs/support-kb.md says it applies to ${declared[ 1 ]}, but the script is ${version[ 1 ]}.\n` +
   "     Releasing a new version means REVISITING THE SUPPORT KB: new controls, new\n" +
   "     messages, fixed bugs to strike from §7, new ones to add. Then update the\n" +
   "     'Applies to' line and the facts card. This test is the reminder." );

// The facts card carries the version too — keep it honest.
assert.ok( KB.indexOf( "| Version | " + version[ 1 ] ) >= 0,
   `the KB facts card must show the shipping version (| Version | ${version[ 1 ]} …).` );

// --- 2. every label in the EN/FR lookup is a real string, in both languages --

const table = /\| English \| Français \|\n\|---\|---\|\n((?:\|.*\|\n)+)/.exec( KB );
assert.ok( table, "docs/support-kb.md must keep the '| English | Français |' lookup table" );

const enValues = new Set( Object.keys( M.STRINGS.en ).map( k => M.STRINGS.en[ k ] ) );
const frValues = new Set( Object.keys( M.STRINGS.fr ).map( k => M.STRINGS.fr[ k ] ) );

const rows = table[ 1 ].trim().split( "\n" );
assert.ok( rows.length >= 10, "the lookup table looks truncated" );

rows.forEach( function( row )
{
   const cells = row.split( "|" ).map( s => s.trim() ).filter( s => s.length );
   assert.strictEqual( cells.length, 2, `malformed lookup row: ${row}` );
   const en = cells[ 0 ], fr = cells[ 1 ];

   assert.ok( enValues.has( en ),
      `the KB lists the English label "${en}", which is no longer in STRINGS.en.\n` +
      "     A label was renamed and the support KB was not updated." );
   assert.ok( frValues.has( fr ),
      `the KB lists the French label "${fr}", which is no longer in STRINGS.fr.\n` +
      "     A label was renamed and the support KB was not updated." );
} );

console.log( `docs: support KB matches ${version[ 1 ]}, ${rows.length} labels verified in EN and FR` );
