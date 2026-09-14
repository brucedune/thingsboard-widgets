# Session prompt — Set up Claude's limited TB write access

Topic: implement limited WRITE access to ThingsBoard for Claude. Read
memory tb-write-access first — it has the agreed plan, the key allowlist,
the etiquette, and the acceptance tests. This session executes it.

## Goal state

A dedicated scoped TB user whose permissions structurally cap Claude at
"shared attributes, engineering groups only", plus working write plumbing
(script now, MCP tool later), proven by negative tests.

## Steps

1. **TB-side setup (Bruce drives the TB UI; Claude can navigate alongside
   via the browser pane if useful).** ThingsBoard PE:
   - Create user claude-eng@dunes.ai (tenant scope).
   - Generic Role: DEVICE entity, ATTRIBUTES read + write ONLY. Explicitly
     excluded: telemetry write, device create/delete/claim, RPC, rule
     chains, dashboards, entity-group admin.
   - Group Roles: assign to engineering groups ONLY — Flow Testing
     (79b9d5f0-9343-11f1-a1a6-391af391818e, tenant-owner group holding
     the 6 PVC flow-test units = the campaign's primary target),
     FOTA Test-Cust (1f1d0a00-73f3-11f1-9333-3b2cfe68422f), FOTA Test,
     GenII Eng, Engineering. NO customer property groups (Shady Lane etc.
     stay Bruce-only; one attr can storm a property — see 777 post-mortem).
   - Optional: extend that user's JWT lifetime (tenant profile) so the
     per-session token paste isn't every 2.5h.
2. **Path A plumbing (this session):** Bruce logs in as the scoped user,
   pastes JWT into the session scratchpad tb_token.txt. Claude builds
   tb_write.py: reads token; functions for device shared-attr write
   (POST /api/plugins/telemetry/DEVICE/{id}/SHARED_SCOPE, header
   X-Authorization: Bearer <jwt>) and group-attr write (entity-group
   endpoint); EVERY call takes an old->new preview step first (fetch
   current value, print diff, require interactive confirmation from
   Bruce in chat) and appends to write_log.csv (ts, device, key,
   old, new). Also add shared-attr READ via the scoped user — this fixes
   the current connector's server-scope-only blindness.
3. **Acceptance tests (do not skip the negative ones):**
   a. Benign write to a bench device (e.g., a no-op checkInPeriod
      re-write or a scratch attr on board2/79454912) -> lands in TB,
      device applies at next check-in.
   b. Attempted write to a CUSTOMER-group device -> expect 403.
   c. Attempted telemetry write and device delete -> expect 403.
   d. Shared-attr read of the FOTA Test-Cust group -> returns the group
      JSON Bruce currently has to paste by hand.
4. **Path B spec (deliverable for Suren, don't build):** one-page spec for
   adding tb_set_shared_attributes(device_id, attrs) +
   tb_get_shared_attributes to the existing MCP connector, backed by the
   scoped user's credentials, with the key allowlist baked server-side:
   recordNoneventFlow, radioOnEventEnd, checkInPeriod, lFactor,
   flowRateCoefficient, piezo, pipeType, pipesize, gen2fw,
   allowTiFotaVer, envSet, maxGainOverride, adcCapPeriod. Include the
   acceptance tests above. (skill/connector work is Suren's domain —
   hand him the spec, don't modify the connector.)

## Etiquette (org policy — applies to every write, forever)

Preview every write as an explicit device/key old->new diff and wait for
Bruce's yes; batches get one preview table; keep the per-session write
log and echo it at session end. Never write outside engineering groups
even if the token permits it. Single-char values for pipeType/pipesize
("P" not "PVC" — parser silently drops multi-char, bg95.c:3996).

## Context crumbs

- Current MCP connector (mcp__095ccaad...) = read-only, server-scope
  attrs only. Its range queries can't reach exotic-timestamp partitions.
- First consumer = L-factor campaign (l-factor-optimization-handoff.md):
  bench lFactor/flowRateCoefficient/piezo flips between runs.
- Dangerous attrs for context: radioOnEventEnd=true disables the radio
  overuse limiter (Shady 777 storm, 8/8); gen2fw/allowTiFotaVer = FOTA
  levers; fleet levers stay Bruce-only by convention even on bench.
- TB base URL / tenant specifics: same instance the MCP connector and
  tb_pull.py already use (JWT ritual: DevTools -> Local Storage ->
  jwt_token).
