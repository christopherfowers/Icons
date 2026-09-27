# Glyph Icons

A self-hosted icon set — our own small Font Awesome. Icons are drawn once as
SVGs and compiled into per-group icon fonts.

The set has **two drawing styles**:

- **`line`** — 2px stroked centerlines, round caps and joins. The generic UI
  set: navigation, editing, status, and so on.
- **`solid`** — filled silhouettes with hard 45° chamfers. A space-sim set
  drawn for a 2D space game: hulls, fitted modules, gates, stations, fleet ops.

They share one 24×24 grid, one build and one codepoint space, so they mix
freely in the same UI.

```
svg/               source icons — the only files you hand-edit
fonts/             generated TTFs, one per group (committed)
codepoints.json    permanent name → codepoint map (committed, never renumbered)
build/             generated outlines, SVG fonts, metadata (gitignored)
preview/           generated HTML gallery of every icon
scripts/           the build pipeline
flutter/           generated Flutter package (parked — see below)
```

## Groups

A group is a directory under `svg/`, and **the group is the unit of bundling**:
each one compiles to its own font file so a project only ships the icons it
actually uses.

| Group | Style | Font family | What's in it |
|---|---|---|---|
| `core` | line | `GlyphCore` | home, search, settings, user, users, menu, close |
| `editing` | line | `GlyphEditing` | add, remove, edit, delete, check, copy |
| `navigation` | line | `GlyphNavigation` | chevrons, arrows, link, external-link |
| `actions` | line | `GlyphActions` | refresh, download, upload, share |
| `status` | line | `GlyphStatus` | bell, info, warning, error |
| `data` | line | `GlyphData` | calendar, clock, filter, sort |
| `toggles` | line | `GlyphToggles` | eye, eye-off, lock, unlock, star, heart |
| `ships` | solid | `GlyphShips` | shuttle, frigate, cruiser, battleship, industrial |
| `fitting` | solid | `GlyphFitting` | turret, launcher, shield, armor, capacitor, afterburner, drone |
| `space` | solid | `GlyphSpace` | warp, jump-gate, dock, undock, station, star-map, wormhole |
| `ops` | solid | `GlyphOps` | target-lock, fleet, probe, cargo, market, blueprint |

Which style a group uses is declared in `icons.config.json` under
`groupStyles`; anything unlisted uses `defaultStyle`. Icon **names are unique
across the whole set**, so moving an icon between groups keeps its codepoint
and only changes which font carries it.

### On the space set and EVE

The solid set is drawn to sit comfortably next to EVE-style UI without copying
it. Everything here is original geometry in a shared genre — chunky monochrome
silhouettes, hard chamfers, top-down hulls — which is exactly the part that is
free to borrow. What is **not** free, and is deliberately absent: EVE's actual
icon artwork, CCP's logos, and the four empire faction marks. Names are generic
(`cruiser`, `jump-gate`, `capacitor`), never lore-specific.

## Using the fonts

Each group is an ordinary TTF in `fonts/`, with its glyphs at the codepoints in
`codepoints.json`. Metrics are 1000 units/em, ascent 1000, descent 0, so a glyph
fills its em box exactly and a 24px font size draws a 24px icon.

```css
@font-face {
  font-family: "GlyphShips";
  src: url("fonts/GlyphShips.ttf") format("truetype");
}
.icon { font-family: "GlyphShips"; font-style: normal; line-height: 1; }
.icon-cruiser::before { content: "\e02d"; }
```

Icons are single-colour and inherit `color`, so they tint like text.

`preview/index.html` is a self-contained gallery of the whole set — open it
straight from a clone, no build step and no network. Click an icon to copy its
name.

## Design rules

Enforced by `npm run lint`, which runs first in every build and in CI. Rules
shared by both styles:

| Rule | Why |
|---|---|
| `24 × 24` viewBox, no `width`/`height` | one grid for the whole set |
| no `transform`, no `style`, no `<style>`, no `class`/`id` | the font pipeline flattens geometry and would silently drop them |
| no `fill-rule` / `clip-path` / `mask` / `filter` | TrueType only has the nonzero rule; cut a hole by winding a contour against its parent |
| `currentColor` only, no hard-coded colours | lets the consumer tint the glyph |
| kebab-case filename, unique across all groups | the filename *is* the public API and the codepoint key |

Then, per style:

| | `line` | `solid` |
|---|---|---|
| root `<svg>` | `fill="none" stroke="currentColor"` | `fill="currentColor" stroke="none"` |
| stroke | `stroke-width="2"`, `round` cap and join, uniform | none — silhouettes only |
| padding | geometry inside `2 … 22` (centerlines) | geometry inside `1 … 23` (the silhouette) |
| elements | `path` `circle` `ellipse` `rect` `line` `polyline` `polygon` | same, minus `line` and `polyline`, which have no area |

```svg
<!-- line -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="10.4" cy="10.4" r="6.6"/>
  <path d="M15.1 15.1 20.6 20.6"/>
</svg>

<!-- solid -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <path d="M12 1.4 21.4 5.6 21.4 12.4 12 22.6 2.6 12.4 2.6 5.6Z"/>
</svg>
```

Beyond the machine-checkable rules: draw on the 24-grid, keep the optical
weight even, keep solid features at least ~2 units thick so they survive at
16px, and check the icon at 16px in the preview before calling it done.

## Adding an icon

```bash
npm install                      # once
npm run new -- ships/destroyer   # scaffolds the right template for the group's style
# ...draw it...
npm run build                    # lint, outline, codepoint, font, preview
open preview/index.html          # check it at 16px and 48px
```

Then commit the source SVG **together with** everything the build regenerated:

```
svg/ships/destroyer.svg    the source
codepoints.json            destroyer's permanent codepoint
fonts/GlyphShips.ttf       the rebuilt font
preview/index.html         the gallery
```

CI fails the build if any of those are missing, so a partial commit cannot land.

## The pipeline

One command: `npm run build`. Each step also runs on its own for debugging
(`npm run build:font`, etc.).

1. **Lint** every source SVG against the spec above. Nothing else runs until
   this passes.
2. **Normalise geometry.** `solid` icons are unioned into one clean contour set
   with correct nonzero winding. `line` icons get outlined: fonts cannot render
   strokes, so each centerline is converted into the filled region its 2px round
   stroke covers — every curve is split until it turns gently, offset to both
   sides, and the resulting ribbons are unioned with a circle at each node. The
   union of those shapes *is* the round-joined, round-capped stroke, so joins
   are exact rather than approximated. Union results are checked for lost area
   at every step; if paper.js trips over degenerate geometry the icon falls back
   to overlapping contours (heavier, still correct) and the build says so.
3. **Assign codepoints.** See below.
4. **Generate one TTF per group** at 1000 units/em with a pinned timestamp, so
   builds are byte-for-byte reproducible and CI can diff them.
5. **Generate the Flutter package** (parked, but kept in sync).
6. **Regenerate `preview/index.html`** from the normalised geometry.

### Codepoints are permanent

`codepoints.json` is the set's contract with anything already shipped, because
a built font is resolved by codepoint, not by name.

- A name that already has a codepoint **keeps it, always.**
- A new icon gets the next unused codepoint above the high-water mark in the
  Private Use Area (`U+E000`–`U+F8FF`).
- Codepoints are never reused and never shifted. Deleting an icon moves its
  entry to `retired`, which burns the codepoint permanently — so a future icon
  can never inherit a stale glyph in a client that has not updated.
- Restoring a deleted icon under its old name gives it its original codepoint
  back.
- Renaming a *group* changes nothing: codepoints are keyed by icon name.

## Flutter (parked)

The build still generates a complete Flutter package under `flutter/` — one
`const IconData` per icon, a library and font per group, an example gallery app
and a test suite. It is not being actively worked on, and its CI job only runs
on manual dispatch. When it comes back, the entry points are
`package:glyph_icons/glyph_<group>.dart` per group, or
`package:glyph_icons/glyph_icons.dart` for everything.

## Web (not built yet)

The repo is structured for it: `build/outlines/` already holds clean filled
SVGs, which is what a web package would ship, and the fonts are plain TTFs that
`fonttools` can convert to WOFF2 in one step. Nothing has been built for it yet.

## Repository commands

| Command | Does |
|---|---|
| `npm run build` | the whole pipeline |
| `npm run lint` | spec check only |
| `npm run new -- <group>/<name>` | scaffold a new source icon |
| `npm run check` | build, then fail if generated files are uncommitted (what CI runs) |
| `npm run build:outlines` / `:font` / `:dart` / `:preview` | individual steps |
