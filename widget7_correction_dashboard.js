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
    var prevBar        = document.getElementById('w7-prevBar');
    var prevDeltaEl    = document.getElementById('w7-prevDelta');
    var currDeltaEl    = document.getElementById('w7-currDelta');
    var deltaCompareEl = document.getElementById('w7-deltaCompare');
    var matchPrevBtn   = document.getElementById('w7-matchPrevBtn');
    var showPrevToggle = document.getElementById('w7-showPrevToggle');
    var attrToggles    = document.getElementById('w7-attrToggles');
    var toggleBillable = document.getElementById('w7-toggleBillable');
    var toggleReview   = document.getElementById('w7-toggleMeterReview');
    var toggleLeak     = document.getElementById('w7-toggleLeak');
    var toggleInstalled = document.getElementById('w7-toggleInstalled');
    var toggleReplace  = document.getElementById('w7-toggleReplace');
    var toggleEngReview = document.getElementById('w7-toggleEngReview');
    var filterBillable = document.getElementById('w7-filterBillable');
    var filterReview   = document.getElementById('w7-filterReview');
    var movePanel      = document.getElementById('w7-movePanel');
    var moveOwnerType  = document.getElementById('w7-moveOwnerType');
    var moveCustField  = document.getElementById('w7-moveCustomerField');
    var moveCustSel    = document.getElementById('w7-moveCustomerSelect');
    var moveGroupSel   = document.getElementById('w7-moveGroupSelect');
    var moveBtn        = document.getElementById('w7-moveBtn');
    var currentUser    = null;
    var chartInstance  = null;
    var allDevices     = [];
    var selectedDevice = null;
    var groupEngReviewed = false; // group-level Engineering Reviewed
    var fetchedPoints  = [];   // { ts, value } -- baseline meterValFlash
    var fetchedFlow    = [];   // { ts, value } -- flowRate data
    var correctedData  = [];   // { ts, value } -- corrected trace for chart
    var previewActive  = false;
    var prevPeriodRaw  = [];    // { ts, value } -- previous 30d raw data
    var prevPeriodNorm = [];    // { ts, value } -- normalized to current period
    var prevPeriodDelta = null; // previous period total usage
    var showPrevOverlay = true;
    var fetchedNotMetering = []; // { ts } -- timestamps where deviceState = "Not Metering"
    var fetchedOffset = [];      // { ts, value } -- offset telemetry

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
        attrToggles.style.display     = 'none';
        movePanel.style.display       = 'none';
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
        prevPeriodRaw    = [];
        prevPeriodNorm   = [];
        prevPeriodDelta  = null;
        prevBar.style.display = 'none';
        matchPrevBtn.disabled = true;
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
        prevPeriodRaw    = [];
        prevPeriodNorm   = [];
        prevPeriodDelta  = null;
        prevBar.style.display = 'none';
        matchPrevBtn.disabled = true;
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
    makeSearchable(moveCustSel);
    makeSearchable(moveGroupSel);

    // -- Load current user --
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
        loadMoveGroups(); // initialize move target with tenant groups
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

    // -- Device list filtering (search + attribute filters) --
    function applyDeviceFilters() {
        var term = deviceSearch.value.toLowerCase();
        var billFilter = filterBillable.value;   // "ALL" or "FALSE"
        var revFilter  = filterReview.value;     // "ALL" or "TRUE"
        var items = deviceList.querySelectorAll('.w7-device-item');
        var visible = 0;
        items.forEach(function (item) {
            var uuid = item.dataset.uuid;
            var dev = allDevices.find(function (d) { return d.uuid === uuid; });
            var show = true;
            // Text search
            if (term) {
                var text = item.textContent.toLowerCase();
                if (text.indexOf(term) === -1) show = false;
            }
            // Billable filter
            if (show && billFilter === 'FALSE' && dev) {
                if (dev.billable === true) show = false;
            }
            // Meter Review filter
            if (show && revFilter === 'TRUE' && dev) {
                if (!dev.meterReview) show = false;
            }
            item.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        deviceCount.textContent = visible + ' of ' + allDevices.length + ' devices';
    }

    deviceSearch.addEventListener('input', applyDeviceFilters);
    filterBillable.addEventListener('change', applyDeviceFilters);
    filterReview.addEventListener('change', applyDeviceFilters);

    // -- Attribute toggle helpers --
    function updateToggleBtn(btn, label, isOn) {
        btn.textContent = label + ': ' + (isOn ? 'TRUE' : 'FALSE');
        btn.className = 'w7-toggle-btn ' + (isOn ? 'w7-toggle-on' : 'w7-toggle-off');
    }

    function toggleAttribute(attrKey, scope, btn, label, devProp) {
        if (!selectedDevice) return;
        var current = selectedDevice[devProp];
        var newVal = !current;
        var body = JSON.stringify({ [attrKey]: newVal });
        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid + '/attributes/' + scope,
            { method: 'POST', body: body }
        ).then(function () {
            selectedDevice[devProp] = newVal;
            updateToggleBtn(btn, label, newVal);
            // Re-render device list to update text color / icons
            refreshDeviceItem(selectedDevice);
        }).catch(function (e) {
            showMessage('Failed to update ' + attrKey + ': ' + e.message, 'error');
        });
    }

    function refreshDeviceItem(dev) {
        var items = deviceList.querySelectorAll('.w7-device-item');
        items.forEach(function (item) {
            if (item.dataset.uuid === dev.uuid) {
                var nameSpan = item.querySelector('.w7-device-item-name');
                if (!nameSpan) return;
                // Rebuild name text color
                var nameText = nameSpan.querySelector('span');
                if (nameText) {
                    var nameColor = dev.meterReview ? '#b8860b' : (dev.replace || dev.billable !== true) ? '#c0392b' : '#2e7d32';
                    nameText.style.color = nameColor;
                }
                // Update single droplet icon
                var existingDrop = nameSpan.querySelector('.w7-drop-icon');
                if (dev.noWater || dev.leak) {
                    var dropColor = dev.noWater ? '#c0392b' : '#42a5f5';
                    var dropTitle = dev.noWater ? 'No Water' : 'Leak detected';
                    if (existingDrop) {
                        existingDrop.title = dropTitle;
                        existingDrop.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + dropColor + '" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 5 11.2 5 16a7 7 0 0 0 14 0C19 11.2 12 2 12 2z"/></svg>';
                    } else {
                        var dropIcon = document.createElement('span');
                        dropIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;';
                        dropIcon.title = dropTitle;
                        dropIcon.className = 'w7-drop-icon';
                        dropIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + dropColor + '" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 5 11.2 5 16a7 7 0 0 0 14 0C19 11.2 12 2 12 2z"/></svg>';
                        nameSpan.appendChild(dropIcon);
                    }
                } else if (existingDrop) {
                    existingDrop.remove();
                }
            }
        });
    }

    toggleBillable.addEventListener('click', function () {
        toggleAttribute('Billable', 'SERVER_SCOPE', toggleBillable, 'Billable', 'billable');
    });
    toggleReview.addEventListener('click', function () {
        toggleAttribute('Billing Review', 'SERVER_SCOPE', toggleReview, 'Billing Review', 'meterReview');
    });
    toggleLeak.addEventListener('click', function () {
        toggleAttribute('Leak', 'SERVER_SCOPE', toggleLeak, 'Leak', 'leak');
    });
    toggleInstalled.addEventListener('click', function () {
        toggleAttribute('Installed', 'SERVER_SCOPE', toggleInstalled, 'Installed', 'installed');
    });
    toggleReplace.addEventListener('click', function () {
        toggleAttribute('Replace', 'SERVER_SCOPE', toggleReplace, 'Replace', 'replace');
    });
    toggleEngReview.addEventListener('click', function () {
        var gId = groupSel.value;
        if (!gId) return;
        var newVal = !groupEngReviewed;
        var attrs = { 'Engineering Reviewed': newVal };
        if (newVal) {
            attrs['Engineering Review Date'] = Date.now();
        }
        apiFetch(
            '/api/plugins/telemetry/ENTITY_GROUP/' + gId + '/attributes/SERVER_SCOPE',
            { method: 'POST', body: JSON.stringify(attrs) }
        ).then(function () {
            groupEngReviewed = newVal;
            updateToggleBtn(toggleEngReview, 'Eng Reviewed', newVal);
            showMessage('Engineering Reviewed set to ' + newVal + ' for group', 'success');
        }).catch(function (e) {
            showMessage('Failed to update Engineering Reviewed: ' + e.message, 'error');
        });
    });

    // -- Move device controls --
    function loadMoveCustomers() {
        moveCustSel.innerHTML = '<option value="">Loading...</option>';
        moveGroupSel.innerHTML = '<option value="">-- Select Group --</option>';
        moveGroupSel.disabled = true;
        moveBtn.disabled = true;

        apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var list = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var items = list.map(function (c) {
                return { id: extractId(c.id), name: c.title || c.name || '' };
            });
            populateSelect(moveCustSel, items, '-- Select Customer --');
        }).catch(function () {
            moveCustSel.innerHTML = '<option value="">-- Select Customer --</option>';
        });
    }

    function loadMoveGroups() {
        if (!currentUser) return;
        moveGroupSel.disabled = true;
        moveGroupSel.innerHTML = '<option value="">Loading...</option>';
        moveBtn.disabled = true;

        var mOwnerType = moveOwnerType.value;
        var mOwnerId = mOwnerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : moveCustSel.value;

        if (!mOwnerId) {
            moveGroupSel.innerHTML = '<option value="">-- Select Group --</option>';
            return;
        }

        apiFetch('/api/entityGroups/' + mOwnerType + '/' + mOwnerId + '/DEVICE')
            .then(function (data) {
                var list = (data || []).filter(function (g) { return g && g.name !== 'All'; });
                var items = list.map(function (g) {
                    return { id: extractId(g.id), name: g.name || g.label || '' };
                });
                populateSelect(moveGroupSel, items, '-- Select Group --');
                moveGroupSel.disabled = false;
            })
            .catch(function () {
                moveGroupSel.innerHTML = '<option value="">-- Select Group --</option>';
            });
    }

    function updateMoveBtn() {
        moveBtn.disabled = !selectedDevice || !moveGroupSel.value;
    }

    moveOwnerType.addEventListener('change', function () {
        if (moveOwnerType.value === 'CUSTOMER') {
            moveCustField.style.display = 'block';
            loadMoveCustomers();
        } else {
            moveCustField.style.display = 'none';
            loadMoveGroups();
        }
        updateMoveBtn();
    });

    moveCustSel.addEventListener('change', function () {
        loadMoveGroups();
        updateMoveBtn();
    });

    moveGroupSel.addEventListener('change', function () {
        updateMoveBtn();
    });

    moveBtn.addEventListener('click', function () {
        if (!selectedDevice || !moveGroupSel.value) return;

        var targetGroupId = moveGroupSel.value;
        var targetGroupName = moveGroupSel.options[moveGroupSel.selectedIndex].text;
        var sourceGroupId = groupSel.value;
        var uuid = selectedDevice.uuid;

        if (!window.confirm('Move "' + selectedDevice.name + '" to group "' + targetGroupName + '"?\n\nThis will remove the device from the current group.')) {
            return;
        }

        moveBtn.disabled = true;
        moveBtn.textContent = 'Moving...';

        // Determine if ownership change is needed
        var sourceOwnerType = ownerTypeSel.value;
        var sourceOwnerId = sourceOwnerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : customerSel.value;
        var targetOwnerType = moveOwnerType.value;
        var targetOwnerId = targetOwnerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : moveCustSel.value;
        var ownerChanging = sourceOwnerId !== targetOwnerId;

        var task;
        if (ownerChanging) {
            // Change ownership first
            var ownerUrl;
            if (targetOwnerType === 'CUSTOMER') {
                ownerUrl = '/api/owner/CUSTOMER/' + targetOwnerId + '/DEVICE/' + uuid;
            } else {
                ownerUrl = '/api/owner/TENANT/' + extractId(currentUser.tenantId) + '/DEVICE/' + uuid;
            }
            task = apiFetch(ownerUrl, { method: 'POST' })
                .then(function () {
                    return apiFetch('/api/entityGroup/' + targetGroupId + '/addEntities', {
                        method: 'POST',
                        body: JSON.stringify([uuid])
                    });
                })
                .then(function () {
                    return apiFetch('/api/entityGroup/' + sourceGroupId + '/deleteEntities', {
                        method: 'POST',
                        body: JSON.stringify([uuid])
                    }).catch(function () {}); // may fail silently if PE auto-removed
                });
        } else {
            task = apiFetch('/api/entityGroup/' + targetGroupId + '/addEntities', {
                method: 'POST',
                body: JSON.stringify([uuid])
            }).then(function () {
                return apiFetch('/api/entityGroup/' + sourceGroupId + '/deleteEntities', {
                    method: 'POST',
                    body: JSON.stringify([uuid])
                });
            });
        }

        task.then(function () {
            showMessage('Moved "' + selectedDevice.name + '" to "' + targetGroupName + '"', 'success');
            // Remove device from local list
            allDevices = allDevices.filter(function (d) { return d.uuid !== uuid; });
            selectedDevice = null;
            renderDeviceList();
            // Reset right side
            summaryPanel.style.display = 'none';
            chartPanel.style.display = 'none';
            correctionPanel.style.display = 'none';
            attrToggles.style.display = 'none';
            movePanel.style.display = 'none';
            placeholder.style.display = 'block';
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        }).catch(function (e) {
            showMessage('Move failed: ' + e.message, 'error');
        }).then(function () {
            moveBtn.disabled = false;
            moveBtn.textContent = 'Move Device';
            updateMoveBtn();
        });
    });

    // Initialize move owner type -- load tenant groups by default
    // (deferred until currentUser is loaded)

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
            nameSpan.style.cssText = 'pointer-events:none;cursor:pointer;display:flex;align-items:center;gap:6px;';

            var nameText = document.createElement('span');
            var nameColor = dev.meterReview ? '#b8860b' : (dev.replace || dev.billable !== true) ? '#c0392b' : '#2e7d32';
            nameText.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:' + nameColor + ';';
            nameText.textContent = parts.join(' - ');
            nameSpan.appendChild(nameText);

            // Single droplet: red if No Water, blue if Leak, hidden if neither
            if (dev.noWater || dev.leak) {
                var dropColor = dev.noWater ? '#c0392b' : '#42a5f5';
                var dropTitle = dev.noWater ? 'No Water' : 'Leak detected';
                var dropIcon = document.createElement('span');
                dropIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;';
                dropIcon.title = dropTitle;
                dropIcon.className = 'w7-drop-icon';
                dropIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + dropColor + '" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 5 11.2 5 16a7 7 0 0 0 14 0C19 11.2 12 2 12 2z"/></svg>';
                nameSpan.appendChild(dropIcon);
            }

            item.appendChild(nameSpan);

            item.addEventListener('click', function () {
                selectDevice(dev, item);
            });

            deviceList.appendChild(item);
        });

        deviceCount.textContent = allDevices.length + ' devices';
    }

    // -- Device navigation buttons --
    function navigateDevice(direction) {
        var items = Array.from(deviceList.querySelectorAll('.w7-device-item'));
        var visible = items.filter(function (el) { return el.style.display !== 'none'; });
        if (visible.length === 0) return;

        var currentIdx = -1;
        if (lastSelectedItem) {
            currentIdx = visible.indexOf(lastSelectedItem);
        }

        var nextIdx;
        if (direction === 'down') {
            nextIdx = currentIdx < visible.length - 1 ? currentIdx + 1 : 0;
        } else {
            nextIdx = currentIdx > 0 ? currentIdx - 1 : visible.length - 1;
        }

        var nextItem = visible[nextIdx];
        var uuid = nextItem.dataset.uuid;
        var dev = allDevices.find(function (d) { return d.uuid === uuid; });
        if (dev) {
            nextItem.scrollIntoView({ block: 'nearest' });
            selectDevice(dev, nextItem);
        }
    }

    document.getElementById('w7-prevDevBtn').addEventListener('click', function () {
        navigateDevice('up');
    });
    document.getElementById('w7-nextDevBtn').addEventListener('click', function () {
        navigateDevice('down');
    });

    // -- Select device & load chart --
    var lastSelectedItem = null;

    function selectDevice(dev, itemEl) {
        // Clear previous selection
        if (lastSelectedItem) {
            lastSelectedItem.style.backgroundColor = '';
        }
        // Highlight new selection -- light background preserves red/green text
        itemEl.style.backgroundColor = '#e0e0e0';
        lastSelectedItem = itemEl;

        selectedDevice = dev;
        placeholder.style.display     = 'none';
        summaryPanel.style.display    = 'none';
        chartPanel.style.display      = 'none';
        correctionPanel.style.display = 'none';
        attrToggles.style.display     = 'flex';
        movePanel.style.display       = 'block';
        updateMoveBtn();
        updateToggleBtn(toggleBillable, 'Billable', dev.billable === true);
        updateToggleBtn(toggleReview, 'Billing Review', dev.meterReview === true);
        updateToggleBtn(toggleLeak, 'Leak', dev.leak === true);
        updateToggleBtn(toggleInstalled, 'Installed', dev.installed === true);
        updateToggleBtn(toggleReplace, 'Replace', dev.replace === true);
        updateToggleBtn(toggleEngReview, 'Eng Reviewed', groupEngReviewed);
        correctionVal.value           = '';
        previewBtn.disabled           = true;
        applyBtn.disabled             = true;
        previewActive                 = false;
        fetchedPoints                 = [];
        correctedData                 = [];
        prevPeriodRaw     = [];
        prevPeriodNorm    = [];
        prevPeriodDelta   = null;
        prevBar.style.display = 'none';
        matchPrevBtn.disabled = true;
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
            // Fetch meter data and flowRate in parallel
            var meterP = apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=meterValFlash,meterValCorrected,deviceState,offset' +
                '&startTs=' + startTs +
                '&endTs=' + endTs +
                '&limit=10000&agg=NONE&orderBy=ASC'
            );
            // FlowRate: fetch in weekly chunks to cover full range
            var weekMs = 7 * 86400000;
            var flowChunks = [];
            for (var cs = startTs; cs < endTs; cs += weekMs) {
                var ce = Math.min(cs + weekMs - 1, endTs);
                flowChunks.push({ s: cs, e: ce });
            }
            var flowP = Promise.all(flowChunks.map(function (chunk) {
                return apiFetch(
                    '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                    '/values/timeseries?keys=flowRate' +
                    '&startTs=' + chunk.s +
                    '&endTs=' + chunk.e +
                    '&limit=100000&agg=NONE&orderBy=ASC'
                ).catch(function () { return { flowRate: [] }; });
            }));
            // Fetch previous 30 days: use mid-period slope (day 7.5 to 22.5)
            // to avoid step functions at boundaries
            var prev30End = startTs - 1;
            var prev30Start = prev30End - (30 * 86400000);
            var midStart = prev30Start + (7.5 * 86400000);   // day 7.5
            var midEnd   = prev30Start + (22.5 * 86400000);  // day 22.5
            // First reading at/after mid-start
            var prevMidFirstP = apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=meterValFlash' +
                '&startTs=' + Math.round(midStart) +
                '&endTs=' + Math.round(midEnd) +
                '&limit=1&agg=NONE&orderBy=ASC'
            ).catch(function () { return null; });
            // Last reading at/before mid-end
            var prevMidLastP = apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=meterValFlash' +
                '&startTs=' + Math.round(midStart) +
                '&endTs=' + Math.round(midEnd) +
                '&limit=1&agg=NONE&orderBy=DESC'
            ).catch(function () { return null; });
            var prevP = Promise.all([prevMidFirstP, prevMidLastP]);
            return Promise.all([meterP, flowP, prevP]);
        }).then(function (results) {
            var data = results[0];
            // Merge all flowRate chunks
            var allFlow = [];
            results[1].forEach(function (chunk) {
                var arr = (chunk && chunk.flowRate) ? chunk.flowRate : [];
                allFlow = allFlow.concat(arr);
            });
            var flowData = { flowRate: allFlow };
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

            var flowRateRaw = (flowData && flowData.flowRate) ? flowData.flowRate : [];
            fetchedFlow = flowRateRaw.map(function (p) {
                var v = parseFloat(p.value);
                return { ts: p.ts, value: v < 0.25 ? 0 : v };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Parse deviceState -- keep timestamps where value is "Not Metering"
            var deviceStateRaw = (data && data.deviceState) ? data.deviceState : [];
            fetchedNotMetering = deviceStateRaw
                .filter(function (p) { return String(p.value).trim() === 'Not Metering'; })
                .map(function (p) { return { ts: p.ts }; })
                .sort(function (a, b) { return a.ts - b.ts; });

            // Parse offset telemetry
            var offsetRaw = (data && data.offset) ? data.offset : [];
            fetchedOffset = offsetRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Process previous 30-day mid-period slope
            var prevMidFirstResult = results[2][0];
            var prevMidLastResult  = results[2][1];
            var prevMidFirstArr = (prevMidFirstResult && prevMidFirstResult.meterValFlash) ? prevMidFirstResult.meterValFlash : [];
            var prevMidLastArr  = (prevMidLastResult && prevMidLastResult.meterValFlash) ? prevMidLastResult.meterValFlash : [];
            prevPeriodRaw = [];
            if (prevMidFirstArr.length > 0 && prevMidLastArr.length > 0) {
                prevPeriodRaw = [
                    { ts: prevMidFirstArr[0].ts, value: parseFloat(prevMidFirstArr[0].value) },
                    { ts: prevMidLastArr[0].ts, value: parseFloat(prevMidLastArr[0].value) }
                ];
            }
            var first = fetchedPoints[0];
            var last  = fetchedPoints[fetchedPoints.length - 1];
            var diff  = last.value - first.value;

            // Normalize previous period to daily intervals aligned with current
            prevPeriodNorm = [];
            prevPeriodDelta = null;
            if (prevPeriodRaw.length < 2) {
                prevBar.style.display = 'flex';
                prevDeltaEl.textContent    = 'N/A';
                currDeltaEl.textContent    = formatNumber(diff);
                deltaCompareEl.textContent = 'No previous data';
                deltaCompareEl.style.color = '#888';
                matchPrevBtn.disabled      = true;
            }
            if (prevPeriodRaw.length >= 2) {
                var prevFirst = prevPeriodRaw[0];
                var prevLast  = prevPeriodRaw[prevPeriodRaw.length - 1];
                // Daily rate from mid-period slope, extrapolate to 30 days
                var midDays = (prevLast.ts - prevFirst.ts) / 86400000;
                var midDelta = prevLast.value - prevFirst.value;
                var prevDailyRate = midDays > 0 ? midDelta / midDays : 0;
                prevPeriodDelta = Math.round(prevDailyRate * 30);

                // Build normalized straight line using daily rate
                var dayMs = 86400000;
                var currentStartDay = Math.floor(first.ts / dayMs) * dayMs;
                var endDateTs = new Date(endDateEl.value).getTime();
                var totalDays = Math.round((endDateTs - currentStartDay) / dayMs);
                prevPeriodNorm = [];
                prevPeriodNorm.push({ ts: first.ts, value: first.value });
                for (var nd = 1; nd <= totalDays; nd++) {
                    prevPeriodNorm.push({
                        ts: currentStartDay + (nd * dayMs),
                        value: Math.round(first.value + (prevDailyRate * nd))
                    });
                }

                // Show comparison bar
                prevDeltaEl.textContent    = formatNumber(prevPeriodDelta);
                currDeltaEl.textContent    = formatNumber(diff);
                var deltaChange = diff - prevPeriodDelta;
                deltaCompareEl.textContent = (deltaChange >= 0 ? '+' : '') + formatNumber(deltaChange);
                deltaCompareEl.style.color = Math.abs(deltaChange) > prevPeriodDelta * 0.2 ? '#c0392b' : '#2e7d32';
                prevBar.style.display      = 'flex';
                matchPrevBtn.disabled      = false;
            }

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
            renderChart(fetchedPoints, correctedParsed, fetchedFlow, dev.name, fetchedNotMetering, fetchedOffset);
            chartPanel.style.display      = 'flex';
            correctionPanel.style.display = 'block';

            hideMessage();

        }).catch(function (e) {
            showMessage('Error loading ' + dev.name + ': ' + e.message, 'error');
        });
    }

    // -- Thin data to max N points by sampling every Nth --
    function thinData(arr, maxPoints) {
        if (!arr || arr.length <= maxPoints) return arr;
        var step = Math.ceil(arr.length / maxPoints);
        var result = [];
        for (var i = 0; i < arr.length; i += step) {
            result.push(arr[i]);
        }
        // Always include last point
        if (result[result.length - 1] !== arr[arr.length - 1]) {
            result.push(arr[arr.length - 1]);
        }
        return result;
    }

    // -- Reload flowRate for visible range (debounced) --
    var flowReloadTimer = null;
    function reloadFlowForRangeDebounced(visMinTs, visMaxTs) {
        if (flowReloadTimer) clearTimeout(flowReloadTimer);
        flowReloadTimer = setTimeout(function () {
            reloadFlowForRange(visMinTs, visMaxTs);
        }, 300);
    }

    function reloadFlowForRange(visMinTs, visMaxTs) {
        if (!selectedDevice) return;
        var sTs = Math.round(visMinTs);
        var eTs = Math.round(visMaxTs);
        var rangeDays = (eTs - sTs) / 86400000;

        // If zoomed out to near full range, use cached fetchedFlow
        var fullStart = new Date(startDateEl.value).getTime();
        var fullEnd = new Date(endDateEl.value).getTime() + 86400000 - 1;
        var fullRange = fullEnd - fullStart;
        var visRange = eTs - sTs;

        if (visRange >= fullRange * 0.9) {
            // Near full zoom -- use original cached data
            var thinned = thinData(fetchedFlow, 10000);
            var flowDataset = thinned.map(function (p) {
                return { x: p.ts, y: p.value };
            });
            if (chartInstance) {
                var flowIdx = -1;
                chartInstance.data.datasets.forEach(function (ds, i) {
                    if (ds.label === 'Flow Rate') flowIdx = i;
                });
                if (flowIdx >= 0) {
                    chartInstance.data.datasets[flowIdx].data = flowDataset;
                    chartInstance.update('none');
                }
            }
            return;
        }

        // For zoomed ranges, fetch in weekly chunks to cover full visible range
        var weekMs = 7 * 86400000;
        var chunks = [];
        for (var cs = sTs; cs < eTs; cs += weekMs) {
            chunks.push({ s: cs, e: Math.min(cs + weekMs - 1, eTs) });
        }

        Promise.all(chunks.map(function (chunk) {
            return apiFetch(
                '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
                '/values/timeseries?keys=flowRate' +
                '&startTs=' + chunk.s +
                '&endTs=' + chunk.e +
                '&limit=100000&agg=NONE&orderBy=ASC'
            ).catch(function () { return { flowRate: [] }; });
        })).then(function (results) {
            var allFlow = [];
            results.forEach(function (r) {
                var arr = (r && r.flowRate) ? r.flowRate : [];
                allFlow = allFlow.concat(arr);
            });

            var newFlow = allFlow.map(function (p) {
                var v = parseFloat(p.value);
                return { ts: p.ts, value: v < 0.25 ? 0 : v };
            }).sort(function (a, b) { return a.ts - b.ts; });

            var thinned = thinData(newFlow, 10000);
            var flowDataset = thinned.map(function (p) {
                return { x: p.ts, y: p.value };
            });

            if (chartInstance) {
                var flowIdx = -1;
                chartInstance.data.datasets.forEach(function (ds, i) {
                    if (ds.label === 'Flow Rate') flowIdx = i;
                });
                if (flowIdx >= 0) {
                    chartInstance.data.datasets[flowIdx].data = flowDataset;
                    chartInstance.update('none');
                }
            }
        });
    }

    // -- Render chart: baseline vs corrected --
    function renderChart(baseline, corrected, flowRate, deviceName, notMetering, offsetData) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        var baseZero = baseline.length > 0 ? baseline[0].value : 0;

        var baselineData = baseline.map(function (p) {
            return { x: p.ts, y: p.value - baseZero };
        });

        var correctedDataset = corrected.map(function (p) {
            return { x: p.ts, y: p.value - baseZero };
        });

        var datasets = [
            {
                label: 'Baseline (meterValFlash)',
                data: baselineData,
                borderColor: '#305680',
                backgroundColor: 'rgba(48, 86, 128, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
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
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: false,
                tension: 0.1,
                borderDash: [6, 3]
            });
        }

        // If preview is active, add preview trace
        if (previewActive && correctedData.length > 0) {
            var previewDataset = correctedData.map(function (p) {
                return { x: p.ts, y: p.value - baseZero };
            });
            datasets.push({
                label: 'Preview (proposed correction)',
                data: previewDataset,
                borderColor: '#f57c00',
                backgroundColor: 'rgba(245, 124, 0, 0.1)',
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: false,
                tension: 0,
                borderDash: [4, 4]
            });
        }

        // Previous period overlay (normalized)
        if (showPrevOverlay && prevPeriodNorm.length > 0) {
            var prevData = prevPeriodNorm.map(function (p) {
                return { x: p.ts, y: p.value - baseZero };
            });
            datasets.push({
                label: 'Previous 30d',
                data: prevData,
                borderColor: 'rgba(156, 39, 176, 0.6)',
                backgroundColor: 'rgba(156, 39, 176, 0.05)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0.1,
                borderDash: [6, 3]
            });
        }

        // Add flowRate on secondary axis (thinned to 500 points max)
        if (flowRate && flowRate.length > 0) {
            var thinnedFlow = thinData(flowRate, 10000);
            var flowData = thinnedFlow.map(function (p) {
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

        // Add "Not Metering" trace -- red points at y=0
        var nmData = notMetering || fetchedNotMetering || [];
        if (nmData.length > 0) {
            var nmDataset = nmData.map(function (p) {
                return { x: p.ts, y: 0 };
            });
            datasets.push({
                label: 'Not Metering',
                data: nmDataset,
                borderColor: 'rgba(211, 47, 47, 0.8)',
                backgroundColor: 'rgba(211, 47, 47, 0.8)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: false,
                showLine: false
            });
        }

        // Add offset trace on secondary axis
        var oData = offsetData || fetchedOffset || [];
        if (oData.length > 0) {
            var thinnedOffset = thinData(oData, 10000);
            var offsetDs = thinnedOffset.map(function (p) {
                return { x: p.ts, y: Math.abs(p.value) };
            });
            datasets.push({
                label: 'Offset',
                data: offsetDs,
                borderColor: 'rgba(56, 142, 60, 0.7)',
                backgroundColor: 'rgba(56, 142, 60, 0.05)',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: false,
                tension: 0,
                yAxisID: 'yOffset'
            });
        }

        var minTs = baseline[0].ts;
        var maxTs = baseline[baseline.length - 1].ts;
        // Extend x-axis to include corrected/preview data and end date
        if (previewActive && correctedData.length > 0) {
            var lastCorr = correctedData[correctedData.length - 1].ts;
            if (lastCorr > maxTs) maxTs = lastCorr;
        }
        var endDateTs = new Date(endDateEl.value).getTime();
        if (endDateTs > maxTs) maxTs = endDateTs;

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                onClick: function () {},
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
                            mode: 'x',
                            onPanComplete: function (ctx) {
                                var xScale = ctx.chart.scales.x;
                                reloadFlowForRangeDebounced(xScale.min, xScale.max);
                            }
                        },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                            onZoomComplete: function (ctx) {
                                var xScale = ctx.chart.scales.x;
                                reloadFlowForRangeDebounced(xScale.min, xScale.max);
                            }
                        },
                        limits: {
                            x: { min: minTs, max: maxTs + 86400000 }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: { day: 'MMM d' },
                            tooltipFormat: 'MMM d, yyyy HH:mm'
                        },
                        ticks: { font: { size: 10 }, maxTicksLimit: 15 },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        min: minTs,
                        max: maxTs
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Usage', font: { size: 11 } },
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
                    },
                    yOffset: {
                        position: 'right',
                        display: oData.length > 0,
                        title: { display: true, text: 'Offset', font: { size: 11 }, color: '#388e3c' },
                        ticks: { font: { size: 10 }, color: '#388e3c' },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        max: 15000
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

    // -- Match Previous button --
    matchPrevBtn.addEventListener('click', function () {
        if (prevPeriodDelta === null || fetchedPoints.length === 0 || prevPeriodRaw.length < 2) return;

        // Calculate daily rate from previous period
        var prevFirst = prevPeriodRaw[0];
        var prevLast  = prevPeriodRaw[prevPeriodRaw.length - 1];
        var prevDays  = (prevLast.ts - prevFirst.ts) / 86400000;
        var dailyRate = prevDays > 0 ? (prevLast.value - prevFirst.value) / prevDays : 0;

        // Build one corrected point per day using previous period slope
        var first = fetchedPoints[0];
        var dayMs = 86400000;
        var startDay = Math.floor(first.ts / dayMs) * dayMs;
        var endDay   = new Date(endDateEl.value).getTime();
        var totalDays = Math.round((endDay - startDay) / dayMs);
        var correctedDiff = Math.round(dailyRate * totalDays);

        correctionVal.value = correctedDiff;
        previewBtn.disabled = false;

        correctedData = [];
        for (var d = 0; d <= totalDays; d++) {
            correctedData.push({
                ts: startDay + (d * dayMs),
                value: Math.round(first.value + (dailyRate * d))
            });
        }

        previewActive = true;
        applyBtn.disabled = false;
        cardCorrDiff.textContent = formatNumber(correctedDiff);
        cardPoints.textContent   = correctedData.length + ' (daily)';

        // Redraw
        reloadCurrentDevice();
        showMessage('Preview: ' + correctedData.length + ' daily points at ' +
            dailyRate.toFixed(2) + '/day (from previous 30d rate). Click Apply to write.', 'info');
    });

    // -- Show/hide previous period overlay --
    showPrevToggle.addEventListener('change', function () {
        showPrevOverlay = showPrevToggle.checked;
        if (selectedDevice && fetchedPoints.length > 0) {
            reloadCurrentDevice();
        }
    });

    function reloadCurrentDevice() {
        if (!selectedDevice) return;

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/values/timeseries?keys=meterValFlash,meterValCorrected' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).then(function (data) {
            var baselineRaw = (data && data.meterValFlash) ? data.meterValFlash : [];
            baselineRaw.sort(function (a, b) { return a.ts - b.ts; });
            fetchedPoints = baselineRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });

            var correctedRaw = (data && data.meterValCorrected) ? data.meterValCorrected : [];
            var correctedParsed = correctedRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            if (fetchedPoints.length === 0) {
                showMessage(selectedDevice.name + ' -- no meterValFlash data in this date range.', 'error');
                return;
            }

            // Update summary cards
            var first = fetchedPoints[0];
            var last  = fetchedPoints[fetchedPoints.length - 1];
            var diff  = last.value - first.value;
            cardStart.textContent     = formatNumber(first.value);
            cardStartDate.textContent = formatDateShort(first.ts);
            cardEnd.textContent       = formatNumber(last.value);
            cardEndDate.textContent   = formatDateShort(last.ts);
            cardDiff.textContent      = formatNumber(diff);
            cardPoints.textContent    = fetchedPoints.length;

            // Replace canvas
            var parent = chartCanvas.parentNode;
            var newCanvas = document.createElement('canvas');
            newCanvas.id = 'w7-chart';
            parent.replaceChild(newCanvas, chartCanvas);
            chartCanvas = newCanvas;

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name, fetchedNotMetering, fetchedOffset);
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
        var dayMs   = 86400000;
        var startDay = Math.floor(first.ts / dayMs) * dayMs;
        var endDay   = new Date(endDateEl.value).getTime();
        var totalDays = Math.round((endDay - startDay) / dayMs);
        var dailyRate = totalDays > 0 ? correctedDiff / totalDays : 0;

        // Build one corrected point per day via linear interpolation
        correctedData = [];
        for (var d = 0; d <= totalDays; d++) {
            correctedData.push({
                ts: startDay + (d * dayMs),
                value: Math.round(first.value + (dailyRate * d))
            });
        }

        previewActive = true;
        applyBtn.disabled = false;
        cardPoints.textContent = correctedData.length + ' (daily)';

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

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name, fetchedNotMetering, fetchedOffset);
            showMessage('Preview: orange dashed line shows proposed correction. Click Apply to write.', 'info');
        });
    });

    // -- Apply correction --
    applyBtn.addEventListener('click', function () {
        if (correctedData.length === 0 || !selectedDevice) return;

        var deviceName = selectedDevice.name;

        var confirmed = confirm(
            'Apply correction to ' + deviceName + '?\n\n' +
            'This will write ' + correctedData.length + ' meterValFlash data points.\n\n' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;

        applyBtn.disabled    = true;
        applyBtn.textContent = 'Deleting old data...';
        hideMessage();

        var deviceId  = selectedDevice.uuid;
        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        // Step 1: Delete existing meterValFlash in date range
        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + deviceId +
            '/timeseries/delete?keys=meterValFlash' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&deleteAllDataForKeys=false',
            { method: 'DELETE' }
        ).then(function () {
            // Step 2: Write corrected daily points
            applyBtn.textContent = 'Applying...';

            var batchSize = 50;
            var batches   = [];
            for (var i = 0; i < correctedData.length; i += batchSize) {
                batches.push(correctedData.slice(i, i + batchSize));
            }

            var successCount = 0;
            var errorCount   = 0;
            processBatch(0);

            function processBatch(batchIndex) {
            if (batchIndex >= batches.length) {
                applyBtn.disabled    = false;
                applyBtn.textContent = 'Apply Correction';
                previewActive = false;

                if (errorCount === 0) {
                    showMessage(
                        'Correction applied -- ' + successCount + ' data points written to meterValFlash.',
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
                            values: { meterValFlash: p.value }
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

        }).catch(function (e) {
            applyBtn.disabled    = false;
            applyBtn.textContent = 'Apply Correction';
            showMessage('Error deleting old data: ' + e.message, 'error');
        });
    });

    // -- Clear Corrected button --
    var clearCorrBtn = document.getElementById('w7-clearCorrBtn');
    clearCorrBtn.addEventListener('click', function () {
        if (!selectedDevice) return;

        var deviceName = selectedDevice.name;
        var confirmed = confirm(
            'Clear ALL meterValFlash data for ' + deviceName + '?\n\n' +
            'This will permanently delete all corrected telemetry for this device.\n\n' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;

        clearCorrBtn.disabled    = true;
        clearCorrBtn.textContent = 'Clearing...';
        hideMessage();

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/timeseries/delete?keys=meterValFlash' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&deleteAllDataForKeys=false',
            { method: 'DELETE' }
        ).then(function () {
            clearCorrBtn.disabled    = false;
            clearCorrBtn.textContent = 'Clear Corrected';
            showMessage('Corrected data cleared for ' + deviceName + '.', 'success');
            correctedData = [];
            previewActive = false;
            applyBtn.disabled   = true;
            previewBtn.disabled = !correctionVal.value;
            correctionVal.value = '';
            cardCorrDiff.textContent = '--';
            reloadCurrentDevice();
        }).catch(function (e) {
            clearCorrBtn.disabled    = false;
            clearCorrBtn.textContent = 'Clear Corrected';
            showMessage('Error clearing corrected data: ' + e.message, 'error');
        });
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

                    var leakP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Leak'
                    ).catch(function () { return []; });

                    var billP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Billable'
                    ).catch(function () { return []; });

                    var reviewP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Billing Review'
                    ).catch(function () { return []; });

                    var instP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Installed'
                    ).catch(function () { return []; });

                    var replP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Replace'
                    ).catch(function () { return []; });

                    var noWaterP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=No Water'
                    ).catch(function () { return []; });

                    return Promise.all([propP, aptP, leakP, billP, reviewP, instP, replP, noWaterP]).then(function (res) {
                        var propArr    = res[0] || [];
                        var aptArr     = res[1] || [];
                        var leakArr    = res[2] || [];
                        var billArr    = res[3] || [];
                        var reviewArr  = res[4] || [];
                        var instArr    = res[5] || [];
                        var replArr    = res[6] || [];
                        var noWaterArr = res[7] || [];
                        dev.property    = propArr.length ? propArr[0].value : '--';
                        dev.apartment   = aptArr.length  ? aptArr[0].value  : '--';
                        dev.leak        = leakArr.length ? (String(leakArr[0].value).toLowerCase() === 'true') : false;
                        dev.billable    = billArr.length ? (String(billArr[0].value).toLowerCase() === 'true') : null;
                        dev.meterReview = reviewArr.length ? (String(reviewArr[0].value).toLowerCase() === 'true') : false;
                        dev.installed   = instArr.length ? (String(instArr[0].value).toLowerCase() === 'true') : false;
                        dev.replace     = replArr.length ? (String(replArr[0].value).toLowerCase() === 'true') : false;
                        dev.noWater     = noWaterArr.length ? (String(noWaterArr[0].value).toLowerCase() === 'true') : false;
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

                // Fetch group-level Engineering Reviewed (with 25-day auto-expire)
                var gId = groupSel.value;
                apiFetch(
                    '/api/plugins/telemetry/ENTITY_GROUP/' + gId +
                    '/values/attributes/SERVER_SCOPE?keys=Engineering Reviewed,Engineering Review Date'
                ).then(function (attrs) {
                    var arr = attrs || [];
                    var engVal = false;
                    var engDate = null;
                    arr.forEach(function (a) {
                        if (a.key === 'Engineering Reviewed') engVal = String(a.value).toLowerCase() === 'true';
                        if (a.key === 'Engineering Review Date') engDate = Number(a.value);
                    });
                    if (engVal && engDate) {
                        var daysSince = (Date.now() - engDate) / 86400000;
                        if (daysSince >= 25) {
                            engVal = false;
                            apiFetch(
                                '/api/plugins/telemetry/ENTITY_GROUP/' + gId + '/attributes/SERVER_SCOPE',
                                { method: 'POST', body: JSON.stringify({ 'Engineering Reviewed': false }) }
                            ).catch(function () {});
                        }
                    }
                    groupEngReviewed = engVal;
                    updateToggleBtn(toggleEngReview, 'Eng Reviewed', groupEngReviewed);
                }).catch(function () {
                    groupEngReviewed = false;
                });

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
