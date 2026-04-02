self.onInit = function () {

    // ── Load Chart.js from CDN ─────────────────────────────────────
    var chartReady = new Promise(function (resolve, reject) {
        if (window.Chart) { resolve(); return; }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
        script.onload  = resolve;
        script.onerror = function () { reject(new Error('Failed to load Chart.js')); };
        document.head.appendChild(script);
    });

    // ── DOM refs (w6- prefix) ──────────────────────────────────────
    var ownerTypeSel  = document.getElementById('w6-ownerTypeSelect');
    var customerField = document.getElementById('w6-customerField');
    var customerSel   = document.getElementById('w6-customerSelect');
    var groupSel      = document.getElementById('w6-groupSelect');
    var startDateEl   = document.getElementById('w6-startDate');
    var endDateEl     = document.getElementById('w6-endDate');
    var fetchBtn      = document.getElementById('w6-fetchBtn');
    var statusMsg     = document.getElementById('w6-statusMsg');
    var summaryPanel  = document.getElementById('w6-summaryPanel');
    var cardDevices   = document.getElementById('w6-cardDevices');
    var cardWithData  = document.getElementById('w6-cardWithData');
    var cardTotal     = document.getElementById('w6-cardTotal');
    var cardAvgDevice = document.getElementById('w6-cardAvgDevice');
    var cardAvgMonth  = document.getElementById('w6-cardAvgMonth');
    var chartPanel    = document.getElementById('w6-chartPanel');
    var chartCanvas   = document.getElementById('w6-chart');
    var tablePanel    = document.getElementById('w6-tablePanel');
    var tableTitle    = document.getElementById('w6-tableTitle');
    var tableBody     = document.getElementById('w6-tableBody');
    var exportBtn     = document.getElementById('w6-exportBtn');
    var devicePanel   = document.getElementById('w6-devicePanel');
    var deviceBody    = document.getElementById('w6-deviceBody');
    var exportDevBtn  = document.getElementById('w6-exportDevBtn');

    var currentUser   = null;
    var chartInstance = null;
    var monthlyData   = [];
    var deviceData    = [];

    // ── Get JWT token ──────────────────────────────────────────────
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // ── API fetch ──────────────────────────────────────────────────
    function apiFetch(path, options) {
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
                    throw new Error('Session expired — please refresh the page.');
                }
                if (!r.ok) {
                    return r.text().then(function (errText) {
                        console.error('API Error ' + r.status + ' on ' + path + ':', errText);
                        throw new Error('HTTP ' + r.status + ' — ' + path);
                    });
                }
                if (r.status === 204) return null;
                return r.text().then(function (txt) {
                    if (!txt || !txt.trim()) return null;
                    try { return JSON.parse(txt); } catch (e) { return null; }
                });
            });
    }

    // ── Helpers ────────────────────────────────────────────────────
    function extractId(val) {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (val.id) return typeof val.id === 'object' ? val.id.id : val.id;
        return null;
    }

    function showMessage(text, type) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w6-message w6-msg-' + (type || 'info');
        statusMsg.style.display = 'block';
    }

    function hideMessage() { statusMsg.style.display = 'none'; }

    function populateSelect(selectEl, items, placeholder) {
        selectEl.innerHTML = '<option value="">' + placeholder + '</option>';
        items.forEach(function (item) {
            var opt         = document.createElement('option');
            opt.value       = item.id;
            opt.textContent = item.name;
            selectEl.appendChild(opt);
        });
    }

    function formatNumber(val) {
        if (val === null || val === undefined) return '—';
        return Math.round(parseFloat(val)).toLocaleString();
    }

    function updateFetchBtn() {
        fetchBtn.disabled = !(groupSel.value && startDateEl.value && endDateEl.value);
    }

    function resetPanels() {
        summaryPanel.style.display = 'none';
        chartPanel.style.display   = 'none';
        tablePanel.style.display   = 'none';
        devicePanel.style.display  = 'none';
        monthlyData = [];
        deviceData  = [];
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    }

    // ── Month key helper (e.g. "2026-01") ──────────────────────────
    function monthKey(ts) {
        var d = new Date(ts);
        var m = d.getMonth() + 1;
        return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
    }

    function monthLabel(key) {
        var parts = key.split('-');
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
    }

    // Generate all month keys between two dates
    function getMonthRange(startTs, endTs) {
        var keys = [];
        var d = new Date(startTs);
        d.setDate(1);
        var end = new Date(endTs);
        while (d <= end) {
            var m = d.getMonth() + 1;
            keys.push(d.getFullYear() + '-' + (m < 10 ? '0' : '') + m);
            d.setMonth(d.getMonth() + 1);
        }
        return keys;
    }

    // ── Searchable dropdown ────────────────────────────────────────
    function makeSearchable(selectEl) {
        selectEl.style.display = 'none';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;width:100%;';

        var face = document.createElement('div');
        face.style.cssText =
            'padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;' +
            'background:#fafafa;cursor:pointer;user-select:none;display:flex;' +
            'justify-content:space-between;align-items:center;min-height:32px;';
        face.innerHTML = '<span class="sd-text" style="color:#999;">— Select —</span>' +
                         '<span style="font-size:10px;color:#888;">▼</span>';

        var panel = document.createElement('div');
        panel.style.cssText =
            'display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;' +
            'background:#fff;border:1px solid #ccc;border-radius:4px;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.15);';

        var searchInput = document.createElement('input');
        searchInput.type         = 'text';
        searchInput.placeholder  = 'Search…';
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.setAttribute('autocorrect', 'off');
        searchInput.setAttribute('autocapitalize', 'off');
        searchInput.setAttribute('spellcheck', 'false');
        searchInput.name = 'sd-search-' + Math.random().toString(36).slice(2);
        searchInput.style.cssText =
            'width:100%;box-sizing:border-box;padding:7px 10px;border:none;' +
            'border-bottom:1px solid #eee;font-size:13px;outline:none;';

        var optionList = document.createElement('div');
        optionList.style.cssText = 'max-height:200px;overflow-y:auto;';

        panel.appendChild(searchInput);
        panel.appendChild(optionList);

        var open = false;

        function syncFace() {
            var sel      = selectEl.options[selectEl.selectedIndex];
            var faceText = face.querySelector('.sd-text');
            if (sel && sel.value) {
                faceText.textContent = sel.text;
                faceText.style.color = '#333';
            } else {
                faceText.textContent = sel ? sel.text : '— Select —';
                faceText.style.color = '#999';
            }
        }

        function buildOptions(term) {
            optionList.innerHTML = '';
            Array.from(selectEl.options).forEach(function (opt) {
                if (term && opt.text.toLowerCase().indexOf(term.toLowerCase()) === -1) return;
                var item = document.createElement('div');
                item.textContent   = opt.text;
                item.dataset.value = opt.value;
                item.style.cssText =
                    'padding:7px 10px;font-size:13px;cursor:pointer;' +
                    (opt.value === selectEl.value ? 'background:#e8f0fe;font-weight:500;' : '') +
                    (opt.disabled ? 'color:#aaa;cursor:default;' : '');
                if (!opt.disabled) {
                    item.addEventListener('mousedown', function (e) {
                        e.preventDefault();
                        selectEl.value = opt.value;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        syncFace();
                        closePanel();
                    });
                    item.addEventListener('mouseover', function () { item.style.background = '#f0f4ff'; });
                    item.addEventListener('mouseout',  function () {
                        item.style.background = opt.value === selectEl.value ? '#e8f0fe' : '';
                    });
                }
                optionList.appendChild(item);
            });
        }

        function openPanel() {
            open = true;
            searchInput.value = '';
            buildOptions('');
            panel.style.display = 'block';
            setTimeout(function () { searchInput.focus(); }, 0);
        }

        function closePanel() {
            open = false;
            panel.style.display = 'none';
        }

        face.addEventListener('click', function (e) {
            e.stopPropagation();
            if (selectEl.disabled) return;
            open ? closePanel() : openPanel();
        });

        searchInput.addEventListener('input', function () { buildOptions(searchInput.value); });
        searchInput.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

        document.addEventListener('click', function (e) {
            if (open && !wrapper.contains(e.target)) closePanel();
        });

        new MutationObserver(syncFace).observe(selectEl, { childList: true, subtree: true });
        selectEl.addEventListener('change', syncFace);

        var origDisabledDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
        Object.defineProperty(selectEl, 'disabled', {
            get: function () { return origDisabledDesc.get.call(selectEl); },
            set: function (v) {
                origDisabledDesc.set.call(selectEl, v);
                face.style.background = v ? '#f0f0f0' : '#fafafa';
                face.style.cursor     = v ? 'default'  : 'pointer';
                face.style.color      = v ? '#999'      : '';
            }
        });

        wrapper.appendChild(face);
        wrapper.appendChild(panel);
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
        syncFace();
    }

    makeSearchable(customerSel);
    makeSearchable(groupSel);

    // ── Load current user ──────────────────────────────────────────
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });

    // ── Load customers ─────────────────────────────────────────────
    function loadCustomers() {
        customerSel.innerHTML   = '<option value="">Loading…</option>';
        groupSel.innerHTML      = '<option value="">— Select Group —</option>';
        groupSel.disabled       = true;
        resetPanels();
        hideMessage();

        apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var list  = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var items = list.map(function (c) {
                return { id: extractId(c.id), name: c.title || c.name || '' };
            });
            populateSelect(customerSel, items, '— Select Customer —');
        }).catch(function (e) {
            showMessage('Could not load customers: ' + e.message, 'error');
        });
    }

    // ── Load groups ────────────────────────────────────────────────
    function loadGroups() {
        if (!currentUser) return;

        groupSel.disabled   = true;
        groupSel.innerHTML  = '<option value="">Loading…</option>';
        resetPanels();
        hideMessage();

        var ownerType = ownerTypeSel.value;
        var ownerId   = ownerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : customerSel.value;

        if (!ownerId) {
            groupSel.innerHTML = '<option value="">— Select Group —</option>';
            return;
        }

        apiFetch('/api/entityGroups/' + ownerType + '/' + ownerId + '/DEVICE')
            .then(function (data) {
                var list  = (data || []).filter(function (g) { return g && g.name !== 'All'; });
                var items = list.map(function (g) {
                    return { id: extractId(g.id), name: g.name || g.label || '' };
                });
                populateSelect(groupSel, items, '— Select Group —');
                groupSel.disabled = false;
                updateFetchBtn();
            })
            .catch(function (e) {
                groupSel.innerHTML = '<option value="">— Select Group —</option>';
                showMessage('Could not load groups: ' + e.message, 'error');
            });
    }

    // ── Events ─────────────────────────────────────────────────────
    ownerTypeSel.addEventListener('change', function () {
        resetPanels();
        hideMessage();
        if (ownerTypeSel.value === 'CUSTOMER') {
            customerField.style.display = 'block';
            loadCustomers();
        } else {
            customerField.style.display = 'none';
            loadGroups();
        }
        updateFetchBtn();
    });

    customerSel.addEventListener('change', function () { hideMessage(); loadGroups(); });
    groupSel.addEventListener('change', function () { resetPanels(); hideMessage(); updateFetchBtn(); });
    startDateEl.addEventListener('change', function () { resetPanels(); updateFetchBtn(); });
    endDateEl.addEventListener('change', function () { resetPanels(); updateFetchBtn(); });

    // ── Render chart ───────────────────────────────────────────────
    function renderChart() {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        var labels = monthlyData.map(function (m) { return m.label; });
        var values = monthlyData.map(function (m) { return m.usage; });

        // Color bars — highlight highest usage month
        var maxVal = Math.max.apply(null, values);
        var colors = values.map(function (v) {
            return v === maxVal ? 'rgba(192, 57, 43, 0.7)' : 'rgba(48, 86, 128, 0.7)';
        });
        var borders = values.map(function (v) {
            return v === maxVal ? '#c0392b' : '#305680';
        });

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monthly Site Usage',
                    data: values,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (item) {
                                return 'Usage: ' + Math.round(item.parsed.y).toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: 'Total Usage', font: { size: 11 } },
                        ticks: {
                            font: { size: 10 },
                            callback: function (val) { return Math.round(val).toLocaleString(); }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // ── Render monthly table ───────────────────────────────────────
    function renderMonthlyTable() {
        tableBody.innerHTML = '';
        var grandTotal = 0;

        monthlyData.forEach(function (m, i) {
            grandTotal += m.usage;
            var tr = document.createElement('tr');

            var tdMonth = document.createElement('td');
            tdMonth.textContent = m.label;

            var tdUsage = document.createElement('td');
            tdUsage.textContent = formatNumber(m.usage);
            tdUsage.className = 'w6-val-pos';

            var tdDevices = document.createElement('td');
            tdDevices.textContent = m.devicesReporting;

            var tdAvg = document.createElement('td');
            tdAvg.textContent = m.devicesReporting > 0
                ? formatNumber(m.usage / m.devicesReporting) : '—';

            var tdChange = document.createElement('td');
            var tdTrend  = document.createElement('td');
            if (i > 0 && monthlyData[i - 1].usage > 0) {
                var pct = ((m.usage - monthlyData[i - 1].usage) / monthlyData[i - 1].usage) * 100;
                tdChange.textContent = Math.round(Math.abs(pct)) + '%';
                tdChange.className   = pct > 0 ? 'w6-val-neg' : pct < 0 ? 'w6-val-pos' : 'w6-val-zero';
                if (pct !== 0) {
                    tdTrend.textContent = pct > 0 ? '▲' : '▼';
                    tdTrend.className   = pct > 0 ? 'w6-trend-up' : 'w6-trend-down';
                } else {
                    tdTrend.textContent = '—';
                }
            } else {
                tdChange.textContent = '—';
                tdChange.className   = 'w6-val-zero';
                tdTrend.textContent  = '';
            }

            tr.appendChild(tdMonth);
            tr.appendChild(tdUsage);
            tr.appendChild(tdDevices);
            tr.appendChild(tdAvg);
            tr.appendChild(tdChange);
            tr.appendChild(tdTrend);
            tableBody.appendChild(tr);
        });

        // Total row
        var totalTr = document.createElement('tr');
        totalTr.className = 'w6-total-row';
        var tdTotalLabel = document.createElement('td');
        tdTotalLabel.textContent = 'TOTAL';
        var tdTotalVal = document.createElement('td');
        tdTotalVal.textContent = formatNumber(grandTotal);
        var tdEmpty1 = document.createElement('td');
        var tdEmpty2 = document.createElement('td');
        var tdEmpty3 = document.createElement('td');
        var tdEmpty4 = document.createElement('td');
        totalTr.appendChild(tdTotalLabel);
        totalTr.appendChild(tdTotalVal);
        totalTr.appendChild(tdEmpty1);
        totalTr.appendChild(tdEmpty2);
        totalTr.appendChild(tdEmpty3);
        totalTr.appendChild(tdEmpty4);
        tableBody.appendChild(totalTr);
    }

    // ── Render per-device table ────────────────────────────────────
    function renderDeviceTable(totalSiteUsage) {
        deviceBody.innerHTML = '';

        var sorted = deviceData.slice().sort(function (a, b) {
            return b.usage - a.usage;
        });

        sorted.forEach(function (d) {
            var tr = document.createElement('tr');

            var tdName = document.createElement('td');
            tdName.textContent = d.name;

            var tdProp = document.createElement('td');
            tdProp.textContent = d.property;

            var tdApt = document.createElement('td');
            tdApt.textContent = d.apartment;

            var tdStart = document.createElement('td');
            tdStart.textContent = d.startVal !== null ? formatNumber(d.startVal) : '—';

            var tdEnd = document.createElement('td');
            tdEnd.textContent = d.endVal !== null ? formatNumber(d.endVal) : '—';

            var tdUsage = document.createElement('td');
            if (d.usage !== null) {
                tdUsage.textContent = formatNumber(d.usage);
                tdUsage.className   = 'w6-val-pos';
            } else {
                tdUsage.textContent = 'No data';
                tdUsage.className   = 'w6-val-zero';
            }

            var tdPct = document.createElement('td');
            if (d.usage !== null && totalSiteUsage > 0) {
                tdPct.textContent = ((d.usage / totalSiteUsage) * 100).toFixed(1) + '%';
            } else {
                tdPct.textContent = '—';
                tdPct.className   = 'w6-val-zero';
            }

            tr.appendChild(tdName);
            tr.appendChild(tdProp);
            tr.appendChild(tdApt);
            tr.appendChild(tdStart);
            tr.appendChild(tdEnd);
            tr.appendChild(tdUsage);
            tr.appendChild(tdPct);
            deviceBody.appendChild(tr);
        });
    }

    // ── Export monthly CSV ──────────────────────────────────────────
    exportBtn.addEventListener('click', function () {
        if (!monthlyData.length) return;
        var rows = [['Month', 'Site Usage', 'Devices Reporting', 'Avg Per Device', 'vs Prior Month', 'Trend']];
        monthlyData.forEach(function (m, i) {
            var pct = '';
            var trend = '';
            if (i > 0 && monthlyData[i - 1].usage > 0) {
                var p = ((m.usage - monthlyData[i - 1].usage) / monthlyData[i - 1].usage) * 100;
                pct = Math.round(Math.abs(p)) + '%';
                trend = p > 0 ? 'Up' : p < 0 ? 'Down' : 'No change';
            }
            rows.push([
                m.label,
                Math.round(m.usage),
                m.devicesReporting,
                m.devicesReporting > 0 ? Math.round(m.usage / m.devicesReporting) : '',
                pct,
                trend
            ]);
        });
        downloadCSV(rows, 'site_monthly_usage_' + startDateEl.value + '_to_' + endDateEl.value + '.csv');
    });

    // ── Export device CSV ───────────────────────────────────────────
    exportDevBtn.addEventListener('click', function () {
        if (!deviceData.length) return;
        var totalUsage = 0;
        deviceData.forEach(function (d) { if (d.usage !== null) totalUsage += d.usage; });

        var rows = [['Device Name', 'Property', 'Apartment', 'Start Value', 'End Value', 'Total Usage', '% of Site']];
        deviceData.slice().sort(function (a, b) { return (b.usage || 0) - (a.usage || 0); })
            .forEach(function (d) {
                rows.push([
                    d.name,
                    d.property,
                    d.apartment,
                    d.startVal !== null ? Math.round(d.startVal) : '',
                    d.endVal !== null ? Math.round(d.endVal) : '',
                    d.usage !== null ? Math.round(d.usage) : '',
                    d.usage !== null && totalUsage > 0 ? ((d.usage / totalUsage) * 100).toFixed(1) + '%' : ''
                ]);
            });
        downloadCSV(rows, 'site_device_usage_' + startDateEl.value + '_to_' + endDateEl.value + '.csv');
    });

    function downloadCSV(rows, filename) {
        var csv = rows.map(function (row) {
            return row.map(function (cell) {
                var s = String(cell);
                if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
                    return '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            }).join(',');
        }).join('\n');

        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Fetch & compute ────────────────────────────────────────────
    fetchBtn.addEventListener('click', function () {
        var groupId = groupSel.value;
        if (!groupId || !startDateEl.value || !endDateEl.value) return;

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        if (startTs >= endTs) {
            showMessage('Start date must be before end date.', 'error');
            return;
        }

        fetchBtn.disabled    = true;
        fetchBtn.textContent = 'Loading…';
        resetPanels();
        hideMessage();

        // Step 1: load devices
        apiFetch('/api/entityGroup/' + groupId + '/entities?pageSize=1000&page=0')
            .then(function (resp) {
                var list = (resp && resp.data) ? resp.data
                         : Array.isArray(resp) ? resp : [];
                list = list.filter(Boolean);

                if (list.length === 0) {
                    showMessage('No devices in this group.', 'info');
                    fetchBtn.disabled    = false;
                    fetchBtn.textContent = 'Load';
                    return;
                }

                var devices = list.map(function (d) {
                    return {
                        uuid: extractId(d.id) || extractId(d),
                        name: d.name || d.label || '—'
                    };
                });

                showMessage('Fetching data for ' + devices.length + ' devices…', 'info');

                // Step 2: for each device, fetch attributes + all meterVal in range
                var allMonthKeys = getMonthRange(startTs, endTs);

                var promises = devices.map(function (dev) {
                    var propP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SHARED_SCOPE?keys=Property'
                    ).catch(function () { return []; });

                    var aptP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Apartment'
                    ).catch(function () { return []; });

                    // First reading in range
                    var startP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + startTs + '&endTs=' + endTs +
                        '&limit=1&agg=NONE&orderBy=ASC'
                    ).catch(function () { return null; });

                    // Last reading in range
                    var endP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + startTs + '&endTs=' + endTs +
                        '&limit=1&agg=NONE&orderBy=DESC'
                    ).catch(function () { return null; });

                    // For monthly breakdown: fetch first & last per month
                    var monthPromises = allMonthKeys.map(function (mk) {
                        var parts = mk.split('-');
                        var y = parseInt(parts[0], 10);
                        var m = parseInt(parts[1], 10) - 1;
                        var mStart = new Date(y, m, 1).getTime();
                        var mEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
                        // Clamp to user range
                        var clampStart = Math.max(mStart, startTs);
                        var clampEnd   = Math.min(mEnd, endTs);

                        var mFirstP = apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                            '/values/timeseries?keys=meterVal' +
                            '&startTs=' + clampStart + '&endTs=' + clampEnd +
                            '&limit=1&agg=NONE&orderBy=ASC'
                        ).catch(function () { return null; });

                        var mLastP = apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                            '/values/timeseries?keys=meterVal' +
                            '&startTs=' + clampStart + '&endTs=' + clampEnd +
                            '&limit=1&agg=NONE&orderBy=DESC'
                        ).catch(function () { return null; });

                        return Promise.all([mFirstP, mLastP]).then(function (mRes) {
                            var mFirst = mRes[0] && mRes[0].meterVal && mRes[0].meterVal[0];
                            var mLast  = mRes[1] && mRes[1].meterVal && mRes[1].meterVal[0];
                            var mfv = mFirst ? parseFloat(mFirst.value) : null;
                            var mlv = mLast  ? parseFloat(mLast.value)  : null;
                            var mDiff = (mfv !== null && mlv !== null) ? mlv - mfv : null;
                            return { month: mk, usage: mDiff };
                        });
                    });

                    return Promise.all([propP, aptP, startP, endP, Promise.all(monthPromises)])
                        .then(function (res) {
                            var propArr  = res[0] || [];
                            var aptArr   = res[1] || [];
                            var property  = propArr.length ? propArr[0].value : '—';
                            var apartment = aptArr.length  ? aptArr[0].value  : '—';

                            var sData = res[2] && res[2].meterVal && res[2].meterVal[0];
                            var eData = res[3] && res[3].meterVal && res[3].meterVal[0];
                            var sv = sData ? parseFloat(sData.value) : null;
                            var ev = eData ? parseFloat(eData.value) : null;
                            var usage = (sv !== null && ev !== null) ? ev - sv : null;

                            return {
                                name:      dev.name,
                                property:  property,
                                apartment: apartment,
                                startVal:  sv,
                                endVal:    ev,
                                usage:     usage,
                                months:    res[4]  // array of { month, usage }
                            };
                        });
                });

                return Promise.all(promises);
            })
            .then(function (results) {
                if (!results) return;

                deviceData = results;

                // Aggregate monthly
                var allMonthKeys = getMonthRange(startTs, endTs);
                var monthMap = {};
                allMonthKeys.forEach(function (mk) {
                    monthMap[mk] = { usage: 0, devicesReporting: 0 };
                });

                results.forEach(function (dev) {
                    dev.months.forEach(function (m) {
                        if (m.usage !== null && m.usage >= 0) {
                            monthMap[m.month].usage += m.usage;
                            monthMap[m.month].devicesReporting++;
                        }
                    });
                });

                monthlyData = allMonthKeys.map(function (mk) {
                    return {
                        key:              mk,
                        label:            monthLabel(mk),
                        usage:            monthMap[mk].usage,
                        devicesReporting: monthMap[mk].devicesReporting
                    };
                });

                // Summary stats
                var totalDevices  = results.length;
                var withData      = results.filter(function (d) { return d.usage !== null; }).length;
                var totalUsage    = 0;
                results.forEach(function (d) { if (d.usage !== null) totalUsage += d.usage; });
                var avgPerDevice  = withData > 0 ? totalUsage / withData : 0;
                var avgPerMonth   = monthlyData.length > 0 ? totalUsage / monthlyData.length : 0;

                cardDevices.textContent   = totalDevices;
                cardWithData.textContent  = withData;
                cardTotal.textContent     = formatNumber(totalUsage);
                cardAvgDevice.textContent = formatNumber(avgPerDevice);
                cardAvgMonth.textContent  = formatNumber(avgPerMonth);
                summaryPanel.style.display = 'block';

                // Chart
                chartReady.then(function () {
                    if (!window.chartjsAdapterLoaded) {
                        return new Promise(function (resolve, reject) {
                            var s = document.createElement('script');
                            s.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js';
                            s.onload = function () { window.chartjsAdapterLoaded = true; resolve(); };
                            s.onerror = function () { reject(new Error('Failed to load date adapter')); };
                            document.head.appendChild(s);
                        });
                    }
                }).then(function () {
                    renderChart();
                    chartPanel.style.display = 'block';
                });

                // Monthly table
                renderMonthlyTable();
                tablePanel.style.display = 'block';

                // Device table
                renderDeviceTable(totalUsage);
                devicePanel.style.display = 'block';

                hideMessage();
                fetchBtn.disabled    = false;
                fetchBtn.textContent = 'Load';
            })
            .catch(function (e) {
                showMessage('Error: ' + e.message, 'error');
                fetchBtn.disabled    = false;
                fetchBtn.textContent = 'Load';
            });
    });

};

self.onDestroy = function () {};
