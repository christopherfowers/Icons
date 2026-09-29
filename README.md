# Glyph Icons

A self-hosted icon set — our own small Font Awesome. Icons are drawn once as
SVGs and compiled into per-group icon fonts.

The set is **general purpose**. The core icons are deliberately neutral so they
suit any project; flavour is added by **theme**, never baked into the base.

Two dimensions, Font Awesome's model:

- **theme** — the design language. `core` is the neutral default. A project that
  wants a house style gets its own theme rather than bending the base set.
- **weight** — `outline` or `filled` within a theme.

Crucially a name is the *same icon* across every theme and weight: one
codepoint, told apart by font family. Restyling or reweighting an icon never
changes what you address it by.

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

A **variant** is one (theme, weight) pair, and a directory under `svg/`. It
decides which spec the linter applies:

| Variant | Theme | Weight | Font family | CSS |
|---|---|---|---|---|
| `outline` | core | outline | `GlyphCore` | `gi-home` |
| `filled` | core | filled | `GlyphCoreFilled` | `gi-filled gi-home` |
| `forge-outline` | forge | outline | `GlyphCoreForge` | `gi-forge gi-home` |
| `forge-filled` | forge | filled | `GlyphCoreForgeFilled` | `gi-forge gi-filled gi-home` |

The default theme and weight contribute nothing to a name, so the neutral set
keeps the short names and the plain class resolves to it. Every other dimension
adds one class and one name segment.

Adding a theme is a directory and four lines of config — see `variants` in
`icons.config.json`. The `forge` theme is the Tsaraforge house style: the same
icons with their strokes chipped and their silhouettes fractured by crack
slivers, matching the company mark. It is generated from the clean set, so the
two stay in step.

**Group** is what an icon is for, and it is the unit of bundling — one font per
(variant, group), so a project only ships what it imports:

| Group | Icons |
|---|---|
| `core` | home, search, settings, sliders, user, users, menu, close, more, help, target, bulb |
| `editing` | add, remove, edit, delete, check, copy |
| `navigation` | chevrons, arrows, link, external-link |
| `actions` | refresh, download, upload, share, rocket |
| `status` | bell, info, warning, error |
| `data` | calendar, clock, file, folder, filter, sort, save |
| `toggles` | eye, eye-off, lock, unlock, star, heart |
| `comms` | chat, mail, message, phone, radio, antenna, send, signal |
| `audio` | mic, speaker, volume, headphones |
| `media` | camera, play, pause |
| `tools` | hammer, wrench, bolt |
| `tabletop` | dice, trophy, table, storefront, gamepad |
| `brand` | tsaraforge, anvil, crown, spark |

Groups and variants are just directories. Adding either is
`npm run new -- <variant>/<group>/<icon>`; the build picks it up and generates
its font, CSS, class and library automatically.

Icon **names are unique within a variant**, so moving an icon between groups
keeps its codepoint and only changes which font carries it. An icon that exists
in one variant but not the other is legal — the build says so as a note rather
than failing.

### Coverage

75 icons, complete across all four variants — `outline`, `filled`,
`forge-outline` and `forge-filled` — for 300 glyphs and no gaps.

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

<i class="gi-home"></i>                   <!-- core theme, outline -->
<i class="gi-filled gi-home"></i>         <!-- same icon, filled -->
<i class="gi-forge gi-home"></i>          <!-- forge theme, outline -->
<i class="gi-forge gi-filled gi-home"></i><!-- forge theme, filled -->

<i class="gi-star" style="font-size: 32px; color: #7fd0de"></i>
```

The icon class carries the codepoint; the variant class swaps the font family.
Each class pulls only its own (variant, group) font, so a page using three
outline `core` icons downloads one 2 KiB WOFF2 and nothing else.

### Desktop and mobile

Install or bundle the TTF and address the glyph by its codepoint from
`codepoints.json`. For Flutter the generated package does this for you — see
below.

## Browsing the set

`preview/index.html` is a self-contained gallery — paginated, searchable, and
built around what is *missing* as much as what exists. Open it straight from a
clone: no build step, no server, no network beyond the webfont.

There are three ways to read it on a phone. They trade privacy against
convenience, so pick per situation.

### 1. On your own network (most private)

Nothing leaves your wifi.

```bash
npm run serve
#   this machine     http://localhost:4173/
#   on your network  http://192.168.1.42:4173/
```

Open the network address on any device on the same wifi. The page never leaves
it — no tunnel, no public host, no outbound calls.

| Flag | Does |
|---|---|
| `--port 8080` | listen somewhere else |
| `--host 127.0.0.1` | this machine only, nothing on the network |
| `--token SECRET` | require `?t=SECRET` once, then a cookie (also reads `ICONS_TOKEN`) |

The server has no dependencies and serves exactly three things: the gallery,
`fonts/`, and `svg/`. It refuses anything else and anything that tries to climb
out of them.

### 2. GitHub Pages (a real URL, public)

`.github/workflows/pages.yml` deploys the committed gallery on every push.
Enable it once in **Settings → Pages → Source: GitHub Actions**, and the site
lands at `https://<owner>.github.io/<repo>/`.

Pages sites are public on the free plan even when the repository is private, so
this publishes the icons to anyone with the URL. That is fine for an icon set
in a public repo and wrong if the set is meant to stay internal.

### 3. Vercel (a real URL, private options)

`vercel.json` is set up for it: import the repo at vercel.com, no other
configuration. Vercel's Standard Protection keeps preview and production
deployments behind your team's login, which is the middle ground — a URL that
works anywhere, visible only to you.

In the gallery: `/` focuses search, arrow keys page, Escape closes the detail
panel or clears the search. The **incomplete** filter isolates icons that are
missing a variant, which is the list to work through when growing the set.
Selecting an icon shows both variants, a 16/24/32/48 size ladder, and
copy-ready CSS class, Dart name and codepoint.

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
| stroke | `stroke-width="1.5"`, `butt` cap, `miter` join, uniform | none — silhouettes only |
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
- Themes and weights share codepoints. `outline/core/home.svg`,
  `filled/core/home.svg` and `eve-outline/core/home.svg` are one icon at one
  codepoint, in three font families.

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
| `npm run new -- <variant>/<group>/<name>` | scaffold a new source icon |
| `npm run serve` | serve the gallery on your own network |
| `npm run check` | build, then fail if generated files are uncommitted (what CI runs) |
| `npm run build:outlines` / `:font` / `:dart` / `:preview` | individual steps |
