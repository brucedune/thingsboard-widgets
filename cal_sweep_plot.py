"""
Plot stddev-vs-gain and upamp-vs-gain from the 2026-05-30 bench log
(device 79460281, pipetype M dia 2, blank 35us, TI v269).

Stddev mapping caveat: INFO packets report duneInfo.tnormStddev = stddev of the
PREVIOUS step (the one just finished), because cal.c sets tnormStddev BEFORE
apply_gain steps down. So "gain=43 stddev=175" means stddev at gain=45 was 175.
The table below is corrected — gain column = the gain that produced the stddev.

upamp is per-aggregate (set by dunePostMeas after every USS measurement) so
its gain alignment is direct: upamp values at "gain=X" in INFO are at gain X.
"""

import matplotlib.pyplot as plt
import numpy as np

# (gain, stddev_ps, upamp_avg)
# upamp_avg = average of stable upamp readings observed at that gain
# Initial-transient upamp samples (right after apply_gain) excluded where obvious.
data = [
    (45, 175,  777),
    (43, 193, 1635),   # avg of 1627, 1643
    (41,  31, 1328),   # avg of 1333, 1322
    (39,  47, 1122),   # avg of 1123, 1123, 1119
    (37,  35,  908),   # avg of 912, 903
    (35,  35,  785),   # avg of 788, 784, 782
    (33,  27,  636),   # avg of 636, 637 (later metering: 628, 625, 630, 641 ≈ 631)
    (31,  42,  529),   # avg of 528, 530 (631 looked like transient from gain=33)
    (29,  53,  441),   # avg of 442, 442, 440
    (27,  44,  368),   # avg of 367, 367, 368 (439 was transient)
    (25,  52,  299),
    (23,  47,  256),
    (21,  58,  205),
    (19,  65,  175),
    # gain=17 stddev not observed (sweep ended before INFO captured it)
    # (17,  None, 142),
]

gains   = np.array([d[0] for d in data])
stddev  = np.array([d[1] for d in data])
upamp   = np.array([d[2] for d in data])
best_gain   = 33
best_stddev = 27

fig, ax1 = plt.subplots(figsize=(11, 6.5))

color_sd = '#c0392b'
color_up = '#2980b9'

# Stddev (left axis)
ax1.plot(gains, stddev, '-o', color=color_sd, linewidth=2.2, markersize=8,
         label='tnorm stddev (ps)')
ax1.set_xlabel('Gain control (PGA, 2 dB / step)', fontsize=11)
ax1.set_ylabel('Stddev of tnorm  (picoseconds)', color=color_sd, fontsize=11)
ax1.tick_params(axis='y', labelcolor=color_sd)
ax1.set_yscale('log')
ax1.set_ylim(20, 250)
ax1.grid(True, which='both', alpha=0.25)
ax1.set_xticks(gains)
ax1.invert_xaxis()   # high gain on left so the "saturation cliff" sits on the left

# Annotate best gain
ax1.annotate(f'best: gain={best_gain},\nstddev={best_stddev} ps',
             xy=(best_gain, best_stddev),
             xytext=(best_gain - 6, best_stddev + 12),
             fontsize=10, color=color_sd,
             arrowprops=dict(arrowstyle='->', color=color_sd, lw=1.2))

# Shade the "good zone"
ax1.axvspan(41.5, 21.5, alpha=0.08, color='green')
ax1.text(31, 22, 'broad good zone  (gain 23–41 → stddev 27–58 ps)',
         color='#1e6e1e', fontsize=9, ha='center', va='bottom')

# Upamp (right axis)
ax2 = ax1.twinx()
ax2.plot(gains, upamp, '-s', color=color_up, linewidth=2.2, markersize=7,
         label='upamp (ADC peak-to-peak)')
ax2.set_ylabel('ADC peak-to-peak amplitude (counts)', color=color_up, fontsize=11)
ax2.tick_params(axis='y', labelcolor=color_up)
ax2.set_ylim(0, 1800)

# Saturation/compression call-out on upamp
expected_ratio_dB = 2.0  # each gain step = 2 dB voltage
# Use gain=33 (636 counts) as the linear anchor; project up from there.
anchor_g, anchor_a = 33, 636
projected = anchor_a * 10 ** ((gains - anchor_g) * expected_ratio_dB / 20.0)
ax2.plot(gains, projected, '--', color=color_up, alpha=0.45, linewidth=1.4,
         label='expected (linear PGA, anchored @gain=33)')

# Legends
ax1.legend(loc='upper left', fontsize=9)
ax2.legend(loc='upper right', fontsize=9)

plt.title('Cal-sweep diagnostic — device 79460281 (TI v269, pipetype M dia 2)\n'
          'Stddev (red) vs gain  |  Upamp (blue) vs gain  |  '
          'Dashed = expected linear PGA',
          fontsize=11)
fig.tight_layout()

out_png = r'C:\Users\Bruce\Documents\GitHub\cal_sweep_plot.png'
fig.savefig(out_png, dpi=140)
print(f'Saved: {out_png}')

# Also dump as ASCII for transcript readability
print('\n   gain | stddev_ps | upamp | upamp_expected_linear')
print('  ------+-----------+-------+----------------------')
for g, s, a, p in zip(gains, stddev, upamp, projected):
    print(f'   {g:3d}  |  {s:5d}    | {a:5d} | {p:8.0f}  ({100*a/p:5.1f}% of linear)')
