self.onInit = function () {

    // ── Load Chart.js from CDN ──
    var chartReady = new Promise(function (resolve, reject) {
        if (window.Chart) { resolve(); return; }
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Failed to load Chart.js')); };
        document.head.appendChild(s);
    });

    // ── DOM refs (w14- prefix) ──
    var ownerFilter    = document.getElementById('w14-ownerFilter');
    var customerFilter = document.getElementById('w14-customerFilter');
    var sortBy      = document.getElementById('w14-sortBy');
    var viewMode    = document.getElementById('w14-viewMode');
    var orientSel   = document.getElementById('w14-orient');
    var refreshBtn  = document.getElementById('w14-refreshBtn');
    var statusEl    = document.getElementById('w14-status');
    var chartCanvas = document.getElementById('w14-chart');
    var summaryPanel = document.getElementById('w14-summary');
    var sumProps  = document.getElementById('w14-sumProps');
    var sumTotal  = document.getElementById('w14-sumTotal');
    var sumGreen  = document.getElementById('w14-sumGreen');
    var sumYellow = document.getElementById('w14-sumYellow');
    var sumRed    = document.getElementById('w14-sumRed');
    var drillPanel = document.getElementById('w14-drill');
    var drillTitle = document.getElementById('w14-drillTitle');
    var drillBody  = document.getElementById('w14-drillBody');
    var drillClose = document.getElementById('w14-drillClose');

    var chartInstance = null;
    var currentUser   = null;

    // Cache of discovered groups (from first Refresh)
    // Each entry: { ownerType, ownerId, ownerName, groupId, groupName }
    var groupCache = [];
    // Last computed property stats:
    // [{ groupId, groupName, ownerName, total, green, yellow, red, devices: [{uuid, name, category}] }]
    var propStats  = [];

    // ── Auth + API helpers ──
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    function refreshToken() {
        try {
            var auth = self.ctx.authService;
            if (auth && typeof auth.refreshJwtToken === 'function') {
                var p = auth.refreshJwtToken();
                if (p && typeof p.then === 'function') return p;
                if (p && typeof p.toPromise === 'function') return p.toPromise();
            }
        } catch (e) {}
        return Promise.resolve();
    }

    function apiFetch(path, options) {
        return _doFetch(path, options).catch(function (err) {
            if (err && err.__status === 401) {
                return refreshToken().then(function () { return _doFetch(path, options); });
            }
            throw err;
        });
    }

    function _doFetch(path, options) {
        var jwt  = getToken();
        options  = options || {};
        var hdrs = { 'Authorization': 'Bearer ' + jwt };
        if (options.method && options.method !== 'GET') {
            hdrs['Content-Type'] = 'application/json';
        }
        return fetch(window.location.origin + path, Object.assign({ headers: hdrs }, options))
            .then(function (r) {
                var ct = r.headers.get('content-type') || '';
                if (ct.indexOf('html') !== -1) {
                    var e = new Error('Session expired -- please refresh the page.');
                    e.__status = 401; throw e;
                }
                if (r.status === 401) {
                    var e401 = new Error('HTTP 401 -- ' + path);
                    e401.__status = 401; throw e401;
                }
                if (!r.ok) {
                    return r.text().then(function (t) {
                        var e2 = new Error('HTTP ' + r.status + ' -- ' + path);
                        e2.__status = r.status; throw e2;
                    });
                }
                if (r.status === 204) return null;
                return r.text().then(function (t) {
                    if (!t || !t.trim()) return null;
                    try { return JSON.parse(t); } catch (e) { return null; }
                });
            });
    }

    function extractId(v) {
        if (!v) return null;
        if (typeof v === 'string') return v;
        return v.id || null;
    }

    function showStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = 'w14-status ' + (kind || '');
    }

    // ── Classify a device by priority: Replace > Billing > Marginal ──
    function classify(dev) {
        if (dev.replace === true)       return 'red';    // Replace queue
        if (dev.billable === true)      return 'green';  // Billing
        return 'yellow';                                 // Marginal (not billable, not flagged for replace)
    }

    // ── Step 1: discover all customers + tenant → all device groups ──
    function discoverGroups() {
        showStatus('Discovering customers...');
        var ownerMode   = ownerFilter.value;
        var customerSel = customerFilter.value;  // "ALL" or a specific customer UUID
        var tenantId    = extractId(currentUser.tenantId);
        var owners = [];
        // Tenant is included only when no specific customer is selected AND
        // the owner mode allows it. Picking a specific customer implies a
        // customer-only view.
        if (ownerMode !== 'CUSTOMER' && customerSel === 'ALL') {
            owners.push({ type: 'TENANT', id: tenantId, name: 'Tenant' });
        }

        function fetchCustomers(page, acc) {
            return apiFetch('/api/customers?pageSize=1000&page=' + page).then(function (resp) {
                var list = (resp && resp.data) ? resp.data.filter(Boolean) : [];
                acc = acc.concat(list);
                if (resp && resp.hasNext) return fetchCustomers(page + 1, acc);
                return acc;
            });
        }

        // If a specific customer is selected, skip customer list fetch
        // and just use that one. If owner=TENANT (tenant-only), no need
        // to fetch customers at all.
        var custP;
        if (customerSel !== 'ALL') {
            // Use cached list if available (populated by initCustomerFilter)
            var cached = (window.__w14CustomerCache || []).find(function (c) {
                return extractId(c.id) === customerSel;
            });
            custP = cached
                ? Promise.resolve([cached])
                : apiFetch('/api/customer/' + customerSel).then(function (c) { return c ? [c] : []; });
        } else if (ownerMode === 'TENANT') {
            custP = Promise.resolve([]);
        } else {
            custP = fetchCustomers(0, []);
        }

        return custP.then(function (custs) {
            custs.forEach(function (c) {
                owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' });
            });
            showStatus('Discovering groups across ' + owners.length + ' owners...');
            groupCache = [];

            // Two-phase discovery:
            //   1. Walk owners in parallel to collect ALL candidate DEVICE groups
            //   2. Filter to only groups that have a non-zero Engineering Review Date
            //      attribute (parallel batched attribute fetch). Matches W7's
            //      eng-review discovery pattern -- these are the "properties"
            //      we care about for the fleet view.
            var candidateGroups = [];

            var ownerBatchSize = 3;
            var ownerIdx = 0;
            function nextOwners() {
                if (ownerIdx >= owners.length) return Promise.resolve();
                var batch = owners.slice(ownerIdx, ownerIdx + ownerBatchSize);
                ownerIdx += ownerBatchSize;
                return Promise.all(batch.map(function (o) {
                    return apiFetch('/api/entityGroups/' + o.type + '/' + o.id + '/DEVICE')
                        .then(function (groups) {
                            (groups || []).forEach(function (g) {
                                if (!g || g.name === 'All') return;
                                candidateGroups.push({
                                    ownerType: o.type,
                                    ownerId:   o.id,
                                    ownerName: o.name,
                                    groupId:   extractId(g.id),
                                    groupName: g.name
                                });
                            });
                        })
                        .catch(function () {});
                })).then(function () {
                    showStatus('Discovering groups... ' + candidateGroups.length + ' candidates so far');
                    return nextOwners();
                });
            }

            return nextOwners().then(function () {
                if (candidateGroups.length === 0) return;
                showStatus('Filtering ' + candidateGroups.length + ' groups by Engineering Review Date...');
                var batchSize = 5;
                var idx = 0;
                function nextBatch() {
                    if (idx >= candidateGroups.length) return Promise.resolve();
                    var batch = candidateGroups.slice(idx, idx + batchSize);
                    idx += batchSize;
                    return Promise.all(batch.map(function (g) {
                        return apiFetch(
                            '/api/plugins/telemetry/ENTITY_GROUP/' + g.groupId +
                            '/values/attributes/SERVER_SCOPE?keys=Engineering Review Date'
                        ).then(function (attrs) {
                            var arr = attrs || [];
                            var reviewDate = 0;
                            arr.forEach(function (a) {
                                if (a.key === 'Engineering Review Date') reviewDate = Number(a.value) || 0;
                            });
                            if (reviewDate > 0) {
                                groupCache.push(g);
                            }
                        }).catch(function () {});
                    })).then(function () {
                        showStatus('Filtering... ' + Math.min(idx, candidateGroups.length) + '/' +
                                   candidateGroups.length + ' — ' + groupCache.length + ' matched');
                        return nextBatch();
                    });
                }
                return nextBatch();
            });
        });
    }

    // ── Step 2: for each group, fetch devices and their Billable/Replace attrs ──
    function loadGroupStats() {
        propStats = [];
        if (groupCache.length === 0) {
            showStatus('No device groups found.', 'error');
            return Promise.resolve();
        }
        showStatus('Loading status for ' + groupCache.length + ' groups...');

        // Groups in parallel, devices within a group in parallel batches
        var groupBatchSize  = 3;
        var deviceBatchSize = 25;
        var doneGroups = 0;
        var gi = 0;

        function processOneGroup(g) {
            return apiFetch(
                '/api/entityGroup/' + g.groupId + '/entities?pageSize=10000&page=0'
            ).then(function (resp) {
                var devs = (resp && resp.data) ? resp.data : [];
                if (devs.length === 0) {
                    propStats.push({
                        groupId: g.groupId, groupName: g.groupName, ownerName: g.ownerName,
                        total: 0, green: 0, yellow: 0, red: 0, devices: []
                    });
                    return;
                }
                // Fetch Billable+Replace attrs in batches
                var devInfo = [];
                var di = 0;
                function nextDevBatch() {
                    if (di >= devs.length) return Promise.resolve();
                    var batch = devs.slice(di, di + deviceBatchSize);
                    di += deviceBatchSize;
                    return Promise.all(batch.map(function (d) {
                        var uuid = extractId(d.id);
                        var name = d.name || '';
                        return apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + uuid +
                            '/values/attributes/SERVER_SCOPE?keys=Billable,Replace,Installed'
                        ).then(function (attrs) {
                            var map = {};
                            (attrs || []).forEach(function (a) { map[a.key] = a.value; });
                            devInfo.push({
                                uuid: uuid,
                                name: name,
                                billable:  String(map.Billable).toLowerCase()  === 'true',
                                replace:   String(map.Replace).toLowerCase()   === 'true',
                                installed: String(map.Installed).toLowerCase() === 'true'
                            });
                        }).catch(function () {
                            // On error, default to marginal + uninstalled (will be filtered out)
                            devInfo.push({ uuid: uuid, name: name, billable: false, replace: false, installed: false });
                        });
                    })).then(nextDevBatch);
                }
                return nextDevBatch().then(function () {
                    // Exclude uninstalled devices from the fleet view -- the
                    // bar chart represents the IN-SERVICE fleet only.
                    var inService = devInfo.filter(function (d) { return d.installed === true; });
                    var counts = { green: 0, yellow: 0, red: 0 };
                    inService.forEach(function (d) {
                        d.category = classify(d);
                        counts[d.category]++;
                    });
                    propStats.push({
                        groupId: g.groupId,
                        groupName: g.groupName,
                        ownerName: g.ownerName,
                        total: inService.length,
                        green:  counts.green,
                        yellow: counts.yellow,
                        red:    counts.red,
                        devices: inService
                    });
                });
            }).catch(function () {
                propStats.push({
                    groupId: g.groupId, groupName: g.groupName, ownerName: g.ownerName,
                    total: 0, green: 0, yellow: 0, red: 0, devices: []
                });
            }).then(function () {
                doneGroups++;
                showStatus('Loading status... ' + doneGroups + '/' + groupCache.length);
            });
        }

        function nextGroups() {
            if (gi >= groupCache.length) return Promise.resolve();
            var batch = groupCache.slice(gi, gi + groupBatchSize);
            gi += groupBatchSize;
            return Promise.all(batch.map(processOneGroup)).then(nextGroups);
        }

        return nextGroups();
    }

    // ── Sort + filter empty groups ──
    function getSortedStats() {
        // Drop empty groups from chart
        var rows = propStats.filter(function (p) { return p.total > 0; });
        var mode = sortBy.value;
        rows.sort(function (a, b) {
            if (mode === 'alpha') {
                return (a.groupName || '').toLowerCase().localeCompare((b.groupName || '').toLowerCase());
            }
            if (mode === 'total')  return b.total  - a.total;
            if (mode === 'red')    return b.red    - a.red;
            if (mode === 'yellow') return b.yellow - a.yellow;
            // worst: highest ratio of (red + yellow) / total, tie-break by red count
            var ra = (a.red + a.yellow) / (a.total || 1);
            var rb = (b.red + b.yellow) / (b.total || 1);
            if (rb !== ra) return rb - ra;
            return b.red - a.red;
        });
        return rows;
    }

    // ── Render chart ──
    function renderChart() {
        var rows = getSortedStats();
        var orient  = orientSel.value;       // vertical | horizontal
        var normPct = viewMode.value === 'percent';

        // Map -> label + 3 datasets
        var labels = rows.map(function (p) { return p.groupName; });
        var totals = rows.map(function (p) { return p.total; });
        function val(p, key) {
            if (normPct && p.total > 0) return +(100 * p[key] / p.total).toFixed(1);
            return p[key];
        }
        var greenData  = rows.map(function (p) { return val(p, 'green'); });
        var yellowData = rows.map(function (p) { return val(p, 'yellow'); });
        var redData    = rows.map(function (p) { return val(p, 'red'); });

        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        // Replace canvas so Chart.js rebinds cleanly on orientation change
        var newCanvas = document.createElement('canvas');
        newCanvas.id = 'w14-chart';
        chartCanvas.parentNode.replaceChild(newCanvas, chartCanvas);
        chartCanvas = newCanvas;

        var isHoriz = (orient === 'horizontal');

        var datasets = [
            { label: 'Billing',  data: greenData,  backgroundColor: '#4caf50',
              borderColor: '#388e3c', borderWidth: 1, categoryKey: 'green' },
            { label: 'Marginal', data: yellowData, backgroundColor: '#ffc107',
              borderColor: '#c79100', borderWidth: 1, categoryKey: 'yellow' },
            { label: 'Replace',  data: redData,    backgroundColor: '#e53935',
              borderColor: '#b71c1c', borderWidth: 1, categoryKey: 'red' }
        ];

        var unitSuffix = normPct ? '%' : '';
        var ctx = chartCanvas.getContext('2d');

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHoriz ? 'y' : 'x',
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 11 }, boxWidth: 14, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return '';
                                var idx = items[0].dataIndex;
                                var p   = rows[idx];
                                return p.groupName + '  (' + p.total + ' devices)';
                            },
                            label: function (item) {
                                var p   = rows[item.dataIndex];
                                var key = item.dataset.categoryKey;
                                var count = p[key];
                                var pct = p.total > 0 ? (100 * count / p.total).toFixed(1) + '%' : '0%';
                                return item.dataset.label + ': ' + count + ' (' + pct + ')';
                            }
                        }
                    }
                },
                onClick: function (evt, els) {
                    if (!els || !els.length) return;
                    var el = els[0];
                    var row = rows[el.index];
                    var key = datasets[el.datasetIndex].categoryKey;
                    openDrill(row, key);
                },
                scales: {
                    x: isHoriz ? {
                        stacked: true,
                        beginAtZero: true,
                        max: normPct ? 100 : undefined,
                        ticks: {
                            font: { size: 10 },
                            callback: function (v) { return v + unitSuffix; }
                        },
                        title: { display: true, text: normPct ? 'Percent of devices' : 'Devices', font: { size: 11 } }
                    } : {
                        stacked: true,
                        ticks: {
                            font: { size: 10 },
                            maxRotation: 70,
                            minRotation: 50,
                            autoSkip: false
                        }
                    },
                    y: isHoriz ? {
                        stacked: true,
                        ticks: { font: { size: 10 }, autoSkip: false }
                    } : {
                        stacked: true,
                        beginAtZero: true,
                        max: normPct ? 100 : undefined,
                        ticks: {
                            font: { size: 10 },
                            callback: function (v) { return v + unitSuffix; }
                        },
                        title: { display: true, text: normPct ? 'Percent of devices' : 'Devices', font: { size: 11 } }
                    }
                }
            }
        });

        // Summary cards
        var totGreen = 0, totYellow = 0, totRed = 0, totAll = 0;
        rows.forEach(function (p) {
            totGreen  += p.green;
            totYellow += p.yellow;
            totRed    += p.red;
            totAll    += p.total;
        });
        sumProps.textContent  = rows.length;
        sumTotal.textContent  = totAll.toLocaleString();
        sumGreen.textContent  = totGreen.toLocaleString();
        sumYellow.textContent = totYellow.toLocaleString();
        sumRed.textContent    = totRed.toLocaleString();
        summaryPanel.style.display = 'flex';
    }

    // ── Drill-down: list devices in a selected category ──
    function openDrill(row, categoryKey) {
        var labelMap = { green: 'Billing', yellow: 'Marginal', red: 'Replace' };
        var devs = (row.devices || []).filter(function (d) { return d.category === categoryKey; });
        drillTitle.textContent = row.groupName + ' — ' + labelMap[categoryKey] +
            ' (' + devs.length + ' of ' + row.total + ')';
        if (devs.length === 0) {
            drillBody.innerHTML = '<div class="w14-drill-row" style="color:#888;">No devices in this category.</div>';
        } else {
            drillBody.innerHTML = devs.map(function (d) {
                return '<div class="w14-drill-row">' +
                    (d.name || d.uuid) +
                    '</div>';
            }).join('');
        }
        drillPanel.style.display = 'block';
    }

    drillClose.addEventListener('click', function () {
        drillPanel.style.display = 'none';
    });

    // ── Refresh button: discover (if needed) → load stats → render ──
    // Shift+click forces re-discovery of groups (picks up newly-added ones).
    refreshBtn.title = 'Refresh (Shift+click to force full group rediscovery)';
    refreshBtn.addEventListener('click', function (e) {
        var forceRescan = !!e.shiftKey;
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Loading...';
        drillPanel.style.display = 'none';

        var groupStep = (forceRescan || groupCache.length === 0)
            ? discoverGroups()
            : Promise.resolve();

        chartReady.then(function () {
            return groupStep;
        }).then(function () {
            return loadGroupStats();
        }).then(function () {
            renderChart();
            var whenMsg = forceRescan ? ' (full rescan)' : (groupCache.length > 0 ? ' (from cache)' : '');
            showStatus('Loaded ' + propStats.filter(function (p) { return p.total > 0; }).length +
                       ' properties' + whenMsg + '.', 'success');
        }).catch(function (err) {
            showStatus('Error: ' + err.message, 'error');
        }).then(function () {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
        });
    });

    // ── Re-render on view option changes (no refetch) ──
    [sortBy, viewMode, orientSel].forEach(function (el) {
        el.addEventListener('change', function () {
            if (propStats.length > 0) renderChart();
        });
    });

    // Owner filter change invalidates the cache (different owner set)
    ownerFilter.addEventListener('change', function () {
        groupCache = [];
        propStats  = [];
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        summaryPanel.style.display = 'none';
        drillPanel.style.display = 'none';
        showStatus('Owner filter changed -- click Refresh to reload.');
    });

    // ── Populate the Customer dropdown on load ──
    // Pagination aware. The cache is stashed on window so discoverGroups()
    // can reuse it when a specific customer is selected (avoids a second
    // /api/customer/{id} round trip).
    function initCustomerFilter() {
        function fetchAll(page, acc) {
            return apiFetch('/api/customers?pageSize=1000&page=' + page).then(function (resp) {
                var list = (resp && resp.data) ? resp.data.filter(Boolean) : [];
                acc = acc.concat(list);
                if (resp && resp.hasNext) return fetchAll(page + 1, acc);
                return acc;
            });
        }
        fetchAll(0, []).then(function (custs) {
            // Sort alphabetically for the dropdown
            custs.sort(function (a, b) {
                var an = (a.title || a.name || '').toLowerCase();
                var bn = (b.title || b.name || '').toLowerCase();
                return an.localeCompare(bn);
            });
            window.__w14CustomerCache = custs;
            // Keep the existing "All customers" option and append each customer
            custs.forEach(function (c) {
                var opt = document.createElement('option');
                opt.value = extractId(c.id);
                opt.textContent = c.title || c.name || '(unnamed)';
                customerFilter.appendChild(opt);
            });
        }).catch(function () {
            // Silent: user can still use Tenant / All modes
        });
    }

    // Customer filter change -- invalidates cache (different owner set)
    customerFilter.addEventListener('change', function () {
        groupCache = [];
        propStats  = [];
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        summaryPanel.style.display = 'none';
        drillPanel.style.display = 'none';
        showStatus('Customer filter changed -- click Refresh to reload.');
    });

    // ── Initial load: fetch current user (needed for tenantId), then wait ──
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        initCustomerFilter();
    }).catch(function (e) {
        showStatus('Could not load user: ' + e.message, 'error');
    });
};

self.onDestroy = function () {};
