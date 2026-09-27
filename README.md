# Glyph Icons

A self-hosted icon set — our own small Font Awesome. Icons are drawn once as
SVGs and compiled into per-group icon fonts.

Every icon ships in **two variants** — `outline` and `filled` — the way Font
Awesome splits regular and solid. Crucially they are the *same icon*: one name,
one codepoint, and the variant is chosen by picking a font family. Switching an
icon's weight never changes what you address it by.

```
svg/<variant>/<group>/<icon>.svg
                   source icons — the only files you hand-edit
fonts/             generated TTF + WOFF2 per group, plus the web CSS (committed)
codepoints.json    permanent name → codepoint map (committed, never renumbered)
build/             generated outlines, SVG fonts, metadata (gitignored)
preview/           generated HTML gallery of every icon
scripts/           the build pipeline
flutter/           generated Flutter package (parked — see below)
```

## Variants and groups

Two axes, doing different jobs.

**Variant** is how an icon is drawn, and it decides which spec the linter
applies:

| Variant | Drawn as | Font family | Dart class |
|---|---|---|---|
| `outline` | 2px stroked centerlines, round caps and joins | `GlyphCore` | `GlyphCore` |
| `filled` | solid silhouettes with interior cut-outs | `GlyphCoreFilled` | `GlyphCoreFilled` |

`outline` is the default variant: it gets the unsuffixed family name, and the
plain CSS class resolves to it.

**Group** is what an icon is for, and it is the unit of bundling — one font per
(variant, group), so a project only ships what it imports:

| Group | Icons |
|---|---|
| `core` | home, search, settings, user, users, menu, close |
| `editing` | add, remove, edit, delete, check, copy |
| `navigation` | chevrons, arrows, link, external-link |
| `actions` | refresh, download, upload, share |
| `status` | bell, info, warning, error |
| `data` | calendar, clock, filter, sort |
| `toggles` | eye, eye-off, lock, unlock, star, heart |

Groups and variants are just directories. Adding either is
`npm run new -- <variant>/<group>/<icon>`; the build picks it up and generates
its font, CSS, class and library automatically.

Icon **names are unique within a variant**, so moving an icon between groups
keeps its codepoint and only changes which font carries it. An icon that exists
in one variant but not the other is legal — the build says so as a note rather
than failing.

### Coverage

`outline` is complete at 39 icons. `filled` currently covers 14 of them
(`home`, `user`, `users`, `search`, `settings`, `bell`, `info`, `warning`,
`error`, `star`, `heart`, `lock`, `unlock`, `eye`) — enough to exercise the
whole variant path end to end. The rest are still to draw.

## Using the fonts

Every group ships in two container formats from the same glyphs, because the set
has to work on desktop, mobile and web:

| Format | For |
|---|---|
| `fonts/<Family>.ttf` | Flutter (desktop + mobile), and anything that installs a font |
| `fonts/<Family>.woff2` | the web, at roughly half the bytes |

Metrics are 1000 units/em, ascent 1000, descent 0, so a glyph fills its em box
exactly and a 24px font size draws a 24px icon. Icons are single-colour and
inherit `color`, so they tint like text.

### Web

`fonts/<name>-icons.css` is generated with the `@font-face` blocks and one class
per icon, so the whole set is two lines:

```html
<link rel="stylesheet" href="fonts/glyph-icons.css">

<i class="gi-home"></i>                <!-- default variant: outline -->
<i class="gi-filled gi-home"></i>      <!-- same icon, filled -->
<i class="gi-outline gi-home"></i>     <!-- explicit, same as the first -->

<i class="gi-star" style="font-size: 32px; color: #7fd0de"></i>
```

The icon class carries the codepoint; the variant class swaps the font family.
Each class pulls only its own (variant, group) font, so a page using three
outline `core` icons downloads one 2 KiB WOFF2 and nothing else.

### Desktop and mobile

Install or bundle the TTF and address the glyph by its codepoint from
`codepoints.json`. For Flutter the generated package does this for you — see
below.

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

Then, per variant:

| | `outline` | `filled` |
|---|---|---|
| root `<svg>` | `fill="none" stroke="currentColor"` | `fill="currentColor" stroke="none"` |
| stroke | `stroke-width="2"`, `round` cap and join, uniform | none — silhouettes only |
| holes | n/a | wind a contour against its parent; overlapping cut-outs wind back to filled |
| padding | geometry inside `2 … 22` (centerlines) | geometry inside `1 … 23` (the silhouette) |
| elements | `path` `circle` `ellipse` `rect` `line` `polyline` `polygon` | same, minus `line` and `polyline`, which have no area |

```svg
<!-- outline -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="10.4" cy="10.4" r="6.6"/>
  <path d="M15.1 15.1 20.6 20.6"/>
</svg>

<!-- filled -->
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
npm run new -- filled/core/menu  # scaffolds the right template for the variant
# ...draw it...
npm run build                    # lint, outline, codepoint, font, preview
open preview/index.html          # check it at 16px and 48px
```

Then commit the source SVG **together with** everything the build regenerated:

```
svg/filled/core/menu.svg      the source
codepoints.json               menu's permanent codepoint (shared with outline)
fonts/GlyphCoreFilled.ttf     the rebuilt font (desktop, mobile)
fonts/GlyphCoreFilled.woff2   the rebuilt font (web)
fonts/glyph-icons.css         the web stylesheet
preview/index.html            the gallery
```

CI fails the build if any of those are missing, so a partial commit cannot land.

## The pipeline

One command: `npm run build`. Each step also runs on its own for debugging
(`npm run build:font`, etc.).

1. **Lint** every source SVG against the spec above. Nothing else runs until
   this passes.
2. **Normalise geometry.** `filled` icons are unioned into one clean contour set
   with correct nonzero winding. `outline` icons get outlined: fonts cannot render
   strokes, so each centerline is converted into the filled region its 2px round
   stroke covers — every curve is split until it turns gently, offset to both
   sides, and the resulting ribbons are unioned with a circle at each node. The
   union of those shapes *is* the round-joined, round-capped stroke, so joins
   are exact rather than approximated. Union results are checked for lost area
   at every step; if paper.js trips over degenerate geometry the icon falls back
   to overlapping contours (heavier, still correct) and the build says so.
3. **Assign codepoints.** See below.
4. **Generate one font per group** at 1000 units/em with a pinned timestamp, so
   builds are byte-for-byte reproducible and CI can diff them. Each is emitted
   as TTF (desktop, mobile) and WOFF2 (web), plus a stylesheet with a class per
   icon.
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
- Variants share codepoints. `filled/core/home.svg` and `outline/core/home.svg`
  are one icon at one codepoint, in two font families.

## Flutter (parked)

The build still generates a complete Flutter package under `flutter/` — one
`const IconData` per icon, a library and font per group, an example gallery app
and a test suite. It is not being actively worked on, and its CI job only runs
on manual dispatch. When it comes back, the entry points are
`package:glyph_icons/glyph_<group>.dart` per group, or
`package:glyph_icons/glyph_icons.dart` for everything.

## Repository commands

| Command | Does |
|---|---|
| `npm run build` | the whole pipeline |
| `npm run lint` | spec check only |
| `npm run new -- <group>/<name>` | scaffold a new source icon |
| `npm run check` | build, then fail if generated files are uncommitted (what CI runs) |
| `npm run build:outlines` / `:font` / `:dart` / `:preview` | individual steps |
