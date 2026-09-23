# WTQ 2026 — Design Language

**Status:** Proposed for approval — needed before the Day 9 polish pass
**Date:** 2026-09-22

---

## 1. The idea

Two feelings have to coexist. This is a **celebration** — a flagship event for women in technology — and it is also a **timed examination** where a visible clock is counting down someone's one and only attempt.

So the identity is built on a contrast: a **deep, calm, focused canvas** that keeps a three-hour working session comfortable, lit by **vivid, confident accents** that carry the energy of the event. Nothing pastel, nothing stereotypically "feminine by default" — the palette reads as premium technology product first, and derives its warmth from an aurora-like violet-to-magenta-to-amber spectrum rather than from softness.

**Name of the accent spectrum: *Aurora*.** It appears in the logo lockup, the hero gradient, progress indicators and the submission celebration — and nowhere else, so it never becomes wallpaper.

---

## 2. Colour tokens

Defined as CSS custom properties on `:root`, redefined for dark mode. Every pairing below meets **WCAG AA** contrast for its intended use.

### 2.1 Brand — Aurora spectrum

| Token | Hex | Use |
|---|---|---|
| `--aurora-violet` | `#6D28D9` | Primary brand. Buttons, active tabs, focus rings |
| `--aurora-violet-hover` | `#5B21B6` | Hover and pressed states |
| `--aurora-magenta` | `#DB2777` | Gradient partner, accent highlights, active drawer edge |
| `--aurora-amber` | `#F59E0B` | Gradient terminus, achievement, bonus score |
| `--aurora-gradient` | `linear-gradient(135deg, #6D28D9, #DB2777 55%, #F59E0B)` | Hero, logo, progress fills, celebration only |

### 2.2 Canvas — Ink

A near-black violet rather than a neutral grey. It makes the accents glow without raising saturation.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF9FC` | `#0B0A14` | Page background |
| `--surface` | `#FFFFFF` | `#151327` | Cards, drawers, modals |
| `--surface-raised` | `#F4F2F9` | `#1E1B34` | Nested panels, table headers, sticky bar |
| `--border` | `#E4E0EE` | `#2A2645` | Dividers, input outlines |
| `--text` | `#1A1727` | `#F4F2F9` | Primary text |
| `--text-muted` | `#5D5878` | `#A9A3C4` | Labels, helper text, timestamps |

### 2.3 Semantic

| Token | Hex | Use |
|---|---|---|
| `--success` | `#059669` | "Saved" indicator, approved judge, completed challenge |
| `--warning` | `#D97706` | Unsaved changes, pending approval |
| `--danger` | `#DC2626` | Destructive actions, validation errors, critical timer |
| `--info` | `#0891B2` | Informational callouts on the briefing page |

### 2.4 The timer ramp — the most important colour decision

The countdown is the single most emotionally charged element in the product. It changes colour as time runs out, so a participant reads their remaining time **peripherally**, without having to stop and parse digits.

| Remaining | Colour | Behaviour |
|---|---|---|
| 3:00:00 – 0:30:00 | `--aurora-violet` | Calm. No motion |
| 0:30:00 – 0:10:00 | `--warning` `#D97706` | One-off toast: "30 minutes remaining" |
| 0:10:00 – 0:05:00 | `#EA580C` | Toast, and the digits gain weight |
| 0:05:00 – 0:01:00 | `--danger` `#DC2626` | Slow 2s pulse on the seconds |
| Final 60 seconds | `--danger` | 1s pulse, and a persistent banner: "Your work is saved automatically" |

That last message matters. The final minute is when people panic and do something destructive; the interface should be reassuring them, not just alarming them.

---

## 3. Typography

| Role | Face | Where |
|---|---|---|
| Display | **Sora** (600/700) | Page titles, the countdown, challenge headings, hero |
| Body | **Inter** (400/500/600) | Everything else. Exceptional legibility at small sizes over long sessions |
| Mono | **JetBrains Mono** (400) | GitHub URLs, CNIC display, file names, audit log entries |

Both are open-source and self-hosted — **no runtime dependency on Google Fonts**, which matters if IT deploys somewhere with restricted egress.

**Scale** (1.25 ratio): 12 · 14 · 16 · 20 · 25 · 31 · 39 · 49 px. Body text is 16px with a 1.6 line height; the countdown is 39px in tabular figures so the digits do not jitter as they change.

---

## 4. Form and motion

**Shape:** 12px radius on cards and drawers, 8px on inputs and buttons, full round on pills and avatars. Elevation comes from a violet-tinted shadow (`0 4px 24px rgba(45, 27, 105, 0.08)`) rather than grey, so cards sit on the Ink canvas rather than floating above a different colour temperature.

**Motion durations:** 150ms micro-interaction · 250ms standard transition · 400ms page change.
**Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `cubic-bezier(0.4, 0, 1, 1)` for exits.

**Every animation is wrapped in `prefers-reduced-motion`.** People who are motion-sensitive should not be fighting the interface for three hours.

### 4.1 The five signature moments

> **Built on Day 11.** All five are in `src/app/globals.css` and switched off wholesale
> by the `prefers-reduced-motion` block at the end of that file — verified by
> re-rendering the confetti under `reducedMotion: "reduce"` and measuring a 0.01ms
> animation. Moment 4 is a 40px arc beside the digits rather than a ring drawn around
> them: at the size the countdown is set, a true surround reads as a border rather than
> as progress. It depletes against the attempt's own allowance, so a reopened attempt
> starts partly spent — which is true.

Restraint is the point. Animation is spent on five moments and withheld everywhere else, so each one carries meaning.

1. **The begin button.** The Aurora gradient sweeps slowly beneath "Let's begin with the challenge", the only animated element on an otherwise still page. It is the one irreversible click in the product, and it should feel like one.
2. **The drawer cascade.** A new bug report drawer expands with height and opacity together, and the previous drawers settle down the page rather than jumping. With participants adding dozens of these, the transition has to feel weightless.
3. **The save pulse.** The "Saved" indicator does a single 150ms scale-and-fade in `--success` on every autosave. Small, frequent, and the entire basis of a participant's trust that their work is safe.
4. **The countdown ring.** A thin Aurora arc around the timer depletes over the three hours, shifting along the ramp in §2.4. Ambient progress, readable without reading.
5. **Submission confetti.** Aurora-coloured, ~1.2 seconds, once, on successful final submit. This is the end of a three-hour effort and the last thing a participant sees. It should feel like an achievement, not a receipt.

---

## 5. Accessibility

Non-negotiable, and it is also what separates this from an ordinary event site.

- **Contrast:** AA for all text, AAA for the countdown.
- **Colour is never the only signal.** The timer ramp is always paired with a toast or a label — a participant with colour vision deficiency must never rely on the hue alone to know they have five minutes left.
- **Focus is always visible:** a 2px `--aurora-violet` ring with a 2px offset. Never removed.
- **Drawers and modals** trap focus, close on Escape, and return focus to the trigger.
- **The countdown is announced** by screen readers at the 30, 10, 5 and 1 minute marks via an `aria-live="polite"` region — not on every tick, which would be unusable.
- **Full keyboard operation** of drawers, tabs, upload and submit.

---

## 6. What I need

Approval, or a direction to change. The concrete question is whether the **violet/magenta/amber Aurora spectrum** is right for Women Tech Quest, or whether you want something cooler (teal/cyan) or closer to the 10Pearls corporate identity.

If it would help to see it rather than read it, say so and I will build a one-page visual preview — palette, type scale, the timer in all five states, and a sample drawer — before any application code is written.
