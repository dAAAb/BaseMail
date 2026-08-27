# BaseMail Design System (2026-08)

This file is the single source of truth for how BaseMail's web UI looks. Every page
(Landing, Dashboard, Agent profile, Claim, static pages, blog templates) must use the
tokens and component classes below instead of ad-hoc Tailwind color/spacing choices.

## 1. Brand voice

- Product: **BaseMail — email for AI agents, on Base.**
- Retired: the "Æmail" spelling. Never use it in UI, meta tags, or copy.
- Tone: precise, developer-first, confident. Short sentences. No hype adjectives.
- No emoji as UI icons. Use the inline SVG icons in `src/components/Icons.tsx`.
  (Emoji may remain in *user content* such as email bodies.)

## 2. Tokens (Tailwind theme + CSS variables in `src/index.css`)

| Token | Value | Use |
|---|---|---|
| `bg` | `#0A0B0D` | page background |
| `surface` | `#111316` | cards, sidebar, inputs on bg |
| `surface-2` | `#181B20` | nested/inner cards, hover rows |
| `line` | `rgba(255,255,255,.08)` | default borders |
| `line-strong` | `rgba(255,255,255,.16)` | hover/focus borders |
| `fg` | `#F2F3F5` | primary text |
| `fg-muted` | `#9AA0A9` | secondary text |
| `fg-subtle` | `#6B7280` | tertiary / hints |
| `accent` | `#0052FF` | Base blue — primary actions, links |
| `accent-hover` | `#2E6BFF` | |
| `accent-soft` | `rgba(0,82,255,.12)` | tinted backgrounds |
| `success` | `#22C55E` | |
| `warning` | `#F59E0B` | |
| `danger` | `#EF4444` | |
| `attn` | `#8B5CF6` | $ATTN token colour only |

Tailwind names: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-fg`,
`text-fg-muted`, `text-fg-subtle`, `bg-accent`, `text-accent`, `bg-accent-soft`,
`text-success`, `text-warning`, `text-danger`, `text-attn`, `bg-attn-soft`.

Legacy names `base-blue`, `base-dark`, `base-gray` still resolve (mapped to the new
values) so nothing breaks, but new code must use the new names.

## 3. Typography

- Sans: Inter (`font-sans`), mono: JetBrains Mono (`font-mono`) — already loaded.
- Display headings: `font-semibold tracking-tight` and the fluid sizes
  `text-display` (clamp 2.25rem→4.5rem), `text-h1` (clamp 1.875rem→3rem),
  `text-h2` (clamp 1.5rem→2.25rem), `text-h3` (1.25rem).
- Body: `text-base` / `text-[15px]` on dashboard; muted copy `text-fg-muted`.
- Eyebrow labels: `.eyebrow` (`text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle`).
- Addresses, hashes, amounts, code: `font-mono`.

## 4. Component classes (defined in `src/index.css` under `@layer components`)

| Class | Purpose |
|---|---|
| `.btn` | base button: inline-flex, h-10, px-4, rounded-lg, text-sm font-medium, focus ring, disabled state |
| `.btn-primary` | accent background, white text |
| `.btn-secondary` | surface-2 background, line border |
| `.btn-ghost` | transparent, muted text, hover surface-2 |
| `.btn-danger` | danger tint |
| `.btn-sm` / `.btn-lg` | h-8 text-xs / h-12 text-base |
| `.card` | `bg-surface border border-line rounded-2xl p-5 sm:p-6` |
| `.card-inset` | `bg-surface-2 border border-line rounded-xl p-4` (inner card) |
| `.input` | full-width text input: h-10, surface-2 bg, line border, focus accent border |
| `.input-lg` | h-12 |
| `.field-label` | `block text-xs font-medium text-fg-muted mb-1.5` |
| `.badge` | pill: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium` |
| `.badge-accent/.badge-success/.badge-warning/.badge-danger/.badge-attn/.badge-neutral` | tints |
| `.eyebrow` | see typography |
| `.prose-basemail` | long-form copy (static pages / blog) |
| `.container-x` | `mx-auto w-full max-w-6xl px-5 sm:px-8` |
| `.section` | `py-16 sm:py-24` vertical rhythm for landing sections |
| `.table-wrap` | `overflow-x-auto -mx-5 sm:mx-0` for wide tables on mobile |
| `.skeleton` | loading shimmer block |

Rules:
- Radius: `rounded-lg` (8px) for controls, `rounded-2xl` (16px) for cards. Nothing else.
- Borders are `border-line`; hover raises to `border-line-strong`. No coloured borders
  except semantic states (success/warning/danger/attn) and only at 30–40% opacity.
- Gradients: at most one subtle radial accent glow per page (hero). No gradient cards.
- Shadows: none on dark surfaces except modals (`shadow-2xl shadow-black/50`).
- Motion: `transition-colors duration-150`. Respect `prefers-reduced-motion`.

## 5. Layout & responsive rules

- Mobile-first. Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Every flex row that holds text + controls must `flex-wrap` or stack (`flex-col sm:flex-row`).
- Every fixed-column grid needs a mobile fallback (`grid-cols-2 md:grid-cols-4`).
- Tables live inside `.table-wrap`.
- Touch targets ≥ 40px. Inputs ≥ 40px tall. 16px font on inputs (prevents iOS zoom).
- No horizontal page scroll at 360px width. Long strings (`0x…`, emails) use `break-all` or `truncate`.
- Safe-area: fixed bottom bars use `pb-[env(safe-area-inset-bottom)]`.

### Landing
- `SiteHeader` (sticky, 64px, blur) + `SiteFooter` shared components.
- Sections use `.section` + `.container-x`; max text width `max-w-2xl`.
- Hero: two columns on `lg` (copy + identity checker left, live terminal right), stacked below.

### Dashboard
- Desktop (`md+`): fixed left sidebar 256px (`bg-surface`, `border-r border-line`);
  `<main>` gets `md:pl-64`. Content max width `max-w-3xl` for forms, full for inbox list.
- Mobile (`<md`): sidebar hidden; top app bar (48px: menu button, current section title,
  account chip); sidebar slides in as a drawer with backdrop; body scroll locked while open.
- Page header pattern: `<h1 class="text-h3 font-semibold">` + optional actions on the right,
  wrapping on small screens.

## 6. Icons

`src/components/Icons.tsx` exports 24px stroke icons (`Icon.Inbox`, `.Send`, `.Compose`,
`.Credits`, `.Attn`, `.Settings`, `.Copy`, `.Check`, `.Close`, `.Menu`, `.ArrowRight`,
`.Wallet`, `.Shield`, `.Globe`, `.Spark`, `.Mail`, `.Key`, `.Terminal`, `.Users`,
`.ChartBar`, `.Lock`, `.ExternalLink`, `.Warning`, `.Info`). Props: `className`, `size`.

## 7. Accessibility

- All icon-only buttons have `aria-label`.
- Focus rings visible (`focus-visible:ring-2 ring-accent/60`).
- Colour contrast ≥ 4.5:1 for body text (`fg-muted` on `surface` passes).
- Drawer/modal: `role="dialog"`, `aria-modal`, Escape closes.
