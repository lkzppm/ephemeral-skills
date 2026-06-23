# Lkzppm Design System

A design system for **Lucas Pacheco** — AI Engineer based in Rio de Janeiro — drawn from the production codebase of his personal portfolio at [lppm.vercel.app](https://lppm.vercel.app).

> _"Building real AI solutions for real business problems."_

The brand is **terminal-first, editorial, and unapologetically dark.** Pure black canvases, large-format serif typography, a single hot blue accent, and a strong technical-monospace voice for anything that quotes or executes code. Where most "AI engineer portfolios" reach for purple gradients, neon glows, or animated cubes, this one looks like a TextMate window with a literary magazine for a body.

---

## Sources

This system was reverse-engineered from a single source:

- **GitHub:** [`lkzppm/portifolio`](https://github.com/lkzppm/portifolio) — Next.js 14 + Tailwind portfolio site.

The original repo is private; visitors with access should browse `app/globals.css`, `tailwind.config.ts`, `components/layout/*`, and `components/terminal/*` to see the live implementations these design files are based on.

If you're building new work in this brand, **start here**, then cross-reference the live site. The portfolio also exposes the design through three "playground" surfaces (`Playground3D`, `PlaygroundLiquids`, `PlaygroundText`) which are intentional sandbox spaces — treat anything you find there as exploratory, not canonical.

---

## What's in this folder

```
.
├── README.md                  — this file
├── SKILL.md                   — Claude Code-compatible skill manifest
├── colors_and_type.css        — design tokens (CSS custom properties)
├── assets/                    — logos, project imagery
│   ├── LP.png                 — wordmark logo (terminal-prompt glyph + serif "LP.")
│   ├── Oracly.jpeg            — project hero
│   ├── Tasker.png             — project hero
│   └── csn.jpeg               — project hero
├── preview/                   — small HTML cards that render the Design System tab
│   ├── color-*.html
│   ├── type-*.html
│   ├── spacing-*.html
│   ├── component-*.html
│   └── brand-*.html
├── ui_kits/
│   └── portfolio/             — pixel-fidelity recreation of the live portfolio
│       ├── README.md
│       ├── index.html         — interactive single-page demo
│       └── *.jsx              — React components (Navigation, Hero, Terminal, etc.)
└── slides/                    — _(none — no slide template was provided)_
```

---

## Brand at a glance

| | |
|---|---|
| **Voice**       | Senior engineer talking shop. Direct. Lowercase asides allowed. |
| **Primary font**    | Tiempos Text (editorial serif) — falls back to Source Serif 4 |
| **Monospace**       | JetBrains Mono — used for prompts, labels, paths, timestamps |
| **Background**      | `#000000` — pure black, no gradient softening |
| **Accent**          | `#0070f3` — Vercel-style hot blue ("terminal" mode) |
| **Secondary accent**| `#c15f3c` — Claude orange ("AI" mode + the Claude Certified Architect badge) |
| **Border**          | `#262626` hairlines — the entire layout is built on 1px gridlines |
| **Easing**          | `cubic-bezier(0.16, 1, 0.3, 1)` — slow-in, snap-out |
| **Iconography**     | Font Awesome 7 (solid + brands). No emoji. |

---

## Content fundamentals

The copy on this site is the work of an engineer who has shipped enough to be tired of buzzwords. Read the existing `data/portfolio.ts` before writing anything new.

### Voice

- **First person, present tense.** "I build production AI systems that ship." Not "Lucas builds…" or "passionate about building…"
- **Direct and concrete.** Names of real things: LangChain, RAG, MCP, FAISS, OceanPact. Never "leveraging cutting-edge AI." Always "RAG chatbot for internal knowledge retrieval."
- **Short sentences, occasional fragments.** Especially in mono captions and terminal output. _"Open to opportunities." "featured." "Reset."_
- **Lowercase asides.** Easter-egg copy is small-cap and dryly funny — when the user clicks the (fake) close button on the terminal, it says `nice try. i live here.` The minimize button replies `where would i even go?` Keep that register if you're writing in similar contexts.
- **No exclamation marks.** Not one in the entire portfolio.
- **No emoji.** Status uses a colored dot (`bg-green-400 animate-pulse`), not 🟢. Icons are Font Awesome SVGs.

### Casing

- **Section headings:** Title Case, serif, large (`text-4xl md:text-5xl`). _About. Projects. Skills. Experience._
- **Command names & section numbers:** lowercase mono. `about`, `skills`, `projects` · `01`, `02`, `03`.
- **Stat labels (mono):** Title Case but small. `Location`, `Education`, `Status`.
- **Microcopy / hints:** lowercase. `try me`, `shift+tab`, `featured`.

### Examples — lift these tones directly

- **Tagline:** _"Building real AI solutions for real business problems."_ — sets the bar: "real…real" implies the inverse exists and is being avoided.
- **Headline:** _"I build production AI systems that ship — from MCP servers to RAG pipelines to LLM agents."_ — em-dash, then three concrete artifacts.
- **About body:** _"Specialized in LLMs, LangChain, and Model Context Protocol. I've built RAG chatbots, network monitoring pipelines, and AI agents for enterprise clients."_ — first sentence: stack. Second sentence: receipts.
- **Project description (Oracly):** _"Enterprise AI chatbot with RAG for internal knowledge bases. Runs locally for security."_ — what it is, then the non-obvious differentiator.
- **Experience bullet:** _"Built RAG chatbot for internal knowledge retrieval, network monitoring pipelines with automated incident analysis, and LLM-powered alerting systems in production."_ — three concrete things, "in production" earns its place.

### Vibe

Imagine a Vercel deploy log narrated by someone who reads The Paris Review. Confident, terse, mildly amused at its own polish. Never breathless. Never apologetic.

---

## Visual foundations

### Color

| Role | Hex | Use |
|---|---|---|
| Background | `#000000` | The page. Never lighter. |
| Elevated   | `#0a0a0a` | Project modal panel, code blocks |
| Subtle     | `#111111` | Hover wash on table rows |
| Body       | `#ededed` (`fg-100`) | Default body text on black |
| Secondary  | `#d4d4d4` (`fg-300`) | Lead paragraphs |
| Muted      | `#a3a3a3` (`fg-400`) | Project descriptions on hover |
| Subtle     | `#737373` (`fg-500`) | Captions, body text at rest |
| Faint      | `#525252` (`fg-600`) | Tech-stack chips, faint labels |
| Hint       | `#404040` (`fg-700`) | Project numbers `01`, very muted icons |
| Border     | `#262626` (`fg-800`) | **Every hairline** in the layout |
| Accent     | `#0070f3` | Section numbers, hover state, links, focus ring |
| Claude     | `#c15f3c` | AI-mode toggle, Claude badge — and **only** the Claude badge |
| Status OK  | `#4ade80` | "Open to opportunities" pulse dot |

**Rules:**
- Pure black is non-negotiable. Don't soften with `#0a0a0a` or dark navy. The blue accent only sings against true `#000`.
- Use the orange `#c15f3c` _only_ for Claude/AI-mode contexts. It is **not** a general second accent.
- Two accents max per surface (blue + Claude, or blue + a status color). Never blue + Claude + green stacked.
- The grayscale is doing the heavy lifting. Lean on the four-level hierarchy `fg-100 → fg-300 → fg-500 → fg-700` for typographic depth, not on color.

### Type

- **Display & body:** Tiempos Text — a commercial editorial serif from Klim. Falls back to Source Serif 4 (the substitution shipped in this design system), then Georgia. Bodies are unusually large — the About headline is `text-2xl md:text-3xl` _font-light_, which would look pretentious in any other context but here reads as "this person values craft."
- **Mono:** JetBrains Mono via `next/font/google`. Loaded as the `--font-mono` variable. Used _only_ for: terminal prompts/input/output, command names, section numbers (`01`, `02`…), mono captions (`Location`, `Education`), tech-stack chips, path labels, and microcopy hints.
- **Pairing rule:** serif headings, serif body, mono for anything that is technically "data" or "interface chrome."

### Spacing & layout

- **4px base.** Tailwind's default scale.
- **Section padding:** `p-8 md:p-16` — that's 32px → 64px. Everything respects this. Hero too.
- **12-column grid** with `border-r` between columns and `border-t`/`border-b` between sections — the page is a literal grid of hairline-bordered cells.
- **Sections vertically stack** with `border-t border-gray-800`. There is no rounded "card" wrapper around a section — the whole page is the card.
- **Numbered sections.** Each h2 is paired with a mono `01`, `02`… either inline (`flex items-baseline gap-4`) or stacked above (`<span>` then `<h2 className="mt-2">`).

### Backgrounds

- **No imagery as background.** Project thumbnails are foreground content, never blurred-out hero washes.
- **No gradients on solid surfaces.** The only gradient is the rainbow-text easter egg and Hero aurora blobs.
- **Aurora blobs** (large, blurred, slowly drifting `radial-gradient` shapes inside `.hero-aurora`) exist only inside the Hero — `blue + cyan` in terminal mode, `orange + amber` in AI mode. Filter: `blur(110px)`. Animation: 26–36s, ease-in-out, alternate.
- **Dot grid + scanlines** layered on top, masked to fade at edges via `radial-gradient` mask-image.

### Animation

- **Easing is canonical:** `cubic-bezier(0.16, 1, 0.3, 1)` — written as `[0.16, 1, 0.3, 1]` in framer-motion. Slow-in, hard-out. Used for everything that reveals.
- **Section reveals:** `initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }}` with `duration: 0.85`, `viewport: { once: true, amount: 0.3–0.5 }`.
- **Per-element, not per-section.** `whileInView` is on each motion element, never on a wrapper — so each piece animates as it scrolls in.
- **Letter-by-letter entry** (`AnimatedTitle`, `WelcomeMessage`) — split text into spans with `--i` custom property for stagger.
- **Snake-wave letter glow** — a perpetual 2.6s ease-in-out infinite animation on letters that shifts color and `text-shadow` to a brighter version, then back. See `.ai-headline-letter` and `.terminal-letter-glow`.
- **Cursor blink:** 1s steps(2) infinite.
- **No bounces. No springs except for navbar active-tab and mode-pill** (`type: 'spring', stiffness: 380, damping: 30/32` — tight, controlled).
- **Reduced motion is respected** — `@media (prefers-reduced-motion: reduce)` disables aurora, particles, grid-shift, and letter animations.

### Hover & press

- **Hover bias: brighter, never darker.** `text-gray-500 → text-gray-300`, `text-gray-100 → text-accent`, `bg-transparent → bg-gray-900/40`.
- **Hover transitions:** `300ms` ease for color/bg, `500ms` for image `scale-105`.
- **Image hover:** `opacity-80 → opacity-100` AND `scale-105` — both, simultaneously.
- **Border hover:** `border-gray-800 → border-accent/40` (40% alpha — never full accent on the border).
- **Press:** no explicit `:active` scale-down. Press is communicated by the immediate `whileTap` snap on motion elements (rare).
- **Focus:** 1px solid `--focus-ring` outline, offset 2px.

### Borders, shadows & elevation

- **Hairlines, hairlines, hairlines.** `border-gray-800` (`#262626`) at `1px` does 90% of the work. Section dividers, between cells in a grid, around inputs, around chips.
- **Shadows are scarce.** On pure black, drop shadows do nothing. Use `box-shadow: inset 0 0 0 1px <color>` to add a colored inner border, and use **glows** (`box-shadow: 0 0 24px var(--accent-glow)`) on interactive accents — sparingly.
- **No protection gradients.** Cards over imagery are rare; when they exist (project modal) the image is the top half and content the bottom — no scrim.

### Transparency & blur

- **Navbar:** `bg-black/90 backdrop-blur-sm` when scrolled. Transparent at rest.
- **Modal backdrop:** `bg-black/85 backdrop-blur-sm`.
- **Mode toggle background:** `bg-gray-900/40 border-gray-800/80` — semi-transparent.
- **Mode pill (active):** `bg-{accent}/20` with `box-shadow: inset 0 0 0 1px {accent}/40`.
- **Rule:** transparency lives on overlays and interactive chrome. Body content is opaque.

### Corner radii

Restrained. The brand reads sharper because of it.

- **0** — sections, the page itself
- **2 (sm)** — tight tag chips
- **6** — buttons, inputs, mode pills (`rounded-md` is the default)
- **8 (md)** — code blocks, command cards inside the terminal
- **12 (lg)** — project modal, hero image cards
- **9999** — pills (Claude badge), status dots, traffic lights

### Cards

When a "card" is needed (rare — most layouts use bordered cells), the recipe is:

```
bg-gray-950 / border border-gray-800 / rounded-lg / overflow-hidden
```

Hover: `border-gray-800 → border-accent/40`, `bg-gray-900/60 → bg-gray-900`.

### Imagery tone

Project thumbnails are warm and slightly photographic (Oracly is a moody dark teal-orange render, Tasker is a screenshot, csn is industrial yellow steel). They're shown at `opacity-80` at rest, full opacity on hover — the muted state matches the editorial mood.

---

## Iconography

The portfolio uses **Font Awesome 7** exclusively for icons. There is no in-repo SVG sprite, no custom illustration system, and no emoji.

### Sets used

- `@fortawesome/free-solid-svg-icons` — UI icons (`faBolt`, `faUser`, `faWrench`, `faFolderOpen`, `faBriefcase`, `faGraduationCap`, `faEnvelope`, `faLink`, `faFileLines`, `faTrash`, `faChevronRight`, `faGamepad`, `faXmark`, `faArrowUpRightFromSquare`)
- `@fortawesome/free-brands-svg-icons` — GitHub, LinkedIn, **and the Claude brand icon** (`faClaude`)

### Rules

- **Stroke style:** Font Awesome solid (filled glyphs, no outline icons). Brand glyphs come from the brands set.
- **Size:** typically `width: 0.75rem` (12px) for inline indicators, `1rem` for command-card icons, `0.85rem` for badge icons.
- **Color:** `text-gray-600` or `text-gray-700` at rest, `text-accent` on hover. Brand icons keep their brand color (`#c15f3c` for Claude).
- **Never lucide-react.** The CLAUDE.md says so explicitly.
- **Never emoji** in production copy. The mobile menu uses a unicode `☰` / `×` as the only exception, treated as a glyph in mono.
- **No SVG illustrations.** Decorative graphics are CSS gradients and animated aurora blobs, never hand-drawn SVG.

### Logo

`assets/LP.png` — a black rounded-square avatar containing:
- a blue `>_` (terminal prompt + cursor) in the top-left
- a large serif `LP.` wordmark, with the period dot drawn in accent blue

It functions as both favicon (`/LP.png` in `app/layout.tsx`) and Open Graph image. Pair it with a black or pure-black-with-aurora background.

### Substitution flag

> **Tiempos Text is a commercial font** ($550+ license from Klim Type Foundry). This design system substitutes **Source Serif 4** (Adobe, open source, on Google Fonts) which has nearly identical editorial proportions and stroke contrast. If you need pixel-perfect parity with the live site, drop Tiempos `.woff2` files into `public/fonts/` and update the `@font-face` declarations — instructions are in the original repo's `app/globals.css`.

---

_Index._

| File | What it is |
|---|---|
| [`README.md`](./README.md) | This file — brand voice, foundations, iconography |
| [`SKILL.md`](./SKILL.md) | Claude Code-compatible skill manifest |
| [`colors_and_type.css`](./colors_and_type.css) | Design tokens as CSS custom properties — import this in any new HTML |
| [`assets/`](./assets/) | Logos, project imagery (`LP.png`, `Oracly.jpeg`, `Tasker.png`, `csn.jpeg`) |
| [`preview/`](./preview/) | Specimen cards that populate the Design System tab |
| [`ui_kits/portfolio/`](./ui_kits/portfolio/) | Pixel-fidelity recreation of the portfolio site — **start here for any new design work** |

### UI kits

| Product | Files | What's inside |
|---|---|---|
| **Portfolio** (`ui_kits/portfolio/`) | `index.html`, `kit.css`, `data.js`, `components.jsx`, `Navigation.jsx`, `Hero.jsx`, `Sections.jsx` | Interactive recreation of the live portfolio. Hero is a real terminal with command parsing, history, autocomplete, and a stubbed AI mode. Below the fold: About, Projects (+ modal), Skills, Experience, Contact form. |

### Slides

No slide template was provided — the original repo does not contain a deck. If you need to make slides for this brand, follow the rules in **Visual foundations** above: pure black, mono section number + serif title, 12-col grid, no gradients, hairline dividers.
