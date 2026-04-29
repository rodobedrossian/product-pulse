# Product Pulse — Pitch & Positioning

---

## The one-line pitch

> **Product Pulse turns any hosted prototype into a behavioral test — so you know if it works before you rebuild it.**

---

## The problem we solve

AI tools like Cursor, Lovable, v0, and Bolt have compressed the time to ship a working prototype from days to hours. But the question that used to take weeks to answer still takes weeks:

**Does this actually work for real people?**

Traditional analytics tools (Hotjar, Mixpanel, PostHog) assume one product, one production environment, one global dataset. They're powerful — for apps that already ship. They're the wrong tool for a prototype URL you created this morning and might throw away by Friday.

Traditional user research (UserTesting, Lookback) requires scheduling, moderation, and a research ops process most teams don't have.

**The gap:** You're building faster than you can validate. Product Pulse closes that gap.

---

## What Product Pulse is

A lightweight behavioral testing platform purpose-built for **parallel, fast-moving prototypes**.

One snippet per prototype. One test per idea. Named participants, not anonymous traffic. Results that stay separate — so two prototypes never contaminate each other's data.

**No tracking plan. No engineering ticket. No moderation call required.**

---

## Who it's for

| Role | What they get |
|---|---|
| **Product Designers** | Behavioral evidence without a research ops team |
| **UX Researchers** | Remote, unmoderated tests at speed — plus replay for qual depth |
| **Product Managers** | Funnel data and completion rates before committing to dev work |
| **Founders / Builders** | Signal on AI-generated UIs without slowing down the iteration loop |

---

## The three testing modes

### 1 — Single Goal
*"Did they make it?"*

Define one success state — click a button, reach a URL, complete a form. Share a participant link. See who reached the goal, how long it took, and replay the session to understand why others didn't.

Best for: focused usability checks, A/B comparisons between two prototype directions, validating a single interaction.

---

### 2 — Scenario / Multi-Step Script
*"Where does the flow break?"*

Guide participants through an ordered sequence of tasks with instructions that appear as a floating card inside the prototype — no moderation call needed. Between steps, ask follow-up questions. See a funnel for each step: completion rate, time spent, and where participants dropped off.

Best for: onboarding flows, checkout sequences, multi-screen journeys, scripted usability sessions.

---

### 3 — Observe & Discover
*"What are real visitors actually doing?"*

Passive recording on any hosted URL — your live site, a staging environment, a Figma prototype. No tasks, no invites required. See sessions roll in, replay them, and surface patterns: what people click most, what pages they visit, where they stall.

Best for: live pages you don't control the audience for, exploratory research, generating hypotheses before running a structured test.

---

## Core capabilities

### Session Replay
Every participant session is recorded and replayable: clicks, page navigations, timing, and pacing. See wrong turns, backtracking, and the exact moment someone stalls or drops off — without asking them to explain it.

### Visual Goal Picker
Click any element inside your running prototype and set it as a goal. No tracking plan, no selectors to write. Product Pulse detects when a participant reaches that state and logs time-to-complete automatically.

### Funnel Analytics
For multi-step tests, every step has its own completion rate. The funnel shows you exactly where a flow breaks — not just that it broke.

### Interaction Heatmaps
See aggregated click density across your prototype's pages. Instantly identify the elements that attract the most attention and the ones that get ignored.

### AI-Generated Named Events
One scan of your interaction data. Product Pulse uses AI to automatically cluster raw clicks and inputs into semantic, human-readable event names — like "Clicked pricing toggle" or "Submitted contact form" — without manually wiring up an event tracking plan. The output looks like what you'd spend hours configuring in Amplitude or Mixpanel, generated in seconds.

### Session Transcripts
A native desktop recorder for capturing audio during moderated or co-located sessions. Transcripts are stored alongside the behavioral data — so you can cross-reference what someone said with what they actually did.

### GeoIP & Audience Insights
Every session is automatically tagged with country and region. See where your participants are coming from, filter by device type, browser, and referrer — and exclude internal traffic with a team IP blocklist so your own testing doesn't pollute the results.

### AI / MCP Integration
Product Pulse exposes a Model Context Protocol (MCP) server. Connect Claude Desktop, Cursor, or any MCP-compatible AI tool and ask questions directly: *"Where do users drop off in the checkout test?"* — and get a structured answer. No CSV exports, no screenshot archaeology, no manual data wrangling. The same agentic stack you use to build can reason over how people used what you built.

---

## Competitive positioning

### vs. Hotjar / Microsoft Clarity
Hotjar records your production site. It's designed for one live product with one stream of anonymous traffic. Product Pulse is designed for **multiple prototypes running simultaneously**, each with its own isolated dataset and named participants you invited. Hotjar tells you what happened on your site. Product Pulse tells you whether a specific idea worked for specific people.

### vs. Mixpanel / PostHog / Amplitude
These are event analytics platforms for production apps. They require a tracking plan, instrumented events, and an engineering team to maintain. They aggregate everyone into one dataset. Product Pulse needs zero instrumentation beyond a one-line snippet, and each test's data is fully isolated. The new AI-generated named events feature closes the semantic gap — without the implementation cost.

### vs. Maze / Useberry
Maze is built around Figma prototypes and surveys. Product Pulse works with **any hosted URL** — Figma prototypes, v0 builds, Lovable apps, staging environments, or your live site. It also includes session replay and a passive observation mode that Maze doesn't offer.

### vs. UserTesting / Lookback
Those platforms require scheduling, recruiting through their panels, and live moderation. Product Pulse is **asynchronous by default** — participants work through tasks on their own time, from their own device. You get behavioral data without coordinating calendars. For teams that do want moderated sessions, the desktop recorder adds that layer on top.

### The unique position
| | One snippet for all traffic | Per-prototype isolation | Session replay | Visual goal picker | Unmoderated async | AI/MCP native | Works on any URL |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Hotjar | ✓ | — | ✓ | — | — | — | ✓ |
| Mixpanel | ✓ | — | — | — | — | — | ✓ |
| Maze | — | ✓ | — | ✓ | ✓ | — | Figma only |
| UserTesting | — | ✓ | ✓ | — | — | — | ✓ |
| **Product Pulse** | — | **✓** | **✓** | **✓** | **✓** | **✓** | **✓** |

---

## The AI-native angle

Product Pulse was built for the era of AI-generated software.

Every AI coding tool — Cursor, Lovable, v0, Claude, Bolt, Replit — makes it trivial to produce a working prototype. The bottleneck is no longer *building*. It's *knowing whether what you built actually works*.

Product Pulse fits the workflow:
- **Build** with your AI tool of choice
- **Paste one snippet** into the layout (or ask your AI to add it)
- **Share a link** and get behavioral data back
- **Ask your AI** to analyze the results via MCP

The full loop — from idea to validated prototype to AI-powered analysis — without leaving the tools you already use.

---

## Key marketing messages

**Primary:**
> You built it in a day. Know if it works before you rebuild it.

**For the AI builder:**
> The same AI stack you use to build can now reason over how people used what you shipped.

**For the researcher:**
> Real behavior. Real participants. No moderation required.

**For the PM:**
> Funnel data before you write a single line of production code.

**Against legacy tools:**
> Hotjar and Mixpanel were built for production. You're not in production yet.

---

## Setup reality

- One `<script>` tag. No SDK. No npm install.
- Works on Figma prototypes, v0 apps, Lovable builds, staging URLs, or live sites.
- Participant links are unique per person — no anonymous blending.
- Team accounts with invite links. IP blocklist to filter internal traffic.
- Free to start. No credit card required.

---

## Slide structure suggestion

1. **Cover** — "You built it in a day. Know if it works before you rebuild it."
2. **The problem** — AI made building fast. Validation is still slow.
3. **The solution** — Behavioral testing built for prototypes, not production.
4. **How it works** — 3 steps: snippet → participant link → results.
5. **The three modes** — Single goal / Scenario / Observe & Discover.
6. **Key features** — Replay, Goals, Funnel, Heatmaps, AI Events, MCP.
7. **Competitive landscape** — The comparison table.
8. **The AI-native angle** — Full loop from build to insight in one stack.
9. **Who it's for** — Designers, researchers, PMs, founders/builders.
10. **CTA** — Free to start. One snippet. No engineering ticket.
