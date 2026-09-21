---
name: requirements-engineering
description: >
  Apply requirements engineering principles and methods in day-to-day IT project work.
  Use this skill when the task involves gathering, analyzing, formulating, qualifying,
  or structuring requirements — whether for a functional specification, a requirements
  review, a stakeholder interview, or a need/requirement classification.
  Also trigger for: writing well-formed requirements, detecting common pitfalls
  (ambiguity, redundancy, unrealism), choosing an elicitation technique,
  or identifying and mapping stakeholders.
license: Based on ISTIC Requirements Engineering course by Laura Pacheco (Capgemini).
---

This skill guides the rigorous application of Requirements Engineering (RE) in an IT
project context. It covers the full cycle: from raw need expression through to a
verifiable, traceable requirement — including stakeholder identification and elicitation
technique selection.

---

## Core Distinction: Need ≠ Requirement

This is the most important distinction in the field. Never conflate the two.

| | Need | Requirement |
|---|---|---|
| **Domain** | Problem space (WHAT?) | Solution space (HOW?) |
| **Source** | Stakeholders | Need analysis |
| **Form** | Raw expression | Precise, verifiable, traceable statement |
| **Example** | "I need to access my payslips easily" | "The system shall allow each employee to view and download their payslips in PDF format via an authenticated interface, available 24/7" |

The hierarchy is: **Need → Business Requirement / Macro-Requirement → Solution Requirements (FR / NFR)**

---

## Types of Requirements

### Functional Requirements (FR)
What the system **must do** — behaviors, features, business rules.
> *"The system shall record the customer's order."*
> *"The user can search for a subscriber by name."*

### Non-Functional Requirements (NFR)
**How** the system must behave in terms of quality.
Key sub-categories: Performance, Usability, Reliability/Availability, Security,
Maintainability, Scalability, Portability, Compatibility.
> *"The interface shall respond to user commands in under 1 second."*
> *"The system shall be operational 24/7."*

### Other Requirements and Constraints
Anything that does not define system behavior or quality:
contractual, organizational, process, and service constraints.
> *"The total project cost shall not exceed €1 million."*
> *"User acceptance testing shall be managed by the Business Owner team."*

---

## Writing a Well-Formed Requirement

### Mandatory Structure
Every requirement = **Subject + Predicate + Complement**

```
[Who]           [What]           [How / Condition]
The user        can move         files to the "Archived" folder
The system      shall display    the account balance in under 3 seconds
```

### Writing Rules
- Active voice: "The user enters their password" not "The password is entered by the user"
- Modal verbs: **shall** (obligation), **can** (permitted capability)
- Avoid: *should, could, might, generally, as much as possible, approximately*
- One sentence = one requirement
- Mandatory measurable criterion ("in under 3 seconds", "at every login")

### Good Requirement Checklist
- [ ] **Atomic** — addresses a single subject
- [ ] **Unambiguous** — only one possible interpretation
- [ ] **Precise and concise** — no open questions
- [ ] **Verifiable** — measurable or qualifiable
- [ ] **Necessary** — maps to a real need
- [ ] **Feasible** — achievable with current technology
- [ ] **Abstract** *(business requirements only)* — implementation-independent
- [ ] **Consistent** *(set-level)* — does not contradict other requirements
- [ ] **Complete** *(set-level)* — the problem is fully covered with no gaps

---

## Pitfalls to Detect and Fix

| Pitfall | Warning Signal | Action |
|---|---|---|
| **Compound requirement** | Conjunctions: "and", "or", "with", "as well as" | Split into atomic requirements |
| **Vague terms** | "user-friendly", "flexible", "fast", "as much as possible" | Replace with a measurable criterion |
| **Escape clause** | "if", "except", "unless", "generally", "typically" | Specify every alternative case |
| **Unrealistic requirement** | "100% reliable", "handles all errors", "works on all platforms" | Rewrite with an achievable value |
| **Solution-prescribing** | Component names, technology names, system field names | Reframe in terms of capability |
| **Redundancy** | Same information stated in two different places | Merge; maintain a single source of truth |
| **Missing alternative** | "If X then Y" with no "else" branch | Add the expected behavior for every branch |
| **Suggestion** | "could", "maybe", "probably" | Convert to an explicit obligation or remove |
| **Mixed abstraction levels** | High-level requirement with highly technical terms | Separate business / system / component requirements |

---

## Elicitation Process

### The 4 Steps
```
1. Understand the domain
   └── Identify project boundaries and scope
   └── Internal factors: technical maturity, culture, budget, existing systems
   └── External factors: market, regulations, external stakeholders

2. Identify stakeholders
   └── Sponsor / Client / Buyer
   └── Business Owner (domain expert, project champion)
   └── Delivery Team (architect, developers, testers)
   └── End users, domain experts, regulatory bodies (GDPR, etc.)

3. Choose elicitation techniques

4. Identify needs
   └── Scenarios, use cases, viewpoints, objectives
```

### Stakeholder Mapping (Mendelow Matrix)

```
                Low Interest      High Interest
              ┌──────────────────┬──────────────────┐
High          │  Keep satisfied  │  Manage closely  │
Influence     │  Inform without  │  Collaborate /   │
              │  overwhelming    │  Keep engaged    │
              ├──────────────────┼──────────────────┤
Low           │  Monitor /       │  Keep            │
Influence     │  Minimum effort  │  informed        │
              └──────────────────┴──────────────────┘
```

**Critical distinction**:
- **Stakeholders** → anyone with an interest in the project
- **Actors** → stakeholders who interact directly with the system (humans or systems)
- **Users** → human actors → drive functional and usability requirements
- *All actors are stakeholders, but not all stakeholders are actors*

---

## Elicitation Techniques

### Technique Overview

| Technique | When to Use | Watch Out For |
|---|---|---|
| **Interview** | Complex problems, key experts | Prepare open questions, confirm understanding |
| **Brainstorming** | Creative exploration, early project phases | 6–8 participants, neutral facilitator, no censorship |
| **Questionnaire** | Large stakeholder population, standardized data | Bias risk, low response rates, shallow answers |
| **Observation** | Understanding actual work practices | Time-intensive; do not influence observed behavior |
| **Document Analysis** | Existing systems, maintenance projects | Verify documentation is up to date |
| **Workshop** | Arbitration, cross-stakeholder alignment | Requires a neutral, skilled facilitator |
| **Focus Group** | Feedback on an existing product or feature | Group-think risk |
| **Prototyping (POC)** | Refining UX needs, validating a direction | Do not confuse POC with a solution commitment |
| **Interface Analysis** | Systems that interact with the future system | Surface integration and compatibility requirements |

### Technique Selection Criteria
1. Project objective
2. Knowledge available from stakeholders
3. Existing documentation sources
4. Number and type of stakeholders to consult
5. Technical maturity of stakeholders
6. Practical constraints (location, language, availability)

**Golden rule**: combine multiple techniques to increase the quality of gathered requirements.

---

## Key Questions by Requirement Type

### For Functional Requirements
- What must the system do?
- When must it do it? Under what conditions?
- What are the inputs and outputs?
- What data format is required? How long must data be retained?

### For Non-Functional Requirements
- **Performance**: target response time? data volume?
- **Usability**: what training is needed? what user profile?
- **Availability**: maximum recovery time after failure? backup frequency?
- **Security**: controlled access? per-user data isolation?
- **Maintainability**: bug fixes only, or does it include enhancements?

---

## Common Difficulties and How to Handle Them

| Difficulty | Strategy |
|---|---|
| Poorly expressed or incomplete need | Ask "Why? Why? Why?" to surface the real underlying need |
| Unavailable stakeholders | Prioritize using Mendelow matrix; schedule elicitation early |
| Conflicting demands | Run an arbitration workshop; rank by business value |
| Different vocabularies (business vs. technical) | Build a shared glossary; restate systematically |
| Hidden (implicit) requirements | Field observation, prototyping, "what if…" scenarios |
| Resistance to change | Involve end users from the very first elicitation session |

> **Key takeaway**: *A need is rarely well expressed — at best, it is incomplete.*
> Elicitation is more art than science — it is an iterative process, not a linear one.

---

## Elicitation Phase Deliverables

| Inputs | Main Activities | Outputs |
|---|---|---|
| Raw business needs | Collect requirements from stakeholders | Formalized business requirements |
| Initial project scope | Detail high-level requirements | Identified boundaries and constraints |
| Stakeholder list | Exclude unnecessary features | Documented assumptions |

---

## Reference Sources

- Badreau & Boulanger, *Ingénierie des exigences*, Dunod, 2014
- Gottesdiener, *The Software Requirements Memory Jogger*, Goal/QPC, 2009
- IEEE 830-1993 — IEEE Guide for Software Requirements Specifications
- CMMI — standard definition of a requirement
