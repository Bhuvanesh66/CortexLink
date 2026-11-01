# Cortex — the live web decision desk

**Know what changed. Decide what's next.**

Cortex turns a plain-English question about a market into a live, web-researched dataset — then tells you **what changed**, **why it matters**, and **which option best fits your priorities**, with the source pages attached.

Built by **Team Cortex Sync** for *Swim with TinyFish* (Scaler School of Technology, Bangalore, 1 Nov 2026).

---

## The problem

Teams make buying and strategy decisions from data that is stale the moment it's copied into a spreadsheet: GPU cloud prices, competitor pricing pages, grant deadlines. Collecting the data is only half the job. The other half is noticing what moved, and deciding.

## What Cortex does

| Step | How |
|---|---|
| **1. Describe** | "GPU cloud providers with H100 hourly price, region, and availability" |
| **2. Research** | TinyFish web agents search and read the live web in parallel and fill a structured table, row by row, in realtime |
| **3. Watch** | Save a baseline snapshot. On every refresh (manual or scheduled), TinyFish re-checks the web and Cortex diffs the new capture |
| **4. Signal** | New entries, missing entries, and field changes with % moves, sorted by impact |
| **5. Decide** | The **Decision Lab** ranks every option by your weighted priorities (higher-is-better / lower-is-better per column) and explains each score |
| **6. Share** | Export a Markdown **decision brief**: priorities, top-5 shortlist, fit scores, data quality, sources, and signals |

### TinyFish is the core

Every observation in Cortex comes from TinyFish web agents — Search to discover sources, Fetch to read pages — running inside the research and refresh workflows. Without TinyFish there is no data, no change signal, and no evidence trail.

### TinyFish MCP built in

The repo ships a `.mcp.json` that wires the **TinyFish MCP server** (`https://agent.tinyfish.ai/mcp`) into any MCP-capable agent (Claude Code, Cursor, etc.) opened on this project. Agents can use TinyFish Search, Fetch, Monitors and web automation directly to prototype new monitors, spot-check the sources behind a row, or debug a research run, using the same TinyFish stack the app runs on.

| Where | TinyFish capability |
|---|---|
| Research workflow (`backend/src/mastra/tools/web-tools.ts`) | Search API: discover sources for every row |
| Research workflow | Fetch API: read pages as clean markdown for extraction |
| Refresh workflow | Search + Fetch re-run on schedule or on demand to feed change signals |
| `.mcp.json` | TinyFish MCP: agent-side search, fetch, monitors, browser automation |

## Key features

- **Decision Lab** (`frontend/components/cortex/DecisionLab.tsx`)
  - Auto-detects numeric columns, including values like `$2.49/hr` or `80 GB`
  - Per-criterion weight sliders and direction toggles, with sensible defaults (price/cost/latency default to lower-is-better)
  - 0–100 fit score with per-field contribution breakdown; missing data never earns credit
  - Data-quality score from completeness + presence of source links
  - Expandable evidence for each option with links to the source pages the agents read
- **Change signals**: baseline snapshots matched by primary key, so additions, absences and field changes are reported with % deltas
- **Decision brief export**: one click to Markdown for Slack, Notion or email
- **Cortex design system**: dark-green and lime theme with a radar motif, light and dark modes, responsive

## Architecture

```
Next.js 16 (frontend :3500) ── Convex (realtime rows) ── Fastify + Mastra (backend :3501)
        │                                                     │
   Decision Lab / Signals / Briefs                  TinyFish Search + Fetch agents
                                                    Claude via OpenRouter (schema + extraction)
```

- `frontend/` — Next.js app, Cortex UI, Convex schema and functions
- `backend/` — Fastify API and Mastra workflows (schema inference, populate, refresh)
- Auth: Clerk (production) or local mode

## Run it

```bash
cp .env.example .env   # add TINYFISH_API_KEY, OPENROUTER_API_KEY (+ Clerk keys for prod)
make dev               # frontend :3500, backend :3501, Mastra Studio :4111, Convex dashboard :6791
```

Open http://localhost:3500, create a monitor, let the agents populate it, then open **Decision lab**.

### Demo flow (3 minutes)

1. Create a monitor: *"GPU cloud providers with H100 hourly price, VRAM, region, availability"*
2. Watch TinyFish agents fill rows live
3. Decision lab → set **price** to lower-is-better, raise its weight → shortlist re-ranks instantly
4. **Save baseline**, then **Update** from settings → TinyFish re-checks the web → signals show what moved
5. Expand the top option → sources → **Export decision brief**

## Honest limits

- The fit score is a preference ranking from your weights, not a benchmark
- Source links show where the evidence came from; they are not independent verification
- Baselines are stored in the browser (per dataset), not on the server yet

## Credits and license

Cortex's data engine (dataset creation, TinyFish research workflows, Convex storage, auth) is built on the open-source **[BigSet](https://github.com/tinyfish-io/bigset-oss)** project by TinyFish. Our contribution is the decision layer on top: change signals, Decision Lab ranking and explanations, decision briefs, and the Cortex product and design. The original engine documentation is in [docs/BIGSET_ENGINE.md](docs/BIGSET_ENGINE.md).

Licensed under **AGPL-3.0**, as required by the upstream project. See [LICENSE](LICENSE).
