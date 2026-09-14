# Paste-ready prompt — calibration-function session

Created 2026-08-17 from the copper M flow campaign. Copy everything inside the fence into the other
session. Full detail lives in `copper-m-flow-handoff.md`.

---

```
Focus: the calibration function for Dune Labs Gen2 ultrasonic meters (3/4" M copper path).

FIRST read, in this order:
  1. copper-m-flow-handoff.md (repo root) — full campaign state as of 2026-08-17 22:40Z
  2. memory project_copper_m_2026_08_16.md — the index/summary
  3. memory project_meter_accuracy_signals.md — read the 2026-08-17 UPDATE block
  4. memory project_pvc_accuracy_2026_08_07.md — READ ITS 8/8 CORRECTION BLOCK before any K math
FW tree: DuneFW_L5_2-eprod-led/

WHAT IS SETTLED (do not re-derive):
- Lf 2.239 for 3/4" M is VALIDATED. Four clean runs at 5-7 gpm: trio -0.310%, sd 0.282 pp, 95% CI
  includes zero. The production table change lFactorsM[3/4"][M] 2.255 -> 2.239 in
  Core/Src/measure.c:333 is supported. Do NOT refine further — the implied 2.2376 sits inside the CI.
- The correction rule R proportional to 1/sqrt(Lf^2 - 4) is validated: predicted +3.489% lift,
  actual +3.496%.
- Sum(tnorm) per gallon is pinned at 212,200 +/-0.15% across every run and every device. The
  firmware's tnorm -> gallons conversion is solid, so ALL error lives in the acoustic integral,
  upstream of every calibration constant. Computational causes are eliminated.

THE CALIBRATION PROBLEM, in priority order:

1. NO Re-DEPENDENT CORRECTION HOOK EXISTS. The only levers are dynamicConfig.lFactor (enters via L)
   and dynamicConfig.flowRateCoefficient (a flat multiplier at measure.c:389). Both are constants.
   A real k(Re) correction needs new firmware: a flow- or Re-indexed curve applied after velocity().
   Measured curve (pair mean; 72718549 excluded because it hard-fails at 0.5 gpm):
     5-7 gpm   Re 21400   error +0.038%    k 0.9908   (textbook 0.9908)
     1 gpm     Re 4266    error +3.748%    k 0.9553   (textbook 0.9737)
     0.5 gpm   Re ~2200   error +13.125%   k 0.8761   (laminar limit 0.75)
   k baked into L_FACTOR = 0.9911. Curve SHAPE is solid; the low-end VALUES are single-run and
   loose — run-to-run scatter is 0.28 pp at 5-7 gpm, 2.53 pp at 1 gpm, and 8.43 pp inter-device at
   0.5 gpm.
   DESIGN TENSION: computing Re on-device needs kinematic viscosity, which is strongly
   temperature-dependent (-20% per 10 C). So an Re-indexed correction implicitly needs temperature.
   A flow-indexed curve avoids that but is only strictly valid at one temperature. Unresolved, and
   probably the first real design decision.

2. NO TEMPERATURE COMPENSATION EXISTS, and the obvious fix is wrong.
   vtot is hardcoded: volatile float vtot = 58639.8242f (measure.c:302), never reassigned anywhere.
   velocity() (measure.c:289) gives V proportional to dTof/TL^2 with TL = L/vtot, so V scales with
   the SQUARE of assumed sound speed. Net sensitivity ~0.32 %/C. Temperature enters through the
   differential itself (dt ~ 2*L*v*cos(theta)/c^2) — it is ONE c^2 sensitivity, not two; the c^2 in
   dt and the vtot^2 in reconstruction are the same effect and would cancel if vtot tracked actual c.
   CRITICAL: a 0.010" rubber coupling strip sits between the piezo/thermistor assembly and the pipe,
   carrying both the acoustic and the thermal path. Its bulk delay CANCELS in the differential (added
   equally to t_up and t_dn), but the refraction angle does NOT:
   sin(theta_water) = sin(theta_rubber) * (c_water / c_rubber), and dt is proportional to cos(theta).
   Elastomer sound-speed tempco is OPPOSITE IN SIGN to water's and comparable in magnitude
   (-0.07..-0.2 %/C vs water +0.16 %/C), so the ratio can move ~0.25 %/C — rivalling the direct term.
   => Keep the ratio form c(T)/c(T_anchor) so the anchor cancels, but the COEFFICIENT MUST BE
   EMPIRICALLY FITTED from measured dReading/dT, not derived from Marczak.
   Note vtot = 58639.8242 in/s = 1489.45 m/s implies ~22.4 C pure water, NOT the 23.5 C previously
   assumed — vtot and L_FACTOR were both fitted with the coupling in the loop, so neither is a clean
   water property.
   Note also: adding temp comp would require RE-DERIVING the Lf values, which currently absorb
   whatever temperature bias was present when they were fitted.
   RIG CONSTRAINT: tank temperature cannot be varied on the current rig, so a wide-delta-T
   characterisation needs either natural diurnal spread with end-of-run temps logged, or a rig change.

3. SENSOR FAILSAFE HOLE. lib/src/hci.c:1040 computes temp_ext_c from duneInfo.temp_ext via
   temp_adc_to_celsius() (misc.c:387, NTC Steinhart-Hart). The range gate at hci.c:1043
   (> -40 && < 125) ACCEPTS 0.0 — exactly what a dead/disconnected sensor reports (unit 72714423
   does this today). The |dT| <= 5 C rate gate at hci.c:1063 only guards tempMin/tempMax, NOT
   meas.temp_ext_c itself.
   Requirements: reject stuck/dead sensors (not merely out-of-range), reject implausible
   rate-of-change, clamp the correction factor to a sane band, fall back to factor = 1.0 (today's
   behaviour) on any rejection, and surface validity state in telemetry. The thermistor sits behind
   the rubber, so it reads a lagged ambient-weighted mix rather than water temperature — use a
   SETTLED / END-OF-EVENT value, never an instantaneous read at event start. Evidence: measured
   temperature fell 26 -> 23.7 C during EVERY run, on both working sensors, every time — that is a
   pipe at ambient being pulled toward water temperature once flow starts.

4. AGC HAS NO SANITY BOUND, and calibration does not catch it. At 0.5 gpm two healthy units backed
   gain 32 -> 26 (upamp ~600-720) while unit 72718549 drove gain 32 -> 44 and railed to upamp 2703,
   roughly 4x the others. Result: fragmented into ~45 micro-events, read 6.835 gal against 20.0 true
   (-65.8%), with tnormStddev 700-1700 against a +/-800 signal (SNR ~1) versus the healthy pair's
   sigma 80-88 against ~1800. calBestGain reads 0 on all three.
   Questions for this session: should the cal routine bound or qualify gain? Should a low-flow gain
   sweep be part of calibration at all, given calibration today is performed at high flow only?

5. RELATED FIRMWARE DEFECT, relevant because it lives in the same path: with
   flowDirection = UNKNOWN, measure.c:359 RECTIFIES a negative tofNorm (tofNorm *= -1) where the
   known-direction branch clamps it to zero. At SNR ~1 that full-wave-rectifies noise into phantom
   gallons — measured ~4.75 gal in 32 idle minutes (~240 gal/day) on 72718549, while two siblings on
   the same pipe counted 0.051 gal each. This makes setting waterFlowDir a correctness fix.
   Also: setCalStates() is an EMPTY STUB in this build (main.c:150), so an lFactor change causes no
   cal disturbance. Verify whether that is intended before relying on it.

6. MONITORING GAP. Through the entire 0.5 gpm failure, errSigWeakCtr / errNoSigCtr / errSigHighCtr /
   adcCapInvalid all stayed 0, and qual read 100 on the BROKEN unit while dropping to 66-83 on the
   two healthy ones. The health telemetry is inverted. The only discriminating signal found is
   tnormStddev relative to tnormAvg (an SNR ratio) — nothing currently computes or alarms on it.

DEVICES (Wyse lab trio, group "Flow Testing", ST 17037 / TI v344, held by device-scope pins):
  70273063   d08d4e60-db7a-11f0-b691-d965a62fa4fa   healthy
  72714423   737b0320-db7a-11f0-b691-d965a62fa4fa   ext temp sensor DEAD (flat 0.0)
  72718549   5f18a040-dc4c-11f0-b691-d965a62fa4fa   AGC runaway at 0.5 gpm
Offsets locked 5360 / -2703 / -601, stOffsetLocked true, flowDirection UNKNOWN on all three,
committed g32, pipe M 3/4" (dia 0.811). End-of-session meterVal 453.213 / 453.492 / 434.778;
test gallons NOT reset.

WORKING RULES:
- TB REST https://thingsboard.dunelabs.ai, header X-Authorization: Bearer <jwt>. Tokens last 2.5 h.
  A fresh one requires an explicit TB logout or an incognito window — closing Chrome does NOT clear
  localStorage, so re-copying returns the identical token. See memory reference_tb_jwt_refresh.
- ALWAYS ingest run data by time range, never by latest — latest values for eventMeterDelta and
  temp_ext_c are pinned to junk points carrying far-future timestamps.
- ALWAYS ask Bruce for the true volume AND the actual flow rate on every rig run; never assume the
  nominal setpoint. See memory feedback_reference_value_discipline.
- Spec before build: for any firmware change, produce objective / scope / constraints / success
  criteria / risks and get Bruce's approval before writing code.

START BY: telling me which of items 1-4 should be specced first and why — given that the k(Re)
correction and the temperature compensation are coupled (Re needs viscosity needs temperature), and
that the Lf values would need re-deriving after temp comp lands.
```
