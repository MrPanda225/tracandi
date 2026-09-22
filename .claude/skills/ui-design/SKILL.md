---
name: ui-design
description: "Apply UI expertise to components, visual systems, interaction patterns, and implementation. Use when the task involves building or reviewing interface elements, choosing visual direction, implementing a design system, or auditing code against platform standards. Actions: build, review, audit, critique, implement, choose, check. Topics: components, typography, colour, layout, navigation, accessibility, animation, forms, buttons, Apple HIG, Material Design 3, WCAG."
---

Apply UI principles to help the user build and review interfaces that meet platform standards and pass accessibility requirements. Every rule must cite its source: Apple HIG, Material Design 3, or WCAG. Signal violations directly, propose concrete corrections.

The user provides a component, screen, or visual decision to build or review. They may include a framework, platform target, or design system context.

## Context Protocol

UI decisions without platform context produce wrong answers. Before building or reviewing, confirm:

- **Target platform**: iOS, Android, web, cross-platform (React Native / Flutter)
- **Framework**: HTML/CSS, React, Vue, SwiftUI, Jetpack Compose, etc.
- **Design system**: custom, Material, shadcn, Radix, or none
- **Accessibility requirement**: AA minimum (standard) or AAA

Once platform is known, apply the correct source hierarchy automatically:

| Platform | Primary source | Secondary |
|---|---|---|
| iOS native | Apple HIG | WCAG |
| Android native | Material Design 3 | WCAG |
| Web / PWA | WCAG | Material Design 3 |
| React Native / Flutter | HIG + MD3 per OS | WCAG |
| Custom design system | MD3 as base | HIG for mobile |

**CRITICAL**: Never mix iOS and Android interaction idioms in the same interface. Never skip WCAG — it applies universally regardless of platform.

---

## Reference Sources

Cite the source in parentheses with every rule applied.

### Apple Human Interface Guidelines (HIG)
Covers: Tab Bar, Navigation Bar, Sheet, tap targets (44×44pt), Dynamic Type, Safe Areas, system gestures, spring physics, shared element transitions, haptic feedback, VoiceOver, accessibilityLabel, accessibilityHint, Dark Mode, native controls (Picker, Toggle, Stepper, ActionSheet).

**DO**: Prefer native controls over custom implementations unless branding explicitly requires it (HIG)
**DON'T**: Block system gestures (swipe-back, Control Center, home indicator) (HIG)
**DON'T**: Hide the Tab Bar in sub-flows — persistent navigation stays reachable (HIG)

### Material Design 3 (MD3)
Covers: tap targets (48×48dp, 8dp min spacing), semantic colour tokens (primary, secondary, surface, on-surface, error, outline), type scale (Display/Headline/Title/Body/Label), elevation, state layers (hover/pressed/focused/dragged), Top App Bar, Bottom Navigation (≤5 items), Navigation Drawer, FAB, Chip, Snackbar, Dialog, 4dp grid, motion easing (emphasized/standard/decelerate/accelerate).

**DO**: Use semantic colour tokens — never raw hex values in components (MD3)
**DO**: Apply state layers for all interactive surfaces — hover, pressed, focused, dragged (MD3)
**DON'T**: Use Bottom Navigation for more than 5 items or for secondary actions (MD3)
**DON'T**: Mix navigation patterns at the same hierarchy level (MD3)

### WCAG 2.1 / 2.2
Levels: A (minimum) → AA (required standard) → AAA (optimal).

**DO**: Text contrast ≥ **4.5:1 AA** / 7:1 AAA (1.4.3)
**DO**: Large text contrast ≥ **3:1 AA** (≥18px or ≥14px bold) (1.4.3)
**DO**: UI components and graphics contrast ≥ **3:1** (1.4.11)
**DO**: Tap/click target ≥ **44×44px** (2.5.5)
**DO**: Focus visible on all interactive elements (2.4.7)
**DO**: Full keyboard navigation, no focus traps (2.1.1)
**DO**: Text resizable to 200% without content loss (1.4.4)
**DO**: aria-label on icon-only buttons, aria-live on dynamic errors
**DON'T**: Convey information by colour alone — always add icon or text (1.4.1)
**DON'T**: Auto-play media with sound (1.4.2)

---

## Selection Controls

| Component | When to use |
|---|---|
| **Checkbox** | Multiple independent choices (0 to ∞ selections) |
| **Radio button** | Single exclusive choice, one default required |
| **Switch** | On/Off with **immediate effect only** |
| **Dropdown** | More than 6–7 options (Miller's Law), predictable or incremental options |
| **Choice chips** | Compact radio alternative for mobile |
| **Filter chips** | Compact checkbox alternative for mobile |

**DO**: Replace switch with checkbox when effect requires form submission — switches imply immediacy (HIG, MD3)
**DO**: Make the entire label clickable on mobile, not just the control (HIG, MD3)
**DO**: Place label to the left of the control for visual scanning (Gestalt proximity)
**DON'T**: Use negative labels ("Do not save card") — always rephrase as positive action
**DON'T**: Use a dropdown when fewer than 6 options exist — visible radio buttons reduce cognitive load

---

## Text Inputs

### Six required states
Inactive → Hover → Active → Disabled → Validation → Error
Every state must be visually distinct and consistent across the entire form.

### Rules

**DO**: Keep the label visible before AND after fill — floating label or label above (memory retention) (HIG, MD3)
**DO**: Match field width to expected answer length — postal code ≠ address (MD3)
**DO**: Use vertical alignment (label above field) for fastest completion time
**DO**: Group related fields with a section title (Gestalt proximity)
**DO**: Trigger the correct keyboard type per field — email, tel, number (HIG, MD3)
**DO**: Show password requirements in real time with a strength indicator (MD3)
**DO**: Validate on blur, not on keystroke — keystroke validation stresses users (MD3)
**DO**: Show errors below the relevant field with explanation + recovery path (HIG, MD3, WCAG)
**DO**: Show a progress indicator on multi-step forms with back navigation allowed (MD3)
**DON'T**: Use placeholder text as the only label — it disappears on focus (WCAG)
**DON'T**: Ask for password confirmation — use show/hide toggle instead (MD3)
**DON'T**: Show errors only at the top of the form without anchor links to each field (WCAG)

---

## Buttons

### Six required states
Normal → Focus → Hover → Active → Loading → Disabled

### Hierarchy
- **Primary** (contained): one main action per screen maximum
- **Secondary** (outlined / ghost): supporting actions
- **Tertiary** (text): low-importance actions

### Types
Contained / Contained with icon / Ghost-Outlined / Text / Icon button / FAB / Toggle / Multiselect / Split

**DO**: Disable button during async operations and show a spinner (MD3)
**DO**: Separate destructive actions visually and spatially from primary actions (HIG)
**DO**: Use semantic danger colour (red) for destructive actions only (HIG, MD3)
**DON'T**: Use button where a link is correct — button = action (Submit, Save), link = navigation (See more, Profile)
**DON'T**: Use the same colour for interactive and non-interactive elements
**DON'T**: Pre-select a default when choices are equal or the action is irreversible (HIG)
**DON'T**: Reinvent button shape — convention exists for a reason (Don't Make Me Think — Steve Krug)

---

## Navigation

### Patterns by platform
- **Tab Bar** (iOS): top-level navigation, icon + label, max 5 items (HIG)
- **Bottom Navigation** (Android): top-level only, icon + label, max 5 items (MD3)
- **Navigation Drawer**: secondary navigation, never primary actions (MD3)
- **Breadcrumb**: hierarchies 3+ levels deep, fixed position (HIG, MD3)
- **Pagination**: long content — allows positioning, skipping, understanding depth

**DO**: Show active state clearly — colour, weight, or indicator (HIG, MD3)
**DO**: Support system gesture navigation — iOS swipe-back, Android predictive back (HIG, MD3)
**DO**: Preserve scroll position, filter state, and input on back navigation (HIG, MD3)
**DON'T**: Hide core navigation in sub-flows (HIG)
**DON'T**: Use modals for primary navigation flows — they break the user's path (HIG)
**DON'T**: Mix Tab Bar + Sidebar + Bottom Nav at the same hierarchy level (MD3)

### Supporting components
- **Tags**: content categorisation and filtering
- **Sliders**: continuous value adjustment — content changes, interface doesn't
- **Icons**: SVG only, never emojis as structural icons — consistent style (stroke width, corner radius) (HIG, MD3)
- **Carousels**: truncated image = scroll affordance — never hide all content fully
- **Tooltips**: hover on desktop, tap on mobile — never sole source of critical information
- **Progress bars**: visual landmark, not clickable — indicates task advancement
- **Modals**: force interaction before resuming navigation — always provide an exit (HIG)
- **Accordions**: multiple sections open simultaneously — for independent dense content
- **Tabs**: one active at a time — for dense content not shown simultaneously

---

## Typography

### Font selection criteria
Legibility (clear L/l/1 distinction), high x-height (95% of text is lowercase), open counters, Regular weight for body, wide non-condensed proportions.

**DO**: Set minimum body size at **16px** on mobile — below this, iOS auto-zooms (HIG)
**DO**: Set line height at size × **1.618** (golden ratio) for optimal readability
**DO**: Limit line length to **65–75 characters** (desktop) / 35–60 (mobile)
**DO**: Apply weight hierarchy — headings **600–700**, body **400**, labels **500** (MD3)
**DO**: Use tabular figures in data tables, prices, and timers (HIG, MD3)
**DON'T**: Use condensed fonts for body text — they reduce legibility at small sizes
**DON'T**: Set body weight below Regular — thin weights reduce counter visibility

### Platform type systems
- **MD3**: Display → Headline → Title → Body → Label
- **HIG**: Large Title → Title 1/2/3 → Headline → Body → Callout → Subhead → Footnote → Caption

---

## Colour

### Foundations
**DO**: Limit to **3 primary colours** + tonal variants — apply 60–30–10 rule (60% dominant, 30% secondary, 10% accent)
**DO**: Add slight saturation to greys and blacks — pure #000000 never appears in nature
**DO**: Use **RGB additive** colour model for screens (≠ CMYK for print)
**DO**: Test light AND dark mode independently — dark mode uses desaturated tonal variants, not inverted colours (HIG, MD3)
**DO**: Use semantic colour tokens in components — never raw hex (MD3)
**DON'T**: Convey information by colour alone — always add icon or text (WCAG 1.4.1)
**DON'T**: Assume light mode contrast ratios work in dark mode — test separately

### Cultural colour meanings
Colours carry different meanings by region — verify implications for the target market before committing:
- Red: danger/love (Europe) / luck/happiness (Asia)
- White: purity (Europe) / mourning (China, Japan)
- Green: nature/hope (Europe) / corruption (North Africa)

---

## Animation

**DO**: Use 150–300ms for micro-interactions, ≤400ms for complex transitions (MD3)
**DO**: Animate only transform and opacity — never width, height, padding, or margin (MD3)
**DO**: Use ease-out for entrances, ease-in for exits (MD3)
**DO**: Respect prefers-reduced-motion — disable or reduce all animations (HIG, WCAG)
**DO**: Make animations interruptible — user gesture cancels in-progress animation (HIG)
**DON'T**: Use animation for decoration only — every animation must convey cause and effect (HIG)
**DON'T**: Block user input during animation (HIG)

---

## The UI Quality Test

Before delivering any component or screen, ask:

> Does every visual decision have a source? Does every interactive element meet platform standards? Would this pass a WCAG AA audit?

If no to any → identify the specific rule being violated and correct it before delivering.

---

## Delivery Checklist

### Accessibility — CRITICAL (WCAG)
- [ ] Text contrast ≥ 4.5:1, large elements ≥ 3:1
- [ ] Focus ring visible on all interactive elements
- [ ] Icon-only buttons have aria-label or accessibilityLabel
- [ ] Full keyboard navigation, no focus traps
- [ ] No information conveyed by colour alone

### Interactions
- [ ] Visual feedback within **100ms** of tap/click (HIG)
- [ ] Tap targets ≥ **44×44pt** iOS / **48×48dp** Android
- [ ] 6 button states defined and consistent
- [ ] Button disabled during async operations + spinner shown
- [ ] Disabled states visually distinct from active states

### Forms
- [ ] Labels visible before AND after fill
- [ ] Errors below the relevant field with explanation and recovery path
- [ ] Validation on blur, not on keystroke
- [ ] Correct keyboard type on mobile
- [ ] Progress indicator on multi-step forms

### Layout
- [ ] Mobile-first, tested at **375px** minimum
- [ ] No horizontal scroll
- [ ] Safe Areas respected — notch, Dynamic Island, gesture bar (HIG)
- [ ] Spacing on **4dp/8dp** grid (MD3)
- [ ] Fixed elements do not obscure scrollable content

### Visual
- [ ] SVG icons only, consistent stroke and corner radius style
- [ ] Greys and blacks have slight saturation (no pure #000 or #808080)
- [ ] Semantic colour tokens used — no raw hex in components (MD3)
- [ ] Light and dark mode tested independently
- [ ] Tabular figures in data tables and price displays

---

## Behaviour Rules

When the user presents a component, screen, or visual decision:
1. Identify the correct source hierarchy for the target platform
2. Cite the source explicitly — (HIG), (MD3), or (WCAG) — with every rule applied
3. Signal violations directly without softening
4. Prioritise: WCAG (accessibility) → HIG/MD3 (platform) → general best practices
5. Never validate a choice without checking it against the source

Format: violation → source → correction. Concise. No padding.
