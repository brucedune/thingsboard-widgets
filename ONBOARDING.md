# Onboarding — Meter Installer App

Welcome. You're joining a three-person build of Dune Labs' field installer
app. Bruce is lead architect. This guide gets you and your Claude Code
session productive in ~10 minutes.

## What we're building

A standalone smartphone web app for meter installers: scan the QR on a new
meter → enter a property PIN → the meter is commissioned and moves itself
into the right property in ThingsBoard. No usernames or passwords in the
field; all security enforcement is server-side.

The one-paragraph architecture and the hard security rules are in
`CLAUDE.md` — Claude loads it automatically when you work in this repo.
Read `ARCHITECTURE.md` once yourself (10 min, includes diagrams and the
threat model). Skim `DECISIONS.md` so you know which debates are closed.

## Ground rules

1. **Settled decisions live in DECISIONS.md.** If you (or your Claude)
   want to change one, talk to Bruce first; the change lands as a new
   dated entry. Don't relitigate in Teams.
2. **Data contracts are frozen** (payload shapes, attribute names, PIN
   table schema — see CLAUDE.md). They're the seams between our three
   workstreams; changing one silently breaks someone else.
3. **Branches + PRs.** Nothing lands on `main` without review. Run
   `/code-review` on your own branch before requesting review.
4. **Never violate the hard rules** in CLAUDE.md (no public grants, no
   client-side PIN checks, no user JWTs in the app). If a task seems to
   require one, the task is mis-specified — flag it.
5. **When you finish a task, tick it in TODO.md in the same PR.**
6. **Day-to-day coordination lives in the Teams channel "Meter Installer
   App"** — field-test reports, questions, screenshots, quick calls.
   Two rules keep it healthy: anything *decided* there (or on a call)
   gets written to DECISIONS.md the same day by whoever decided it, and
   verbal approvals get recapped as a channel message so there's a
   searchable record (Claude can read the channel and pull context into
   the repo docs).
7. **Fleet-affecting actions need Bruce's sign-off first** — going live,
   removing an interlock/safety gate, changing what the chain writes to
   production meters, or touching firmware-read attributes. A call or a
   channel message is fine; the approval gets recorded in DECISIONS.md
   with the change. Everything else (branch work, test devices, docs)
   needs no permission — ship it.

## Your workstream

Check TODO.md — workstreams A (ThingsBoard rule chain), B (static PWA),
C (admin tooling + legacy QRs). Bruce assigns owners; each stream is
independent apart from the frozen contracts.

## Environment

- TB instance: `thingsboard.dunelabs.ai` (ThingsBoard PE). Ask Bruce for
  tenant access if you're on workstream A or C.
- Reference code: the `Thingsboard_Widget_Dev` repo, branch
  `w13-pin-table`, holds the interim widget-based installer (widget 13)
  and the first-cut PIN manager (widget 29). Reuse its UI and its
  `apiFetch` patterns; do NOT reuse its auth model (user JWT) — that's
  exactly what this project replaces.
- Useful TB API facts and PE endpoint quirks are documented in
  `Thingsboard_Widget_Dev/CLAUDE.md`.

## Working with Claude on this project

- Open Claude Code in this repo — CLAUDE.md gives it the architecture,
  contracts, and hard rules automatically.
- Point it at a TODO.md task and let it plan; it knows the seams.
- If Claude proposes something that contradicts DECISIONS.md, that's a
  signal to stop and re-read, not to proceed.
- Keep design discussion outcomes in files (DECISIONS.md, ARCHITECTURE.md),
  not in chat — chat context dies, the repo is the shared brain.
