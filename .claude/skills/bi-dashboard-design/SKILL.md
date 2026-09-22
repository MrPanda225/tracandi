---
name: bi-dashboard-design
description: "Apply dashboard design expertise to BI production, visual critique, and data communication decisions. Use when the task involves creating, reviewing, or improving a dashboard or data visualization. Actions: audit, critique, design, structure, choose, recommend. Topics: KPI layout, chart selection, color palette, cognitive load, dashboard structure, data storytelling, Power BI design, dataviz best practices."
---

Apply dashboard design principles to help the user produce clearer, more actionable dashboards. Every recommendation must reference a named principle or model. Signal design problems directly. Justify every alternative.

The user provides a dashboard, a description, a set of KPIs, or a design decision to analyze. They may include context about their audience, data sources, or business objectives.

## Context Protocol

Dashboard recommendations without audience context are decoration. Before any analysis, confirm:

- **Who reads it**: profile, technical level, available time per session
- **What decision it supports**: not the data shown, the action triggered
- **Dashboard type**: strategic (minutes), operational (< 1 min), analytical (hours)
- **Constraints**: screen size, tool (Power BI, Tableau…), refresh frequency

**CRITICAL**: Never infer the audience from the data. The data tells you what was collected, not who needs to act on it or how fast.

---

## Foundations

### What a dashboard actually is
Stephen Few: *a visual display of the most important information needed to achieve one or more objectives, consolidated on a single screen so it can be monitored at a glance.*

The primary goal is not to inform. Not to document. **To promote action** (Kaushik).

### The human is a visual animal
Four facts that must constrain every design decision:
- 70% of sensory receptors are in the eyes — vision dominates all other channels
- Images are processed 60,000× faster than text — a number in a cell is slower than a bar
- Working memory retains ~4–7 items for ~15 seconds — everything beyond that is lost
- 65% of people are visual learners — tables of numbers are a minority format

**DO**: Default to visual encoding. Every table is a last resort.
**DON'T**: Mistake data density for richness — a dense dashboard is a failed dashboard.

### Three dashboard types — pick one before starting

| Type | Audience | Purpose | Read time |
|------|----------|---------|-----------|
| **Strategic** | Direction | KPIs and trend signals | Minutes |
| **Operational** | Production managers | Real-time monitoring | < 1 minute |
| **Analytical** | Business Analysts | Ad hoc exploration | 1h+ |

**DO**: Design for exactly one type per dashboard. Mixed-purpose dashboards serve no one well.
**DON'T**: Add analytical depth to an operational dashboard — it kills the < 1 min read time.

---

## Recueil du besoin — Canvas en 3 dimensions

### Désirabilité (Human)
- **Audience**: who reads it, at what level of data literacy, with how much time
- **Value proposition**: what business problem does this solve? what decisions does it support?

### Faisabilité (Technical)
- **KPIs**: which indicators, with precise business definitions, are they actionable?
- **Sources**: where is the data, what is the refresh cadence, what granularity is available?

### Viabilité (Business)
- **Scope**: whole company, one department, one process?
- **Threats**: change management, data culture, competing priorities?

**DO**: Run all three dimensions before touching a tool. Skipping viabilité is the most common source of abandoned dashboards.
**DON'T**: Start from "what data do we have?" — start from "what decision do we need to make?"

### Stakeholder anti-patterns

| Pattern | Description | Counter |
|---------|-------------|---------|
| **HIPPO** | Highest Paid Person's Opinion overrides data | Bring all decisions back to measurable objectives |
| **ZEBRA** | Zero Evidence But Really Arrogant — gut over proof | Propose a quick test before committing to a direction |
| **RHINO** | Really High-value New Opportunity — derails the roadmap | Absorb or defer with explicit priority scoring |
| **WOLF** | Working On Latest Fire — attention jumps constantly | Build a formal request and prioritization process |

---

## Perception visuelle — Les 4 axes d'organisation

### Attributs pré-attentifs (Colin Ware)
What the brain captures before conscious reading. Four categories:
- **Spatial position**: top-left is always seen first
- **Color**: a different color = a categorical signal or an alert — use it once
- **Shape**: shape variation = category distinction
- **Size**: size encodes magnitude — bigger = more

**DO**: Use pre-attentive attributes to direct the eye before the user reads a single label.
**DON'T**: Use color, size, and shape simultaneously without a legend — it creates noise, not signal.

### Gestalt Laws

| Law | Dashboard application |
|-----|-----------------------|
| **Proximity** | Group related KPIs. Vertical grouping → top-to-bottom reading. Horizontal → left-to-right. |
| **Similarity** | Same color = same category. Do not vary colors without semantic intent. |
| **Enclosure** | Use negative space and borders to create distinct zones — not decorative boxes. |
| **Connection** | Lines link data points — the brain follows the line. Use in sparklines and trend indicators. |
| **Continuity** | Aligned elements are perceived as belonging together. Misalignment signals separation. |
| **Simplicity (Prägnanz)** | The brain always picks the simplest interpretation. Don't fight it. |

**DO**: Use proximity and similarity before adding any border or color to group elements.
**DON'T**: Add borders to compensate for poor spatial organization — they add cognitive load without solving the problem.

### UX Laws

**Hick's Law**: decision time increases logarithmically with the number of choices.
→ Limit filters, limit navigation options, limit the number of KPIs per dashboard.

**Fitts's Law**: time to reach a target is a function of distance and target size.
→ Interactive elements (filters, drill-downs) must be large and near the data they affect.

**Von Restorff Effect**: an isolated element among similar ones is the one remembered.
→ Use exactly one color accent per dashboard view to signal the one thing that requires attention.

**DO**: Treat Hick's Law as a budget — every filter added has a cognitive cost.
**DON'T**: Use Von Restorff for decoration. One accent means one. Two accents means zero.

### Reading patterns — choose one

| Pattern | Use when |
|---------|----------|
| **Z model** | Simple layout, few large elements. Most important KPI: top-left → top-right → bottom-left → bottom-right. |
| **F model** | Semi-text layouts. High importance at top and left edge. |
| **Inverted pyramid** | KPIs top → trends middle → detail bottom. Clearest narrative structure. |

**DO**: Place the most important information top-left, always.
**DON'T**: Design bottom-up — users rarely reach the bottom of a dense dashboard.

---

## Charge cognitive

Three types of cognitive load (Sweller):

| Type | Definition | Dashboard action |
|------|-----------|-----------------|
| **Intrinsic** | Complexity inherent to the subject | Decompose the message. One dashboard = one audience. Limit choices. |
| **Extraneous** | Everything that distracts from the message | Reduce colors, remove decorations, kill the chartjunk |
| **Germane** | Processing that transfers info to long-term memory | Highlight what matters. Reuse icons and layouts consistently. |

### Data Ink Ratio (Tufte) — 5 laws
1. Above all, show the data
2. Maximize the data-ink ratio
3. Erase all ink unrelated to data
4. Erase all redundant data-ink
5. Revise and edit

**DO**: After completing a dashboard, remove elements one by one and ask: does removing this hurt understanding? If no → remove it.
**DON'T**: Mistake visual richness for analytical richness. They are inversely correlated.

---

## Choix des graphiques

### Selection guide

| Objective | Recommended | Avoid |
|-----------|-------------|-------|
| Compare categories | **Bar chart** | Pie if >3 categories |
| Show trend over time | **Line chart** | Bar chart if many data points |
| Trend + cumulative volume | **Area chart** | — |
| Correlate 2 measures | **Dual axis** or **Scatter plot** | Dual axis if exact values needed |
| Part of a whole (≤3 categories) | **Pie / Donut** | Pie if >3 categories |
| Geographic distribution | **Map** | If geography isn't precise enough for the analysis |
| Category × category comparison | **Heatmap** | If too many categories to label clearly |
| Proportional hierarchy (≤5 levels) | **Treemap** | If >5 categories |

### Absolute rules
- **No 3D charts** — they distort proportions and actively mislead
- **Bar chart Y-axis always starts at 0** — truncation is a lie
- **Maximum 4 lines** on a single line chart
- **Maximum 6 distinct colors** in a bar chart
- **Pie charts**: 2 categories ideal, 3 maximum — eyes cannot compare angles accurately

**DO**: Default to bar charts and line charts. They are the most universally readable formats.
**DON'T**: Use chart variety to make a dashboard look sophisticated — it fragments the reading experience.

---

## Gestion des couleurs

### Three palette types

| Type | When to use |
|------|-------------|
| **Multi-hue** | Comparing independent categories — each gets a distinct color |
| **Single-hue** (light → dark) | One naturally ordered numeric variable |
| **Diverging** (two colors + neutral midpoint) | Variable with a meaningful center (zero, target, average) |

### Key rules

**Gray is your most powerful tool** — it creates reference, context, and neutral background that makes accents pop. Use it for everything that is not the focus.

**DO**: Use gray for secondary data, reference lines, and background structure. Reserve color for signal.
**DON'T**: Use the brand logo color as the primary palette — it adds cognitive load with no informational value.
**DON'T**: Code everything red/green — reserve red and green for genuine alerts only.
**DO**: Account for color blindness — never encode critical information through red/green alone.
**DO**: Use the same colors for the same indicators across all pages of a report. Consistency IS the message.

### Color decision checklist
- **Context**: what does this color mean culturally for this audience?
- **Selection**: which palette type fits this chart type and data?
- **Simplicity**: are the same colors used consistently across the full dashboard?
- **Excess**: is red or green used more than twice on this page? If yes — reduce.

---

## Les 10 pièges — Audit checklist

Use this list to audit any dashboard, at any stage of production:

1. **More than one screen** — Content exceeds one view → prioritize or split into typed dashboards
2. **No context** — A number without a reference (vs. target, vs. prior period) means nothing
3. **Too much detail** — Granularity overload → cognitive load exceeds working memory
4. **Wrong metrics** — The KPI doesn't answer the audience's actual question
5. **Wrong chart type** — The most frequent error → apply the selection guide above
6. **Too much chart variety** — Mixing types without reason disorients the reader
7. **No structure** — No visual hierarchy, no narrative, no reading path
8. **Too many focal points** — If everything is highlighted, nothing is highlighted
9. **Decoration** — Shadows, gradients, icons that carry no data → remove everything
10. **Color abuse** — Too many colors, no logic, no consistency → reduce to 3 colors maximum

---

## Audit mode

When the user shares a dashboard (screenshot, description, or list of visuals):

1. Identify the type (strategic / operational / analytical) and intended audience
2. Check the reading structure: which model (Z, F, pyramid)? Does the most important info land top-left?
3. Run the 10-piège checklist — flag every violation
4. Evaluate each chart: right type for the data? apply the selection guide
5. Evaluate the color palette: right type? consistent? any abuse?
6. Evaluate cognitive load: can the primary KPIs be read in under 15 seconds?
7. Deliver recommendations ordered by impact / effort — highest impact first

---

## Behaviour Rules

When the user presents a dashboard, a design decision, or a set of KPIs:
1. Name the applicable principle before recommending — no ungrounded opinions
2. Signal violations and blind spots directly — no softening
3. Propose a concrete alternative with its justification
4. Prioritize: structural problems → chart selection → color → details
5. Never validate a design choice because the user seems committed to it

Format: problem identified → principle violated → correction proposed. Concise. No padding.

---

## Key References

- **Stephen Few** — Dashboard definition, *Show Me the Numbers*, *Information Dashboard Design*
- **Edward Tufte** — Data Ink Ratio, Challenger disaster dataviz analysis
- **Colin Ware** — Pre-attentive attributes, *Information Visualization*
- **Avinash Kaushik** — Primary dashboard goal = action, *Web Analytics 2.0*
- **John Sweller** — Cognitive load theory (intrinsic / extraneous / germane)
