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
   "     Releasing a new version means REVISITING THE SUPPORT KB: new controls and\n" +
   "     messages, bugs fixed MOVED under a 'Fixed in X.Y.Z' heading rather than\n" +
   "     deleted (someone who has not updated still hits them), bugs found added\n" +
   "     with today's answer. Then the 'Applies to' line and the facts card." );

// The facts card carries the version too — keep it honest.
assert.ok( KB.indexOf( "| Version | " + version[ 1 ] ) >= 0,
   `the KB facts card must show the shipping version (| Version | ${version[ 1 ]} …).` );

// --- 2. every label in the EN/FR lookup is a real string, in both languages --
//
// The lookup is a LIST, not a table, on purpose: the knowledge-base back-office
// renders tables badly, and this file is imported into a support agent.
// Format of each row:   - **English label** = **Libellé français**

const rows = KB.split( "\n" )
               .map( l => /^- \*\*(.+?)\*\* = \*\*(.+?)\*\*\s*$/.exec( l ) )
               .filter( Boolean );

assert.ok( rows.length >= 10,
   "docs/support-kb.md must keep the EN/FR label lookup, one label per line:\n" +
   "     - **English label** = **Libellé français**" );

const enValues = new Set( Object.keys( M.STRINGS.en ).map( k => M.STRINGS.en[ k ] ) );
const frValues = new Set( Object.keys( M.STRINGS.fr ).map( k => M.STRINGS.fr[ k ] ) );

// A row has to name ONE key. Two independent membership tests would pass on a row
// pairing an English label with the French of a different control — which is
// exactly the mistake a support agent would then repeat to a user.
const keys = Object.keys( M.STRINGS.en );
rows.forEach( function( m )
{
   const en = m[ 1 ], fr = m[ 2 ];
   assert.ok( enValues.has( en ),
      `the KB lists the English label "${en}", which is no longer in STRINGS.en.\n` +
      "     A label was renamed and the support KB was not updated — support would\n" +
      "     be quoting a button that no longer exists." );
   assert.ok( frValues.has( fr ),
      `the KB lists the French label "${fr}", which is no longer in STRINGS.fr.\n` +
      "     A label was renamed and the support KB was not updated." );
   assert.ok( keys.some( k => M.STRINGS.en[ k ] === en && M.STRINGS.fr[ k ] === fr ),
      `the KB pairs "${en}" with "${fr}", and no single key carries both.\n` +
      "     Both halves exist, but they belong to different controls — which is\n" +
      "     the pairing a support agent would read out to a user." );
} );

// --- 2b. the messages quoted word for word ---------------------------------
//
// The check above only ever saw lines shaped like a lookup row, so the whole
// "Error messages, word for word" section — the part support pastes back to a
// user — reached no assertion at all. The KB has one convention for a product
// message and it is unambiguous:
//
//     **"English sentence."** / *« Phrase française. »*
//
// which is also what tells a message apart from a user's complaint quoted as a
// heading in the troubleshooting table. Both halves have to be real strings, and
// they have to belong to the SAME key — an English message paired with the French
// of a different one is exactly the pairing support would read out.
//
// The KB truncates the French with an ellipsis and the product substitutes %1, so
// the requirement is a prefix up to the first placeholder, not equality.

const flat = KB.replace( /\s+/g, " " );
const pairs = [];
{
   const re = /\*\*"([^"]+)"\*\* ?\/ ?\*« (.+?) »\*/g;
   let m;
   while ( ( m = re.exec( flat ) ) !== null )
      pairs.push( [ m[ 1 ].trim(), m[ 2 ].trim() ] );
}
// A floor, not a target: it catches the section being deleted, not its size.
assert.ok( pairs.length >= 12,
   `the KB must keep its EN / FR message pairs; found ${pairs.length}` );

const clean = t => String( t ).replace( /\s+/g, " " ).trim();

// What the run substitutes is a wildcard on both sides: the product writes %1,
// the KB writes N or an ellipsis for the same hole, and a truncated French
// sentence ends in one. Everything else has to match character for character.
function toPattern( kbText )
{
   const holes = clean( kbText ).split( /%\d|\bN\b|…+/ );
   return new RegExp( "^" +
      holes.map( h => h.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" ) ).join( ".*" ),
      "" );
}

const missing = [];
for ( const [ en, fr ] of pairs )
{
   const reEn = toPattern( en ), reFr = toPattern( fr );
   const k = keys.find( kk => reEn.test( clean( M.STRINGS.en[ kk ] ) ) &&
                              reFr.test( clean( M.STRINGS.fr[ kk ] ) ) );
   if ( !k )
      missing.push( en );
}
assert.deepStrictEqual( missing, [],
   "the KB quotes these as messages the product shows, and no single key in the\n" +
   "     string table begins that way in BOTH languages. Either the wording moved\n" +
   "     and the KB did not follow, or the two halves belong to different messages\n" +
   "     — and support would read the pair to a user." );

// --- 3. the knowledge-base importer's hard limit -----------------------------
//
// The importer cuts one article per `##`, re-cuts on `###` when a section is too
// big, and TRUNCATES what it serves at 4000 characters. A long `##` with no `###`
// is therefore silently beheaded: the agent goes blind to the end of it and
// nothing reports an error. This is the one formatting rule that must not slip.

const LIMIT = 3500;
const sections = [];
let cur = null;
KB.split( "\n" ).forEach( function( line )
{
   if ( /^## /.test( line ) )
   {
      cur = { title: line.slice( 3 ).trim(), chars: 0, subs: 0 };
      sections.push( cur );
      return;
   }
   if ( !cur )
      return;                       // the preamble is its own article
   if ( /^### /.test( line ) )
      cur.subs++;
   cur.chars += line.length + 1;
} );

const beheaded = sections.filter( s => s.chars > LIMIT && s.subs === 0 );
assert.deepStrictEqual( beheaded.map( s => `${s.title} (${s.chars} chars, no ###)` ), [],
   "these sections exceed the knowledge-base article limit and have no ### to be\n" +
   "     re-cut on, so the support agent would never see their end. Split them." );

// And the ### themselves: a "##" re-cut on its "###" only helps if each of those
// fits. The biggest was nearly twice the limit, so the article the importer
// served for it was beheaded exactly like the case above — the guard just could
// not see it.
const subs = [];
let sub = null;
KB.split( "\n" ).forEach( function( line )
{
   if ( /^#{2,3} /.test( line ) )
   {
      sub = /^### /.test( line ) ? { title: line.slice( 4 ).trim(), chars: 0 } : null;
      if ( sub )
         subs.push( sub );
      return;
   }
   if ( sub )
      sub.chars += line.length + 1;
} );

const cutOff = subs.filter( s => s.chars > LIMIT );
assert.deepStrictEqual( cutOff.map( s => `${s.title} (${s.chars} chars)` ), [],
   "these sub-sections exceed the article limit, so the support agent goes blind\n" +
   "     to the end of them. Split them further." );

// --- 4. every document this repository points at is in this repository -------
//
// PJSR-NOTES.md was cited by two files and existed in none, so nobody could know
// what the validation runs check or notice they had been skipped.
{
   const files = [ "README.md", "docs/support-kb.md", "docs/pjsr-validation.md" ];
   const broken = [];
   for ( const f of files )
   {
      const text = fs.readFileSync( path.join( ROOT, f ), "utf8" );
      for ( const m of text.matchAll( /\]\(([^)#:]+\.md)\)/g ) )
      {
         const target = path.join( ROOT, path.dirname( f ), m[ 1 ] );
         if ( !fs.existsSync( target ) )
            broken.push( `${f} -> ${m[ 1 ]}` );
      }
   }
   assert.deepStrictEqual( broken, [],
      "these documents point at a file that is not in the repository" );
}

console.log( `docs: support KB matches ${version[ 1 ]}, ${rows.length} labels verified in EN and FR, ` +
             `${pairs.length} message pairs matched, ` +
             `${sections.length} sections and ${subs.length} sub-sections within the ` +
             "KB import limit" );
