# ffmpeg mirror — hosting contract (retired)

> **Retired in 1.3.0.** Session Cinema no longer downloads ffmpeg: the CPD Program
> Rules v1.0 (rules 5.1–5.3) forbid running a program that did not come through
> the PixInsight update system or an independent install by the user. The URLs
> below are still requested by 1.2.x and earlier, and serving them stays a
> decision of the site repository. Nothing in this repository uses them any more.

Session Cinema can install ffmpeg automatically when none is detected: the
script downloads a static build from the CaeloWorks mirror and validates it by
running `ffmpeg -version`. This document is the contract the site repository
(which serves `pixinsight-scripts.caelo.works`) must implement.

## URLs served

The script requests these fixed URLs (`FFMPEG_MIRROR_BASE` +
`ffmpegMirrorCandidates()` in `pjsr/SessionCinema.js`):

```
https://pixinsight-scripts.caelo.works/ffmpeg/ffmpeg-windows-x64.exe
https://pixinsight-scripts.caelo.works/ffmpeg/ffmpeg-macos-arm64
https://pixinsight-scripts.caelo.works/ffmpeg/ffmpeg-macos-x64
https://pixinsight-scripts.caelo.works/ffmpeg/ffmpeg-linux-x64
https://pixinsight-scripts.caelo.works/ffmpeg/ffmpeg-linux-arm64
```

Each URL serves a **single static, self-contained ffmpeg executable** (not an
archive — the script does no extraction). Names are unversioned on purpose:
the mirror updates binaries in place, and the script's `-version` gate rejects
a truncated or corrupt download. PJSR cannot detect the CPU architecture, so
on macOS/Linux the script tries the architectures in the order above and keeps
the first binary that actually runs.

## Producing the binaries

Repackage the official static builds — extract only the `ffmpeg` executable:

- **Windows x64 / Linux x64 / Linux arm64 / macOS**: [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
  (`ffmpeg-master-latest-<os><arch>-gpl` variants), or gyan.dev (Windows),
  johnvansickle.com (Linux), evermeet.cx (macOS x64) as alternatives.
- The build must include `libx264` (H.264 encoding), PNG decoding and the
  `tpad` filter — any GPL "full"/default static build has all three.
- **macOS**: the executable must carry at least an ad-hoc code signature
  (mandatory on arm64). If the repackaged file lost it: `codesign -s - ffmpeg`.
  No quarantine attribute is involved — the script downloads via curl, which
  does not set one.

## GPL compliance

ffmpeg GPL builds are redistributed here, so next to the binaries the site
must also publish:

- the ffmpeg license text (`https://.../ffmpeg/LICENSE.txt`), and
- the corresponding sources or a link to them (the exact source tarball /
  commit the builds were made from — BtbN releases link theirs).

A short `https://.../ffmpeg/README.txt` stating the build origin, version and
source link satisfies both points at once.

## Operational notes

- Serve with correct `Content-Length`; the script treats anything under 1 MB
  as an error page.
- HTTP errors must return a real error status — the script passes `curl -f`.
- HTTPS only (the base URL is hard-coded with `https://`).
