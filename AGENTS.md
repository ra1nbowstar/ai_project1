# AI Pred Project Rules

## Design Philosophy

### 1. Anti-AI-Slop Policy
- **NO emojis** in code, markup, text content, or alt text. Use SVG icons (Lucide, Phosphor) instead.
- **NO Inter font** - Use `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`
- **NO purple/blue AI gradients** - Use neutral bases (Zinc/Slate) with singular accents
- **NO pure black** (#000000) - Use Off-Black, Zinc-950, or Charcoal
- **NO neon/outer glows** - Use inner borders or subtle tinted shadows
- **NO generic names** (John Doe, Acme, Nexus) - Use creative, realistic names

### 2. Typography
- Display/Headlines: `text-4xl md:text-6xl tracking-tighter leading-none`
- Body: `text-base text-gray-600 leading-relaxed max-w-[65ch]`
- Serif fonts BANNED for dashboards/software UI - Use high-end Sans-Serif pairings

### 3. Color Constraints
- Max 1 accent color, saturation < 80%
- Stick to one palette per project
- Background: `#f9fafb` or `#ffffff`
- Cards: pure white with 1px border `border-slate-200/50`

### 4. Layout Rules
- Use CSS Grid over complex flexbox math
- NEVER use `h-screen` - Use `min-h-[100dvh]` for mobile safety
- Containers: `max-w-[1400px] mx-auto` or `max-w-7xl`
- Mobile fallback: single column, `w-full`, `px-4`, `py-8`

### 5. Performance
- Animate only `transform` and `opacity` (never `top`, `left`, `width`, `height`)
- Grain/noise filters only on `fixed inset-0 z-50 pointer-events-none`
- Z-index only for systemic layers (navbars, modals, overlays)

### 6. Interaction States
- Loading: skeletal loaders (not circular spinners)
- Empty states: compose with illustration + guide text + action button
- Error states: clear inline reporting
- Tactile feedback: `-translate-y-[1px]` or `scale-[0.98]` on `:active`

### 7. Spacing System
- 8px grid: 8, 16, 24, 32, 48, 64
- Page padding: mobile 16-20px, desktop 24-48px
- Card padding: 16-24px
- Element gaps: 8px (tight), 16px (standard), 24px (loose)

### 8. Shadows
- Weak: `0 1px 3px rgba(0,0,0,0.04)`
- Light: `0 4px 12px rgba(0,0,0,0.08)`
- Medium: `0 8px 24px rgba(0,0,0,0.12)`
- Max 2 shadow levels per page

### 9. Transitions
- Duration: 150-300ms, ease-out or cubic-bezier(0.25, 0.1, 0.25, 1)
- Button hover: scale(1.02) + shadow deepen
- Card hover: shadow level up + translateY(-2px)

## Vue/React Component Patterns

### Composition API (Vue 3)
- Use `<script setup>` syntax
- Prefer `ref()` over `reactive()` for primitives
- Use `computed()` for derived state
- Extract reusable logic to composables

### State Management
- Local state: `ref()` / `reactive()`
- Global state: Pinia (Vue) or context (React)
- Avoid deep prop drilling

### CSS Strategy
- Tailwind CSS for utility classes
- CSS Variables for theme switching
- Scoped styles for component isolation

## Git Conventions

- Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`
- Commit messages: imperative mood, < 72 chars
- PR titles: concise, descriptive
- One logical change per commit

## Code Quality

- No unused imports or variables
- Prefer `const` over `let`
- Early returns for guard clauses
- Extract magic numbers to named constants
