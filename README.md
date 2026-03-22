# Critique — Figma Plugin

>![Critique Plugin Preview](COVER IMAGE.png)

> Instant, rule-based UX feedback inside Figma. Select any frame, run Critique, get structured feedback in seconds.

## What it does

Critique analyses your Figma frames and detects real UX problems — without AI, without an API key, and completely free.

For each issue found it tells you:
- **What's wrong** — the specific problem with layer names and real values
- **Why it matters** — the real user impact
- **Fix suggestion** — a concrete, actionable fix

## Issues it detects

| Category | Rule | Severity |
|---|---|---|
| Accessibility | Touch targets below 44×44px | 🔴 High |
| Accessibility | Text layers with no fill | 🔴 High |
| Contrast | Very light text colour | 🔴 High |
| Hierarchy | Heading and body sizes too similar | 🟡 Medium |
| Hierarchy | 6+ different font sizes | 🟡 Medium |
| Spacing | Values off the 4pt grid | 🟡 Medium |
| Spacing | 4+ unique gap sizes | 🟡 Medium |
| Typography | 50%+ unstyled text layers | 🟡 Medium |
| Typography | 3+ font families | 🟡 Medium |
| Touch Targets | Icon/nav elements below 44px | 🟡 Medium |

## How the score works

Starts at 100. Deducts per issue based on user impact:
- 🔴 High = −15 points (blocks the user entirely)
- 🟡 Medium = −8 points (slows the user down)
- 🟢 Low = −3 points (craft issue, users won't notice)

## How to install locally

1. Download or clone this repo
2. Open Figma Desktop
3. Plugins → Development → Import plugin from manifest
4. Select `manifest.json` from this folder
5. Select any frame → Plugins → Development → Critique

## Why rule-based instead of AI?

Objective UX rules — spacing grids, contrast ratios, touch target sizes — have right and wrong answers. A rule engine is faster, free, more predictable, and more trustworthy for these checks than an AI model. AI is better suited for subjective judgment calls like visual polish or emotional tone — that's the plan for v2.

## Built by

Aakanksha Kalaskar — Product Designer
