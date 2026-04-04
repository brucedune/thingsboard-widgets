self.onInit = function () {

    // -- Load Chart.js from CDN --
    var chartReady = new Promise(function (resolve, reject) {
        if (window.Chart) { resolve(); return; }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
        script.onload  = resolve;
        script.onerror = function () { reject(new Error('Failed to load Chart.js')); };
        document.head.appendChild(script);
    });

    // -- Load Chart.js Zoom plugin --
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

    // -- DOM refs (w7- prefix) --
    var ownerTypeSel  = document.getElementById('w7-ownerTypeSelect');
    var customerField = document.getElementById('w7-customerField');
    var customerSel   = document.getElementById('w7-customerSelect');
    var groupSel      = document.getElementById('w7-groupSelect');
    var startDateEl   = document.getElementById('w7-startDate');
    var endDateEl     = document.getElementById('w7-endDate');
    var fetchBtn      = document.getElementById('w7-fetchBtn');
    var statusMsg     = document.getElementById('w7-statusMsg');
    var deviceSearch  = document.getElementById('w7-deviceSearch');
    var deviceCount   = document.getElementById('w7-deviceCount');
    var deviceList    = document.getElementById('w7-deviceList');
    var summaryPanel  = document.getElementById('w7-summaryPanel');
    var cardStart     = document.getElementById('w7-cardStart');
    var cardStartDate = document.getElementById('w7-cardStartDate');
    var cardEnd       = document.getElementById('w7-cardEnd');
    var cardEndDate   = document.getElementById('w7-cardEndDate');
    var cardDiff      = document.getElementById('w7-cardDiff');
    var cardCorrDiff  = document.getElementById('w7-cardCorrDiff');
    var cardPoints    = document.getElementById('w7-cardPoints');
    var chartPanel    = document.getElementById('w7-chartPanel');
    var chartCanvas   = document.getElementById('w7-chart');
    var correctionPanel = document.getElementById('w7-correctionPanel');
    var correctionVal = document.getElementById('w7-correctionVal');
    var previewBtn    = document.getElementById('w7-previewBtn');
    var applyBtn      = document.getElementById('w7-applyBtn');
    var placeholder   = document.getElementById('w7-placeholder');
    var anchorHint    = document.getElementById('w7-anchorHint');
    var anchorInfo    = document.getElementById('w7-anchorInfo');
    var anchorText    = document.getElementById('w7-anchorText');
    var anchorClearBtn = document.getElementById('w7-anchorClear');

    var currentUser    = null;
    var chartInstance  = null;
    var allDevices     = [];
    var selectedDevice = null;
    var fetchedPoints  = [];   // { ts, value } -- baseline meterValFlash
    var fetchedFlow    = [];   // { ts, value } -- flowRate data
    var correctedData  = [];   // { ts, value } -- corrected trace for chart
    var previewActive  = false;
    var anchorStart    = null;  // { ts, value, index }
    var anchorEnd      = null;  // { ts, value, index }

    // -- Get JWT token --
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // -- API fetch --
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

    // -- Helpers --
    function extractId(val) {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (val.id) return typeof val.id === 'object' ? val.id.id : val.id;
        return null;
    }

    function showMessage(text, type) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w7-message w7-msg-' + (type || 'info');
        statusMsg.style.display = 'block';
    }

    function hideMessage() { statusMsg.style.display = 'none'; }

    function populateSelect(selectEl, items, ph) {
        selectEl.innerHTML = '<option value="">' + ph + '</option>';
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
        summaryPanel.style.display    = 'none';
        chartPanel.style.display      = 'none';
        correctionPanel.style.display = 'none';
        placeholder.style.display     = 'flex';
        deviceList.innerHTML          = '';
        deviceCount.textContent       = '0 devices';
        correctionVal.value           = '';
        previewBtn.disabled           = true;
        applyBtn.disabled             = true;
        allDevices     = [];
        selectedDevice = null;
        fetchedPoints  = [];
        fetchedFlow    = [];
        correctedData  = [];
        previewActive  = false;
        anchorStart    = null;
        anchorEnd      = null;
        anchorHint.style.display = 'block';
        anchorInfo.style.display = 'none';
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    }

    function resetChart() {
        summaryPanel.style.display    = 'none';
        chartPanel.style.display      = 'none';
        correctionPanel.style.display = 'none';
        placeholder.style.display     = 'flex';
        correctionVal.value           = '';
        previewBtn.disabled           = true;
        applyBtn.disabled             = true;
        selectedDevice = null;
        fetchedPoints  = [];
        fetchedFlow    = [];
        correctedData  = [];
        previewActive  = false;
        anchorStart    = null;
        anchorEnd      = null;
        anchorHint.style.display = 'block';
        anchorInfo.style.display = 'none';
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    }

    // -- Searchable dropdown --
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

    // -- Load current user --
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });

    // -- Load customers --
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

    // -- Load groups --
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

    // -- Events --
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

    // -- Device list search filter --
    deviceSearch.addEventListener('input', function () {
        var term = deviceSearch.value.toLowerCase();
        var items = deviceList.querySelectorAll('.w7-device-item');
        var visible = 0;
        items.forEach(function (item) {
            var text = item.textContent.toLowerCase();
            var show = !term || text.indexOf(term) !== -1;
            item.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        deviceCount.textContent = visible + ' of ' + allDevices.length + ' devices';
    });

    // -- Render device list --
    function renderDeviceList() {
        deviceList.innerHTML = '';
        deviceSearch.value   = '';

        allDevices.forEach(function (dev) {
            var item = document.createElement('div');
            item.className = 'w7-device-item';
            item.style.cursor = 'pointer';
            item.dataset.uuid = dev.uuid;

            var parts = [];
            if (dev.property && dev.property !== '--') parts.push(dev.property);
            if (dev.apartment && dev.apartment !== '--') parts.push('Unit ' + dev.apartment);
            parts.push(dev.name);

            var nameSpan = document.createElement('div');
            nameSpan.className   = 'w7-device-item-name';
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

    // -- Select device & load chart --
    function selectDevice(dev, itemEl) {
        var items = deviceList.querySelectorAll('.w7-device-item');
        items.forEach(function (el) { el.classList.remove('w7-active'); });
        itemEl.classList.add('w7-active');

        selectedDevice = dev;
        placeholder.style.display     = 'none';
        summaryPanel.style.display    = 'none';
        chartPanel.style.display      = 'none';
        correctionPanel.style.display = 'none';
        correctionVal.value           = '';
        previewBtn.disabled           = true;
        applyBtn.disabled             = true;
        previewActive                 = false;
        fetchedPoints                 = [];
        correctedData                 = [];
        anchorStart                   = null;
        anchorEnd                     = null;
        anchorHint.style.display      = 'block';
        anchorInfo.style.display      = 'none';
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        // Reset canvas
        var parent = chartCanvas.parentNode;
        var newCanvas = document.createElement('canvas');
        newCanvas.id = 'w7-chart';
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
            // Fetch meterValFlash + meterValCorrected in one call
            return apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=meterValFlash,meterValCorrected,flowRate' +
                '&startTs=' + startTs +
                '&endTs=' + endTs +
                '&limit=10000&agg=NONE&orderBy=ASC'
            );
        }).then(function (data) {
            var baselineRaw  = (data && data.meterValFlash) ? data.meterValFlash : [];
            var correctedRaw = (data && data.meterValCorrected) ? data.meterValCorrected : [];

            if (baselineRaw.length === 0) {
                showMessage(dev.name + ' -- no meterValFlash data in this date range.', 'error');
                return;
            }

            baselineRaw.sort(function (a, b) { return a.ts - b.ts; });
            fetchedPoints = baselineRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });

            var correctedParsed = correctedRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            var flowRateRaw = (data && data.flowRate) ? data.flowRate : [];
            fetchedFlow = flowRateRaw.map(function (p) {
                var v = parseFloat(p.value);
                return { ts: p.ts, value: v < 0.25 ? 0 : v };
            }).sort(function (a, b) { return a.ts - b.ts; });

            var first = fetchedPoints[0];
            var last  = fetchedPoints[fetchedPoints.length - 1];
            var diff  = last.value - first.value;

            // Corrected diff (if corrected data exists)
            var corrDiff = '--';
            if (correctedParsed.length >= 2) {
                var cFirst = correctedParsed[0];
                var cLast  = correctedParsed[correctedParsed.length - 1];
                corrDiff = formatNumber(cLast.value - cFirst.value);
            }

            // Summary cards
            cardStart.textContent     = formatNumber(first.value);
            cardStartDate.textContent = formatDateShort(first.ts);
            cardEnd.textContent       = formatNumber(last.value);
            cardEndDate.textContent   = formatDateShort(last.ts);
            cardDiff.textContent      = formatNumber(diff);
            cardCorrDiff.textContent  = corrDiff;
            cardPoints.textContent    = fetchedPoints.length;
            summaryPanel.style.display = 'block';

            // Render chart
            renderChart(fetchedPoints, correctedParsed, fetchedFlow, dev.name);
            chartPanel.style.display      = 'flex';
            correctionPanel.style.display = 'block';

            hideMessage();

        }).catch(function (e) {
            showMessage('Error loading ' + dev.name + ': ' + e.message, 'error');
        });
    }

    // -- Render chart: baseline vs corrected --
    function renderChart(baseline, corrected, flowRate, deviceName) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        var baselineData = baseline.map(function (p) {
            return { x: p.ts, y: p.value };
        });

        var correctedDataset = corrected.map(function (p) {
            return { x: p.ts, y: p.value };
        });

        var datasets = [
            {
                label: 'Baseline (meterValFlash)',
                data: baselineData,
                borderColor: '#305680',
                backgroundColor: 'rgba(48, 86, 128, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 8,
                pointHitRadius: 15,
                fill: false,
                tension: 0.1
            }
        ];

        if (correctedDataset.length > 0) {
            datasets.push({
                label: 'Corrected (meterValCorrected)',
                data: correctedDataset,
                borderColor: '#e65100',
                backgroundColor: 'rgba(230, 81, 0, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6,
                fill: false,
                tension: 0.1,
                borderDash: [6, 3]
            });
        }

        // If preview is active, add preview trace
        if (previewActive && correctedData.length > 0) {
            var previewDataset = correctedData.map(function (p) {
                return { x: p.ts, y: p.value };
            });
            datasets.push({
                label: 'Preview (proposed correction)',
                data: previewDataset,
                borderColor: '#f57c00',
                backgroundColor: 'rgba(245, 124, 0, 0.1)',
                borderWidth: 2.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                fill: false,
                tension: 0,
                borderDash: [4, 4]
            });
        }

        // Add flowRate on secondary axis
        if (flowRate && flowRate.length > 0) {
            var flowData = flowRate.map(function (p) {
                return { x: p.ts, y: p.value };
            });
            datasets.push({
                label: 'Flow Rate',
                data: flowData,
                borderColor: 'rgba(21, 101, 192, 0.5)',
                backgroundColor: 'rgba(21, 101, 192, 0.05)',
                borderWidth: 1,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: false,
                tension: 0,
                yAxisID: 'yFlow'
            });
        }

        // Add anchor marker datasets
        if (anchorStart) {
            datasets.push({
                label: 'Start Anchor',
                data: [{ x: anchorStart.ts, y: anchorStart.value }],
                borderColor: '#2e7d32',
                backgroundColor: '#2e7d32',
                pointRadius: 10,
                pointHoverRadius: 12,
                pointStyle: 'circle',
                showLine: false
            });
        }
        if (anchorEnd) {
            datasets.push({
                label: 'End Anchor',
                data: [{ x: anchorEnd.ts, y: anchorEnd.value }],
                borderColor: '#c0392b',
                backgroundColor: '#c0392b',
                pointRadius: 10,
                pointHoverRadius: 12,
                pointStyle: 'circle',
                showLine: false
            });
        }

        var minTs = baseline[0].ts;
        var maxTs = baseline[baseline.length - 1].ts;

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                onClick: function (evt, elements) {
                    if (!elements || elements.length === 0) return;
                    // Only respond to clicks on the baseline dataset (index 0)
                    var baseEl = elements.find(function (el) { return el.datasetIndex === 0; });
                    if (!baseEl) return;
                    var idx = baseEl.index;
                    var pt = fetchedPoints[idx];
                    if (!pt) return;

                    if (!anchorStart || (anchorStart && anchorEnd)) {
                        // First click or restart: set start anchor
                        anchorStart = { ts: pt.ts, value: pt.value, index: idx };
                        anchorEnd   = null;
                        anchorHint.style.display = 'none';
                        anchorInfo.style.display = 'flex';
                        anchorText.textContent = 'Start: ' + formatNumber(pt.value) +
                            ' (' + formatDateShort(pt.ts) + ') -- click second point to set end';
                        correctionVal.value = '';
                        previewBtn.disabled = true;
                        applyBtn.disabled   = true;
                    } else {
                        // Second click: set end anchor
                        anchorEnd = { ts: pt.ts, value: pt.value, index: idx };

                        // Ensure start is before end
                        if (anchorEnd.ts < anchorStart.ts) {
                            var tmp = anchorStart;
                            anchorStart = anchorEnd;
                            anchorEnd = tmp;
                        }

                        var delta = anchorEnd.value - anchorStart.value;
                        anchorText.textContent = 'Start: ' + formatNumber(anchorStart.value) +
                            ' (' + formatDateShort(anchorStart.ts) + ')  -->  End: ' +
                            formatNumber(anchorEnd.value) + ' (' + formatDateShort(anchorEnd.ts) +
                            ')  |  Delta: ' + formatNumber(delta);

                        // Auto-populate correction value
                        correctionVal.value = Math.round(delta);
                        previewBtn.disabled = false;
                    }

                    // Redraw chart with anchor markers
                    var parent = chartCanvas.parentNode;
                    var newCanvas = document.createElement('canvas');
                    newCanvas.id = 'w7-chart';
                    parent.replaceChild(newCanvas, chartCanvas);
                    chartCanvas = newCanvas;
                    renderChart(baseline, corrected, flowRate, deviceName);
                },
                plugins: {
                    title: {
                        display: true,
                        text: deviceName + ' -- Baseline vs Corrected',
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
                                var d = new Date(items[0].parsed.x);
                                return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
                            },
                            label: function (item) {
                                var val = item.parsed.y;
                                return item.dataset.label + ': ' + (val !== null ? Math.round(val).toLocaleString() : '--');
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
                            x: { min: minTs, max: maxTs }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            tooltipFormat: 'MMM d, yyyy HH:mm'
                        },
                        ticks: { font: { size: 10 }, maxTicksLimit: 15 },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        min: minTs,
                        max: maxTs
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Meter Value', font: { size: 11 } },
                        ticks: {
                            font: { size: 10 },
                            callback: function (val) { return Math.round(val).toLocaleString(); }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    yFlow: {
                        position: 'right',
                        display: flowRate && flowRate.length > 0,
                        title: { display: true, text: 'Flow Rate', font: { size: 11 }, color: '#1565c0' },
                        ticks: { font: { size: 10 }, color: '#1565c0' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // -- Correction input --
    correctionVal.addEventListener('input', function () {
        previewBtn.disabled = !correctionVal.value;
        if (previewActive) {
            previewActive = false;
            applyBtn.disabled = true;
            if (selectedDevice && fetchedPoints.length > 0) {
                reloadCurrentDevice();
            }
        }
    });

    // -- Clear anchor selection --
    anchorClearBtn.addEventListener('click', function () {
        anchorStart = null;
        anchorEnd   = null;
        anchorHint.style.display = 'block';
        anchorInfo.style.display = 'none';
        correctionVal.value = '';
        previewBtn.disabled = true;
        applyBtn.disabled   = true;
        previewActive = false;
        if (selectedDevice && fetchedPoints.length > 0) {
            reloadCurrentDevice();
        }
    });

    function reloadCurrentDevice() {
        if (!selectedDevice || fetchedPoints.length === 0) return;

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/values/timeseries?keys=meterValCorrected' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).then(function (data) {
            var correctedRaw = (data && data.meterValCorrected) ? data.meterValCorrected : [];
            var correctedParsed = correctedRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Replace canvas
            var parent = chartCanvas.parentNode;
            var newCanvas = document.createElement('canvas');
            newCanvas.id = 'w7-chart';
            parent.replaceChild(newCanvas, chartCanvas);
            chartCanvas = newCanvas;

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name);
        });
    }

    // -- Preview button --
    previewBtn.addEventListener('click', function () {
        if (fetchedPoints.length === 0 || !correctionVal.value) return;

        var correctedDiff = parseFloat(correctionVal.value);
        if (isNaN(correctedDiff)) {
            showMessage('Please enter a valid number.', 'error');
            return;
        }

        var first   = fetchedPoints[0];
        var last    = fetchedPoints[fetchedPoints.length - 1];
        var totalTs = last.ts - first.ts;

        // Build corrected trace via linear interpolation
        correctedData = fetchedPoints.map(function (p) {
            var newVal;
            if (totalTs === 0) {
                newVal = first.value;
            } else {
                var fraction = (p.ts - first.ts) / totalTs;
                newVal = first.value + (correctedDiff * fraction);
            }
            return { ts: p.ts, value: Math.round(newVal) };
        });

        previewActive = true;
        applyBtn.disabled = false;

        // Update corrected diff card
        cardCorrDiff.textContent = formatNumber(correctedDiff);

        // Redraw chart with preview overlay
        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/values/timeseries?keys=meterValCorrected' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).then(function (data) {
            var correctedRaw = (data && data.meterValCorrected) ? data.meterValCorrected : [];
            var correctedParsed = correctedRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Replace canvas
            var parent = chartCanvas.parentNode;
            var newCanvas = document.createElement('canvas');
            newCanvas.id = 'w7-chart';
            parent.replaceChild(newCanvas, chartCanvas);
            chartCanvas = newCanvas;

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name);
            showMessage('Preview: orange dashed line shows proposed correction. Click Apply to write.', 'info');
        });
    });

    // -- Apply correction --
    applyBtn.addEventListener('click', function () {
        if (correctedData.length === 0 || !selectedDevice) return;

        var deviceName = selectedDevice.name;

        var confirmed = confirm(
            'Apply correction to ' + deviceName + '?\n\n' +
            'This will write ' + correctedData.length + ' meterValCorrected data points.\n\n' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;

        applyBtn.disabled    = true;
        applyBtn.textContent = 'Applying...';
        hideMessage();

        var deviceId  = selectedDevice.uuid;
        var batchSize = 50;
        var batches   = [];
        for (var i = 0; i < correctedData.length; i += batchSize) {
            batches.push(correctedData.slice(i, i + batchSize));
        }

        var successCount = 0;
        var errorCount   = 0;

        function processBatch(batchIndex) {
            if (batchIndex >= batches.length) {
                applyBtn.disabled    = false;
                applyBtn.textContent = 'Apply Correction';
                previewActive = false;

                if (errorCount === 0) {
                    showMessage(
                        'Correction applied -- ' + successCount + ' data points written to meterValCorrected.',
                        'success'
                    );
                    // Reload to show the now-persisted corrected trace
                    reloadCurrentDevice();
                } else {
                    showMessage(
                        successCount + ' points written, ' + errorCount + ' errors.',
                        'error'
                    );
                }
                return;
            }

            var batch    = batches[batchIndex];
            var promises = batch.map(function (p) {
                return apiFetch(
                    '/api/plugins/telemetry/DEVICE/' + deviceId + '/timeseries/ANY',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            ts: p.ts,
                            values: { meterValCorrected: p.value }
                        })
                    }
                ).then(function () {
                    successCount++;
                }).catch(function (e) {
                    console.error('Failed to write ts=' + p.ts + ':', e);
                    errorCount++;
                });
            });

            Promise.all(promises).then(function () {
                applyBtn.textContent = 'Applying... (' +
                    Math.min((batchIndex + 1) * batchSize, correctedData.length) +
                    '/' + correctedData.length + ')';
                processBatch(batchIndex + 1);
            });
        }

        processBatch(0);
    });

    // -- Load button: fetch devices + attributes --
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
