self.onInit = function () {

    // ── DOM refs (w4- prefix) ──────────────────────────────────────
    var ownerTypeSel  = document.getElementById('w4-ownerTypeSelect');
    var customerField = document.getElementById('w4-customerField');
    var customerSel   = document.getElementById('w4-customerSelect');
    var groupSel      = document.getElementById('w4-groupSelect');
    var deviceSel     = document.getElementById('w4-deviceSelect');
    var startDateEl   = document.getElementById('w4-startDate');
    var endDateEl     = document.getElementById('w4-endDate');
    var fetchBtn      = document.getElementById('w4-fetchBtn');
    var statusMsg     = document.getElementById('w4-statusMsg');
    var readingsPanel = document.getElementById('w4-readingsPanel');
    var startValEl    = document.getElementById('w4-startVal');
    var startDate2El  = document.getElementById('w4-startDate2');
    var endValEl      = document.getElementById('w4-endVal');
    var endDate2El    = document.getElementById('w4-endDate2');
    var currentDiffEl = document.getElementById('w4-currentDiff');
    var pointCountEl  = document.getElementById('w4-pointCount');
    var correctionVal = document.getElementById('w4-correctionVal');
    var previewBtn    = document.getElementById('w4-previewBtn');
    var previewPanel  = document.getElementById('w4-previewPanel');
    var previewSummary = document.getElementById('w4-previewSummary');
    var previewBody   = document.getElementById('w4-previewBody');
    var applyBtn      = document.getElementById('w4-applyBtn');

    var currentUser   = null;
    var fetchedPoints = [];   // { ts, value } — all meterValFlash points in range
    var correctedPoints = []; // { ts, oldVal, newVal } — preview data

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
        statusMsg.className     = 'w4-message w4-msg-' + (type || 'info');
        statusMsg.style.display = 'block';
    }

    function hideMessage() {
        statusMsg.style.display = 'none';
    }

    function populateSelect(selectEl, items, placeholder) {
        selectEl.innerHTML = '<option value="">' + placeholder + '</option>';
        items.forEach(function (item) {
            var opt         = document.createElement('option');
            opt.value       = item.id;
            opt.textContent = item.name;
            selectEl.appendChild(opt);
        });
    }

    function formatDate(ts) {
        if (!ts) return '—';
        var d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }

    function formatNumber(val) {
        if (val === null || val === undefined) return '—';
        return Math.round(parseFloat(val)).toLocaleString();
    }

    function updateFetchBtn() {
        fetchBtn.disabled = !(deviceSel.value && startDateEl.value && endDateEl.value);
    }

    function resetPanels() {
        readingsPanel.style.display = 'none';
        previewPanel.style.display  = 'none';
        correctionVal.value         = '';
        previewBtn.disabled         = true;
        fetchedPoints               = [];
        correctedPoints             = [];
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
    makeSearchable(deviceSel);

    // ── Load current user ──────────────────────────────────────────
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });

    // ── Load customers ─────────────────────────────────────────────
    function loadCustomers() {
        customerSel.innerHTML    = '<option value="">Loading…</option>';
        groupSel.innerHTML       = '<option value="">— Select Group —</option>';
        groupSel.disabled        = true;
        deviceSel.innerHTML      = '<option value="">— Select Device —</option>';
        deviceSel.disabled       = true;
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

        groupSel.disabled        = true;
        groupSel.innerHTML       = '<option value="">Loading…</option>';
        deviceSel.innerHTML      = '<option value="">— Select Device —</option>';
        deviceSel.disabled       = true;
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
            })
            .catch(function (e) {
                groupSel.innerHTML = '<option value="">— Select Group —</option>';
                showMessage('Could not load groups: ' + e.message, 'error');
            });
    }

    // ── Load devices in group ──────────────────────────────────────
    function loadDevices() {
        var groupId = groupSel.value;
        deviceSel.disabled   = true;
        deviceSel.innerHTML  = '<option value="">Loading…</option>';
        resetPanels();
        hideMessage();

        if (!groupId) {
            deviceSel.innerHTML = '<option value="">— Select Device —</option>';
            return;
        }

        apiFetch('/api/entityGroup/' + groupId + '/entities?pageSize=1000&page=0')
            .then(function (resp) {
                var list = (resp && resp.data) ? resp.data
                         : Array.isArray(resp) ? resp : [];
                list = list.filter(Boolean);

                var items = list.map(function (d) {
                    return {
                        id:   extractId(d.id) || extractId(d),
                        name: d.name || d.label || '—'
                    };
                });
                items.sort(function (a, b) {
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });
                populateSelect(deviceSel, items, '— Select Device —');
                deviceSel.disabled = false;
                updateFetchBtn();
            })
            .catch(function (e) {
                deviceSel.innerHTML = '<option value="">— Select Device —</option>';
                showMessage('Could not load devices: ' + e.message, 'error');
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

    customerSel.addEventListener('change', function () {
        hideMessage();
        loadGroups();
    });

    groupSel.addEventListener('change', function () {
        hideMessage();
        loadDevices();
    });

    deviceSel.addEventListener('change', function () {
        resetPanels();
        hideMessage();
        updateFetchBtn();
    });

    startDateEl.addEventListener('change', function () { resetPanels(); updateFetchBtn(); });
    endDateEl.addEventListener('change', function () { resetPanels(); updateFetchBtn(); });

    correctionVal.addEventListener('input', function () {
        previewBtn.disabled = !correctionVal.value;
        previewPanel.style.display = 'none';
    });

    // ── Fetch telemetry ────────────────────────────────────────────
    fetchBtn.addEventListener('click', function () {
        var deviceId = deviceSel.value;
        if (!deviceId || !startDateEl.value || !endDateEl.value) return;

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        if (startTs >= endTs) {
            showMessage('Start date must be before end date.', 'error');
            return;
        }

        fetchBtn.disabled    = true;
        fetchBtn.textContent = 'Fetching…';
        resetPanels();
        hideMessage();

        // Fetch ALL meterValFlash points in the range (paginated up to 10000)
        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + deviceId +
            '/values/timeseries?keys=meterValFlash' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).then(function (data) {
            var points = (data && data.meterValFlash) ? data.meterValFlash : [];

            if (points.length === 0) {
                showMessage('No meterValFlash data found in this date range.', 'error');
                fetchBtn.disabled    = false;
                fetchBtn.textContent = 'Fetch';
                return;
            }

            // Sort by timestamp ascending
            points.sort(function (a, b) { return a.ts - b.ts; });

            fetchedPoints = points.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });

            var first = fetchedPoints[0];
            var last  = fetchedPoints[fetchedPoints.length - 1];
            var diff  = last.value - first.value;

            startValEl.textContent    = formatNumber(first.value);
            startDate2El.textContent  = formatDate(first.ts);
            endValEl.textContent      = formatNumber(last.value);
            endDate2El.textContent    = formatDate(last.ts);
            currentDiffEl.textContent = formatNumber(diff);
            pointCountEl.textContent  = fetchedPoints.length;

            readingsPanel.style.display = 'block';
            previewBtn.disabled         = !correctionVal.value;

            fetchBtn.disabled    = false;
            fetchBtn.textContent = 'Fetch';
        }).catch(function (e) {
            showMessage('Error fetching telemetry: ' + e.message, 'error');
            fetchBtn.disabled    = false;
            fetchBtn.textContent = 'Fetch';
        });
    });

    // ── Preview correction ─────────────────────────────────────────
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

        correctedPoints = fetchedPoints.map(function (p) {
            var newVal;
            if (totalTs === 0) {
                // All points at same timestamp — just use start value
                newVal = first.value;
            } else {
                var fraction = (p.ts - first.ts) / totalTs;
                newVal = first.value + (correctedDiff * fraction);
            }
            return {
                ts:     p.ts,
                oldVal: p.value,
                newVal: Math.round(newVal)
            };
        });

        // Render preview table
        previewBody.innerHTML = '';
        correctedPoints.forEach(function (p, i) {
            var tr = document.createElement('tr');

            var tdNum = document.createElement('td');
            tdNum.textContent = i + 1;

            var tdTs = document.createElement('td');
            tdTs.textContent = formatDate(p.ts);

            var tdOld = document.createElement('td');
            tdOld.textContent = formatNumber(p.oldVal);

            var tdNew = document.createElement('td');
            tdNew.textContent = formatNumber(p.newVal);
            if (p.newVal !== Math.round(p.oldVal)) {
                tdNew.className = 'w4-val-changed';
            }

            var tdChange = document.createElement('td');
            var delta = p.newVal - Math.round(p.oldVal);
            if (delta !== 0) {
                tdChange.textContent = (delta > 0 ? '+' : '') + formatNumber(delta);
                tdChange.className   = 'w4-val-changed';
            } else {
                tdChange.textContent = '0';
                tdChange.className   = 'w4-val-same';
            }

            tr.appendChild(tdNum);
            tr.appendChild(tdTs);
            tr.appendChild(tdOld);
            tr.appendChild(tdNew);
            tr.appendChild(tdChange);
            previewBody.appendChild(tr);
        });

        var newEnd  = correctedPoints[correctedPoints.length - 1].newVal;
        var oldDiff = Math.round(last.value - first.value);
        previewSummary.textContent =
            correctedPoints.length + ' data points  |  ' +
            'Old difference: ' + formatNumber(oldDiff) +
            '  →  New difference: ' + formatNumber(correctedDiff) +
            '  |  New end value: ' + formatNumber(newEnd);

        previewPanel.style.display = 'block';
    });

    // ── Apply correction ───────────────────────────────────────────
    applyBtn.addEventListener('click', function () {
        if (correctedPoints.length === 0) return;

        var deviceId = deviceSel.value;
        var deviceName = deviceSel.options[deviceSel.selectedIndex].text;

        var confirmed = confirm(
            'Apply correction to ' + deviceName + '?\n\n' +
            'This will write ' + correctedPoints.length + ' meterValFlash data points.\n\n' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;

        applyBtn.disabled    = true;
        applyBtn.textContent = 'Applying…';
        hideMessage();

        // Send telemetry writes sequentially in small batches
        var batchSize = 50;
        var batches   = [];
        for (var i = 0; i < correctedPoints.length; i += batchSize) {
            batches.push(correctedPoints.slice(i, i + batchSize));
        }

        var successCount = 0;
        var errorCount   = 0;

        function processBatch(batchIndex) {
            if (batchIndex >= batches.length) {
                // Done
                applyBtn.disabled    = false;
                applyBtn.textContent = 'Apply Correction';

                if (errorCount === 0) {
                    showMessage(
                        'Correction applied successfully — ' + successCount + ' data points updated.',
                        'success'
                    );
                } else {
                    showMessage(
                        successCount + ' points updated, ' + errorCount + ' errors.',
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
                            values: { meterValFlash: p.newVal }
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
                applyBtn.textContent = 'Applying… (' +
                    Math.min((batchIndex + 1) * batchSize, correctedPoints.length) +
                    '/' + correctedPoints.length + ')';
                processBatch(batchIndex + 1);
            });
        }

        processBatch(0);
    });

};

self.onDestroy = function () {};
