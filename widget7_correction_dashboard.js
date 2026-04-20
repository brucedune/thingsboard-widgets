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
    var cardFwVer           = document.getElementById('w7-cardFwVer');
    var cardFwVerDate       = document.getElementById('w7-cardFwVerDate');
    var cardFwVerTi         = document.getElementById('w7-cardFwVerTi');
    var cardFwVerTiDate     = document.getElementById('w7-cardFwVerTiDate');
    var cardDeviceState     = document.getElementById('w7-cardDeviceState');
    var cardDeviceStateDate = document.getElementById('w7-cardDeviceStateDate');
    var cardActive          = document.getElementById('w7-cardActive');
    var cardActiveDate      = document.getElementById('w7-cardActiveDate');
    var cardGain            = document.getElementById('w7-cardGain');
    var cardGainDate        = document.getElementById('w7-cardGainDate');
    var cardVddAdc          = document.getElementById('w7-cardVddAdc');
    var cardVddAdcDate      = document.getElementById('w7-cardVddAdcDate');
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
    var pick2Btn       = document.getElementById('w7-pick2Btn');
    var pick2Status    = document.getElementById('w7-pick2Status');
    var showPrevToggle = document.getElementById('w7-showPrevToggle');
    var attrToggles    = document.getElementById('w7-attrToggles');
    var toggleBillable = document.getElementById('w7-toggleBillable');
    var toggleReview   = document.getElementById('w7-toggleMeterReview');
    var toggleVacant   = document.getElementById('w7-toggleVacant');
    var toggleNoWater  = document.getElementById('w7-toggleNoWater');
    var toggleLeak     = document.getElementById('w7-toggleLeak');
    var toggleInstalled = document.getElementById('w7-toggleInstalled');
    var toggleReplace  = document.getElementById('w7-toggleReplace');
    var toggleRecalibrate = document.getElementById('w7-toggleRecalibrate');
    // Two sets of counter chips live in the DOM: the first sits inside
    // w7-attrToggles (shown when a device is selected, next to Replace),
    // the second sits in w7-groupCounts (shown once a group is loaded
    // before any device is clicked). Both get updated together.
    var groupCountsPanel         = document.getElementById('w7-groupCounts');
    var countElsTotal         = [document.getElementById('w7-countTotal'),
                                 document.getElementById('w7-countTotal2')];
    var countElsBillableFalse = [document.getElementById('w7-countBillableFalse'),
                                 document.getElementById('w7-countBillableFalse2')];
    var countElsReviewTrue    = [document.getElementById('w7-countBillingReviewTrue'),
                                 document.getElementById('w7-countBillingReviewTrue2')];
    var countElsReplaceTrue   = [document.getElementById('w7-countReplaceTrue'),
                                 document.getElementById('w7-countReplaceTrue2')];
    var countElsNoDevice      = [document.getElementById('w7-countNoDevice'),
                                 document.getElementById('w7-countNoDevice2')];
    var toggleEngReview = document.getElementById('w7-toggleEngReview');
    var filterBillable = document.getElementById('w7-filterBillable');
    var filterReplace  = document.getElementById('w7-filterReplace');
    var filterReview   = document.getElementById('w7-filterReview');
    var movePanel      = document.getElementById('w7-movePanel');
    var moveOwnerType  = document.getElementById('w7-moveOwnerType');
    var moveCustField  = document.getElementById('w7-moveCustomerField');
    var moveCustSel    = document.getElementById('w7-moveCustomerSelect');
    var moveGroupSel   = document.getElementById('w7-moveGroupSelect');
    var moveBtn        = document.getElementById('w7-moveBtn');
    var gen2fwInput    = document.getElementById('w7-gen2fw');
    var gen2fwSetBtn   = document.getElementById('w7-gen2fwSet');
    var fotaVerInput   = document.getElementById('w7-allowTiFotaVer');
    var fotaVerSetBtn  = document.getElementById('w7-allowTiFotaVerSet');
    var modelInput     = document.getElementById('w7-model');
    var modelSetBtn    = document.getElementById('w7-modelSet');
    var flowDirSel     = document.getElementById('w7-flowDir');
    var flowDirSetBtn  = document.getElementById('w7-flowDirSet');
    var flowDirTSEl    = document.getElementById('w7-flowDirTS');
    var flowDirFlipEl  = document.getElementById('w7-flowDirFlippedTS');
    var engReviewBody  = document.getElementById('w7-engReviewBody');
    var engReviewEmpty = document.getElementById('w7-engReviewEmpty');
    var engRefreshBtn  = document.getElementById('w7-engRefreshBtn');
    var engFilterReview = document.getElementById('w7-engFilterReview');
    var attrInputsPanel = document.getElementById('w7-attrInputs');
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
    var pickMode      = false;   // true while user is selecting 2 baseline points
    var pickedPoints  = [];      // { ts, value } -- points clicked on baseline for slope calc
    var fetchedOffset = [];      // { ts, value } -- offset telemetry
    var fetchedFwVer = [];        // { ts, value } -- fwVer telemetry (stepped trace)
    var fetchedFwVerChanges = []; // { ts, fromVer, toVer } -- firmware version change points
    var fetchedEventMeterDelta = []; // { ts, value } -- eventMeterDelta telemetry
    var fetchedVDDA = [];
    var engReviewData = [];
    // Cache of discovered device groups that have Engineering Review Date set.
    // Populated on first full scan; subsequent refreshes reuse it to avoid
    // re-walking all customers + all groups every time.
    // Shift+click the refresh button to force a full rescan.
    var engGroupCache = [];  // [{ groupId, groupName, customer }, ...]
    var engSortCol = 'customer';
    var engSortAsc = true;

    // -- Get JWT token --
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // -- Ask TB's auth service to refresh the JWT. Returns a Promise. --
    // Different TB versions expose different methods; try them in order.
    function refreshToken() {
        try {
            var auth = self.ctx.authService;
            if (auth && typeof auth.refreshJwtToken === 'function') {
                var p = auth.refreshJwtToken();
                // Some versions return a Promise, some an Observable.toPromise
                if (p && typeof p.then === 'function') return p;
                if (p && typeof p.toPromise === 'function') return p.toPromise();
            }
        } catch (e) {}
        return Promise.resolve();
    }

    // -- API fetch (with automatic one-shot retry on 401) --
    // The wrapped fetch calls _doFetch; if it returns 401 we try to refresh
    // the JWT once and retry. This handles the common case where the tab has
    // been idle long enough for the old token to expire but TB's auth service
    // can mint a new one without a full reload.
    function apiFetch(path, options) {
        return _doFetch(path, options).catch(function (err) {
            if (err && err.__status === 401) {
                return refreshToken().then(function () {
                    return _doFetch(path, options);
                });
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
                    e.__status = 401;
                    throw e;
                }
                if (r.status === 401) {
                    var e401 = new Error('HTTP 401 -- ' + path);
                    e401.__status = 401;
                    throw e401;
                }
                if (!r.ok) {
                    return r.text().then(function (errText) {
                        console.error('API Error ' + r.status + ' on ' + path + ':', errText);
                        var e2 = new Error('HTTP ' + r.status + ' -- ' + path);
                        e2.__status = r.status;
                        throw e2;
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

    // ── Populate status cards (deviceState, active, gain, VddAdc) ──
    // tsData        : timeseries response like { deviceState: [{ts,value}], ... }
    // activeAttr    : SERVER_SCOPE attribute object { key, value, lastUpdateTs }
    // latestDeviceTs: latest overall telemetry ts (e.g. last meterValFlash). Used
    //                 as the "last seen active" date when current value is true.
    function updateStatusCards(tsData, activeAttr, latestDeviceTs) {
        tsData = tsData || {};
        function setCard(valEl, dateEl, arr, isNumeric) {
            if (arr && arr.length > 0) {
                var v = arr[0].value;
                if (isNumeric && v != null && !isNaN(parseFloat(v))) {
                    valEl.textContent = formatNumber(v);
                } else {
                    valEl.textContent = (v == null || v === '') ? '--' : String(v);
                }
                dateEl.textContent = formatDateShort(arr[0].ts);
            } else {
                valEl.textContent  = '--';
                dateEl.textContent = '--';
            }
        }
        setCard(cardFwVer,       cardFwVerDate,       tsData.fwVer,       false);
        setCard(cardFwVerTi,     cardFwVerTiDate,     tsData.fwVerTi,     false);
        setCard(cardDeviceState, cardDeviceStateDate, tsData.deviceState, false);
        setCard(cardGain,        cardGainDate,        tsData.gain,        true);
        setCard(cardVddAdc,      cardVddAdcDate,      tsData.VddAdc,      true);

        // Active = SERVER_SCOPE attribute, date = last time value was true
        if (activeAttr && activeAttr.key === 'active') {
            var curVal = activeAttr.value;
            var curIsTrue = (curVal === true || curVal === 'true');
            cardActive.textContent = (curVal == null) ? '--' : String(curVal);
            cardActive.style.color = curIsTrue ? '#2e7d32' : '#c62828';

            // Date semantics:
            //   - When currently TRUE  → latest overall telemetry ts (e.g. most
            //     recent meterValFlash). Moves forward as new data arrives.
            //   - When currently FALSE → attribute.lastUpdateTs. That's the
            //     transition point -- when it was written to false, i.e. when
            //     it last changed from true → false.
            var dateTs = null;
            if (curIsTrue) {
                dateTs = latestDeviceTs || (activeAttr && activeAttr.lastUpdateTs) || null;
            } else if (activeAttr && activeAttr.lastUpdateTs) {
                dateTs = activeAttr.lastUpdateTs;
            }
            cardActiveDate.textContent = dateTs ? formatDateShort(dateTs) : '--';
        } else {
            cardActive.textContent = '--';
            cardActiveDate.textContent = '--';
            cardActive.style.color = '';
        }

        // Color deviceState: green for "Metering", red for "Not Metering"
        if (tsData.deviceState && tsData.deviceState.length > 0) {
            var st = String(tsData.deviceState[0].value || '').toLowerCase();
            cardDeviceState.style.color = st.indexOf('not') !== -1 ? '#c62828'
                                        : st.indexOf('meter') !== -1 ? '#2e7d32'
                                        : '';
        } else {
            cardDeviceState.style.color = '';
        }
    }

    function clearStatusCards() {
        cardFwVer.textContent = '--';
        cardFwVerDate.textContent = '--';
        cardFwVerTi.textContent = '--';
        cardFwVerTiDate.textContent = '--';
        cardDeviceState.textContent = '--';
        cardDeviceStateDate.textContent = '--';
        cardDeviceState.style.color = '';
        cardActive.textContent = '--';
        cardActiveDate.textContent = '--';
        cardActive.style.color = '';
        cardGain.textContent = '--';
        cardGainDate.textContent = '--';
        cardVddAdc.textContent = '--';
        cardVddAdcDate.textContent = '--';
    }

    function updateFetchBtn() {
        fetchBtn.disabled = !(groupSel.value && startDateEl.value && endDateEl.value);
    }

    function resetAll() {
        summaryPanel.style.display    = 'none';
        chartPanel.style.display      = 'none';
        correctionPanel.style.display = 'none';
        attrToggles.style.display     = 'none';
        if (groupCountsPanel) groupCountsPanel.style.display = 'none';
        attrInputsPanel.style.display = 'none';
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
        pick2Btn.disabled = true;
        pickMode = false;
        pickedPoints = [];
        if (pick2Status) pick2Status.textContent = '';
        pick2Btn.textContent = 'Pick 2 Points';
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
        pick2Btn.disabled = true;
        pickMode = false;
        pickedPoints = [];
        if (pick2Status) pick2Status.textContent = '';
        pick2Btn.textContent = 'Pick 2 Points';
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
        // Engineering review table loads on manual refresh only
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
        var billFilter    = filterBillable.value;    // "ALL" or "FALSE"
        var revFilter     = filterReview.value;      // "ALL" or "TRUE"
        var replaceFilter = filterReplace ? filterReplace.value : 'ALL'; // "ALL" or "TRUE"
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
            // Billable filter -- show Billable=FALSE devices, but EXCLUDE
            // those already flagged Replace=TRUE (matches the counter logic:
            // a device queued for replacement is expected to be non-billable
            // and is not actionable under this filter).
            if (show && billFilter === 'FALSE' && dev) {
                if (dev.billable === true || dev.replace === true) show = false;
            }
            // Meter Review filter
            if (show && revFilter === 'TRUE' && dev) {
                if (!dev.meterReview) show = false;
            }
            // Replace filter
            if (show && replaceFilter === 'TRUE' && dev) {
                if (dev.replace !== true) show = false;
            }
            item.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        deviceCount.textContent = visible + ' of ' + allDevices.length + ' devices';
    }

    deviceSearch.addEventListener('input', applyDeviceFilters);
    filterBillable.addEventListener('change', applyDeviceFilters);
    filterReview.addEventListener('change', applyDeviceFilters);
    if (filterReplace) filterReplace.addEventListener('change', applyDeviceFilters);

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
            // Counters depend on Billable / Billing Review / Replace -- refresh
            updateGroupCounts();
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
                // Status icons -- all three can be true at once. Each icon is
                // managed independently; we re-insert in canonical order
                // (🏚️ Vacant → 🚱 No Water → 💧 Leak) so added icons land in
                // the right spot regardless of which attributes changed.
                var existingVac  = nameSpan.querySelector('.w7-vacant-icon');
                var existingNw   = nameSpan.querySelector('.w7-nowater-icon');
                var existingLeak = nameSpan.querySelector('.w7-drop-icon');

                // Remove stale ones
                if (!dev.vacant  && existingVac)  { existingVac.remove();  existingVac  = null; }
                if (!dev.noWater && existingNw)   { existingNw.remove();   existingNw   = null; }
                if (!dev.leak    && existingLeak) { existingLeak.remove(); existingLeak = null; }

                // Ensure each icon exists and is in correct order.
                // Strategy: remove any existing status icons first, then
                // re-append in canonical order. Cheaper than trying to
                // reason about insertBefore targets that may or may not exist.
                if (existingVac)  existingVac.remove();
                if (existingNw)   existingNw.remove();
                if (existingLeak) existingLeak.remove();

                if (dev.vacant) {
                    var vacIcon = document.createElement('span');
                    vacIcon.className = 'w7-vacant-icon';
                    vacIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;font-size:14px;line-height:1;';
                    vacIcon.title = 'Vacant';
                    vacIcon.textContent = '\uD83C\uDFDA\uFE0F';  // 🏚️
                    nameSpan.appendChild(vacIcon);
                }
                if (dev.noWater) {
                    var nwIcon = document.createElement('span');
                    nwIcon.className = 'w7-nowater-icon';
                    nwIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;font-size:14px;line-height:1;';
                    nwIcon.title = 'No Water';
                    nwIcon.textContent = '\uD83D\uDEB1';  // 🚱
                    nameSpan.appendChild(nwIcon);
                }
                if (dev.leak) {
                    var leakIcon = document.createElement('span');
                    leakIcon.className = 'w7-drop-icon';
                    leakIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;';
                    leakIcon.title = 'Leak detected';
                    leakIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#42a5f5" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 5 11.2 5 16a7 7 0 0 0 14 0C19 11.2 12 2 12 2z"/></svg>';
                    nameSpan.appendChild(leakIcon);
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
    toggleVacant.addEventListener('click', function () {
        toggleAttribute('Vacant', 'SERVER_SCOPE', toggleVacant, 'Vacant', 'vacant');
    });
    toggleNoWater.addEventListener('click', function () {
        toggleAttribute('No Water', 'SERVER_SCOPE', toggleNoWater, 'No Water', 'noWater');
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
    // Recalibrate is a SHARED_SCOPE attribute (pushed to device)
    toggleRecalibrate.addEventListener('click', function () {
        toggleAttribute('recalibrate', 'SHARED_SCOPE', toggleRecalibrate, 'Recalibrate', 'recalibrate');
    });

    gen2fwSetBtn.addEventListener('click', function () {
        if (!selectedDevice) return;
        var val = gen2fwInput.value.trim();
        if (!val) { showMessage('Enter a gen2fw value.', 'error'); return; }
        apiFetch('/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid + '/attributes/SHARED_SCOPE',
            { method: 'POST', body: JSON.stringify({ gen2fw: val }) }
        ).then(function () {
            selectedDevice.gen2fw = val;
            showMessage('gen2fw set to ' + val, 'success');
        }).catch(function (e) { showMessage('Failed to set gen2fw: ' + e.message, 'error'); });
    });

    fotaVerSetBtn.addEventListener('click', function () {
        if (!selectedDevice) return;
        var val = fotaVerInput.value.trim();
        if (!val) { showMessage('Enter an allowTiFotaVer value.', 'error'); return; }
        apiFetch('/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid + '/attributes/SHARED_SCOPE',
            { method: 'POST', body: JSON.stringify({ allowTiFotaVer: val }) }
        ).then(function () {
            selectedDevice.allowTiFotaVer = val;
            showMessage('allowTiFotaVer set to ' + val, 'success');
        }).catch(function (e) { showMessage('Failed to set allowTiFotaVer: ' + e.message, 'error'); });
    });

    modelSetBtn.addEventListener('click', function () {
        if (!selectedDevice) return;
        var val = modelInput.value.trim();
        if (!val) { showMessage('Enter a Model value.', 'error'); return; }
        apiFetch('/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid + '/attributes/SHARED_SCOPE',
            { method: 'POST', body: JSON.stringify({ Model: val }) }
        ).then(function () {
            selectedDevice.model = val;
            showMessage('Model set to ' + val, 'success');
        }).catch(function (e) { showMessage('Failed to set Model: ' + e.message, 'error'); });
    });

    flowDirSetBtn.addEventListener('click', function () {
        if (!selectedDevice) return;
        var val = flowDirSel.value;
        if (!val) { showMessage('Select a waterFlowDir value.', 'error'); return; }
        apiFetch('/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid + '/attributes/SHARED_SCOPE',
            { method: 'POST', body: JSON.stringify({ waterFlowDir: parseInt(val) }) }
        ).then(function () {
            selectedDevice.flowDirection = val;
            showMessage('waterFlowDir set to ' + val, 'success');
        }).catch(function (e) { showMessage('Failed to set waterFlowDir: ' + e.message, 'error'); });
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
            // No device selected now -- refresh and show the standalone counter bar
            updateGroupCounts();
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

    // -- Update group counters (total, Billable=FALSE, Billing Review=TRUE, Replace=TRUE) --
    function updateGroupCounts() {
        // Total + Billable FALSE exclude Vacant=TRUE devices:
        //   - Vacant units aren't actionable under billing
        //   - A vacant lot shouldn't inflate the "total" we measure against
        // Billing Review TRUE and Replace TRUE still count across ALL devices
        // (including vacants) since those are hardware/review states unrelated
        // to occupancy.
        var total = 0;
        var billableFalse = 0;
        var reviewTrue = 0;
        var replaceTrue = 0;
        var noDevice = 0;
        allDevices.forEach(function (d) {
            var isVacant = d.vacant === true;
            if (!isVacant) total++;
            // Count Billable=FALSE (excluding Vacant, excluding Replace) --
            // a device being replaced is expected non-billable and not actionable.
            if (!isVacant && d.billable !== true && d.replace !== true) billableFalse++;
            if (d.meterReview === true) reviewTrue++;
            if (d.replace === true) replaceTrue++;
            // "No device assigned" = non-vacant lot with no working meter installed
            if (!isVacant && d.installed !== true) noDevice++;
        });
        function setAll(arr, text, count) {
            arr.forEach(function (el) {
                if (!el) return;
                el.textContent = text;
                if (count != null) el.setAttribute('data-count', count);
            });
        }
        setAll(countElsTotal,         'Total: ' + total, null);
        setAll(countElsBillableFalse, 'Billable FALSE: ' + billableFalse, billableFalse);
        setAll(countElsReviewTrue,    'Billing Review TRUE: ' + reviewTrue, reviewTrue);
        setAll(countElsReplaceTrue,   'Replace TRUE: ' + replaceTrue, replaceTrue);
        setAll(countElsNoDevice,      'No Device: ' + noDevice, noDevice);

        // Show the standalone counter bar ONLY when no device is selected.
        // When attrToggles is visible (a device is selected), that row carries
        // its own copy of the chips -- showing both would double-print.
        if (groupCountsPanel) {
            var deviceSelected = attrToggles && attrToggles.style.display !== 'none';
            groupCountsPanel.style.display = (total > 0 && !deviceSelected) ? 'flex' : 'none';
        }
    }

    // -- Render device list --
    function renderDeviceList() {
        deviceList.innerHTML = '';
        deviceSearch.value   = '';
        updateGroupCounts();

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

            // Status icons -- all three render independently when TRUE.
            // Order: 🏚️ Vacant → 🚱 No Water → 💧 Leak
            if (dev.vacant) {
                var vacIcon = document.createElement('span');
                vacIcon.className = 'w7-vacant-icon';
                vacIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;font-size:14px;line-height:1;';
                vacIcon.title = 'Vacant';
                vacIcon.textContent = '\uD83C\uDFDA\uFE0F';  // 🏚️
                nameSpan.appendChild(vacIcon);
            }
            if (dev.noWater) {
                var nwIcon = document.createElement('span');
                nwIcon.className = 'w7-nowater-icon';
                nwIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;font-size:14px;line-height:1;';
                nwIcon.title = 'No Water';
                nwIcon.textContent = '\uD83D\uDEB1';  // 🚱
                nameSpan.appendChild(nwIcon);
            }
            if (dev.leak) {
                var leakIcon = document.createElement('span');
                leakIcon.className = 'w7-drop-icon';
                leakIcon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;';
                leakIcon.title = 'Leak detected';
                leakIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#42a5f5" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 5 11.2 5 16a7 7 0 0 0 14 0C19 11.2 12 2 12 2z"/></svg>';
                nameSpan.appendChild(leakIcon);
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
        clearStatusCards();
        attrToggles.style.display     = 'flex';
        // Hide the standalone group-counts bar -- attrToggles already carries
        // its own copy of the counter chips when a device is selected.
        if (groupCountsPanel) groupCountsPanel.style.display = 'none';
        attrInputsPanel.style.display = 'flex';
        movePanel.style.display       = 'block';
        updateMoveBtn();
        gen2fwInput.value  = dev.gen2fw || '';
        fotaVerInput.value = dev.allowTiFotaVer || '';
        modelInput.value   = dev.model || '';
        flowDirSel.value   = dev.flowDirection || '';
        flowDirTSEl.textContent = 'TS: --';
        flowDirFlipEl.textContent = 'Flipped: --';
        // Fetch latest flowDirection and flowDirectionFlipped telemetry
        apiFetch('/api/plugins/telemetry/DEVICE/' + dev.uuid +
            '/values/timeseries?keys=flowDirection,flowDirectionFlipped&startTs=0&endTs=' + Date.now() + '&limit=1&agg=NONE&orderBy=DESC'
        ).then(function (tsData) {
            if (tsData && tsData.flowDirection && tsData.flowDirection.length > 0) {
                var fd = tsData.flowDirection[0];
                flowDirTSEl.textContent = 'TS: ' + new Date(fd.ts).toLocaleDateString() + ' val:' + fd.value;
            }
            if (tsData && tsData.flowDirectionFlipped && tsData.flowDirectionFlipped.length > 0) {
                var ff = tsData.flowDirectionFlipped[0];
                flowDirFlipEl.textContent = 'Flipped: ' + ff.value + ' (' + new Date(ff.ts).toLocaleDateString() + ')';
            }
        }).catch(function () {});
        updateToggleBtn(toggleBillable, 'Billable', dev.billable === true);
        updateToggleBtn(toggleReview, 'Billing Review', dev.meterReview === true);
        updateToggleBtn(toggleVacant, 'Vacant', dev.vacant === true);
        updateToggleBtn(toggleNoWater, 'No Water', dev.noWater === true);
        updateToggleBtn(toggleLeak, 'Leak', dev.leak === true);
        updateToggleBtn(toggleInstalled, 'Installed', dev.installed === true);
        updateToggleBtn(toggleReplace, 'Replace', dev.replace === true);
        updateToggleBtn(toggleRecalibrate, 'Recalibrate', dev.recalibrate === true);
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
        pick2Btn.disabled = true;
        pickMode = false;
        pickedPoints = [];
        if (pick2Status) pick2Status.textContent = '';
        pick2Btn.textContent = 'Pick 2 Points';
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
                '/values/timeseries?keys=meterValFlash,meterValCorrected,deviceState,offset,fwVer,eventMeterDelta,VddAdc' +
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
            // Latest status telemetry (deviceState, gain, VddAdc — no date range = most recent)
            var statusP = apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/timeseries?keys=deviceState,gain,VddAdc,fwVer,fwVerTi'
            ).catch(function () { return {}; });
            // "active" is a SERVER_SCOPE attribute (current value + lastUpdateTs)
            var activeAttrP = apiFetch(
                '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                '/values/attributes/SERVER_SCOPE?keys=active'
            ).then(function (arr) {
                return (arr && arr.length > 0) ? arr[0] : null;
            }).catch(function () { return null; });
            return Promise.all([meterP, flowP, prevP, statusP, activeAttrP]);
        }).then(function (results) {
            // Compute latest known telemetry ts (last meterValFlash reading) to
            // use as "last active" date when current active attribute is true.
            var latestTs = null;
            var mvf = (results[0] && results[0].meterValFlash) ? results[0].meterValFlash : [];
            if (mvf.length > 0) {
                // meterValFlash is fetched ASC, so the final entry is the latest
                latestTs = mvf[mvf.length - 1].ts;
            }
            // Update latest status cards (deviceState / active / gain / VddAdc)
            updateStatusCards(results[3] || {}, results[4], latestTs);

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
            var noBaseline   = baselineRaw.length === 0;

            baselineRaw.sort(function (a, b) { return a.ts - b.ts; });
            fetchedPoints = baselineRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });

            // Enable 2-point picker whenever we have baseline data
            pick2Btn.disabled = fetchedPoints.length < 2;

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

            // Parse VddAdc telemetry
            var vddaRaw = (data && data.VddAdc) ? data.VddAdc : [];
            fetchedVDDA = vddaRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).sort(function (a, b) { return a.ts - b.ts; });

            // Parse fwVer telemetry -- group by day, detect day where version changes
            var fwVerRaw = (data && data.fwVer) ? data.fwVer : [];
            fwVerRaw.sort(function (a, b) { return a.ts - b.ts; });
            fetchedFwVer = fwVerRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            });
            fetchedFwVerChanges = [];
            if (fwVerRaw.length > 0) {
                // Group by day, pick most common value per day
                var dayMap = {};
                fwVerRaw.forEach(function (p) {
                    var dayKey = new Date(p.ts).toISOString().slice(0, 10);
                    if (!dayMap[dayKey]) dayMap[dayKey] = {};
                    var v = String(p.value);
                    dayMap[dayKey][v] = (dayMap[dayKey][v] || 0) + 1;
                });
                var dayVers = Object.keys(dayMap).sort().map(function (day) {
                    var counts = dayMap[day];
                    var best = Object.keys(counts).reduce(function (a, b) {
                        return counts[a] >= counts[b] ? a : b;
                    });
                    return { day: day, ver: best };
                });
                for (var di = 1; di < dayVers.length; di++) {
                    if (dayVers[di].ver !== dayVers[di - 1].ver) {
                        fetchedFwVerChanges.push({
                            ts: new Date(dayVers[di].day).getTime(),
                            fromVer: dayVers[di - 1].ver,
                            toVer: dayVers[di].ver
                        });
                    }
                }
            }

            // Parse eventMeterDelta telemetry (filter < 50 gal)
            var emdRaw = (data && data.eventMeterDelta) ? data.eventMeterDelta : [];
            fetchedEventMeterDelta = emdRaw.map(function (p) {
                return { ts: p.ts, value: parseFloat(p.value) };
            }).filter(function (p) {
                return p.value >= 50;
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
            var first = fetchedPoints.length > 0 ? fetchedPoints[0] : null;
            var last  = fetchedPoints.length > 0 ? fetchedPoints[fetchedPoints.length - 1] : null;
            var diff  = (first && last) ? (last.value - first.value) : null;

            // Normalize previous period to daily intervals aligned with current
            prevPeriodNorm = [];
            prevPeriodDelta = null;
            if (prevPeriodRaw.length < 2) {
                prevBar.style.display = 'flex';
                prevDeltaEl.textContent    = 'N/A';
                currDeltaEl.textContent    = (diff == null) ? '--' : formatNumber(diff);
                deltaCompareEl.textContent = 'No previous data';
                deltaCompareEl.style.color = '#888';
                matchPrevBtn.disabled      = true;
            }
            if (prevPeriodRaw.length >= 2 && first) {
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

            // Summary cards -- when baseline is empty, show the selected date
            // range (dates only, values as '--') so the user still sees context.
            var rangeStartTs = new Date(startDateEl.value).getTime();
            var rangeEndTs   = new Date(endDateEl.value).getTime();
            cardStart.textContent     = first ? formatNumber(first.value) : '--';
            cardStartDate.textContent = first ? formatDateShort(first.ts) : formatDateShort(rangeStartTs);
            cardEnd.textContent       = last  ? formatNumber(last.value)  : '--';
            cardEndDate.textContent   = last  ? formatDateShort(last.ts)  : formatDateShort(rangeEndTs);
            cardDiff.textContent      = (diff == null) ? '--' : formatNumber(diff);
            cardCorrDiff.textContent  = corrDiff;
            summaryPanel.style.display = 'block';

            // Render chart even when baseline is empty (other traces may still
            // have data: flow, deviceState, fwVer, etc.)
            renderChart(fetchedPoints, correctedParsed, fetchedFlow, dev.name, fetchedNotMetering, fetchedOffset, fetchedFwVerChanges);
            chartPanel.style.display      = 'flex';
            correctionPanel.style.display = 'block';

            if (noBaseline) {
                // Disable correction controls -- nothing to correct against
                if (previewBtn) previewBtn.disabled = true;
                if (applyBtn)   applyBtn.disabled   = true;
                if (pick2Btn)   pick2Btn.disabled   = true;
                showMessage(dev.name + ' -- no meterValFlash data in this date range (other telemetry loaded).', 'info');
            } else {
                hideMessage();
            }

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

    // -- Add daily variation to linear correction data --
    function addDailyVariation(points, dailyRate) {
        if (points.length < 3) return points;
        var n = points.length;
        var maxJitter = Math.abs(dailyRate) * 0.3;
        if (maxJitter < 0.5) return points;
        var offsets = [0];
        var sum = 0;
        for (var i = 1; i < n - 1; i++) {
            var r = (Math.random() - 0.5) * 2 * maxJitter;
            offsets.push(r);
            sum += r;
        }
        offsets.push(0);
        var correction = sum / (n - 2);
        for (var j = 1; j < n - 1; j++) offsets[j] -= correction;
        var smoothed = [0];
        for (var k = 1; k < n - 1; k++) {
            smoothed.push((offsets[k-1] + offsets[k] + offsets[k+1]) / 3);
        }
        smoothed.push(0);
        var cumOffset = 0;
        var result = [];
        for (var m = 0; m < n; m++) {
            cumOffset += smoothed[m];
            result.push({ ts: points[m].ts, value: Math.round(points[m].value + cumOffset) });
        }
        result[n - 1].value = points[n - 1].value;
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
    function renderChart(baseline, corrected, flowRate, deviceName, notMetering, offsetData, fwVerChanges) {
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

        // Picked points overlay (for 2-point slope selection)
        if (pickedPoints.length > 0) {
            datasets.push({
                label: 'Picked Points',
                data: pickedPoints.map(function (p) { return { x: p.ts, y: p.value - baseZero }; }),
                borderColor: '#d81b60',
                backgroundColor: '#d81b60',
                borderWidth: 0,
                pointRadius: 7,
                pointHoverRadius: 9,
                pointStyle: 'circle',
                showLine: false,
                fill: false,
                order: -1
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

        // Add VddAdc on secondary axis
        if (fetchedVDDA.length > 0) {
            var thinnedVDDA = thinData(fetchedVDDA, 10000);
            datasets.push({
                label: 'VddAdc',
                data: thinnedVDDA.map(function (p) { return { x: p.ts, y: p.value }; }),
                borderColor: 'rgba(255, 152, 0, 0.7)',
                backgroundColor: 'rgba(255, 152, 0, 0.05)',
                borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
                fill: false, tension: 0, yAxisID: 'yVDDA'
            });
        }

        // Add eventMeterDelta as scatter plot on Usage axis
        if (fetchedEventMeterDelta.length > 0) {
            var emdDs = fetchedEventMeterDelta.map(function (p) {
                return { x: p.ts, y: p.value };
            });
            datasets.push({
                label: 'Event Meter Delta',
                data: emdDs,
                borderColor: 'rgba(13, 71, 161, 0.8)',
                backgroundColor: 'rgba(13, 71, 161, 0.8)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointStyle: 'circle',
                fill: false,
                showLine: false,
                yAxisID: 'yEventDelta'
            });
        }

        // When baseline is empty, fall back to the user-selected date range so
        // the x-axis still spans a useful window.
        var rangeStartTs2 = new Date(startDateEl.value).getTime();
        var rangeEndTs2   = new Date(endDateEl.value).getTime() + 86400000 - 1;
        var minTs = baseline.length > 0 ? baseline[0].ts : rangeStartTs2;
        var maxTs = baseline.length > 0 ? baseline[baseline.length - 1].ts : rangeEndTs2;
        // Extend x-axis to include corrected/preview data and end date
        if (previewActive && correctedData.length > 0) {
            var lastCorr = correctedData[correctedData.length - 1].ts;
            if (lastCorr > maxTs) maxTs = lastCorr;
        }
        var endDateTs = new Date(endDateEl.value).getTime();
        if (endDateTs > maxTs) maxTs = endDateTs;

        // Add fwVer change vertical lines as datasets (uses y axis = Usage)
        var fwChanges = fwVerChanges || fetchedFwVerChanges || [];
        if (fwChanges.length > 0) {
            fwChanges.forEach(function (chg) {
                datasets.push({
                    label: 'FW ' + chg.fromVer + ' \u2192 ' + chg.toVer,
                    data: [
                        { x: chg.ts, y: 0 },
                        { x: chg.ts, y: 1 }
                    ],
                    borderColor: 'rgba(255, 87, 34, 0.85)',
                    borderWidth: 3,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    showLine: true,
                    tension: 0,
                    yAxisID: 'yFwVer'
                });
            });
        }

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                onClick: function (evt, _els, chart) {
                    if (!pickMode) return;
                    if (!fetchedPoints || fetchedPoints.length === 0) return;
                    // Convert pixel click -> time via x-scale, then snap to nearest baseline point
                    var xScale = chart.scales.x;
                    if (!xScale) return;
                    var rect = chart.canvas.getBoundingClientRect();
                    var px = evt.native ? (evt.native.clientX - rect.left) : evt.x;
                    var tsClick = xScale.getValueForPixel(px);
                    var nearest = fetchedPoints[0];
                    var bestDiff = Math.abs(nearest.ts - tsClick);
                    for (var i = 1; i < fetchedPoints.length; i++) {
                        var d = Math.abs(fetchedPoints[i].ts - tsClick);
                        if (d < bestDiff) { bestDiff = d; nearest = fetchedPoints[i]; }
                    }
                    handlePickedPoint(nearest);
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
                        position: 'right',
                        title: { display: true, text: 'Usage', font: { size: 11 } },
                        ticks: {
                            font: { size: 10 },
                            callback: function (val) { return Math.round(val).toLocaleString(); }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    yFlow: {
                        position: 'left',
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
                    },
                    yVDDA: {
                        position: 'right',
                        display: fetchedVDDA.length > 0,
                        title: { display: true, text: 'VddAdc', font: { size: 11 }, color: '#ff9800' },
                        ticks: { font: { size: 10 }, color: '#ff9800' },
                        grid: { drawOnChartArea: false },
                        min: 3000,
                        max: 4000
                    },
                    yEventDelta: {
                        position: 'left',
                        display: fetchedEventMeterDelta.length > 0,
                        title: { display: true, text: 'Event Delta', font: { size: 11 }, color: '#0d47a1' },
                        ticks: { font: { size: 10 }, color: '#0d47a1' },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        max: 1000
                    },
                    yFwVer: {
                        display: false,
                        min: 0,
                        max: 1
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

        // Redraw
        reloadCurrentDevice();
        showMessage('Preview: ' + correctedData.length + ' daily points at ' +
            dailyRate.toFixed(2) + '/day (from previous 30d rate). Click Apply to write.', 'info');
    });

    // -- 2-Point Slope picker --
    pick2Btn.addEventListener('click', function () {
        if (pick2Btn.disabled) return;
        if (pickMode) {
            // Cancel active pick mode
            pickMode = false;
            pickedPoints = [];
            pick2Btn.textContent = 'Pick 2 Points';
            pick2Status.textContent = '';
            chartCanvas.style.cursor = '';
            if (selectedDevice && fetchedPoints.length > 0) reloadCurrentDevice();
            return;
        }
        pickMode = true;
        pickedPoints = [];
        pick2Btn.textContent = 'Cancel Pick';
        pick2Status.textContent = 'Click point 1 on baseline...';
        chartCanvas.style.cursor = 'crosshair';
        showMessage('Click two points on the blue Baseline trace to compute slope.', 'info');
    });

    function handlePickedPoint(pt) {
        // Avoid same-timestamp duplicates
        if (pickedPoints.length === 1 && pickedPoints[0].ts === pt.ts) {
            showMessage('Pick a different point (same timestamp as point 1).', 'error');
            return;
        }
        pickedPoints.push({ ts: pt.ts, value: pt.value });

        if (pickedPoints.length === 1) {
            pick2Status.textContent = 'Click point 2 on baseline...';
            // Redraw so marker appears
            if (chartInstance) {
                var ds = chartInstance.data.datasets.filter(function (d) { return d.label !== 'Picked Points'; });
                var baseZero = fetchedPoints.length > 0 ? fetchedPoints[0].value : 0;
                ds.push({
                    label: 'Picked Points',
                    data: pickedPoints.map(function (p) { return { x: p.ts, y: p.value - baseZero }; }),
                    borderColor: '#d81b60',
                    backgroundColor: '#d81b60',
                    borderWidth: 0,
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    pointStyle: 'circle',
                    showLine: false,
                    fill: false,
                    order: -1
                });
                chartInstance.data.datasets = ds;
                chartInstance.update('none');
            }
            return;
        }

        // Two points collected -- compute slope and apply correction
        pickMode = false;
        pick2Btn.textContent = 'Pick 2 Points';
        chartCanvas.style.cursor = '';

        // Sort by ts so slope direction is predictable
        pickedPoints.sort(function (a, b) { return a.ts - b.ts; });
        var p1 = pickedPoints[0];
        var p2 = pickedPoints[1];
        var days = (p2.ts - p1.ts) / 86400000;
        if (days <= 0) {
            showMessage('Picked points must be on different days.', 'error');
            pickedPoints = [];
            pick2Status.textContent = '';
            if (selectedDevice && fetchedPoints.length > 0) reloadCurrentDevice();
            return;
        }
        var dailyRate = (p2.value - p1.value) / days;

        // Build one corrected point per day spanning current fetched range, using picked slope
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

        pick2Status.textContent = 'Slope: ' + dailyRate.toFixed(2) + '/day';

        // Redraw with preview + picked markers
        reloadCurrentDevice();
        showMessage('Preview: ' + correctedData.length + ' daily points at ' +
            dailyRate.toFixed(2) + '/day (from 2-point slope). Click Apply to write.', 'info');
    }

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

        // Refresh latest status cards alongside meter data
        var refreshStatusP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/values/timeseries?keys=deviceState,gain,VddAdc,fwVer,fwVerTi'
        ).catch(function () { return {}; });
        var refreshActiveAttrP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + selectedDevice.uuid +
            '/values/attributes/SERVER_SCOPE?keys=active'
        ).then(function (arr) {
            return (arr && arr.length > 0) ? arr[0] : null;
        }).catch(function () { return null; });
        // Refresh uses fetchedPoints latest ts (already loaded from meter data)
        // as "last seen" date when current active is true.
        var latestRefreshTs = (fetchedPoints && fetchedPoints.length > 0)
            ? fetchedPoints[fetchedPoints.length - 1].ts : null;
        Promise.all([refreshStatusP, refreshActiveAttrP])
            .then(function (r) { updateStatusCards(r[0] || {}, r[1], latestRefreshTs); });

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

            // Update summary cards (tolerate empty baseline)
            var first = fetchedPoints.length > 0 ? fetchedPoints[0] : null;
            var last  = fetchedPoints.length > 0 ? fetchedPoints[fetchedPoints.length - 1] : null;
            var diff  = (first && last) ? (last.value - first.value) : null;
            var rangeStartTs = new Date(startDateEl.value).getTime();
            var rangeEndTs   = new Date(endDateEl.value).getTime();
            cardStart.textContent     = first ? formatNumber(first.value) : '--';
            cardStartDate.textContent = first ? formatDateShort(first.ts) : formatDateShort(rangeStartTs);
            cardEnd.textContent       = last  ? formatNumber(last.value)  : '--';
            cardEndDate.textContent   = last  ? formatDateShort(last.ts)  : formatDateShort(rangeEndTs);
            cardDiff.textContent      = (diff == null) ? '--' : formatNumber(diff);

            // Replace canvas
            var parent = chartCanvas.parentNode;
            var newCanvas = document.createElement('canvas');
            newCanvas.id = 'w7-chart';
            parent.replaceChild(newCanvas, chartCanvas);
            chartCanvas = newCanvas;

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name, fetchedNotMetering, fetchedOffset, fetchedFwVerChanges);
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
        var linearData = [];
        for (var d = 0; d <= totalDays; d++) {
            linearData.push({
                ts: startDay + (d * dayMs),
                value: Math.round(first.value + (dailyRate * d))
            });
        }
        correctedData = addDailyVariation(linearData, dailyRate);

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

            renderChart(fetchedPoints, correctedParsed, fetchedFlow, selectedDevice.name, fetchedNotMetering, fetchedOffset, fetchedFwVerChanges);
            showMessage('Preview: orange dashed line shows proposed correction. Click Apply to write.', 'info');
        });
    });

    // -- Helper: delete meterValFlash TS data in a date range --
    function deleteMeterValFlashRange(deviceId, startTs, endTs) {
        return apiFetch(
            '/api/plugins/telemetry/DEVICE/' + deviceId +
            '/timeseries/delete?keys=meterValFlash' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&deleteAllDataForKeys=false',
            { method: 'DELETE' }
        );
    }

    // -- Apply correction --
    applyBtn.addEventListener('click', function () {
        if (correctedData.length === 0 || !selectedDevice) return;

        var deviceName = selectedDevice.name;

        var confirmed = confirm(
            'Apply correction to ' + deviceName + '?\n\n' +
            'This will delete existing meterValFlash data in the date range, then write ' +
            correctedData.length + ' corrected data points.\n\n' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;

        applyBtn.disabled    = true;
        applyBtn.textContent = 'Deleting old data...';
        hideMessage();

        var deviceId  = selectedDevice.uuid;
        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        // Step 1: Delete existing meterValFlash in date range (reuses Clear Corrected logic)
        deleteMeterValFlashRange(deviceId, startTs, endTs).then(function () {
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

        deleteMeterValFlashRange(selectedDevice.uuid, startTs, endTs).then(function () {
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

                // Defensive name resolution: TB normally returns d.name on
                // entity group responses, but we have seen cases where certain
                // groups return entries without name/label on first fetch.
                // Fall back to short UUID so the row is still identifiable.
                var missingNameUuids = [];
                var devices = list.map(function (d) {
                    var uuid = extractId(d.id) || extractId(d) || '';
                    var name = d.name || d.label;
                    if (!name && d.entity) name = d.entity.name || d.entity.label;
                    if (!name) {
                        missingNameUuids.push(uuid);
                        name = uuid ? ('Device …' + uuid.slice(-8)) : '(unnamed)';
                    }
                    return { uuid: uuid, name: name };
                });
                if (missingNameUuids.length > 0) {
                    // Diagnostic: dump the actual response shape for the first
                    // affected entity so we can see what TB actually returned.
                    var sample = list.find(function (d) {
                        return missingNameUuids.indexOf(extractId(d.id) || extractId(d)) !== -1;
                    });
                    console.warn('[w7] ' + missingNameUuids.length +
                        ' device(s) in group returned without a name. Sample payload shown below.',
                        { groupId: groupId, samplePayload: sample, uuids: missingNameUuids });

                    // Backup path: re-fetch canonical device info for those
                    // missing names via /api/device/{uuid} (this endpoint always
                    // returns the proper name). Parallelised, bounded to 25 at
                    // a time to stay polite if many are affected.
                    var backfillBatch = 25;
                    var bfi = 0;
                    var nameByUuid = {};
                    function runBackfill() {
                        if (bfi >= missingNameUuids.length) return Promise.resolve();
                        var slice = missingNameUuids.slice(bfi, bfi + backfillBatch);
                        bfi += backfillBatch;
                        return Promise.all(slice.map(function (uuid) {
                            return apiFetch('/api/device/' + uuid)
                                .then(function (dev) {
                                    if (dev && (dev.name || dev.label)) {
                                        nameByUuid[uuid] = dev.name || dev.label;
                                    }
                                })
                                .catch(function () {});
                        })).then(runBackfill);
                    }
                    // Kick off backfill but don't block the main chain -- the
                    // list renders with UUID suffixes first, then names get
                    // patched in when backfill resolves.
                    runBackfill().then(function () {
                        var patched = 0;
                        Object.keys(nameByUuid).forEach(function (uuid) {
                            var idx = allDevices.findIndex(function (d) { return d.uuid === uuid; });
                            if (idx !== -1) {
                                allDevices[idx].name = nameByUuid[uuid];
                                patched++;
                            }
                        });
                        if (patched > 0) {
                            console.log('[w7] Backfilled ' + patched + ' device name(s) via /api/device/{id}.');
                            renderDeviceList();
                        }
                    });
                }

                showMessage('Loading attributes for ' + devices.length + ' devices...', 'info');

                var promises = devices.map(function (dev) {
                    var srvP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=' +
                        encodeURIComponent('Apartment,Leak,Billable,Billing Review,Installed,Replace,No Water,Vacant')
                    ).catch(function () { return []; });

                    var shrP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + dev.uuid +
                        '/values/attributes/SHARED_SCOPE?keys=' +
                        encodeURIComponent('Property,gen2fw,allowTiFotaVer,Model,waterFlowDir,recalibrate')
                    ).catch(function () { return []; });

                    return Promise.all([srvP, shrP]).then(function (res) {
                        var srvMap = {};
                        (res[0] || []).forEach(function (a) { srvMap[a.key] = a.value; });
                        var shrMap = {};
                        (res[1] || []).forEach(function (a) { shrMap[a.key] = a.value; });
                        dev.property    = shrMap.Property || '--';
                        dev.apartment   = srvMap.Apartment || '--';
                        dev.leak        = String(srvMap.Leak || '').toLowerCase() === 'true';
                        dev.billable    = srvMap.Billable !== undefined ? String(srvMap.Billable).toLowerCase() === 'true' : null;
                        dev.meterReview = String(srvMap['Billing Review'] || '').toLowerCase() === 'true';
                        dev.installed   = String(srvMap.Installed || '').toLowerCase() === 'true';
                        dev.replace     = String(srvMap.Replace || '').toLowerCase() === 'true';
                        dev.noWater     = String(srvMap['No Water'] || '').toLowerCase() === 'true';
                        dev.vacant      = String(srvMap['Vacant'] || '').toLowerCase() === 'true';
                        dev.gen2fw          = shrMap.gen2fw ? String(shrMap.gen2fw) : '';
                        dev.allowTiFotaVer  = shrMap.allowTiFotaVer ? String(shrMap.allowTiFotaVer) : '';
                        dev.model           = shrMap.Model ? String(shrMap.Model) : '';
                        dev.flowDirection   = shrMap.waterFlowDir ? String(shrMap.waterFlowDir) : '';
                        dev.recalibrate     = String(shrMap.recalibrate || '').toLowerCase() === 'true';
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

    // -- Engineering Review Table --
    // Refresh: uses cache if populated (attribute-only refresh).
    // Shift+click forces a full rescan (for when new groups have been added).
    if (engRefreshBtn) engRefreshBtn.title = 'Refresh (Shift+click to force full rescan)';
    engRefreshBtn.addEventListener('click', function (e) {
        loadEngReviewTable(!!e.shiftKey);
    });

    engFilterReview.addEventListener('change', function () {
        renderEngReviewTable();
    });

    var engSetAllFalseBtn = document.getElementById('w7-engSetAllFalse');
    engSetAllFalseBtn.addEventListener('click', function () {
        // RESET operates on ALL device groups (ignores the current filter).
        // Skip groups already FALSE -- setting FALSE on already-FALSE is a
        // no-op that still generates an API call.
        var visible = engReviewData.filter(function (row) { return row.reviewed === true; });

        if (visible.length === 0) {
            showMessage('No groups to reset -- all already FALSE.', 'info');
            return;
        }

        if (!confirm('Reset review state to FALSE for ALL ' + visible.length + ' group(s) currently TRUE?')) return;

        engSetAllFalseBtn.disabled = true;
        engSetAllFalseBtn.textContent = 'Resetting...';
        var idx = 0;

        function setNext() {
            if (idx >= visible.length) {
                engSetAllFalseBtn.disabled = false;
                engSetAllFalseBtn.textContent = 'Review State RESET';
                showMessage('Reset ' + visible.length + ' group(s).', 'success');
                renderEngReviewTable();
                return;
            }
            var row = visible[idx];
            engSetAllFalseBtn.textContent = 'Resetting ' + (idx + 1) + '/' + visible.length + '...';
            apiFetch('/api/plugins/telemetry/ENTITY_GROUP/' + row.groupId + '/attributes/SERVER_SCOPE',
                { method: 'POST', body: JSON.stringify({ 'Engineering Reviewed': false, 'Engineering Review Date': Date.now() }) }
            ).then(function () {
                row.reviewed = false;
                row.reviewDate = Date.now();
                idx++;
                setNext();
            }).catch(function () {
                idx++;
                setNext();
            });
        }
        setNext();
    });

    // Sortable eng review headers
    var engHeaderLabels = {};
    var engHeaders = document.querySelectorAll('.w7-eng-sortable');
    engHeaders.forEach(function (th) {
        engHeaderLabels[th.dataset.col] = th.textContent;
        th.addEventListener('click', function () {
            var col = th.dataset.col;
            if (engSortCol === col) {
                engSortAsc = !engSortAsc;
            } else {
                engSortCol = col;
                engSortAsc = true;
            }
            engHeaders.forEach(function (h) {
                h.textContent = engHeaderLabels[h.dataset.col];
            });
            th.textContent = engHeaderLabels[col] + (engSortAsc ? ' \u25B2' : ' \u25BC');
            renderEngReviewTable();
        });
    });

    function loadEngReviewTable(forceRescan) {
        engReviewBody.innerHTML = '';
        engReviewEmpty.style.display = 'block';
        engReviewData = [];

        if (!currentUser) {
            engReviewEmpty.textContent = 'Error: no user loaded. Load a device group first.';
            return;
        }

        // Fast path: use the cached group list, just re-fetch the current
        // Engineering Reviewed / Date attrs for each cached group.
        if (!forceRescan && engGroupCache.length > 0) {
            refreshEngReviewedAttrsFromCache();
            return;
        }

        engReviewEmpty.textContent = 'Scanning owners...';
        engGroupCache = [];  // rebuild on full scan
        var tenantId = extractId(currentUser.tenantId);
        var owners = [{ type: 'TENANT', id: tenantId, name: 'Tenant' }];

        // Paginated customer fetch
        function fetchCustomers(page, allCusts) {
            return apiFetch('/api/customers?pageSize=1000&page=' + page).then(function (resp) {
                var list = (resp && resp.data) ? resp.data.filter(Boolean) : [];
                allCusts = allCusts.concat(list);
                if (resp && resp.hasNext) {
                    return fetchCustomers(page + 1, allCusts);
                }
                return allCusts;
            });
        }

        fetchCustomers(0, []).then(function (custs) {
            custs.forEach(function (c) {
                owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' });
            });
            return owners;
        }).then(function (owners) {
            var ownerIdx = 0;

            function processNextOwner() {
                if (ownerIdx >= owners.length) {
                    if (engReviewData.length === 0) {
                        engReviewEmpty.textContent = 'No groups with Engineering Review Date found.';
                    } else {
                        engReviewEmpty.style.display = 'none';
                    }
                    renderEngReviewTable();
                    return;
                }

                var owner = owners[ownerIdx];
                engReviewEmpty.textContent = 'Scanning ' + owner.name + '... ' + engReviewData.length + ' groups';

                apiFetch('/api/entityGroups/' + owner.type + '/' + owner.id + '/DEVICE')
                    .then(function (groups) {
                        var list = (groups || []).filter(function (g) { return g && g.name !== 'All'; });
                        if (list.length === 0) {
                            ownerIdx++;
                            processNextOwner();
                            return;
                        }

                        // Process groups in batches of 3
                        var gi = 0;
                        function processGroupBatch() {
                            if (gi >= list.length) {
                                ownerIdx++;
                                processNextOwner();
                                return;
                            }

                            var batch = list.slice(gi, gi + 3);
                            gi += 3;

                            Promise.all(batch.map(function (g) {
                                var gId = extractId(g.id);
                                return apiFetch(
                                    '/api/plugins/telemetry/ENTITY_GROUP/' + gId +
                                    '/values/attributes/SERVER_SCOPE?keys=Engineering Reviewed,Engineering Review Date'
                                ).then(function (attrs) {
                                    var arr = attrs || [];
                                    var reviewed = false;
                                    var reviewDate = null;
                                    arr.forEach(function (a) {
                                        if (a.key === 'Engineering Reviewed') reviewed = String(a.value).toLowerCase() === 'true';
                                        if (a.key === 'Engineering Review Date') reviewDate = Number(a.value);
                                    });
                                    if (reviewDate) {
                                        engReviewData.push({
                                            customer: owner.name,
                                            groupName: g.name,
                                            groupId: gId,
                                            reviewDate: reviewDate,
                                            reviewed: reviewed
                                        });
                                        // Remember this group for subsequent
                                        // attribute-only refreshes (no rediscovery)
                                        engGroupCache.push({
                                            groupId: gId,
                                            groupName: g.name,
                                            customer: owner.name
                                        });
                                    }
                                }).catch(function () {});
                            })).then(function () {
                                engReviewEmpty.textContent = 'Scanning ' + owner.name + '... ' + engReviewData.length + ' groups';
                                processGroupBatch();
                            });
                        }
                        processGroupBatch();
                    })
                    .catch(function () {
                        ownerIdx++;
                        processNextOwner();
                    });
            }
            processNextOwner();
        }).catch(function (e) {
            engReviewEmpty.textContent = 'Error loading: ' + e.message;
        });
    }

    // Fast refresh: keeps the cached group list, only re-fetches the current
    // Engineering Reviewed / Engineering Review Date attrs for each group.
    // Runs in parallel batches of 5.
    function refreshEngReviewedAttrsFromCache() {
        engReviewEmpty.textContent = 'Refreshing ' + engGroupCache.length + ' cached groups...';
        engReviewData = [];
        var idx = 0;
        var batchSize = 5;

        function next() {
            if (idx >= engGroupCache.length) {
                if (engReviewData.length === 0) {
                    engReviewEmpty.textContent = 'No groups with Engineering Review Date found.';
                } else {
                    engReviewEmpty.style.display = 'none';
                }
                renderEngReviewTable();
                return;
            }
            var batch = engGroupCache.slice(idx, idx + batchSize);
            idx += batchSize;
            Promise.all(batch.map(function (g) {
                return apiFetch(
                    '/api/plugins/telemetry/ENTITY_GROUP/' + g.groupId +
                    '/values/attributes/SERVER_SCOPE?keys=Engineering Reviewed,Engineering Review Date'
                ).then(function (attrs) {
                    var arr = attrs || [];
                    var reviewed = false;
                    var reviewDate = null;
                    arr.forEach(function (a) {
                        if (a.key === 'Engineering Reviewed') reviewed = String(a.value).toLowerCase() === 'true';
                        if (a.key === 'Engineering Review Date') reviewDate = Number(a.value);
                    });
                    if (reviewDate) {
                        engReviewData.push({
                            customer: g.customer,
                            groupName: g.groupName,
                            groupId: g.groupId,
                            reviewDate: reviewDate,
                            reviewed: reviewed
                        });
                    }
                }).catch(function () {});
            })).then(function () {
                engReviewEmpty.textContent = 'Refreshing... ' + Math.min(idx, engGroupCache.length) + '/' + engGroupCache.length;
                next();
            });
        }
        next();
    }

    function renderEngReviewTable() {
        var filterVal = engFilterReview.value;
        var filtered = engReviewData.filter(function (row) {
            if (filterVal === 'TRUE') return row.reviewed === true;
            if (filterVal === 'FALSE') return row.reviewed === false;
            return true;
        });

        // Sort
        filtered.sort(function (a, b) {
            var valA, valB;
            if (engSortCol === 'reviewDate') {
                valA = a.reviewDate || 0;
                valB = b.reviewDate || 0;
            } else if (engSortCol === 'reviewed') {
                valA = a.reviewed ? 1 : 0;
                valB = b.reviewed ? 1 : 0;
            } else {
                valA = (a[engSortCol] || '').toLowerCase();
                valB = (b[engSortCol] || '').toLowerCase();
            }
            if (valA < valB) return engSortAsc ? -1 : 1;
            if (valA > valB) return engSortAsc ? 1 : -1;
            return 0;
        });

        engReviewBody.innerHTML = '';
        var countEl = document.getElementById('w7-engCount');

        if (filtered.length === 0) {
            engReviewEmpty.style.display = 'block';
            engReviewEmpty.textContent = 'No matching groups.';
            countEl.textContent = '0 groups';
            return;
        }
        engReviewEmpty.style.display = 'none';
        countEl.textContent = filtered.length + ' group' + (filtered.length !== 1 ? 's' : '');

        filtered.forEach(function (row) {
            var div = document.createElement('div');
            div.style.cssText = 'padding:5px 12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:6px;cursor:default;';

            var nameText = document.createElement('span');
            nameText.style.cssText = 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#333;';
            nameText.textContent = row.groupName;

            var dateText = document.createElement('span');
            dateText.style.cssText = 'flex-shrink:0;font-size:11px;color:#666;';
            dateText.textContent = row.reviewDate != null ? String(row.reviewDate) : '--';

            div.appendChild(nameText);
            div.appendChild(dateText);
            engReviewBody.appendChild(div);
        });
    }

};

self.onDestroy = function () {};
