---
name: ux-design
description: "Apply UX expertise to product decisions, user journeys, feature prioritization, and behavioral strategy. Use when the task involves understanding users, structuring information, reducing friction, or improving engagement and retention. Actions: audit, critique, design, analyze, prioritize, structure, validate. Topics: user journeys, information architecture, behavioral psychology, cognitive biases, engagement models, onboarding, feature prioritization."
---

Apply UX principles to help the user make better product and experience decisions. Every recommendation must be grounded in a named model or principle. Signal problems directly, justify every alternative with its source.

The user provides a product decision, journey, feature, or experience to analyze. They may include context about their users, business goals, or constraints.

## Context Protocol

UX recommendations without user context are guesswork. Before any analysis, confirm:

- **Who are the users**: their profile, expertise level, context of use
- **What they're trying to do**: the job-to-be-done, not the feature
- **Where in the journey**: acquisition, onboarding, retention, re-engagement
- **Platform and constraints**: web, mobile, cross-platform, technical limits

**CRITICAL**: Never infer user needs from the interface alone. The interface tells you what was built, not who it's for or why they'd use it.

---

## Foundations

### What good UX actually means
An interface must be: **useful** (right features), **usable** (easy to operate), **desirable** (emotional appeal), **navigable** (efficient), **accessible** (inclusive), **credible** (trustworthy).

The two core concepts of the discipline: **human experience** and **anticipation of use**. Design FOR the user and WITH the user, iteratively. You are not your user.

### Hassenzahl (2003) — Two perspectives that must converge
Designer side → selects content, presentation, features, interactions to give the product a character.
User side → evaluates **pragmatic quality** (utility, usability, ergonomics) and **hedonic quality** (stimulation, pleasure, fulfilment, connection).

**DO**: Test whether the character the designer intended is actually perceived by users
**DON'T**: Assume a well-designed product is well-experienced — the two perspectives regularly diverge

### Mahlke (2007) — Three inputs, three outputs
Three factors shape every human-technology interaction:
- System properties (features, dialogues, interactions)
- User characteristics (values, needs, motivations, expertise)
- Context parameters (spatial, social, temporal, technical)

They produce: perceived practical qualities + perceived non-practical qualities + emotional reactions → judgements and usage behaviours.

**DO**: Account for user characteristics and context from the start of conception
**DON'T**: Design only around system properties — Hassenzahl's mistake

### Karaponos — Three phases of adoption
1. **Orientation**: discovery, novelty stimulation, learning curve
2. **Incorporation**: the product becomes useful daily
3. **Identification**: emotional attachment, the product becomes part of identity

**DO**: Design explicitly for each phase transition, not just initial acceptance
**DON'T**: Optimise only for conversion — long-term adoption requires different design decisions

### UX temporality — Four time frames
- **Anticipated**: expectations before use (marketing, reputation, word of mouth)
- **Momentary**: impressions and emotions during use
- **Episodic**: memory after use — emotions filter and distort the lived experience
- **Cumulative**: global vision built over multiple usage periods

**DO**: Think across the full product lifecycle
**DON'T**: Design only for the momentary experience — episodic memory shapes whether users return

---

## Engagement & Behaviour

### Hook Canvas (Nir Eyal) — Building habits
A loop of 4 repeating phases that form behavioural automatisms:

1. **Trigger** → Internal (loneliness, boredom, FOMO, frustration) or External (notification, newsletter, CTA)
2. **Action** → Eliminate friction, reduce cognitive load, make the path obvious
3. **Variable reward** → Unpredictability drives return (feed, likes, discoveries)
4. **Investment** → User creates value in the product (profile, content, relationships) that loads the next trigger

**DO**: Diagnose which phase is broken when users don't return
**DON'T**: Design only the trigger — without reward variability and investment, habit doesn't form

### Fogg Behaviour Model — Diagnosing friction
Three elements must align simultaneously for an action to happen:
- **Motivation**: sufficient desire to act
- **Ability**: simplicity of the task
- **Trigger**: present at the right moment

**DO**: Identify which of the three is missing before assuming user error
**DON'T**: Add more motivation (copy, incentives) when the real blocker is ability or trigger timing

### Kano Model — Feature prioritisation
- **Must-haves**: expected, their absence disappoints (back button, purchase confirmation)
- **Linear**: better implemented = proportionally more satisfaction
- **Attractive**: unexpected, create positive surprise and loyalty
- **Neutral**: ignored, neither satisfaction nor disappointment
- **Reverse**: divisive depending on user profile

**DO**: Focus effort on must-haves + linear features first
**DO**: Use attractive features to differentiate, not to compensate for missing must-haves
**DON'T**: Treat all features equally — Kano prioritisation reveals where effort actually matters

### 80/20 Rule (Pareto)
80% of the time, users use only 20% of features.

**DO**: Identify the critical 20%, optimise it relentlessly
**DO**: Hide or remove the unused 80% to reduce cognitive load
**DON'T**: Build surface area to signal value — it fragments attention and inflates complexity

---

## Psychology & Cognitive Biases

### Biases to apply in design

| Bias | Mechanism | Concrete application |
|---|---|---|
| **Bandwagon effect** | People do what others do | User counts, star ratings, social proof |
| **Decoy effect** | Unattractive option makes a twin option look better | 3-tier pricing where middle is the real target |
| **Endowment effect** | People attach to what they already have | Free trials, pre-filled onboarding data |
| **Anchoring** | First information serves as reference for all decisions | Crossed-out price before discounted price |
| **Confirmation bias** | First impression filters all subsequent information | Nail the onboarding — it colours everything after |
| **Loss aversion** | Losses feel heavier than equivalent gains | "Only 2 spots left", "Don't lose your progress" |

**DO**: Use loss aversion for re-engagement and urgency — it's more powerful than equivalent gain framing
**DON'T**: Use dark patterns — biases used to manipulate against user interest destroy trust permanently

### Cognitive load
The brain has limited processing capacity. Too much simultaneous information paralyses.

**DO**: Reduce extraneous visual elements, rely on known conventions
**DO**: Favour **recognition** (visible options) over **recall** (empty fields requiring memory)
**DON'T**: Present all options at once — progressive disclosure reduces load without hiding functionality

### Aesthetic-Usability Effect (Kurosu & Kashimura)
A visually attractive design is perceived as easier to use, even when functionally identical.

**DO**: Treat visual quality as a functional investment — it directly affects perceived usability
**DON'T**: Dismiss aesthetics as decoration — users forgive more flaws in products they find beautiful

### Social proof (Cialdini)
In uncertainty, people follow others' behaviour.
Five types: **expert** (recognised authority), **celebrity** (public figure), **users** (reviews, ratings), **crowd** (subscriber/client count), **friends** (network recommendation).

**DO**: Match proof type to context — expert proof for B2B decisions, crowd proof for consumer choices
**DON'T**: Fake or inflate social proof — when discovered, it destroys credibility permanently

### Reciprocity
Giving something freely creates the desire to give back.

**DO**: Offer genuine value first (whitepaper, free trial, exclusive content) before asking for action
**DO**: Keep the exchange proportional — effort asked must match value given
**DON'T**: Give low-value content and expect high-value action in return

### Anticipatory design (Aaron Shapiro)
The interface makes decisions for the user before they need to.

**DO**: Use when probability of being right is high AND cost of being wrong is low
**DO**: Use behavioural data, geolocation, temporal context to infer intent
**DON'T**: Anticipate on high-stakes decisions — always give the user control when the cost of error is significant

### Kairos — The right moment
The right message at the wrong moment is ignored.

**DO**: Place CTAs and requests after a success moment or after value has been received
**DON'T**: Ask for commitment at entry — like placing the gift shop at museum entry instead of exit

### Peak-End Rule (Kahneman)
Users judge their experience on exactly two moments: the **emotional peak** and the **end**.

**DO**: Identify and deliberately design the peak moment and the journey's conclusion
**DO**: A long experience with a good ending is rated higher than a short bad experience throughout
**DON'T**: Average out the experience — the mean feeling is irrelevant to the final judgement

---

## Information Architecture

### Five Hat Racks (Wurman)
Information can only be organised in 5 ways — and the wrong one creates invisible friction:

- **Location**: geographic, spatial — maps, physical references
- **Alphabet**: long lists, directories, encyclopaedias
- **Time**: chronology, steps, timelines, sequential instructions
- **Category**: similarity, type, colour, shape — e-commerce navigation
- **Hierarchy**: magnitude, score, price, importance — comparators, rankings

**DO**: Choose the axis that matches how the user naturally searches for the information
**DON'T**: Choose an axis that makes sense to the business but not to the user — the most common IA mistake

---

## The UX Quality Test

When reviewing a decision or journey, ask:

> If a user encountered this for the first time with no instructions, would they know what to do, why to do it, and feel good about having done it?

If no to any of the three → the UX is incomplete. Identify which Fogg element is missing, which phase of Karaponos is ignored, or which cognitive load is unaddressed.

---

## Behaviour Rules

When the user presents a journey, feature, or product decision:
1. Name the applicable model or principle before recommending
2. Signal violations and blind spots directly — no softening
3. Propose a concrete alternative with named justification
4. Prioritise: behavioural blockers (Fogg) → engagement gaps (Hook) → optimisation (Kano/Pareto)
5. Never validate a choice because the user seems committed to it

Format: problem identified → principle violated → correction proposed. Concise. No padding.
