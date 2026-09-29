# Working in this repo

A private icon set: source SVGs in, per-group fonts and a gallery out. Read
`README.md` first — it is the spec. This file covers what the README does not:
the traps, and what has already been tried.

## Quick orientation

```bash
npm install
npm run build      # lint -> normalise -> codepoints -> fonts -> gallery, ~2s
npm run check      # build, then fail if generated files are uncommitted (CI runs this)
npm run serve      # gallery on your LAN, for reading on a phone
npm run new -- <variant>/<group>/<name>
```

Source lives at `svg/<variant>/<group>/<icon>.svg`. Everything else under
`fonts/`, `flutter/`, `preview/` and `codepoints.json` is generated — never
hand-edit it, regenerate it.

## Two axes, and why

- **variant** (`outline`, `filled`) is *how* an icon is drawn, and picks which
  lint spec applies. It is NOT a different icon: the same name keeps one
  codepoint across variants, and the weight is chosen by font family. This is
  the Font Awesome regular/solid model, and it means changing an icon's weight
  never changes what you address it by.
- **group** (`core`, `status`, …) is *what it is for*, and is the unit of
  bundling. One font per (variant, group), so a project ships only what it
  imports.

## Traps that have already bitten

- **Nonzero winding.** Fonts have one fill rule. Two overlapping cut-outs wind
  their intersection back to *filled* — an X built from two crossing bars gets a
  blob in the middle, and a keyhole built from a circle overlapping a slot fills
  in. Build such shapes as ONE contour. `scripts/lint.js` bans `fill-rule` for
  this reason.
- **paper.js boolean ops are fragile on exact tangency.** The stroke outliner
  inflates every operand by a hair so tangencies become clean crossings, and
  asserts no union step loses area. If that assertion ever fires, the icon falls
  back to overlapping contours (heavier, still correct) and the build says so.
  Do not "fix" it by removing the assertion.
- **Codepoints are permanent.** Names keep theirs forever; deletions move to
  `retired` rather than freeing the code. Never renumber. A Flutter test asserts
  the generated Dart still matches `codepoints.json`.
- **Builds must stay byte-reproducible.** The TTF timestamp is pinned. CI diffs
  the committed output, so anything nondeterministic breaks the build.

## State

39 icons. `outline` covers all 39; `filled` covers 14. The gallery's
**incomplete** filter is the work queue.

## The EVE styling problem — read before attempting it

The owner is building a 2D space game (`Hammerfall-Digital/spacegame`,
"Embers of Rebellion") and wants the set themed like EVE Online. **Seven
attempts have been rejected.** Do not start an eighth by guessing.

Rejected, with the owner's words:

1. Flat chamfered solid silhouettes — "too generic"
2. Three probes: machined/aperture, stencil plate, HUD bracket — "same design still"
3. Abstract ship class insignia — rejected with the above
4. Diagonal, dimensional, multi-tonal module renders — "internet corporate cheap
   shenanigans over gritty futuristic space faring"
5. Weathered plate with hazard striping, rivets, scorch — rejected
6. Fat-stroke HUD glyphs matched to the game's own button sheet — "get closer to EVE"
7. Base icons restyled with panel cuts and notches — "hate them… heavily missed the mark"

What the owner has actually specified, and which still holds:

- Font-capable is a hard constraint. Single colour, closed contours. That rules
  out tone, texture and multi-layer colour entirely.
- Both variants: outline and filled.
- EVE character should come from **asymmetric mechanical forms, interior
  panel-line cuts, and notched silhouettes** (their selection, verbatim).

Why every attempt missed: the work was style transfer from a reference nobody
had looked at. The cloud environment's egress policy blocks `images.evetech.net`
and general web access, so no EVE icon was ever seen — each round was invention,
not matching. **Running locally removes that limit.** Fetch real reference from
CCP's public image server (`https://images.evetech.net/types/{id}/icon?size=64`,
official and documented for third-party use) and work from it.

Reference, not copying: the owner explicitly did not ask for EVE's art to be
traced or vendored. Look at it, then draw original geometry on the 24 grid.
Do not commit CCP assets to this repo.

The game repo's own art is also reference worth using — `Assets/UI/` has the
button kit whose glyphs are fat stroke with butt caps and miter joins, and
`Content/Ships/SmallFreighter/` is a top-down hull covered in octagonal pods.

## Working style the owner has asked for

Show work rendered at real sizes (16/24/48), not just at 48. Say what is wrong
with your own output before asking for a verdict. Do not commit art that has
been rejected.
