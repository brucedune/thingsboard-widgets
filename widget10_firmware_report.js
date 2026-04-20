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

    // -- Load date adapter --
    var adapterReady = chartReady.then(function () {
        if (window._chartDateAdapterLoaded) return;
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js';
            s.onload  = function () { window._chartDateAdapterLoaded = true; resolve(); };
            s.onerror = function () { reject(new Error('Failed to load date adapter')); };
            document.head.appendChild(s);
        });
    });

    // -- DOM refs (w10- prefix) --
    var fwInput     = document.getElementById('w10-fwInput');
    var fwList      = document.getElementById('w10-fwList');
    var fwAddBtn    = document.getElementById('w10-fwAddBtn');
    var custFilter  = document.getElementById('w10-custFilter');
    var startDateEl = document.getElementById('w10-startDate');
    var endDateEl   = document.getElementById('w10-endDate');
    var countEl     = document.getElementById('w10-count');
    var refreshBtn  = document.getElementById('w10-refreshBtn');
    var exportBtn   = document.getElementById('w10-exportBtn');
    var statusMsg   = document.getElementById('w10-statusMsg');
    var deviceSearch = document.getElementById('w10-deviceSearch');
    var deviceCount = document.getElementById('w10-deviceCount');
    var deviceList  = document.getElementById('w10-deviceList');
    var emptyMsg    = document.getElementById('w10-empty');
    var sortSelect  = document.getElementById('w10-sortSelect');
    var sortDirBtn  = document.getElementById('w10-sortDir');
    var prevDevBtn  = document.getElementById('w10-prevDevBtn');
    var nextDevBtn  = document.getElementById('w10-nextDevBtn');
    var chartSide   = document.getElementById('w10-chartSide');
    var chartTitle  = document.getElementById('w10-chartTitle');
    var chartClose  = document.getElementById('w10-chartClose');
    var chartCanvas = document.getElementById('w10-chart');
    var chartPlaceholder = document.getElementById('w10-chartPlaceholder');
    var filterRow   = document.getElementById('w10-filterRow');
    var ownerTypeSel  = document.getElementById('w10-ownerType');
    var custScopeField = document.getElementById('w10-custScopeField');
    var custScopeSel  = document.getElementById('w10-custScope');
    var groupScopeField = document.getElementById('w10-groupScopeField');
    var groupScopeSel = document.getElementById('w10-groupScope');

    var currentUser   = null;
    var allCustomers  = [];  // cached customer list
    var allRows       = [];   // full scan results
    var chartInstance = null;
    var selectedRow   = null;

    // -- Firmware version lookup table (Tenant SERVER_SCOPE attribute) --
    var FW_ATTR_KEY = 'w10_fwVersions';
    var fwLookupCache = [];

    function loadFwLookupFromTB() {
        if (!currentUser) return Promise.resolve([]);
        var tenantId = extractId(currentUser.tenantId);
        return apiFetch(
            '/api/plugins/telemetry/TENANT/' + tenantId +
            '/values/attributes/SERVER_SCOPE?keys=' + FW_ATTR_KEY
        ).then(function (attrs) {
            var list = [];
            (attrs || []).forEach(function (a) {
                if (a.key === FW_ATTR_KEY) {
                    try { list = JSON.parse(a.value); } catch (e) { list = []; }
                }
            });
            fwLookupCache = list;
            refreshFwDatalist();
            return list;
        }).catch(function () { return []; });
    }

    function saveFwLookupToTB() {
        if (!currentUser) return;
        var tenantId = extractId(currentUser.tenantId);
        var body = {};
        body[FW_ATTR_KEY] = JSON.stringify(fwLookupCache);
        apiFetch(
            '/api/plugins/telemetry/TENANT/' + tenantId + '/SERVER_SCOPE',
            { method: 'POST', body: JSON.stringify(body) }
        ).catch(function () { /* silent */ });
    }

    function addFwVersion(ver) {
        if (!ver) return;
        if (fwLookupCache.indexOf(ver) === -1) {
            fwLookupCache.push(ver);
            fwLookupCache.sort();
            saveFwLookupToTB();
            refreshFwDatalist();
        }
    }

    function refreshFwDatalist() {
        fwList.innerHTML = '';
        fwLookupCache.forEach(function (v) {
            var opt = document.createElement('option');
            opt.value = v;
            fwList.appendChild(opt);
        });
    }

    // Default date range: past 30 days
    var now = new Date();
    var d30 = new Date(now.getTime() - 30 * 86400000);
    endDateEl.value   = now.toISOString().slice(0, 10);
    startDateEl.value = d30.toISOString().slice(0, 10);

    // -- Sort state --
    var sortCol = 'customer';
    var sortAsc = true;

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
                if (!r.ok) throw new Error('HTTP ' + r.status + ' -- ' + path);
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

    makeSearchable(custScopeSel);
    makeSearchable(groupScopeSel);
    makeSearchable(custFilter);

    function showMessage(text, type) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w10-message w10-msg-' + (type || 'info');
        statusMsg.style.display = 'block';
    }
    function hideMessage() { statusMsg.style.display = 'none'; }

    // -- Load current user then fetch fw lookup + customers --
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadFwLookupFromTB();
        return loadAllCustomers();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });

    // -- Load all customers (for scope dropdowns) --
    function loadAllCustomers() {
        return apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            allCustomers = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            populateCustScope();
        });
    }

    function populateCustScope() {
        custScopeSel.innerHTML = '<option value="ALL">All</option>';
        allCustomers.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = extractId(c.id);
            opt.textContent = c.title || c.name || '';
            custScopeSel.appendChild(opt);
        });
    }

    function loadGroupScope() {
        groupScopeSel.innerHTML = '<option value="ALL">All</option>';
        groupScopeSel.disabled = true;
        groupScopeField.style.display = 'none';

        if (!currentUser) return;
        var ot = ownerTypeSel.value;
        if (ot === 'ALL') return;

        var ownerId;
        if (ot === 'TENANT') {
            ownerId = extractId(currentUser.tenantId);
        } else {
            ownerId = custScopeSel.value;
            if (!ownerId || ownerId === 'ALL') return;
        }

        groupScopeField.style.display = 'block';
        groupScopeSel.innerHTML = '<option value="">Loading...</option>';

        apiFetch('/api/entityGroups/' + ot + '/' + ownerId + '/DEVICE').then(function (groups) {
            var list = (groups || []).filter(function (g) { return g && g.name !== 'All'; });
            groupScopeSel.innerHTML = '<option value="ALL">All</option>';
            list.forEach(function (g) {
                var opt = document.createElement('option');
                opt.value = extractId(g.id);
                opt.textContent = g.name || g.label || '';
                groupScopeSel.appendChild(opt);
            });
            groupScopeSel.disabled = false;
        }).catch(function () {
            groupScopeSel.innerHTML = '<option value="ALL">All</option>';
            groupScopeSel.disabled = false;
        });
    }

    // -- Scope dropdown events --
    ownerTypeSel.addEventListener('change', function () {
        var ot = ownerTypeSel.value;
        custScopeField.style.display = (ot === 'CUSTOMER') ? 'block' : 'none';
        if (ot === 'TENANT') {
            loadGroupScope();
        } else if (ot === 'CUSTOMER') {
            groupScopeField.style.display = 'none';
        } else {
            groupScopeField.style.display = 'none';
        }
    });

    custScopeSel.addEventListener('change', function () {
        if (custScopeSel.value && custScopeSel.value !== 'ALL') {
            loadGroupScope();
        } else {
            groupScopeField.style.display = 'none';
        }
    });

    // -- Process array in sequential batches of N --
    function batchProcess(items, batchSize, fn) {
        var idx = 0;
        function next() {
            if (idx >= items.length) return Promise.resolve();
            var batch = items.slice(idx, idx + batchSize);
            idx += batchSize;
            return Promise.all(batch.map(fn)).then(next);
        }
        return next();
    }

    // -- Scan a single group for installed devices --
    function scanGroup(gId, gName, ownerName) {
        var filterFw = fwInput.value.trim();
        return apiFetch('/api/entityGroup/' + gId + '/entities?pageSize=1000&page=0')
            .then(function (devResp) {
                var devs = (devResp && devResp.data) ? devResp.data
                         : Array.isArray(devResp) ? devResp : [];
                devs = devs.filter(Boolean);
                if (devs.length === 0) return Promise.resolve();

                // Step 1: Fetch fwVer for all devices in parallel (1 call each)
                return Promise.all(devs.map(function (d) {
                    var uuid = extractId(d.id) || extractId(d);
                    var dName = d.name || d.label || '--';
                    return apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + uuid +
                        '/values/timeseries?keys=fwVer' +
                        '&startTs=0&endTs=' + Date.now() +
                        '&limit=1&agg=NONE&orderBy=DESC'
                    ).then(function (tsData) {
                        var fwVer = '--';
                        var fwTs = 0;
                        if (tsData && tsData.fwVer && tsData.fwVer.length > 0) {
                            fwVer = String(tsData.fwVer[0].value);
                            fwTs  = Number(tsData.fwVer[0].ts);
                        }
                        return { uuid: uuid, name: dName, fwVer: fwVer, fwTs: fwTs };
                    }).catch(function () {
                        return { uuid: uuid, name: dName, fwVer: '--', fwTs: 0 };
                    });
                })).then(function (devResults) {
                    // Step 2: Filter by fwVer if a version is selected
                    var candidates = devResults;
                    if (filterFw) {
                        candidates = devResults.filter(function (d) { return d.fwVer === filterFw; });
                    }
                    if (candidates.length === 0) return Promise.resolve();

                    // Step 3: Fetch Installed attribute only for fwVer matches (1 call each)
                    return Promise.all(candidates.map(function (d) {
                        return apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + d.uuid +
                            '/values/attributes/SERVER_SCOPE?keys=Installed'
                        ).then(function (attrs) {
                            var installed = false;
                            (attrs || []).forEach(function (a) {
                                if (a.key === 'Installed') {
                                    installed = String(a.value).toLowerCase() === 'true';
                                }
                            });
                            if (!installed) return;

                            allRows.push({
                                customer: ownerName,
                                group: gName,
                                name: d.name,
                                uuid: d.uuid,
                                fwVer: d.fwVer,
                                fwTs: d.fwTs
                            });
                            countEl.textContent = allRows.length + ' found...';
                        }).catch(function () {});
                    }));
                });
            }).catch(function () { /* skip group */ });
    }

    // -- Build list of owners to scan based on scope selections --
    function getScanOwners() {
        var tenantId = extractId(currentUser.tenantId);
        var ot = ownerTypeSel.value;

        if (ot === 'TENANT') {
            return Promise.resolve([{ type: 'TENANT', id: tenantId, name: 'Tenant' }]);
        }

        if (ot === 'CUSTOMER') {
            var custId = custScopeSel.value;
            if (custId && custId !== 'ALL') {
                var custName = custScopeSel.options[custScopeSel.selectedIndex].textContent;
                return Promise.resolve([{ type: 'CUSTOMER', id: custId, name: custName }]);
            }
            // All customers
            return apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
                var customers = (resp && resp.data) ? resp.data.filter(Boolean) : [];
                return customers.map(function (c) {
                    return { type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' };
                });
            });
        }

        // ALL - tenant + all customers
        return apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var customers = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var owners = [{ type: 'TENANT', id: tenantId, name: 'Tenant' }];
            customers.forEach(function (c) {
                owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' });
            });
            return owners;
        });
    }

    // -- Scan devices based on scope --
    function scanAll() {
        if (!currentUser) { showMessage('User not loaded yet.', 'error'); return; }

        refreshBtn.disabled    = true;
        refreshBtn.textContent = 'Scanning...';
        exportBtn.disabled     = true;
        allRows = [];
        displayedRows = [];
        deviceList.innerHTML = '';
        emptyMsg.textContent = 'Scanning device groups...';
        emptyMsg.style.display = 'block';
        countEl.textContent = '--';
        hideMessage();

        var specificGroup = groupScopeSel.value && groupScopeSel.value !== 'ALL' ? groupScopeSel.value : null;

        getScanOwners().then(function (owners) {
            // Process owners 3 at a time
            return batchProcess(owners, 3, function (owner) {
                // If a specific group is selected, only scan that group
                if (specificGroup) {
                    var gName = groupScopeSel.options[groupScopeSel.selectedIndex].textContent;
                    return scanGroup(specificGroup, gName, owner.name);
                }

                return apiFetch('/api/entityGroups/' + owner.type + '/' + owner.id + '/DEVICE')
                    .then(function (groups) {
                        var list = (groups || []).filter(function (g) { return g && g.name !== 'All'; });
                        if (list.length === 0) return Promise.resolve();

                        // Process groups 3 at a time
                        return batchProcess(list, 3, function (g) {
                            emptyMsg.textContent = 'Scanning ' + owner.name + ' / ' + (g.name || '') + '...';
                            return scanGroup(extractId(g.id), g.name || g.label || '', owner.name);
                        });
                    }).catch(function () { /* skip owner */ });
            });
        }).then(function () {
            refreshBtn.disabled    = false;
            refreshBtn.textContent = 'Refresh';
            exportBtn.disabled     = allRows.length === 0;
            // Auto-add discovered fwVer values to lookup
            allRows.forEach(function (r) {
                if (r.fwVer && r.fwVer !== '--') addFwVersion(r.fwVer);
            });
            buildFilters();
            filterRow.style.display = allRows.length > 0 ? 'flex' : 'none';
            renderDeviceList();
            showMessage('Scan complete: ' + allRows.length + ' installed devices found.', 'success');
        }).catch(function (e) {
            refreshBtn.disabled    = false;
            refreshBtn.textContent = 'Refresh';
            showMessage('Scan failed: ' + e.message, 'error');
        });
    }

    // -- Build filter dropdowns from data --
    function buildFilters() {
        var customers = {};
        allRows.forEach(function (r) {
            customers[r.customer] = true;
        });

        var curCust = custFilter.value;
        custFilter.innerHTML = '<option value="ALL">All</option>';
        Object.keys(customers).sort().forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            custFilter.appendChild(opt);
        });
        if (curCust && custFilter.querySelector('option[value="' + curCust + '"]')) custFilter.value = curCust;
    }

    // -- Get filtered rows --
    function getFiltered() {
        var fwTerm = fwInput.value.trim().toLowerCase();
        var cust   = custFilter.value;
        return allRows.filter(function (r) {
            if (fwTerm && r.fwVer.toLowerCase().indexOf(fwTerm) === -1) return false;
            if (cust !== 'ALL' && r.customer !== cust) return false;
            return true;
        });
    }

    // -- Get sorted + filtered list --
    var displayedRows = []; // current visible list after filter+sort

    function renderDeviceList() {
        deviceList.innerHTML = '';
        var filtered = getFiltered();

        // Apply search
        var searchTerm = deviceSearch.value.trim().toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(function (r) {
                return r.name.toLowerCase().indexOf(searchTerm) !== -1 ||
                       r.customer.toLowerCase().indexOf(searchTerm) !== -1 ||
                       r.group.toLowerCase().indexOf(searchTerm) !== -1 ||
                       r.fwVer.toLowerCase().indexOf(searchTerm) !== -1;
            });
        }

        if (filtered.length === 0) {
            emptyMsg.textContent = allRows.length === 0
                ? 'No installed devices found.'
                : 'No devices match the current filters.';
            emptyMsg.style.display = 'block';
            deviceCount.textContent = '0 devices';
            countEl.textContent = '0';
            displayedRows = [];
            return;
        }

        emptyMsg.style.display = 'none';

        // Sort
        var col = sortSelect.value;
        filtered.sort(function (a, b) {
            var cmp = 0;
            if (col === 'customer') {
                cmp = a.customer.toLowerCase().localeCompare(b.customer.toLowerCase());
            } else if (col === 'group') {
                cmp = a.group.toLowerCase().localeCompare(b.group.toLowerCase());
            } else if (col === 'name') {
                cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            } else if (col === 'fwVer') {
                cmp = a.fwVer.localeCompare(b.fwVer);
            } else if (col === 'fwDate') {
                cmp = a.fwTs - b.fwTs;
            }
            return sortAsc ? cmp : -cmp;
        });

        displayedRows = filtered;
        deviceCount.textContent = filtered.length + ' devices';
        countEl.textContent = filtered.length + ' devices';

        filtered.forEach(function (r, idx) {
            var div = document.createElement('div');
            div.className = 'w10-device-item';
            if (selectedRow && selectedRow.uuid === r.uuid) div.className += ' w10-active';

            var dateStr = r.fwTs > 0
                ? new Date(r.fwTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '--';

            div.innerHTML =
                '<div class="w10-device-item-name">' + r.name + '</div>' +
                '<div class="w10-device-item-sub">' + r.customer + ' / ' + r.group + ' &mdash; FW: ' + r.fwVer + ' (' + dateStr + ')</div>';

            div.addEventListener('click', function () {
                selectDevice(idx);
            });

            deviceList.appendChild(div);
        });
    }

    function selectDevice(idx) {
        if (idx < 0 || idx >= displayedRows.length) return;
        selectedRow = displayedRows[idx];
        renderDeviceList();
        loadDeviceChart(selectedRow);

        // Scroll selected into view
        var items = deviceList.querySelectorAll('.w10-device-item');
        if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    }

    function getSelectedIndex() {
        if (!selectedRow) return -1;
        for (var i = 0; i < displayedRows.length; i++) {
            if (displayedRows[i].uuid === selectedRow.uuid) return i;
        }
        return -1;
    }

    // -- Nav buttons --
    prevDevBtn.addEventListener('click', function () {
        var idx = getSelectedIndex();
        if (idx > 0) selectDevice(idx - 1);
        else if (displayedRows.length > 0) selectDevice(0);
    });

    nextDevBtn.addEventListener('click', function () {
        var idx = getSelectedIndex();
        if (idx < displayedRows.length - 1) selectDevice(idx + 1);
        else if (displayedRows.length > 0) selectDevice(0);
    });

    // -- Sort controls --
    sortSelect.addEventListener('change', function () { renderDeviceList(); });
    sortDirBtn.addEventListener('click', function () {
        sortAsc = !sortAsc;
        sortDirBtn.innerHTML = sortAsc ? '&#9650;' : '&#9660;';
        renderDeviceList();
    });

    // -- Filter/search handlers --
    deviceSearch.addEventListener('input', renderDeviceList);
    fwInput.addEventListener('input', renderDeviceList);
    custFilter.addEventListener('change', renderDeviceList);

    fwAddBtn.addEventListener('click', function () {
        var val = fwInput.value.trim();
        if (val) {
            addFwVersion(val);
        }
    });

    // -- Refresh --
    refreshBtn.addEventListener('click', function () {
        selectedRow = null;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        chartPlaceholder.style.display = 'flex';
        scanAll();
    });

    // -- Close chart --
    chartClose.addEventListener('click', function () {
        selectedRow = null;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        chartPlaceholder.style.display = 'flex';
        renderDeviceList();
    });

    // -- Load chart for selected device --
    function loadDeviceChart(row) {
        chartPlaceholder.style.display = 'none';
        chartTitle.textContent = row.name + ' -- Loading...';

        var startTs = new Date(startDateEl.value).getTime();
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;

        // Fetch telemetry: meterValFlash, fwVer, flowRate, offset, VddAdc, deviceState, eventMeterDelta
        var tsKeys = 'meterValFlash,meterValCorrected,fwVer,deviceState,offset,VddAdc,eventMeterDelta';
        var mainP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + row.uuid +
            '/values/timeseries?keys=' + tsKeys +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).catch(function () { return {}; });

        var flowP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + row.uuid +
            '/values/timeseries?keys=flowRate' +
            '&startTs=' + startTs +
            '&endTs=' + endTs +
            '&limit=10000&agg=NONE&orderBy=ASC'
        ).catch(function () { return {}; });

        adapterReady.then(function () {
            return Promise.all([mainP, flowP]);
        }).then(function (results) {
            var data = results[0] || {};
            var flowData = results[1] || {};

            // If user clicked a different row while loading, abort
            if (!selectedRow || selectedRow.uuid !== row.uuid) return;

            chartTitle.textContent = row.name;

            // Parse telemetry arrays
            var meterFlash = (data.meterValFlash || []).map(function (p) {
                return { ts: Number(p.ts), value: Number(p.value) };
            });
            var meterCorr = (data.meterValCorrected || []).map(function (p) {
                return { ts: Number(p.ts), value: Number(p.value) };
            });
            var fwVer = (data.fwVer || []).map(function (p) {
                return { ts: Number(p.ts), value: String(p.value) };
            });
            var deviceState = (data.deviceState || []).filter(function (p) {
                return String(p.value) === 'Not Metering';
            }).map(function (p) { return { ts: Number(p.ts) }; });
            var offset = (data.offset || []).map(function (p) {
                return { ts: Number(p.ts), value: Math.abs(Number(p.value)) };
            });
            var vdda = (data.VddAdc || []).map(function (p) {
                return { ts: Number(p.ts), value: Number(p.value) };
            });
            var eventDelta = (data.eventMeterDelta || []).map(function (p) {
                return { ts: Number(p.ts), value: Number(p.value) };
            });
            var flowRate = (flowData.flowRate || []).map(function (p) {
                return { ts: Number(p.ts), value: Number(p.value) };
            });

            // Detect fwVer changes
            var fwChanges = [];
            for (var i = 1; i < fwVer.length; i++) {
                if (fwVer[i].value !== fwVer[i - 1].value) {
                    fwChanges.push({ ts: fwVer[i].ts, fromVer: fwVer[i - 1].value, toVer: fwVer[i].value });
                }
            }

            buildChart(row.name, meterFlash, meterCorr, flowRate, deviceState, offset, vdda, eventDelta, fwChanges, startTs, endTs);
        }).catch(function (e) {
            chartTitle.textContent = row.name + ' -- Error loading data';
        });
    }

    // -- Thin data helper --
    function thinData(arr, maxPts) {
        if (arr.length <= maxPts) return arr;
        var step = arr.length / maxPts;
        var out = [];
        for (var i = 0; i < maxPts; i++) {
            out.push(arr[Math.floor(i * step)]);
        }
        if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
        return out;
    }

    // -- Build chart --
    function buildChart(deviceName, baseline, corrected, flowRate, notMetering, offsetData, vddaData, eventDelta, fwChanges, startTs, endTs) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        if (baseline.length === 0) {
            chartTitle.textContent = deviceName + ' -- No data in range';
            return;
        }

        var baseZero = baseline[0].value;
        var datasets = [];

        // Baseline (meterValFlash)
        var baseData = baseline.map(function (p) { return { x: p.ts, y: p.value - baseZero }; });
        datasets.push({
            label: 'Baseline (meterValFlash)',
            data: baseData,
            borderColor: '#305680',
            backgroundColor: 'rgba(48, 86, 128, 0.08)',
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 4,
            fill: true,
            tension: 0
        });

        // Corrected
        if (corrected.length > 0) {
            var corrData = corrected.map(function (p) { return { x: p.ts, y: p.value - baseZero }; });
            datasets.push({
                label: 'Corrected',
                data: corrData,
                borderColor: '#e65100',
                backgroundColor: 'rgba(230, 81, 0, 0.08)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0
            });
        }

        // Flow Rate
        if (flowRate.length > 0) {
            var thinnedFlow = thinData(flowRate, 5000);
            datasets.push({
                label: 'Flow Rate',
                data: thinnedFlow.map(function (p) { return { x: p.ts, y: p.value }; }),
                borderColor: 'rgba(21, 101, 192, 0.5)',
                borderWidth: 1,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: false,
                tension: 0,
                yAxisID: 'yFlow'
            });
        }

        // Not Metering
        if (notMetering.length > 0) {
            datasets.push({
                label: 'Not Metering',
                data: notMetering.map(function (p) { return { x: p.ts, y: 0 }; }),
                borderColor: 'rgba(211, 47, 47, 0.8)',
                backgroundColor: 'rgba(211, 47, 47, 0.8)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: false,
                showLine: false
            });
        }

        // Offset
        if (offsetData.length > 0) {
            var thinnedOff = thinData(offsetData, 5000);
            datasets.push({
                label: 'Offset',
                data: thinnedOff.map(function (p) { return { x: p.ts, y: p.value }; }),
                borderColor: 'rgba(56, 142, 60, 0.7)',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: false,
                tension: 0,
                yAxisID: 'yOffset'
            });
        }

        // VddAdc
        if (vddaData.length > 0) {
            var thinnedVDDA = thinData(vddaData, 5000);
            datasets.push({
                label: 'VddAdc',
                data: thinnedVDDA.map(function (p) { return { x: p.ts, y: p.value }; }),
                borderColor: 'rgba(255, 152, 0, 0.7)',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 3,
                fill: false,
                tension: 0,
                yAxisID: 'yVDDA'
            });
        }

        // Event Meter Delta
        if (eventDelta.length > 0) {
            datasets.push({
                label: 'Event Meter Delta',
                data: eventDelta.map(function (p) { return { x: p.ts, y: p.value }; }),
                borderColor: 'rgba(13, 71, 161, 0.8)',
                backgroundColor: 'rgba(13, 71, 161, 0.8)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: false,
                showLine: false,
                yAxisID: 'yEventDelta'
            });
        }

        // FW version change vertical lines
        var minTs = baseline[0].ts;
        var maxTs = baseline[baseline.length - 1].ts;
        if (endTs > maxTs) maxTs = endTs;

        fwChanges.forEach(function (chg) {
            datasets.push({
                label: 'FW ' + chg.fromVer + ' \u2192 ' + chg.toVer,
                data: [{ x: chg.ts, y: 0 }, { x: chg.ts, y: 1 }],
                borderColor: 'rgba(255, 87, 34, 0.85)',
                borderWidth: 3,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                showLine: true,
                tension: 0,
                yAxisID: 'yFwVer'
            });
        });

        var ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                plugins: {
                    title: {
                        display: true,
                        text: deviceName + ' -- Baseline vs Corrected',
                        font: { size: 14, weight: '500' },
                        color: '#305680',
                        padding: { bottom: 10 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 10 }, usePointStyle: true }
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
                        ticks: { font: { size: 10 }, maxTicksLimit: 12 },
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
                        display: flowRate.length > 0,
                        title: { display: true, text: 'Flow Rate', font: { size: 11 }, color: '#1565c0' },
                        ticks: { font: { size: 10 }, color: '#1565c0' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    },
                    yOffset: {
                        position: 'right',
                        display: offsetData.length > 0,
                        title: { display: true, text: 'Offset', font: { size: 11 }, color: '#388e3c' },
                        ticks: { font: { size: 10 }, color: '#388e3c' },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        max: 15000
                    },
                    yVDDA: {
                        position: 'right',
                        display: vddaData.length > 0,
                        title: { display: true, text: 'VddAdc', font: { size: 11 }, color: '#ff9800' },
                        ticks: { font: { size: 10 }, color: '#ff9800' },
                        grid: { drawOnChartArea: false },
                        min: 3000,
                        max: 4000
                    },
                    yEventDelta: {
                        position: 'left',
                        display: eventDelta.length > 0,
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

    // -- Export CSV --
    exportBtn.addEventListener('click', function () {
        var filtered = getFiltered();
        if (filtered.length === 0) return;

        var lines = ['Customer,Device Group,Device Name,Firmware Ver,FW Date'];
        filtered.forEach(function (r) {
            var dateStr = r.fwTs > 0
                ? new Date(r.fwTs).toISOString().slice(0, 10)
                : '';
            lines.push(
                '"' + r.customer + '",' +
                '"' + r.group + '",' +
                '"' + r.name + '",' +
                '"' + r.fwVer + '",' +
                '"' + dateStr + '"'
            );
        });

        var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'firmware_report_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    });

};

self.onDestroy = function () {};
