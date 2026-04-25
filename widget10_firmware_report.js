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
    // (FW Version is now a post-scan dropdown in the filter row, not a
    //  free-text input. The Add-to-lookup button + datalist are gone too;
    //  the dropdown is auto-populated from scan results.)
    var custFilter  = document.getElementById('w10-custFilter');
    var groupFilter = document.getElementById('w10-groupFilter');
    var fwFilter    = document.getElementById('w10-fwFilter');
    var modelFilter = document.getElementById('w10-modelFilter');
    var installedFilter = document.getElementById('w10-installedFilter');
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
    // (sort dropdown + direction button removed; default sort is
    //  customer -> group -> name asc, applied in renderDeviceList)
    var prevDevBtn  = document.getElementById('w10-prevDevBtn');
    var nextDevBtn  = document.getElementById('w10-nextDevBtn');
    var chartSide   = document.getElementById('w10-chartSide');
    var chartTitle  = document.getElementById('w10-chartTitle');
    var chartClose  = document.getElementById('w10-chartClose');
    var chartCanvas = document.getElementById('w10-chart');
    var chartPlaceholder = document.getElementById('w10-chartPlaceholder');
    var filterRow   = document.getElementById('w10-filterRow');
    // (Owner Type dropdown removed. Customer Scope is now the top-level
    //  scope picker; Group Scope still cascades from Customer.)
    var custScopeField  = document.getElementById('w10-custScopeField');
    var custScopeSel    = document.getElementById('w10-custScope');
    var groupScopeField = document.getElementById('w10-groupScopeField');
    var groupScopeSel   = document.getElementById('w10-groupScope');
    var engReviewOnly   = document.getElementById('w10-engReviewOnly');
    // (FW Search scope toggle removed -- FW filter is post-scan only now.)

    // Stats panel chips
    var statsRow         = document.getElementById('w10-statsRow');
    var statTotal        = document.getElementById('w10-statTotal');
    var statMetering     = document.getElementById('w10-statMetering');
    var statNotMetering  = document.getElementById('w10-statNotMetering');
    var statHighGain     = document.getElementById('w10-statHighGain');
    var statFwMismatch   = document.getElementById('w10-statFwMismatch');

    // Groups-table DOM refs
    var groupsSection    = document.getElementById('w10-groupsSection');
    var groupsTableBody  = document.getElementById('w10-groupsTableBody');
    var groupsMeta       = document.getElementById('w10-groupsMeta');
    var statCacheInfo    = document.getElementById('w10-statCacheInfo');

    var currentUser   = null;
    var allCustomers  = [];  // cached customer list
    var allRows       = [];   // full scan results
    var chartInstance = null;
    var selectedRow   = null;

    // ── Caches (W7-style) ─────────────────────────────────────────
    // eligibleGroupCache: groups that survived the Eng Review Date filter
    //   shape: [{ ownerType, ownerId, ownerName, groupId, groupName }]
    //   key   = "<scopeKey>:<engReviewMode>"  (scope and Eng filter mode)
    // deviceCache: per-device latest values to avoid re-fetching
    //   shape: { uuid -> { name, installed, fwVer, fwTs, deviceState, deviceStateTs, gain, gainTs, cachedAt } }
    var eligibleGroupCache    = null;
    var eligibleGroupCacheKey = '';
    var deviceCache           = {};
    var lastScanAt            = 0;

    // Build a key that captures the scan scope so changing it auto-invalidates
    function getScopeKey() {
        var cs = (custScopeSel && custScopeSel.value) || '';
        var gs = (groupScopeSel && groupScopeSel.value) || '';
        return cs + '|' + gs;
    }
    function invalidateCaches() {
        eligibleGroupCache    = null;
        eligibleGroupCacheKey = '';
        deviceCache           = {};
    }
    // Auto-invalidate when scope changes
    [custScopeSel, groupScopeSel].forEach(function (el) {
        if (!el) return;
        el.addEventListener('change', invalidateCaches);
    });
    if (engReviewOnly) {
        engReviewOnly.addEventListener('change', function () {
            // Eng review toggle changes which groups are eligible -- drop the
            // group cache but keep per-device cache (device data unchanged).
            eligibleGroupCache    = null;
            eligibleGroupCacheKey = '';
        });
    }

    // Stats updater -- reflects the current Installed/Customer/Group/Search
    // filters so changing dropdowns updates counts without rescanning.
    function updateStats() {
        var rows = (typeof getFiltered === 'function') ? getFiltered() : allRows;
        var total = rows.length;
        var metering = 0, notMetering = 0, highGain = 0;
        rows.forEach(function (r) {
            if (r.deviceState === 'Metering')      metering++;
            else if (r.deviceState === 'Not Metering') notMetering++;
            if (r.gain != null && Number(r.gain) > 40) highGain++;
        });
        statTotal.textContent       = 'Total: ' + total;
        statMetering.textContent    = 'Metering: ' + metering;
        statNotMetering.textContent = 'Not Metering: ' + notMetering;
        statHighGain.textContent    = 'Gain > 40: ' + highGain;
        statMetering.setAttribute('data-count', metering);
        statNotMetering.setAttribute('data-count', notMetering);
        statHighGain.setAttribute('data-count', highGain);

        // FW Mismatch -- counts FOTA stragglers in groups TARGETING the
        // selected fwVer (group-level gen2fw == fwTarget). This makes the
        // chip consistent with the Engineering Reviewed Groups table.
        if (statFwMismatch) {
            var fwTarget = fwFilter ? fwFilter.value : 'ALL';
            if (fwTarget && fwTarget !== 'ALL') {
                // Build set of "ownerName||groupName" for groups whose gen2fw
                // matches the target (and have a review date set).
                var targetGroups = {};
                (eligibleGroupCache || []).forEach(function (g) {
                    if (g.reviewDate > 0 && String(g.gen2fw) === String(fwTarget)) {
                        targetGroups[g.ownerName + '||' + g.groupName] = true;
                    }
                });
                var rowsIgnoringFw = getFilteredIgnoringFw();
                var mismatch = 0;
                rowsIgnoringFw.forEach(function (r) {
                    if (!targetGroups[r.customer + '||' + r.group]) return;
                    if (r.fwVer !== fwTarget) mismatch++;
                });
                statFwMismatch.style.display = 'inline-flex';
                statFwMismatch.textContent = 'FW Mismatch: ' + mismatch;
                statFwMismatch.setAttribute('data-count', mismatch);
                statFwMismatch.title = 'Devices in groups targeting gen2fw="' + fwTarget +
                    '" but on a different fwVer (FOTA stragglers). Matches the Engineering Reviewed Groups table.';
            } else {
                statFwMismatch.style.display = 'none';
            }
        }

        statsRow.style.display = allRows.length > 0 ? 'flex' : 'none';
    }

    // Variant of getFiltered that applies all filters EXCEPT the FW Version
    // filter -- used to compute the "FW Mismatch" count against the selected
    // FW target. Model filter still applies (a mismatch is per-model).
    function getFilteredIgnoringFw() {
        var model     = modelFilter ? modelFilter.value : 'ALL';
        var cust      = custFilter.value;
        var grp       = groupFilter ? groupFilter.value : 'ALL';
        var installed = installedFilter ? installedFilter.value : 'TRUE';
        var searchTerm = (deviceSearch && deviceSearch.value)
            ? deviceSearch.value.trim().toLowerCase() : '';
        return allRows.filter(function (r) {
            if (model !== 'ALL' && r.model    !== model) return false;
            if (cust  !== 'ALL' && r.customer !== cust)  return false;
            if (grp   !== 'ALL' && r.group    !== grp)   return false;
            if (installed === 'TRUE'  && r.installed !== true) return false;
            if (installed === 'FALSE' && r.installed === true) return false;
            if (searchTerm) {
                var hit = r.name.toLowerCase().indexOf(searchTerm) !== -1 ||
                          r.customer.toLowerCase().indexOf(searchTerm) !== -1 ||
                          r.group.toLowerCase().indexOf(searchTerm) !== -1 ||
                          (r.fwVer || '').toLowerCase().indexOf(searchTerm) !== -1;
                if (!hit) return false;
            }
            return true;
        });
    }

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

    // Maintained for backwards-compat with callers (e.g. post-scan it's still
    // called to record discovered fwVer values into the tenant-level lookup);
    // no longer paints into a datalist since the toolbar input is gone.
    function addFwVersion(ver) {
        if (!ver) return;
        if (fwLookupCache.indexOf(ver) === -1) {
            fwLookupCache.push(ver);
            fwLookupCache.sort();
            saveFwLookupToTB();
        }
    }

    // Default date range: past 30 days
    var now = new Date();
    var d30 = new Date(now.getTime() - 30 * 86400000);
    endDateEl.value   = now.toISOString().slice(0, 10);
    startDateEl.value = d30.toISOString().slice(0, 10);

    // -- Sort state --
    var sortCol = 'customer';
    // (sort direction state removed; default ascending)

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

    // Cascade Group Scope from the selected Customer Scope.
    // - "ALL" customer  -> Group scope hidden (we scan everything)
    // - specific customer -> Group scope visible, populated with that customer's groups
    function loadGroupScope() {
        groupScopeSel.innerHTML = '<option value="ALL">All</option>';
        groupScopeSel.disabled = true;
        groupScopeField.style.display = 'none';

        if (!currentUser) return;
        var ownerId = custScopeSel.value;
        if (!ownerId || ownerId === 'ALL') return;

        groupScopeField.style.display = 'block';
        groupScopeSel.innerHTML = '<option value="">Loading...</option>';

        apiFetch('/api/entityGroups/CUSTOMER/' + ownerId + '/DEVICE').then(function (groups) {
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

    // -- Group-level attribute fetch: pulls Engineering Review Date AND
    //    gen2fw (target firmware version for the group). Single-group fetch,
    //    used as the fallback when the batched path fails.
    //    Returns { reviewDate: ms-or-0, gen2fw: 'string-or-empty' }.
    function groupHasEngReview(gId) {
        return apiFetch(
            '/api/plugins/telemetry/ENTITY_GROUP/' + gId +
            '/values/attributes/SERVER_SCOPE?keys=' +
            encodeURIComponent('Engineering Review Date,gen2fw')
        ).then(function (attrs) {
            var arr = attrs || [];
            var reviewDate = 0;
            var gen2fw = '';
            arr.forEach(function (a) {
                if (a.key === 'Engineering Review Date') {
                    var ts = Number(a.value);
                    if (ts > 0) reviewDate = ts;
                } else if (a.key === 'gen2fw') {
                    gen2fw = (a.value == null) ? '' : String(a.value);
                }
            });
            return { reviewDate: reviewDate, gen2fw: gen2fw };
        }).catch(function () { return { reviewDate: 0, gen2fw: '' }; });
    }

    // ── Batched group-attribute fetch via entitiesQuery on ENTITY_GROUP ──
    // Up to ~100 groups in a single API call. Returns map
    //   { groupId -> { reviewDate: ms-or-0, gen2fw: 'string-or-empty' } }
    // Returns null on failure (caller falls back to per-group fetches).
    function fetchBatchGroupAttrs(groupIds) {
        if (!groupIds || groupIds.length === 0) return Promise.resolve({});
        return apiFetch('/api/entitiesQuery/find', {
            method: 'POST',
            body: JSON.stringify({
                entityFilter: {
                    type: 'entityList',
                    entityType: 'ENTITY_GROUP',
                    entityList: groupIds
                },
                pageLink: { pageSize: groupIds.length, page: 0 },
                latestValues: [
                    { type: 'ATTRIBUTE', key: 'Engineering Review Date' },
                    { type: 'ATTRIBUTE', key: 'gen2fw' }
                ]
            })
        }).then(function (resp) {
            var byId = {};
            var data = (resp && resp.data) ? resp.data : [];
            data.forEach(function (entity) {
                var id = entity.entityId && (entity.entityId.id || extractId(entity.entityId));
                if (!id) return;
                var latest = entity.latest || {};
                var attrL  = latest.ATTRIBUTE || {};
                var rawTs  = attrL['Engineering Review Date'] && attrL['Engineering Review Date'].value;
                var rawFw  = attrL.gen2fw && attrL.gen2fw.value;
                var ts     = Number(rawTs);
                byId[id] = {
                    reviewDate: (ts > 0) ? ts : 0,
                    gen2fw:     (rawFw == null || rawFw === '') ? '' : String(rawFw)
                };
            });
            return byId;
        }).catch(function (err) {
            console.warn('[w10] entitiesQuery batch (groups) failed:', err && err.message);
            return null;
        });
    }

    // Chunked variant -- calls fetchBatchGroupAttrs in groups of 100.
    function fetchBatchGroupAttrsChunked(groupIds, chunkSize) {
        chunkSize = chunkSize || 100;
        var result = {};
        var i = 0;
        function next() {
            if (i >= groupIds.length) return Promise.resolve(result);
            var chunk = groupIds.slice(i, i + chunkSize);
            i += chunkSize;
            return fetchBatchGroupAttrs(chunk).then(function (data) {
                if (data === null) return null;  // signal failure
                Object.keys(data).forEach(function (k) { result[k] = data[k]; });
                return next();
            });
        }
        return next();
    }

    // ── Batched device-data fetch via TB's entitiesQuery API ──
    // Returns map { uuid -> { installed, fwVer, fwTs, deviceState, deviceStateTs, gain, gainTs } }
    // for up to ~100 devices in a single API call. Returns null on failure
    // (caller can fall back to the per-device path).
    function fetchBatchDeviceData(uuids) {
        if (!uuids || uuids.length === 0) return Promise.resolve({});
        return apiFetch('/api/entitiesQuery/find', {
            method: 'POST',
            body: JSON.stringify({
                entityFilter: {
                    type: 'entityList',
                    entityType: 'DEVICE',
                    entityList: uuids
                },
                pageLink: { pageSize: uuids.length, page: 0 },
                latestValues: [
                    { type: 'ATTRIBUTE',        key: 'Installed' },
                    { type: 'ATTRIBUTE',        key: 'active' },
                    { type: 'SHARED_ATTRIBUTE', key: 'Model' },
                    { type: 'SHARED_ATTRIBUTE', key: 'Property' },
                    { type: 'TIME_SERIES',      key: 'fwVer' },
                    { type: 'TIME_SERIES',      key: 'deviceState' },
                    { type: 'TIME_SERIES',      key: 'gain' }
                ]
            })
        }).then(function (resp) {
            var byUuid = {};
            var data = (resp && resp.data) ? resp.data : [];
            data.forEach(function (entity) {
                var uuid = entity.entityId && (entity.entityId.id || extractId(entity.entityId));
                if (!uuid) return;
                var latest = entity.latest || {};
                var attrL  = latest.ATTRIBUTE        || {};
                var sharedL = latest.SHARED_ATTRIBUTE || {};
                var tsL    = latest.TIME_SERIES       || {};
                function val(obj, k) {
                    return (obj[k] && obj[k].value !== undefined && obj[k].value !== '') ? obj[k].value : null;
                }
                function tsv(obj, k) {
                    return (obj[k] && obj[k].ts !== undefined) ? (Number(obj[k].ts) || 0) : 0;
                }
                var installedVal = val(attrL, 'Installed');
                var installed    = installedVal != null && String(installedVal).toLowerCase() === 'true';
                var activeVal    = val(attrL, 'active');
                var activeBool   = activeVal != null && String(activeVal).toLowerCase() === 'true';
                // Shared-scope attrs (Model, Property) -- fall back to the
                // catch-all ATTRIBUTE bucket if the TB version returns them
                // there instead of in SHARED_ATTRIBUTE.
                var modelVal = val(sharedL, 'Model');
                if (modelVal == null) modelVal = val(attrL, 'Model');
                var propVal = val(sharedL, 'Property');
                if (propVal == null) propVal = val(attrL, 'Property');
                byUuid[uuid] = {
                    installed:     installed,
                    active:        activeBool,
                    model:         modelVal != null ? String(modelVal) : '',
                    property:      propVal  != null ? String(propVal)  : '',
                    fwVer:         val(tsL, 'fwVer') != null ? String(val(tsL, 'fwVer')) : '--',
                    fwTs:          tsv(tsL, 'fwVer'),
                    deviceState:   val(tsL, 'deviceState') != null ? String(val(tsL, 'deviceState')) : '',
                    deviceStateTs: tsv(tsL, 'deviceState'),
                    gain:          val(tsL, 'gain') != null ? Number(val(tsL, 'gain')) : null,
                    gainTs:        tsv(tsL, 'gain')
                };
            });
            return byUuid;
        }).catch(function (err) {
            console.warn('[w10] entitiesQuery batch failed:', err && err.message);
            return null;
        });
    }

    // ── Chunk uuids into batches of N and fetch each ──
    // Stops on first batch failure, returning whatever succeeded so far.
    function fetchBatchDeviceDataChunked(uuids, chunkSize) {
        chunkSize = chunkSize || 100;
        var result = {};
        var i = 0;
        function next() {
            if (i >= uuids.length) return Promise.resolve(result);
            var chunk = uuids.slice(i, i + chunkSize);
            i += chunkSize;
            return fetchBatchDeviceData(chunk).then(function (data) {
                if (data === null) return null;  // failure
                Object.keys(data).forEach(function (k) { result[k] = data[k]; });
                return next();
            });
        }
        return next();
    }

    // (groupFwMatches removed -- FW filtering is post-scan only via the
    //  fwFilter dropdown in the filter row.)

    // -- Build list of owners to scan based on Customer Scope selection --
    // - "ALL" customer  -> Tenant + all customers
    // - specific customer -> just that one customer
    function getScanOwners() {
        var tenantId = extractId(currentUser.tenantId);
        var custId   = custScopeSel.value;

        if (custId && custId !== 'ALL') {
            var custName = custScopeSel.options[custScopeSel.selectedIndex].textContent;
            return Promise.resolve([{ type: 'CUSTOMER', id: custId, name: custName }]);
        }

        // ALL: Tenant + every customer
        if (allCustomers && allCustomers.length > 0) {
            var owners = [{ type: 'TENANT', id: tenantId, name: 'Tenant' }];
            allCustomers.forEach(function (c) {
                owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' });
            });
            return Promise.resolve(owners);
        }
        return apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var customers = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            allCustomers = customers;
            var owners = [{ type: 'TENANT', id: tenantId, name: 'Tenant' }];
            customers.forEach(function (c) {
                owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || '' });
            });
            return owners;
        });
    }

    // -- Build the eligible-group cache (walks owners, applies Eng Review filter) --
    // Returns flat list of { ownerType, ownerId, ownerName, groupId, groupName,
    // reviewDate, gen2fw }.
    //
    // Three phases:
    //   1. Walk all owners and collect every candidate device-group across them
    //      (one /api/entityGroups call per owner, parallelised in batches of 3)
    //   2. Batch-fetch the Engineering Review Date + gen2fw attributes for ALL
    //      candidate groups via one /api/entitiesQuery/find call per 100 groups
    //      (replaces the old per-group attribute round-trips that took 3-5s)
    //   3. Filter by reviewDate when engReviewMode is on, then collect
    //
    // Falls back to per-group attribute fetches if the batched ENTITY_GROUP
    // query fails (some TB versions might not support entityList queries on
    // ENTITY_GROUP type).
    function discoverEligibleGroups() {
        var engReviewMode = engReviewOnly && engReviewOnly.checked;
        var specificGroup = groupScopeSel.value && groupScopeSel.value !== 'ALL' ? groupScopeSel.value : null;

        return getScanOwners().then(function (owners) {
            // Specific group case: skip discovery, use selection directly
            if (specificGroup) {
                var gName = groupScopeSel.options[groupScopeSel.selectedIndex].textContent;
                return owners.map(function (o) {
                    return { ownerType: o.type, ownerId: o.id, ownerName: o.name,
                             groupId: specificGroup, groupName: gName,
                             reviewDate: 0, gen2fw: '' };
                });
            }

            // Phase 1: collect every candidate device-group across all owners
            emptyMsg.textContent = 'Loading group lists from ' + owners.length + ' owner(s)...';
            var candidates = [];   // [{ owner, group: rawTbGroup }]
            return batchProcess(owners, 3, function (owner) {
                return apiFetch('/api/entityGroups/' + owner.type + '/' + owner.id + '/DEVICE')
                    .then(function (groups) {
                        (groups || []).forEach(function (g) {
                            if (!g || g.name === 'All') return;
                            candidates.push({ owner: owner, group: g });
                        });
                    }).catch(function () { /* skip owner */ });
            }).then(function () {
                if (candidates.length === 0) return [];

                // Phase 2: batch-fetch reviewDate + gen2fw for all candidates.
                // Always fetched so the Engineering Reviewed Groups table can
                // populate even when engReviewMode is OFF (the renderer filters
                // by reviewDate>0 itself).
                var ids = candidates.map(function (c) { return extractId(c.group.id); });
                emptyMsg.textContent = 'Batch fetching attributes for ' + ids.length +
                    ' group(s) (' + Math.ceil(ids.length / 100) + ' calls)...';

                return fetchBatchGroupAttrsChunked(ids, 100).then(function (attrsMap) {
                    if (attrsMap === null) {
                        // Batched path failed -- fall back to per-group fetches
                        console.warn('[w10] Group attr batch failed; falling back to per-group fetches');
                        emptyMsg.textContent = 'Batch unavailable; per-group fetch (slower)...';
                        attrsMap = {};
                        return batchProcess(candidates, 5, function (c) {
                            var gid = extractId(c.group.id);
                            return groupHasEngReview(gid).then(function (a) {
                                attrsMap[gid] = a;
                            });
                        }).then(function () { return attrsMap; });
                    }
                    return attrsMap;
                }).then(function (attrsMap) {
                    // Phase 3: filter and collect
                    var collected = [];
                    var keptCount = 0;
                    candidates.forEach(function (c) {
                        var gid   = extractId(c.group.id);
                        var attrs = attrsMap[gid] || { reviewDate: 0, gen2fw: '' };
                        if (engReviewMode && !(attrs.reviewDate > 0)) return;
                        keptCount++;
                        collected.push({
                            ownerType:  c.owner.type,
                            ownerId:    c.owner.id,
                            ownerName:  c.owner.name,
                            groupId:    gid,
                            groupName:  c.group.name || c.group.label || '',
                            reviewDate: attrs.reviewDate,
                            gen2fw:     attrs.gen2fw
                        });
                    });
                    if (engReviewMode) {
                        emptyMsg.textContent = 'Eng-reviewed groups: ' + keptCount +
                            ' of ' + candidates.length;
                    }
                    return collected;
                });
            });
        });
    }

    // -- Scan devices based on scope --
    // forceRescan = true: invalidate caches and re-discover/refetch everything
    // forceRescan = false (default): reuse caches when available
    function scanAll(forceRescan) {
        if (!currentUser) { showMessage('User not loaded yet.', 'error'); return; }

        refreshBtn.disabled    = true;
        refreshBtn.textContent = forceRescan ? 'Rescanning...' : 'Scanning...';
        exportBtn.disabled     = true;
        allRows = [];
        displayedRows = [];
        deviceList.innerHTML = '';
        emptyMsg.textContent = 'Scanning device groups...';
        emptyMsg.style.display = 'block';
        countEl.textContent = '--';
        hideMessage();

        if (forceRescan) invalidateCaches();

        var scopeKey   = getScopeKey();
        var engOn      = engReviewOnly && engReviewOnly.checked;
        var cacheKey   = scopeKey + '|eng=' + engOn;
        var groupListP;

        if (eligibleGroupCache && eligibleGroupCacheKey === cacheKey) {
            // Reuse cached eligible-group list
            groupListP = Promise.resolve(eligibleGroupCache);
            emptyMsg.textContent = 'Using cached group list (' + eligibleGroupCache.length + ' groups)...';
        } else {
            groupListP = discoverEligibleGroups().then(function (groups) {
                eligibleGroupCache    = groups;
                eligibleGroupCacheKey = cacheKey;
                return groups;
            });
        }

        groupListP.then(function (groups) {
            if (!groups || groups.length === 0) return Promise.resolve();

            // Phase 1: Fetch every group's device list in parallel (5 at a time).
            //   Output: per-group [{uuid, name}, ...]
            //   This is the only fan-out we still do per-group; entity-group
            //   listing must be one call per group (no cross-group endpoint).
            emptyMsg.textContent = 'Loading device lists from ' + groups.length + ' groups...';
            var groupDevs = [];   // [{ group: {ownerName, groupName, groupId}, devs: [{uuid, name}] }]
            var listsLoaded = 0;
            return batchProcess(groups, 5, function (g) {
                return apiFetch('/api/entityGroup/' + g.groupId + '/entities?pageSize=1000&page=0')
                    .then(function (resp) {
                        var devs = (resp && resp.data) ? resp.data
                                 : Array.isArray(resp) ? resp : [];
                        devs = devs.filter(Boolean).map(function (d) {
                            return {
                                uuid: extractId(d.id) || extractId(d),
                                name: d.name || d.label || '--'
                            };
                        });
                        groupDevs.push({ group: g, devs: devs });
                        listsLoaded++;
                        emptyMsg.textContent = 'Loaded ' + listsLoaded + '/' +
                            groups.length + ' device lists...';
                    }).catch(function () {
                        // Skip the group on list-fetch failure; record empty
                        groupDevs.push({ group: g, devs: [] });
                        listsLoaded++;
                    });
            }).then(function () {
                // Phase 2: Collect every UNCACHED uuid across ALL groups,
                //   then chunk into 100-device batches and run the entitiesQuery
                //   API. Cross-group batching means a fleet of 50 small groups
                //   (~20 devices each) becomes ~10 big batch calls instead of
                //   50 small ones.
                var uncached = [];
                groupDevs.forEach(function (gd) {
                    gd.devs.forEach(function (d) {
                        if (!deviceCache[d.uuid]) uncached.push(d.uuid);
                    });
                });
                emptyMsg.textContent = 'Batch fetching ' + uncached.length +
                    ' device(s) (' + Math.ceil(uncached.length / 100) + ' calls)...';
                if (uncached.length === 0) return null;
                return fetchBatchDeviceDataChunked(uncached, 100);
            }).then(function (newData) {
                if (newData === null) {
                    // No-op (everything cached) -- proceed.
                } else if (typeof newData === 'object') {
                    Object.keys(newData).forEach(function (uuid) {
                        deviceCache[uuid] = newData[uuid];
                    });
                }
                // Phase 3: build allRows from cache. FW filtering happens
                //   post-scan via the fwFilter dropdown in the filter row.
                groupDevs.forEach(function (gd) {
                    var owner = gd.group.ownerName;
                    var gName = gd.group.groupName;
                    gd.devs.forEach(function (d) {
                        var rec = deviceCache[d.uuid];
                        if (!rec) return;
                        allRows.push({
                            customer:  owner,
                            group:     gName,
                            name:      d.name,
                            uuid:      d.uuid,
                            installed: rec.installed,
                            active:    rec.active === true,
                            model:     rec.model    || '',
                            property:  rec.property || '',
                            fwVer:     rec.fwVer,
                            fwTs:      rec.fwTs,
                            deviceState:   rec.deviceState,
                            deviceStateTs: rec.deviceStateTs,
                            gain:      rec.gain,
                            gainTs:    rec.gainTs
                        });
                    });
                });
                countEl.textContent = allRows.length + ' found';
            });
        }).then(function () {
            refreshBtn.disabled    = false;
            refreshBtn.textContent = 'Refresh';
            exportBtn.disabled     = allRows.length === 0;
            lastScanAt = Date.now();

            // Auto-add discovered fwVer values to lookup
            allRows.forEach(function (r) {
                if (r.fwVer && r.fwVer !== '--') addFwVersion(r.fwVer);
            });
            buildFilters();
            filterRow.style.display = allRows.length > 0 ? 'flex' : 'none';
            renderDeviceList();
            updateStats();
            renderGroupsTable();

            // Cache indicator: count how many devices came from the cache
            var cachedCount = 0;
            allRows.forEach(function (r) {
                if (deviceCache[r.uuid]) cachedCount++;
            });
            if (statCacheInfo) {
                if (forceRescan || cachedCount === 0) {
                    statCacheInfo.style.display = 'none';
                } else {
                    statCacheInfo.textContent = 'cached: ' + cachedCount + ' / ' + allRows.length;
                    statCacheInfo.style.display = 'inline-flex';
                }
            }

            var msg = 'Scan complete: ' + allRows.length + ' installed devices found' +
                      (forceRescan ? ' (full rescan)' :
                       (eligibleGroupCache ? ' (using cache)' : ''));
            showMessage(msg + '.', 'success');
        }).catch(function (e) {
            refreshBtn.disabled    = false;
            refreshBtn.textContent = 'Refresh';
            showMessage('Scan failed: ' + e.message, 'error');
        });
    }

    // -- Build filter dropdowns from data --
    function buildFilters() {
        var customers = {};
        allRows.forEach(function (r) { customers[r.customer] = true; });

        var curCust = custFilter.value;
        custFilter.innerHTML = '<option value="ALL">All</option>';
        Object.keys(customers).sort().forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            custFilter.appendChild(opt);
        });
        if (curCust && custFilter.querySelector('option[value="' + curCust + '"]')) {
            custFilter.value = curCust;
        }

        // Group dropdown -- cascades from the selected customer
        rebuildGroupFilter();

        // Model dropdown -- one option per unique Model (SHARED) in scan results
        if (modelFilter) {
            var curModel = modelFilter.value;
            var models = {};
            allRows.forEach(function (r) {
                if (r.model) models[r.model] = true;
            });
            modelFilter.innerHTML = '<option value="ALL">All</option>';
            Object.keys(models).sort().forEach(function (m) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modelFilter.appendChild(opt);
            });
            if (curModel && modelFilter.querySelector('option[value="' + curModel + '"]')) {
                modelFilter.value = curModel;
            } else {
                modelFilter.value = 'ALL';
            }
        }

        // FW Version dropdown -- one option per unique fwVer in scan results
        if (fwFilter) {
            var curFw = fwFilter.value;
            var versions = {};
            allRows.forEach(function (r) {
                if (r.fwVer && r.fwVer !== '--') versions[r.fwVer] = true;
            });
            fwFilter.innerHTML = '<option value="ALL">All</option>';
            // Sort numerically when possible (firmware versions like "15143")
            Object.keys(versions).sort(function (a, b) {
                var na = Number(a), nb = Number(b);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.localeCompare(b);
            }).forEach(function (v) {
                var opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                fwFilter.appendChild(opt);
            });
            if (curFw && fwFilter.querySelector('option[value="' + curFw + '"]')) {
                fwFilter.value = curFw;
            } else {
                fwFilter.value = 'ALL';
            }
        }
    }

    // Repopulate the group dropdown based on the currently selected customer.
    // When customer = ALL, lists every group across allRows.
    // Otherwise lists only the groups that belong to the selected customer.
    function rebuildGroupFilter() {
        if (!groupFilter) return;
        var selectedCust = custFilter.value;
        var groups = {};
        allRows.forEach(function (r) {
            if (selectedCust !== 'ALL' && r.customer !== selectedCust) return;
            if (r.group) groups[r.group] = true;
        });

        var curGroup = groupFilter.value;
        groupFilter.innerHTML = '<option value="ALL">All</option>';
        Object.keys(groups).sort().forEach(function (g) {
            var opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            groupFilter.appendChild(opt);
        });
        // Preserve the selection if still valid; otherwise reset to ALL
        if (curGroup && groupFilter.querySelector('option[value="' + curGroup + '"]')) {
            groupFilter.value = curGroup;
        } else {
            groupFilter.value = 'ALL';
        }
    }

    // -- Render the Engineering Reviewed Groups table --
    // Source: eligibleGroupCache (only groups with reviewDate > 0).
    // Per-group device counts come from allRows. The FW Match / Mismatch
    // columns use the currently-selected FW Version filter as the target.
    // When FW filter = "All", match/mismatch columns show "--".
    function renderGroupsTable() {
        if (!groupsTableBody || !groupsSection) return;

        var fwTarget  = fwFilter ? fwFilter.value : 'ALL';
        var hasTarget = fwTarget && fwTarget !== 'ALL';

        // Eligible: has Engineering Review Date AND (when a specific FW
        // version is selected) the group's gen2fw attribute matches that
        // version. When FW filter = "All", show every reviewed group.
        var groupsWithReview = (eligibleGroupCache || []).filter(function (g) {
            if (!(g.reviewDate && g.reviewDate > 0)) return false;
            if (hasTarget && String(g.gen2fw) !== String(fwTarget)) return false;
            return true;
        });

        if (groupsWithReview.length === 0) {
            groupsSection.style.display = 'none';
            groupsTableBody.innerHTML = '';
            if (groupsMeta) groupsMeta.textContent = '';
            return;
        }
        groupsSection.style.display = 'flex';

        // Index allRows by groupId so per-group lookups are cheap.
        var devsByKey = {};
        allRows.forEach(function (r) {
            var key = r.customer + '||' + r.group;
            if (!devsByKey[key]) devsByKey[key] = [];
            devsByKey[key].push(r);
        });

        // Build rows -- sort by mismatch count desc when FW target set,
        // otherwise alphabetically by group name.
        // Per-group device counts respect the dashboard's Installed and
        // Model filters so the table stays consistent with the device list.
        var installedMode = installedFilter ? installedFilter.value : 'TRUE';
        var modelMode     = modelFilter ? modelFilter.value : 'ALL';

        var rows = groupsWithReview.map(function (g) {
            var key = g.ownerName + '||' + g.groupName;
            var devs = devsByKey[key] || [];
            var inScope = devs.filter(function (d) {
                if (installedMode === 'TRUE'  && d.installed !== true) return false;
                if (installedMode === 'FALSE' && d.installed === true) return false;
                if (modelMode !== 'ALL' && d.model !== modelMode) return false;
                return true;
            });
            var match = 0, mismatch = 0;
            if (hasTarget) {
                inScope.forEach(function (d) {
                    if (d.fwVer === fwTarget) match++;
                    else mismatch++;
                });
            }
            return {
                group: g, devices: inScope.length, match: match, mismatch: mismatch
            };
        });

        // When a Model filter is active, hide groups that have zero devices
        // matching that model -- otherwise the table fills with empty rows.
        if (modelMode !== 'ALL') {
            rows = rows.filter(function (r) { return r.devices > 0; });
        }
        if (rows.length === 0) {
            groupsSection.style.display = 'none';
            groupsTableBody.innerHTML = '';
            if (groupsMeta) groupsMeta.textContent = '';
            return;
        }

        rows.sort(function (a, b) {
            if (hasTarget) {
                if (b.mismatch !== a.mismatch) return b.mismatch - a.mismatch;
            }
            return (a.group.groupName || '').toLowerCase()
                   .localeCompare((b.group.groupName || '').toLowerCase());
        });

        // Render
        var totalMismatch = 0;
        groupsTableBody.innerHTML = '';
        rows.forEach(function (row) {
            var tr = document.createElement('tr');
            if (hasTarget && row.mismatch > 0) tr.classList.add('w10-row-mismatch');

            var matchCell = hasTarget ? row.match : '--';
            var mismatchCellText = hasTarget ? row.mismatch : '--';
            var mismatchClass = '';
            if (hasTarget) {
                mismatchClass = row.mismatch > 0 ? 'w10-cell-mismatch' : 'w10-cell-zero';
            }

            tr.innerHTML =
                '<td>' + escapeHtml(row.group.groupName) + '</td>' +
                '<td class="w10-num">' + row.devices + '</td>' +
                '<td class="w10-num">' + matchCell + '</td>' +
                '<td class="w10-num ' + mismatchClass + '">' + mismatchCellText + '</td>';

            // Click row -> set Filter Customer + Group to drill in
            tr.addEventListener('click', function () {
                custFilter.value = row.group.ownerName;
                rebuildGroupFilter();
                if (groupFilter && groupFilter.querySelector('option[value="' + row.group.groupName + '"]')) {
                    groupFilter.value = row.group.groupName;
                }
                renderDeviceList();
                updateStats();
            });
            groupsTableBody.appendChild(tr);
            if (hasTarget) totalMismatch += row.mismatch;
        });

        // Header summary
        if (groupsMeta) {
            var modelSuffix = (modelMode !== 'ALL') ? ' (Model=' + modelMode + ')' : '';
            if (hasTarget) {
                groupsMeta.textContent = rows.length + ' group(s) targeting gen2fw=' +
                    fwTarget + modelSuffix + ' — total mismatch: ' + totalMismatch;
            } else {
                groupsMeta.textContent = rows.length + ' group(s)' + modelSuffix +
                    ' — pick a FW Version filter to narrow by gen2fw';
            }
        }
    }

    // Tiny HTML escape so group / customer names with special chars don't break the table
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // -- Get filtered rows --
    function getFiltered() {
        var fw        = fwFilter ? fwFilter.value : 'ALL';
        var model     = modelFilter ? modelFilter.value : 'ALL';
        var cust      = custFilter.value;
        var grp       = groupFilter ? groupFilter.value : 'ALL';
        var installed = installedFilter ? installedFilter.value : 'TRUE';
        return allRows.filter(function (r) {
            if (fw    !== 'ALL' && r.fwVer    !== fw)    return false;
            if (model !== 'ALL' && r.model    !== model) return false;
            if (cust  !== 'ALL' && r.customer !== cust)  return false;
            if (grp   !== 'ALL' && r.group    !== grp)   return false;
            if (installed === 'TRUE'  && r.installed !== true) return false;
            if (installed === 'FALSE' && r.installed === true) return false;
            return true;
        });
    }

    // -- Get sorted + filtered list --
    var displayedRows = []; // current visible list after filter+sort

    function renderDeviceList() {
        deviceList.innerHTML = '';
        var filtered = getFiltered();

        // Apply free-text search (matches name, customer, group, fwVer)
        var searchTerm = deviceSearch && deviceSearch.value
            ? deviceSearch.value.trim().toLowerCase() : '';
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

        // Default sort: customer -> group -> name (all ascending, case-insensitive)
        filtered.sort(function (a, b) {
            var ca = (a.customer || '').toLowerCase();
            var cb = (b.customer || '').toLowerCase();
            if (ca !== cb) return ca.localeCompare(cb);
            var ga = (a.group || '').toLowerCase();
            var gb = (b.group || '').toLowerCase();
            if (ga !== gb) return ga.localeCompare(gb);
            return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        });

        displayedRows = filtered;
        deviceCount.textContent = filtered.length + ' devices';
        countEl.textContent = filtered.length + ' devices';

        filtered.forEach(function (r, idx) {
            var tr = document.createElement('tr');
            if (selectedRow && selectedRow.uuid === r.uuid) tr.className = 'w10-active';

            var prop    = r.property || r.group || '';
            var state   = r.deviceState || '--';
            var actStr  = (r.active === true) ? 'TRUE' : (r.active === false ? 'FALSE' : '--');
            var gainStr = (r.gain != null && !isNaN(r.gain)) ? String(r.gain) : '--';
            // Tooltip with full text so users can see anything truncated by ellipsis
            tr.title = r.name + ' · ' + prop + ' · FW ' + (r.fwVer || '--') +
                       ' · ' + state + ' · act:' + actStr + ' · gain:' + gainStr;

            // Color classes for state and active
            var stateClass = '';
            if (state === 'Metering') stateClass = 'w10-cell-state-on';
            else if (state === 'Not Metering') stateClass = 'w10-cell-state-off';
            var actClass = '';
            if (r.active === true)  actClass = 'w10-cell-bool-true';
            else if (r.active === false) actClass = 'w10-cell-bool-false';

            tr.innerHTML =
                '<td class="w10-cell-name">' + escapeHtml(r.name) + '</td>' +
                '<td>' + escapeHtml(prop) + '</td>' +
                '<td class="w10-cell-fw">' + escapeHtml(r.fwVer || '--') + '</td>' +
                '<td class="' + stateClass + '">' + escapeHtml(state) + '</td>' +
                '<td class="' + actClass + '">' + actStr + '</td>' +
                '<td class="w10-num">' + gainStr + '</td>';

            tr.addEventListener('click', function () {
                selectDevice(idx);
            });

            deviceList.appendChild(tr);
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

    // -- Filter/search handlers --
    function rerenderAndStats() {
        renderDeviceList();
        updateStats();
        renderGroupsTable();
    }
    // Customer change: cascade the Group dropdown options first, then re-render.
    custFilter.addEventListener('change', function () {
        rebuildGroupFilter();
        rerenderAndStats();
    });
    if (groupFilter)     groupFilter.addEventListener('change', rerenderAndStats);
    if (modelFilter)     modelFilter.addEventListener('change', rerenderAndStats);
    if (fwFilter)        fwFilter.addEventListener('change', rerenderAndStats);
    if (deviceSearch)    deviceSearch.addEventListener('input', rerenderAndStats);
    if (installedFilter) installedFilter.addEventListener('change', rerenderAndStats);

    // -- Refresh -- Shift+click forces full rescan (clears caches)
    refreshBtn.addEventListener('click', function (e) {
        selectedRow = null;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        chartPlaceholder.style.display = 'flex';
        scanAll(!!e.shiftKey);
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
