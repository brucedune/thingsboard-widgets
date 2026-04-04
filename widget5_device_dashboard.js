self.onInit = function () {

    // -- Load Chart.js from CDN -------------------------------------
    var chartReady = new Promise(function (resolve, reject) {
        if (window.Chart) { resolve(); return; }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
        script.onload  = resolve;
        script.onerror = function () { reject(new Error('Failed to load Chart.js')); };
        document.head.appendChild(script);
    });

    // -- Load Chart.js Zoom plugin ---------------------------------
    var zoomReady = chartReady.then(function () {
        if (window.ChartZoom) return;
        return new Promise(function (resolve, reject) {
            var h = document.createElement('script');
            h.src = 'https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js';
            h.onload = function () {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js';
                s.onload  = function () { window.ChartZoom = true; resolve(); };
                s.onerror = function () { reject(new Error('Failed to load zoom plugin')); };
                document.head.appendChild(s);
            };
            h.onerror = function () { reject(new Error('Failed to load Hammer.js')); };
            document.head.appendChild(h);
        });
    });

    // -- DOM refs (w5- prefix) --------------------------------------
    var ownerTypeSel  = document.getElementById('w5-ownerTypeSelect');
    var customerField = document.getElementById('w5-customerField');
    var customerSel   = document.getElementById('w5-customerSelect');
    var groupSel      = document.getElementById('w5-groupSelect');
    var startDateEl   = document.getElementById('w5-startDate');
    var endDateEl     = document.getElementById('w5-endDate');
    var fetchBtn      = document.getElementById('w5-fetchBtn');
    var statusMsg     = document.getElementById('w5-statusMsg');
    var contentPanel  = document.getElementById('w5-contentPanel');
    var deviceSearch  = document.getElementById('w5-deviceSearch');
    var deviceCount   = document.getElementById('w5-deviceCount');
    var deviceList    = document.getElementById('w5-deviceList');
    var summaryPanel  = document.getElementById('w5-summaryPanel');
    var cardStart     = document.getElementById('w5-cardStart');
    var cardStartDate = document.getElementById('w5-cardStartDate');
    var cardEnd       = document.getElementById('w5-cardEnd');
    var cardEndDate   = document.getElementById('w5-cardEndDate');
    var cardUsage     = document.getElementById('w5-cardUsage');
    var cardAvg       = document.getElementById('w5-cardAvg');
    var cardPoints    = document.getElementById('w5-cardPoints');
    var chartPanel      = document.getElementById('w5-chartPanel');
    var chartCanvas     = document.getElementById('w5-chart');
    var detailPanel     = document.getElementById('w5-detailPanel');
    var detailTitle     = document.getElementById('w5-detailTitle');
    var detailCanvas    = document.getElementById('w5-detailChart');
    var detailCloseBtn  = document.getElementById('w5-detailClose');
    var detailResetBtn  = document.getElementById('w5-detailReset');
    var placeholder        = document.getElementById('w5-placeholder');
    var detailPlaceholder  = document.getElementById('w5-detailPlaceholder');

    var currentUser      = null;
    var chartInstance    = null;
    var detailInstance   = null;
    var allDevices       = [];
    var selectedDevice   = null;
    var chartLabels      = [];

    // -- Get JWT token ----------------------------------------------
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // -- API fetch --------------------------------------------------
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
                    throw new Error('Session expired -- please refresh the page.');
                }
                if (!r.ok) {
                    return r.text().then(function (errText) {
                        console.error('API Error ' + r.status + ' on ' + path + ':', errText);
                        throw new Error('HTTP ' + r.status + ' -- ' + path);
                    });
                }
                if (r.status === 204) return null;
                return r.text().then(function (txt) {
                    if (!txt || !txt.trim()) return null;
                    try { return JSON.parse(txt); } catch (e) { return null; }
                });
            });
    }

    // -- Helpers ----------------------------------------------------
    function extractId(val) {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (val.id) return typeof val.id === 'object' ? val.id.id : val.id;
        return null;
    }

    function showMessage(text, type) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w5-message w5-msg-' + (type || 'info');
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

    function formatDateShort(ts) {
        if (!ts) return '--';
        return new Date(ts).toLocaleDateString();
    }

    function formatNumber(val) {
        if (val === null || val === undefined) return '--';
        return Math.round(parseFloat(val)).toLocaleString();
    }

    function updateFetchBtn() {
        fetchBtn.disabled = !(groupSel.value && startDateEl.value && endDateEl.value);
    }

    function resetAll() {
        summaryPanel.style.display        = 'none';
        chartPanel.style.display          = 'none';
        detailPanel.style.display         = 'none';
        placeholder.style.display         = 'flex';
        detailPlaceholder.style.display   = 'flex';
        deviceList.innerHTML              = '';
        deviceCount.textContent           = '0 devices';
        allDevices     = [];
        selectedDevice = null;
        chartLabels    = [];
        if (chartInstance)  { chartInstance.destroy();  chartInstance  = null; }
        if (detailInstance) { detailInstance.destroy(); detailInstance = null; }
    }

    function resetChart() {
        summaryPanel.style.display        = 'none';
        chartPanel.style.display          = 'none';
        detailPanel.style.display         = 'none';
        placeholder.style.display         = 'flex';
        detailPlaceholder.style.display   = 'flex';
        selectedDevice = null;
        chartLabels    = [];
        if (chartInstance)  { chartInstance.destroy();  chartInstance  = null; }
        if (detailInstance) { detailInstance.destroy(); detailInstance = null; }
    }

    // -- Searchable dropdown ----------------------------------------
    function makeSearchable(selectEl) {
        selectEl.style.display = 'none';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:flex;flex-direction:column;width:100%;';

        var face = document.createElement('div');
        face.style.cssText =
            'padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;' +
            'background:#fafafa;cursor:pointer;user-select:none;display:flex;' +
            'justify-content:space-between;align-items:center;min-height:32px;';
        face.innerHTML = '<span class="sd-text" style="color:#999;">-- Select --</span>' +
                         '<span style="font-size:10px;color:#888;">&#9660;</span>';

        var panel = document.createElement('div');
        panel.style.cssText =
            'display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;' +
            'background:#fff;border:1px solid #ccc;border-radius:4px;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.15);';

        var searchInput = document.createElement('input');
        searchInput.type         = 'text';
        searchInput.placeholder  = 'Search...';
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
                faceText.textContent = sel ? sel.text : '-- Select --';
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

    // -- Load current user ------------------------------------------
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });

    // -- Load customers ---------------------------------------------
    function loadCustomers() {
        customerSel.innerHTML   = '<option value="">Loading...</option>';
        groupSel.innerHTML      = '<option value="">-- Select Group --</option>';
        groupSel.disabled       = true;
        resetAll();
        hideMessage();

        apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var list  = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var items = list.map(function (c) {
                return { id: extractId(c.id), name: c.title || c.name || '' };
            });
            populateSelect(customerSel, items, '-- Select Customer --');
        }).catch(function (e) {
            showMessage('Could not load customers: ' + e.message, 'error');
        });
    }

    // -- Load groups ------------------------------------------------
    function loadGroups() {
        if (!currentUser) return;

        groupSel.disabled  = true;
        groupSel.innerHTML = '<option value="">Loading...</option>';
        resetAll();
        hideMessage();

        var ownerType = ownerTypeSel.value;
        var ownerId   = ownerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : customerSel.value;

        if (!ownerId) {
            groupSel.innerHTML = '<option value="">-- Select Group --</option>';
            return;
        }

        apiFetch('/api/entityGroups/' + ownerType + '/' + ownerId + '/DEVICE')
            .then(function (data) {
                var list  = (data || []).filter(function (g) { return g && g.name !== 'All'; });
                var items = list.map(function (g) {
                    return { id: extractId(g.id), name: g.name || g.label || '' };
                });
                populateSelect(groupSel, items, '-- Select Group --');
                groupSel.disabled = false;
                updateFetchBtn();
            })
            .catch(function (e) {
                groupSel.innerHTML = '<option value="">-- Select Group --</option>';
                showMessage('Could not load groups: ' + e.message, 'error');
            });
    }

    // -- Events -----------------------------------------------------
    ownerTypeSel.addEventListener('change', function () {
        resetAll();
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
    groupSel.addEventListener('change', function () { resetAll(); hideMessage(); updateFetchBtn(); });
    startDateEl.addEventListener('change', function () { resetAll(); updateFetchBtn(); });
    endDateEl.addEventListener('change', function () { resetAll(); updateFetchBtn(); });

    // -- Device list search filter ----------------------------------
    deviceSearch.addEventListener('input', function () {
        var term = deviceSearch.value.toLowerCase();
        var items = deviceList.querySelectorAll('.w5-device-item');
        var visible = 0;
        items.forEach(function (item) {
            var text = item.textContent.toLowerCase();
            var show = !term || text.indexOf(term) !== -1;
            item.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        deviceCount.textContent = visible + ' of ' + allDevices.length + ' devices';
    });

    // -- Render device list -----------------------------------------
    function renderDeviceList() {
        deviceList.innerHTML = '';
        deviceSearch.value   = '';

        allDevices.forEach(function (dev) {
            var item = document.createElement('div');
            item.className = 'w5-device-item';
            item.style.cursor = 'pointer';
            item.dataset.uuid = dev.uuid;

            var parts = [];
            if (dev.property && dev.property !== '--') parts.push(dev.property);
            if (dev.apartment && dev.apartment !== '--') parts.push('Unit ' + dev.apartment);
            parts.push(dev.name);

            var nameSpan = document.createElement('div');
            nameSpan.className   = 'w5-device-item-name';
            nameSpan.style.cssText = 'pointer-events:none;cursor:pointer;';
            nameSpan.textContent = parts.join(' - ');

            item.appendChild(nameSpan);

            item.addEventListener('click', function () {
                selectDevice(dev, item);
            });

            deviceList.appendChild(item);
        });

        deviceCount.textContent = allDevices.length + ' devices';
    }

    // -- Select device & load chart ---------------------------------
    function selectDevice(dev, itemEl) {
        // Highlight active
        var items = deviceList.querySelectorAll('.w5-device-item');
        items.forEach(function (el) { el.classList.remove('w5-active'); });
        itemEl.classList.add('w5-active');

        selectedDevice = dev;
        placeholder.style.display         = 'none';
        summaryPanel.style.display        = 'none';
        chartPanel.style.display          = 'none';
        detailPanel.style.display         = 'none';
        detailPlaceholder.style.display   = 'flex';
        if (chartInstance)  { chartInstance.destroy();  chartInstance  = null; }
        if (detailInstance) { detailInstance.destroy(); detailInstance = null; }
        // Reset canvas to avoid stale renders
        var parent = chartCanvas.parentNode;
        var newCanvas = document.createElement('canvas');
        newCanvas.id = 'w5-chart';
        parent.replaceChild(newCanvas, chartCanvas);
        chartCanvas = newCanvas;

        showMessage('Loading ' + dev.name + '...', 'info');

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

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
            // Fetch meterValFlash + dailyConsumption in one call
            return apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=meterValFlash,dailyConsumption' +
                '&startTs=' + startTs +
                '&endTs=' + endTs +
                '&limit=10000&agg=NONE&orderBy=ASC'
            );
        }).then(function (data) {
            var points = (data && data.meterValFlash) ? data.meterValFlash : [];
            var dailyRaw = (data && data.dailyConsumption) ? data.dailyConsumption : [];

            if (points.length === 0) {
                showMessage(dev.name + ' -- no meterValFlash data in this date range.', 'error');
                return;
            }

            points.sort(function (a, b) { return a.ts - b.ts; });
            var parsed = points.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });

            var first = parsed[0];
            var last  = parsed[parsed.length - 1];
            var usage = last.value - first.value;
            var days  = (last.ts - first.ts) / 86400000;
            var avgDaily = days > 0 ? usage / days : 0;

            // Summary cards
            cardStart.textContent     = formatNumber(first.value);
            cardStartDate.textContent = formatDateShort(first.ts);
            cardEnd.textContent       = formatNumber(last.value);
            cardEndDate.textContent   = formatDateShort(last.ts);
            cardUsage.textContent     = formatNumber(usage);
            cardAvg.textContent       = formatNumber(avgDaily);
            cardPoints.textContent    = parsed.length;
            summaryPanel.style.display = 'block';

            // Parse daily consumption
            var dailyPoints = dailyRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Chart
            renderChart(parsed, dailyPoints, dev.name);
            chartPanel.style.display = 'flex';

            hideMessage();

        }).catch(function (e) {
            showMessage('Error loading ' + dev.name + ': ' + e.message, 'error');
        });
    }

    // -- Render chart -----------------------------------------------
    function renderChart(points, dailyPoints, deviceName) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        function toDateKey(ts) {
            var d = new Date(ts);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        // Meter: last reading per day
        var dayMeter = {};
        points.forEach(function (p) {
            dayMeter[toDateKey(p.ts)] = p.value;
        });

        // Daily consumption: shift timestamp forward by 12 hours to align with the correct day
        var dayConsumption = {};
        dailyPoints.forEach(function (p) {
            var shifted = p.ts + 43200000; // +12 hours
            dayConsumption[toDateKey(shifted)] = Math.max(0, Math.round(p.value));
        });

        // Merge all day keys and sort
        var allKeys = {};
        Object.keys(dayMeter).forEach(function (k) { allKeys[k] = true; });
        Object.keys(dayConsumption).forEach(function (k) { allKeys[k] = true; });
        var sortedKeys = Object.keys(allKeys).sort();

        // Find baseVal from the first day that has meterValFlash data
        var meterKeys = Object.keys(dayMeter).sort();
        var baseVal = meterKeys.length > 0 ? dayMeter[meterKeys[0]] : 0;

        var labels = [];
        var cumulativeData = [];
        var barData = [];

        sortedKeys.forEach(function (key) {
            labels.push(key);
            cumulativeData.push(dayMeter[key] !== undefined ? Math.round(dayMeter[key] - baseVal) : null);
            barData.push(dayConsumption[key] !== undefined ? dayConsumption[key] : 0);
        });

        // Store labels for click handler
        chartLabels = labels.slice();

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Cumulative Usage',
                        data: cumulativeData,
                        type: 'line',
                        borderColor: '#305680',
                        backgroundColor: 'rgba(48, 86, 128, 0.1)',
                        borderWidth: 2,
                        pointRadius: sortedKeys.length > 60 ? 0 : 3,
                        pointHoverRadius: 5,
                        fill: true,
                        tension: 0.2,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Daily Usage',
                        data: barData,
                        backgroundColor: 'rgba(46, 125, 50, 0.5)',
                        borderColor: '#2e7d32',
                        borderWidth: 1,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                onClick: function (evt, elements) {
                    if (!elements || elements.length === 0) return;
                    var barEl = elements.find(function (el) { return el.datasetIndex === 1; });
                    if (!barEl) barEl = elements[0];
                    var idx = barEl.index;
                    var dateKey = chartLabels[idx];
                    if (dateKey && selectedDevice) {
                        loadDetailChart(selectedDevice.uuid, dateKey, selectedDevice.name);
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: deviceName,
                        font: { size: 14, weight: '500' },
                        color: '#305680',
                        padding: { bottom: 12 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 11 }, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return '';
                                return labels[items[0].dataIndex];
                            },
                            label: function (item) {
                                var val = Math.round(item.parsed.y).toLocaleString();
                                return item.dataset.label + ': ' + val;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: { size: 10 },
                            maxTicksLimit: 15,
                            callback: function (val, idx) {
                                var parts = labels[idx].split('-');
                                var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                                return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Cumulative Usage', font: { size: 11 } },
                        ticks: {
                            font: { size: 10 },
                            callback: function (val) { return Math.round(val).toLocaleString(); }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        beginAtZero: true
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Daily Usage', font: { size: 11 } },
                        ticks: {
                            font: { size: 10 },
                            callback: function (val) { return Math.round(val).toLocaleString(); }
                        },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                        min: 0
                    }
                }
            }
        });
    }

    // -- Detail chart: flowrate + eventMeterDelta --------------------
    function loadDetailChart(uuid, dateKey, deviceName) {
        // Date range: start of day to end of day
        var dayStart = new Date(dateKey + 'T00:00:00').getTime();
        var dayEnd   = dayStart + 86400000 - 1;

        detailTitle.textContent = deviceName + ' -- ' + dateKey;
        detailPlaceholder.style.display = 'none';
        detailPanel.style.display = 'flex';

        // Force Chart 1 to resize to its new smaller container
        if (chartInstance) {
            setTimeout(function () { chartInstance.resize(); }, 50);
        }

        if (detailInstance) { detailInstance.destroy(); detailInstance = null; }
        // Replace canvas to avoid stale renders
        var parent = detailCanvas.parentNode;
        var newCanvas = document.createElement('canvas');
        newCanvas.id = 'w5-detailChart';
        parent.replaceChild(newCanvas, detailCanvas);
        detailCanvas = newCanvas;

        zoomReady.then(function () {
            return apiFetch(
                '/api/plugins/telemetry/DEVICE/' + uuid +
                '/values/timeseries?keys=flowRate,eventMeterDelta' +
                '&startTs=' + dayStart +
                '&endTs=' + dayEnd +
                '&limit=10000&agg=NONE&orderBy=ASC'
            );
        }).then(function (data) {
            var flowRaw  = (data && data.flowRate) ? data.flowRate : [];
            var deltaRaw = (data && data.eventMeterDelta) ? data.eventMeterDelta : [];

            if (flowRaw.length === 0 && deltaRaw.length === 0) {
                detailTitle.textContent = deviceName + ' -- ' + dateKey + ' (no detail data)';
                return;
            }

            var flowParsed = flowRaw.map(function (p) {
                var v = parseFloat(p.value);
                return { x: p.ts, y: v < 0.25 ? 0 : v };
            }).sort(function (a, b) { return a.x - b.x; });

            var deltaParsed = deltaRaw.map(function (p) {
                return { x: p.ts, y: parseFloat(p.value) };
            }).sort(function (a, b) { return a.x - b.x; });

            var datasets = [];
            if (flowParsed.length > 0) {
                datasets.push({
                    label: 'Flowrate',
                    data: flowParsed,
                    borderColor: '#1565c0',
                    backgroundColor: 'rgba(21, 101, 192, 0.1)',
                    borderWidth: 1.5,
                    pointRadius: flowParsed.length > 200 ? 0 : 2,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0,
                    yAxisID: 'yFlow'
                });
            }
            if (deltaParsed.length > 0) {
                datasets.push({
                    label: 'Event Meter Delta',
                    data: deltaParsed,
                    borderColor: '#e65100',
                    backgroundColor: '#e65100',
                    showLine: false,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    yAxisID: 'yDelta'
                });
            }

            var dCtx = detailCanvas.getContext('2d');
            detailInstance = new Chart(dCtx, {
                type: 'line',
                data: { datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { font: { size: 11 }, usePointStyle: true }
                        },
                        tooltip: {
                            callbacks: {
                                title: function (items) {
                                    if (!items.length) return '';
                                    var d = new Date(items[0].parsed.x);
                                    return d.toLocaleTimeString();
                                },
                                label: function (item) {
                                    var val = item.parsed.y;
                                    return item.dataset.label + ': ' + (val !== null ? val.toFixed(2) : '--');
                                }
                            }
                        },
                        zoom: {
                            pan: {
                                enabled: true,
                                mode: 'x'
                            },
                            zoom: {
                                wheel: { enabled: true },
                                pinch: { enabled: true },
                                mode: 'x'
                            },
                            limits: {
                                x: { min: dayStart, max: dayEnd }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour',
                                displayFormats: { hour: 'HH:mm' },
                                tooltipFormat: 'HH:mm:ss'
                            },
                            min: dayStart,
                            max: dayEnd,
                            ticks: { font: { size: 10 } },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        yFlow: {
                            position: 'left',
                            display: flowParsed.length > 0,
                            title: { display: true, text: 'Flowrate', font: { size: 11 }, color: '#1565c0' },
                            ticks: { font: { size: 10 }, color: '#1565c0' },
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            beginAtZero: true
                        },
                        yDelta: {
                            position: 'right',
                            display: deltaParsed.length > 0,
                            title: { display: true, text: 'Event Meter Delta', font: { size: 11 }, color: '#e65100' },
                            ticks: { font: { size: 10 }, color: '#e65100' },
                            grid: { drawOnChartArea: false },
                            beginAtZero: true
                        }
                    }
                }
            });

        }).catch(function (e) {
            detailTitle.textContent = deviceName + ' -- ' + dateKey + ' (error: ' + e.message + ')';
        });
    }

    function hideDetailChart() {
        detailPanel.style.display = 'none';
        detailPlaceholder.style.display = 'flex';
        if (detailInstance) { detailInstance.destroy(); detailInstance = null; }
        // Resize Chart 1 back to full height
        if (chartInstance) {
            setTimeout(function () { chartInstance.resize(); }, 50);
        }
    }

    detailCloseBtn.addEventListener('click', hideDetailChart);
    detailResetBtn.addEventListener('click', function () {
        if (detailInstance) detailInstance.resetZoom();
    });

    // -- Load button: fetch devices + attributes --------------------
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
        fetchBtn.textContent = 'Loading...';
        resetAll();
        hideMessage();

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
                        name: d.name || d.label || '--'
                    };
                });

                showMessage('Loading attributes for ' + devices.length + ' devices...', 'info');

                // Fetch Property + Apartment for each device
                var promises = devices.map(function (dev) {
                    var propP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SHARED_SCOPE?keys=Property'
                    ).catch(function () { return []; });

                    var aptP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Apartment'
                    ).catch(function () { return []; });

                    return Promise.all([propP, aptP]).then(function (res) {
                        var propArr  = res[0] || [];
                        var aptArr   = res[1] || [];
                        dev.property  = propArr.length ? propArr[0].value : '--';
                        dev.apartment = aptArr.length  ? aptArr[0].value  : '--';
                        return dev;
                    });
                });

                return Promise.all(promises);
            })
            .then(function (results) {
                if (!results) return;

                // Sort by apartment (numeric), then name
                results.sort(function (a, b) {
                    var aptA = parseFloat(a.apartment);
                    var aptB = parseFloat(b.apartment);
                    var numA = isNaN(aptA) ? 999999 : aptA;
                    var numB = isNaN(aptB) ? 999999 : aptB;
                    if (numA !== numB) return numA - numB;
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });

                allDevices = results;
                renderDeviceList();
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
