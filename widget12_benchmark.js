self.onInit = function () {

    var logEl       = document.getElementById('w12-log');
    var runAllBtn   = document.getElementById('w12-runAll');
    var runParBtn   = document.getElementById('w12-runParallel');
    var clearBtn    = document.getElementById('w12-clear');
    var groupIdInp  = document.getElementById('w12-groupId');
    var maxDevInp   = document.getElementById('w12-maxDev');
    var summaryEl   = document.getElementById('w12-summary');

    /* ── helpers ──────────────────────────────────────── */

    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    function log(text, cls) {
        var span = document.createElement('span');
        span.className = cls || '';
        span.textContent = text + '\n';
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function fmtMs(ms) {
        if (ms < 1000) return ms.toFixed(0) + 'ms';
        return (ms / 1000).toFixed(2) + 's';
    }

    function percentile(arr, p) {
        var sorted = arr.slice().sort(function (a, b) { return a - b; });
        var idx = Math.ceil(sorted.length * p / 100) - 1;
        return sorted[Math.max(0, idx)];
    }

    var BASE = window.location.origin;

    function apiFetch(path) {
        var jwt = getToken();
        var start = performance.now();
        return fetch(BASE + path, {
            headers: { 'Authorization': 'Bearer ' + jwt }
        }).then(function (r) {
            var elapsed = performance.now() - start;
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('html') !== -1) {
                return { ok: false, status: 'REDIRECT', elapsed: elapsed, data: null, error: 'HTML response (session expired?)' };
            }
            if (!r.ok) {
                return r.text().then(function (t) {
                    return { ok: false, status: r.status, elapsed: elapsed, data: null, error: t.substring(0, 200) };
                });
            }
            if (r.status === 204) return { ok: true, status: 204, elapsed: elapsed, data: null };
            return r.text().then(function (txt) {
                var d = null;
                try { d = JSON.parse(txt); } catch (e) {}
                return { ok: true, status: r.status, elapsed: elapsed, data: d };
            });
        }).catch(function (e) {
            return { ok: false, status: 'NETWORK', elapsed: performance.now() - start, data: null, error: e.message };
        });
    }

    function logResult(label, res) {
        var cls = res.ok ? 'w12-ok' : 'w12-err';
        var status = res.ok ? 'OK' : 'FAIL(' + res.status + ')';
        var msg = '  ' + status + '  ' + fmtMs(res.elapsed).padStart(8) + '  ' + label;
        if (res.error) msg += '  -- ' + res.error;
        log(msg, cls);
        return res;
    }

    function extractId(obj) {
        if (!obj) return null;
        if (typeof obj === 'string') return obj;
        if (obj.id && typeof obj.id === 'string') return obj.id;
        if (obj.id && obj.id.id) return obj.id.id;
        return null;
    }

    /* ── parallel test ───────────────────────────────── */

    function runParallelTest() {
        log('\n=== Parallel Request Test (10 x /api/auth/user) ===', 'w12-head');
        var startAll = performance.now();
        var promises = [];
        for (var i = 0; i < 10; i++) promises.push(apiFetch('/api/auth/user'));

        Promise.all(promises).then(function (results) {
            var totalElapsed = performance.now() - startAll;
            var times = results.map(function (r) { return r.elapsed; });
            var failed = results.filter(function (r) { return !r.ok; }).length;
            log('  Wall time:    ' + fmtMs(totalElapsed), 'w12-info');
            log('  Min:          ' + fmtMs(Math.min.apply(null, times)), 'w12-dim');
            log('  Max:          ' + fmtMs(Math.max.apply(null, times)), 'w12-dim');
            log('  Avg:          ' + fmtMs(times.reduce(function (a, b) { return a + b; }, 0) / times.length), 'w12-dim');
            log('  Failed:       ' + failed + '/10', failed > 0 ? 'w12-err' : 'w12-ok');
            if (totalElapsed > 5000) {
                log('  WARNING: Server may be rate-limiting or overloaded.', 'w12-warn');
            }
        });
    }

    /* ── full benchmark ──────────────────────────────── */

    function runFullBenchmark() {
        runAllBtn.disabled = true;
        runAllBtn.textContent = 'Running...';
        var summary = {};

        log('\n========================================', 'w12-head');
        log('  FULL API BENCHMARK', 'w12-head');
        log('  ' + new Date().toISOString(), 'w12-head');
        log('========================================', 'w12-head');

        // 1. Auth
        log('\n--- Test 1: Authentication ---', 'w12-head');
        apiFetch('/api/auth/user')
        .then(function (authRes) {
            logResult('/api/auth/user', authRes);
            summary.auth = authRes.elapsed;
            if (!authRes.ok) throw new Error('Auth failed');
            var user = authRes.data;
            var tenantId = user.tenantId ? user.tenantId.id : null;
            log('  Tenant ID: ' + tenantId, 'w12-dim');
            return { user: user, tenantId: tenantId };
        })

        // 2. Customers
        .then(function (ctx) {
            log('\n--- Test 2: Fetch Customers ---', 'w12-head');
            return apiFetch('/api/customers?pageSize=1000&page=0&sortProperty=title&sortOrder=ASC')
            .then(function (custRes) {
                logResult('/api/customers', custRes);
                summary.customers = custRes.elapsed;
                ctx.customers = (custRes.ok && custRes.data && custRes.data.data) ? custRes.data.data : [];
                log('  Customers: ' + ctx.customers.length, 'w12-dim');
                return ctx;
            });
        })

        // 3. Tenant groups
        .then(function (ctx) {
            log('\n--- Test 3: Fetch Tenant Device Groups ---', 'w12-head');
            return apiFetch('/api/entityGroups/TENANT/' + ctx.tenantId + '/DEVICE')
            .then(function (tgRes) {
                logResult('/api/entityGroups/TENANT/.../DEVICE', tgRes);
                summary.tenantGroups = tgRes.elapsed;
                ctx.tenantGroups = (tgRes.ok && Array.isArray(tgRes.data)) ? tgRes.data : [];
                log('  Tenant groups: ' + ctx.tenantGroups.length, 'w12-dim');
                return ctx;
            });
        })

        // 4. Customer groups (first 3)
        .then(function (ctx) {
            var custs = ctx.customers.slice(0, 3);
            if (custs.length === 0) return ctx;
            log('\n--- Test 4: Customer Groups (first 3, sequential) ---', 'w12-head');
            var cgTimes = [];
            var chain = Promise.resolve();
            custs.forEach(function (c) {
                chain = chain.then(function () {
                    var cId = extractId(c);
                    return apiFetch('/api/entityGroups/CUSTOMER/' + cId + '/DEVICE')
                    .then(function (cgRes) {
                        logResult('Groups for "' + (c.title || c.name) + '"', cgRes);
                        cgTimes.push(cgRes.elapsed);
                    });
                });
            });
            return chain.then(function () {
                summary.customerGroupsAvg = cgTimes.reduce(function (a, b) { return a + b; }, 0) / cgTimes.length;
                return ctx;
            });
        })

        // 5. Device list from a group
        .then(function (ctx) {
            var testGroupId = groupIdInp.value.trim();
            if (!testGroupId) {
                for (var gi = 0; gi < ctx.tenantGroups.length; gi++) {
                    if (ctx.tenantGroups[gi].name !== 'All') {
                        testGroupId = extractId(ctx.tenantGroups[gi]);
                        log('\n  Auto-selected group: "' + ctx.tenantGroups[gi].name + '"', 'w12-info');
                        break;
                    }
                }
            }
            ctx.testGroupId = testGroupId;
            if (!testGroupId) {
                log('\n--- Skipping device tests (no group) ---', 'w12-warn');
                return ctx;
            }
            log('\n--- Test 5: Fetch Device List ---', 'w12-head');
            return apiFetch('/api/entityGroup/' + testGroupId + '/entities?pageSize=1000&page=0')
            .then(function (devRes) {
                logResult('/api/entityGroup/.../entities', devRes);
                summary.deviceList = devRes.elapsed;
                var devices = [];
                if (devRes.ok && Array.isArray(devRes.data)) devices = devRes.data;
                else if (devRes.ok && devRes.data && Array.isArray(devRes.data.data)) devices = devRes.data.data;
                log('  Devices: ' + devices.length, 'w12-dim');
                ctx.devices = devices;
                return ctx;
            });
        })

        // 6. Single device attribute fetch (sequential vs combined)
        .then(function (ctx) {
            if (!ctx.devices || ctx.devices.length === 0) return ctx;
            var devId0 = extractId(ctx.devices[0]);
            var keys = ['Apartment', 'Leak', 'Billable', 'Billing Review', 'Installed', 'Replace', 'No Water'];

            log('\n--- Test 6: Single Device Attributes ---', 'w12-head');
            log('  6a: Individual calls (8 calls, sequential):', 'w12-info');

            var seqTimes = [];
            var seqStart = performance.now();
            var chain = apiFetch('/api/plugins/telemetry/DEVICE/' + devId0 + '/values/attributes/SHARED_SCOPE?keys=Property')
                .then(function (r) { logResult('  SHARED?keys=Property', r); seqTimes.push(r.elapsed); });

            keys.forEach(function (k) {
                chain = chain.then(function () {
                    return apiFetch('/api/plugins/telemetry/DEVICE/' + devId0 + '/values/attributes/SERVER_SCOPE?keys=' + encodeURIComponent(k))
                    .then(function (r) { logResult('  SERVER?keys=' + k, r); seqTimes.push(r.elapsed); });
                });
            });

            return chain.then(function () {
                var seqTotal = performance.now() - seqStart;
                log('  Sequential total: ' + fmtMs(seqTotal), 'w12-info');
                summary.singleDevSeq = seqTotal;

                log('  6b: Combined call (1 call with all keys):', 'w12-info');
                return apiFetch('/api/plugins/telemetry/DEVICE/' + devId0 + '/values/attributes/SERVER_SCOPE?keys=' + encodeURIComponent(keys.join(',')));
            }).then(function (combRes) {
                logResult('  SERVER?keys=' + keys.join(','), combRes);
                summary.singleDevCombined = combRes.elapsed;
                return ctx;
            });
        })

        // 7. Parallel attribute fetch for N devices
        .then(function (ctx) {
            if (!ctx.devices || ctx.devices.length === 0) return ctx;
            var maxDev = parseInt(maxDevInp.value) || 10;
            var testDevices = ctx.devices.slice(0, maxDev);
            var keys = ['Apartment', 'Leak', 'Billable', 'Billing Review', 'Installed', 'Replace', 'No Water'];
            var totalCalls = testDevices.length * 8;

            log('\n--- Test 7: Parallel Fetch (' + testDevices.length + ' dev x 8 = ' + totalCalls + ' calls) ---', 'w12-head');
            var parallelStart = performance.now();

            var allPromises = [];
            testDevices.forEach(function (dev) {
                var did = extractId(dev);
                allPromises.push(apiFetch('/api/plugins/telemetry/DEVICE/' + did + '/values/attributes/SHARED_SCOPE?keys=Property'));
                keys.forEach(function (k) {
                    allPromises.push(apiFetch('/api/plugins/telemetry/DEVICE/' + did + '/values/attributes/SERVER_SCOPE?keys=' + encodeURIComponent(k)));
                });
            });

            return Promise.all(allPromises).then(function (allResults) {
                var parallelTotal = performance.now() - parallelStart;
                var allTimes = allResults.map(function (r) { return r.elapsed; });
                var failCount = allResults.filter(function (r) { return !r.ok; }).length;

                log('  Wall clock:   ' + fmtMs(parallelTotal), parallelTotal > 10000 ? 'w12-err' : 'w12-ok');
                log('  Requests:     ' + allResults.length, 'w12-dim');
                log('  Failed:       ' + failCount, failCount > 0 ? 'w12-err' : 'w12-ok');
                log('  Min:          ' + fmtMs(Math.min.apply(null, allTimes)), 'w12-dim');
                log('  Max:          ' + fmtMs(Math.max.apply(null, allTimes)), 'w12-dim');
                log('  Avg:          ' + fmtMs(allTimes.reduce(function (a, b) { return a + b; }, 0) / allTimes.length), 'w12-dim');
                log('  P50:          ' + fmtMs(percentile(allTimes, 50)), 'w12-dim');
                log('  P95:          ' + fmtMs(percentile(allTimes, 95)), 'w12-dim');

                summary.parallelWall = parallelTotal;
                summary.parallelAvg = allTimes.reduce(function (a, b) { return a + b; }, 0) / allTimes.length;
                summary.parallelMax = Math.max.apply(null, allTimes);
                summary.parallelFailed = failCount;
                summary.parallelCount = allResults.length;

                // Rate limit detection
                log('\n--- Test 8: Rate Limit Detection ---', 'w12-head');
                var sorted = allTimes.slice().sort(function (a, b) { return a - b; });
                var half = Math.floor(sorted.length / 2);
                var fast = sorted.slice(0, half);
                var slow = sorted.slice(half);
                var fastAvg = fast.reduce(function (a, b) { return a + b; }, 0) / fast.length;
                var slowAvg = slow.reduce(function (a, b) { return a + b; }, 0) / slow.length;

                log('  Fast half avg: ' + fmtMs(fastAvg), 'w12-dim');
                log('  Slow half avg: ' + fmtMs(slowAvg), 'w12-dim');
                log('  Ratio:         ' + (slowAvg / fastAvg).toFixed(1) + 'x', 'w12-dim');

                if (slowAvg / fastAvg > 5) {
                    log('  LIKELY RATE LIMITING: Slow half ' + (slowAvg / fastAvg).toFixed(1) + 'x slower.', 'w12-warn');
                } else if (parallelTotal > 15000) {
                    log('  SERVER SLOW: Responses uniformly slow.', 'w12-warn');
                } else {
                    log('  Looks healthy.', 'w12-ok');
                }

                var status429 = allResults.filter(function (r) { return r.status === 429; }).length;
                if (status429 > 0) {
                    log('  GOT ' + status429 + ' HTTP 429 (explicit rate limit!)', 'w12-err');
                }

                return ctx;
            });
        })

        // Summary
        .then(function () {
            log('\n========================================', 'w12-head');
            log('  SUMMARY', 'w12-head');
            log('========================================', 'w12-head');
            log('  Auth:              ' + fmtMs(summary.auth || 0), 'w12-info');
            log('  Customer list:     ' + fmtMs(summary.customers || 0), 'w12-info');
            log('  Tenant groups:     ' + fmtMs(summary.tenantGroups || 0), 'w12-info');
            if (summary.customerGroupsAvg) log('  Cust groups (avg): ' + fmtMs(summary.customerGroupsAvg), 'w12-info');
            if (summary.deviceList) log('  Device list:       ' + fmtMs(summary.deviceList), 'w12-info');
            if (summary.singleDevSeq) log('  1 dev (8 seq):     ' + fmtMs(summary.singleDevSeq), 'w12-info');
            if (summary.singleDevCombined) log('  1 dev (combined):  ' + fmtMs(summary.singleDevCombined), 'w12-info');
            if (summary.parallelWall) {
                log('  ' + summary.parallelCount + ' parallel:     ' + fmtMs(summary.parallelWall), summary.parallelWall > 15000 ? 'w12-err' : 'w12-ok');
            }

            log('\n--- DIAGNOSIS ---', 'w12-head');
            if (summary.auth > 2000) {
                log('  AUTH SLOW (' + fmtMs(summary.auth) + '). Server overloaded?', 'w12-err');
            }
            if (summary.singleDevSeq && summary.singleDevSeq > 5000) {
                log('  SINGLE DEVICE SLOW. Avg per call: ' + fmtMs(summary.singleDevSeq / 8), 'w12-err');
                log('  This is server-side. Individual calls should be <200ms.', 'w12-err');
            }
            if (summary.parallelWall && summary.parallelWall > 20000) {
                log('  PARALLEL SLOW (' + fmtMs(summary.parallelWall) + ').', 'w12-err');
                if (summary.parallelAvg > 2000) {
                    log('  Per-request slow = server issue, not browser.', 'w12-err');
                } else {
                    log('  Per-request fast but total slow = connection queuing.', 'w12-warn');
                    log('  Consider reducing concurrent requests.', 'w12-warn');
                }
            }
            if (summary.parallelWall && summary.parallelWall < 5000) {
                log('  API performance looks GOOD. Issue may be in rendering.', 'w12-ok');
            }

            // Show summary bar
            summaryEl.style.display = 'block';
            var html = '';
            if (summary.auth) html += '<span class="w12-sb">Auth: <b>' + fmtMs(summary.auth) + '</b></span>';
            if (summary.deviceList) html += '<span class="w12-sb">Dev List: <b>' + fmtMs(summary.deviceList) + '</b></span>';
            if (summary.singleDevSeq) html += '<span class="w12-sb">1 Dev (seq): <b>' + fmtMs(summary.singleDevSeq) + '</b></span>';
            if (summary.parallelWall) html += '<span class="w12-sb">' + summary.parallelCount + ' Parallel: <b>' + fmtMs(summary.parallelWall) + '</b></span>';
            summaryEl.innerHTML = html;
        })

        .catch(function (e) {
            log('\nBENCHMARK ERROR: ' + e.message, 'w12-err');
        })
        .then(function () {
            runAllBtn.disabled = false;
            runAllBtn.textContent = 'Run Full Benchmark';
        });
    }

    /* ── event listeners ─────────────────────────────── */

    runAllBtn.addEventListener('click', runFullBenchmark);
    runParBtn.addEventListener('click', runParallelTest);
    clearBtn.addEventListener('click', function () { logEl.innerHTML = ''; summaryEl.style.display = 'none'; });
};

self.onDestroy = function () {};
