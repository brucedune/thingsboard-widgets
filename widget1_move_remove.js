self.onInit = function () {

    var ATTRIBUTES = [
        { key: 'Installed', scope: 'SERVER_SCOPE' },
        { key: 'Replace',   scope: 'SERVER_SCOPE' }
    ];

    // ── DOM refs (w1- prefix to avoid ID collision with other widgets) ──
    var ownerTypeSel        = document.getElementById('w1-ownerTypeSelect');
    var customerField       = document.getElementById('w1-customerField');
    var customerSel         = document.getElementById('w1-customerSelect');
    var groupSel            = document.getElementById('w1-groupSelect');
    var deviceSection       = document.getElementById('w1-deviceSection');
    var deviceList          = document.getElementById('w1-deviceList');
    var deviceCount         = document.getElementById('w1-deviceCount');
    var emptyMsg            = document.getElementById('w1-emptyMsg');
    var attrFilterSection   = document.getElementById('w1-attrFilterSection');
    var filterAttrKeySel    = document.getElementById('w1-filterAttrKey');
    var filterAttrValueSel  = document.getElementById('w1-filterAttrValue');
    var filterApplyBtn      = document.getElementById('w1-filterApplyBtn');
    var filterClearBtn      = document.getElementById('w1-filterClearBtn');
    var actionRemove        = document.getElementById('w1-actionRemove');
    var actionMove          = document.getElementById('w1-actionMove');
    var moveTargetField     = document.getElementById('w1-moveTargetField');
    var targetOwnerTypeSel  = document.getElementById('w1-targetOwnerTypeSelect');
    var targetCustomerField = document.getElementById('w1-targetCustomerField');
    var targetCustomerSel   = document.getElementById('w1-targetCustomerSelect');
    var targetGroupSel      = document.getElementById('w1-targetGroupSelect');
    var actionBtn           = document.getElementById('w1-actionBtn');
    var statusMsg           = document.getElementById('w1-statusMsg');

    // ── Inject search box above device list ────────────────────────
    var deviceSearch = document.createElement('input');
    deviceSearch.type        = 'text';
    deviceSearch.placeholder = '🔍  Search by name, property or apartment…';
    deviceSearch.style.cssText =
        'display:none;width:100%;box-sizing:border-box;padding:7px 10px;' +
        'margin-bottom:8px;border:1px solid #ccc;border-radius:4px;' +
        'font-size:13px;outline:none;';
    deviceList.parentNode.insertBefore(deviceSearch, deviceList);

    var currentUser   = null;
    var allDeviceData = [];

    // ── Get JWT token ──────────────────────────────────────────────
    function getToken() {
        try {
            var t = self.ctx.authService.getCurrentJWTToken();
            if (t) { return t; }
        } catch (e) {}
        try {
            var t = localStorage.getItem('jwt_token');
            if (t) { return t; }
        } catch (e) {}
        return '';
    }

    // ── API fetch ──────────────────────────────────────────────────
    function apiFetch(path, options) {
        var jwt = getToken();
        options = options || {};
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
                if (r.status === 204) { return null; }
                return r.text().then(function (txt) {
                    if (!txt || !txt.trim()) { return null; }
                    try { return JSON.parse(txt); }
                    catch (e) { return null; }
                });
            });
    }

    // ── Helpers ────────────────────────────────────────────────────
    function extractId(val) {
        if (!val) { return null; }
        if (typeof val === 'string') { return val; }
        if (val.id) { return typeof val.id === 'object' ? val.id.id : val.id; }
        return null;
    }

    function showMessage(text, isError) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w1-message ' + (isError ? 'msg-error' : 'msg-success');
        statusMsg.style.display = 'block';
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

    function updateActionBtn() {
        var any = Array.from(
            deviceList.querySelectorAll('input[type="checkbox"]:checked')
        ).some(function (cb) {
            return cb.closest('label').style.display !== 'none';
        });
        var moveOk = !actionMove.checked ||
            (targetGroupSel.value !== '' &&
             (targetOwnerTypeSel.value === 'TENANT' || targetCustomerSel.value !== ''));
        actionBtn.disabled = !(any && moveOk);
    }

    function isMove() { return actionMove.checked; }

    // ── Searchable dropdown ────────────────────────────────────────
    function makeSearchable(selectEl) {
        selectEl.style.display = 'none';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;';

        var face = document.createElement('div');
        face.style.cssText =
            'padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;' +
            'background:#fff;cursor:pointer;user-select:none;display:flex;' +
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
                if (term && opt.text.toLowerCase().indexOf(term.toLowerCase()) === -1) { return; }
                var item = document.createElement('div');
                item.textContent    = opt.text;
                item.dataset.value  = opt.value;
                item.style.cssText  =
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
            if (selectEl.disabled) { return; }
            open ? closePanel() : openPanel();
        });

        searchInput.addEventListener('input', function () { buildOptions(searchInput.value); });
        searchInput.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePanel(); } });

        document.addEventListener('click', function (e) {
            if (open && !wrapper.contains(e.target)) { closePanel(); }
        });

        // Sync face when populateSelect rebuilds options
        new MutationObserver(syncFace).observe(selectEl, { childList: true, subtree: true });
        selectEl.addEventListener('change', syncFace);

        // Mirror disabled state to face styling
        var origDisabledDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
        Object.defineProperty(selectEl, 'disabled', {
            get: function () { return origDisabledDesc.get.call(selectEl); },
            set: function (v) {
                origDisabledDesc.set.call(selectEl, v);
                face.style.background = v ? '#f5f5f5' : '#fff';
                face.style.cursor     = v ? 'default'  : 'pointer';
                face.style.color      = v ? '#aaa'      : '';
            }
        });

        wrapper.appendChild(face);
        wrapper.appendChild(panel);
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
        syncFace();
    }

    makeSearchable(customerSel);
    makeSearchable(groupSel);
    makeSearchable(targetCustomerSel);
    makeSearchable(targetGroupSel);

    // ── Text search filter ─────────────────────────────────────────
    function filterDevices() {
        var term   = deviceSearch.value.toLowerCase().trim();
        var labels = deviceList.querySelectorAll('label.grp-item');
        var visible = 0;

        labels.forEach(function (label) {
            var show = !term || label.textContent.toLowerCase().indexOf(term) !== -1;
            label.style.display = show ? '' : 'none';
            if (show) { visible++; }
        });

        var total = allDeviceData.length;
        deviceCount.textContent = term
            ? 'Devices (' + visible + ' of ' + total + ')'
            : 'Devices (' + total + ')';

        updateActionBtn();
    }

    deviceSearch.addEventListener('input', filterDevices);

    // ── Render device rows ─────────────────────────────────────────
    function renderDeviceRows(results) {
        allDeviceData        = results;
        deviceList.innerHTML = '';
        deviceSearch.value   = '';

        if (results.length === 0) {
            emptyMsg.style.display          = 'block';
            deviceCount.textContent         = '';
            deviceSearch.style.display      = 'none';
            attrFilterSection.style.display = 'none';
            return;
        }

        deviceCount.textContent         = 'Devices (' + results.length + ')';
        deviceSearch.style.display      = '';
        attrFilterSection.style.display = '';

        results.forEach(function (r) {
            var label       = document.createElement('label');
            label.className = 'grp-item';

            var cb          = document.createElement('input');
            cb.type         = 'checkbox';
            cb.dataset.uuid = r.uuid;
            cb.addEventListener('change', updateActionBtn);

            var info           = document.createElement('div');
            info.className     = 'grp-item-info';

            var nameEl         = document.createElement('div');
            nameEl.className   = 'grp-item-name';
            nameEl.textContent = r.name;

            var metaEl         = document.createElement('div');
            metaEl.className   = 'grp-item-meta';
            metaEl.textContent = 'Property: ' + (r.attrs.Property  || '—') +
                                 '   |   Apartment: ' + (r.attrs.Apartment || '—');

            info.appendChild(nameEl);
            info.appendChild(metaEl);
            label.appendChild(cb);
            label.appendChild(info);
            deviceList.appendChild(label);
        });
    }

    // ── Attribute filter ───────────────────────────────────────────
    function applyAttributeFilter() {
        var attrKey   = filterAttrKeySel.value;
        var attrValue = filterAttrValueSel.value;   // 'true' or 'false'

        if (!attrKey) {
            showMessage('Please select an attribute to filter by.', true);
            return;
        }

        filterApplyBtn.disabled    = true;
        filterApplyBtn.textContent = 'Loading…';

        var attr  = ATTRIBUTES.find(function (a) { return a.key === attrKey; });
        var scope = attr ? attr.scope : 'SERVER_SCOPE';

        var promises = allDeviceData.map(function (d) {
            return apiFetch(
                '/api/plugins/telemetry/DEVICE/' + d.uuid +
                '/values/attributes/' + scope + '?keys=' + attrKey
            ).then(function (data) {
                var val = null;
                if (Array.isArray(data) && data.length) {
                    val = String(data[0].value).toLowerCase();
                }
                return { uuid: d.uuid, match: val === attrValue };
            }).catch(function () {
                return { uuid: d.uuid, match: false };
            });
        });

        Promise.all(promises).then(function (results) {
            var matchMap = {};
            results.forEach(function (r) { matchMap[r.uuid] = r.match; });

            deviceList.querySelectorAll('label.grp-item').forEach(function (label) {
                var cb    = label.querySelector('input[type="checkbox"]');
                var match = matchMap[cb.dataset.uuid];
                if (match) {
                    cb.checked             = true;
                    label.style.background = '#e8f5e9';
                }
            });

            updateActionBtn();
            filterApplyBtn.disabled    = false;
            filterApplyBtn.textContent = 'Apply';
        }).catch(function (e) {
            showMessage('Filter error: ' + e.message, true);
            filterApplyBtn.disabled    = false;
            filterApplyBtn.textContent = 'Apply';
        });
    }

    function clearAttributeFilter() {
        deviceList.querySelectorAll('label.grp-item').forEach(function (label) {
            label.querySelector('input[type="checkbox"]').checked = false;
            label.style.background = '';
        });
        filterAttrKeySel.value = '';
        updateActionBtn();
    }

    filterApplyBtn.addEventListener('click', applyAttributeFilter);
    filterClearBtn.addEventListener('click', clearAttributeFilter);

    // ── Load current user ──────────────────────────────────────────
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, true);
    });

    // ── Load customers into any <select> ───────────────────────────
    function loadCustomers(targetSel) {
        targetSel.innerHTML = '<option value="">Loading…</option>';
        apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var list  = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var items = list.map(function (c) {
                return { id: extractId(c.id), name: c.title || c.name || '' };
            });
            populateSelect(targetSel, items, '— Select Customer —');
        }).catch(function (e) {
            showMessage('Could not load customers: ' + e.message, true);
        });
    }

    // ── Source groups ──────────────────────────────────────────────
    var allGroups       = [];
    var allTargetGroups = [];

    function loadGroups() {
        if (!currentUser) { return; }

        groupSel.disabled           = true;
        groupSel.innerHTML          = '<option value="">Loading…</option>';
        deviceSection.style.display = 'none';
        statusMsg.style.display     = 'none';
        allGroups                   = [];

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
                allGroups = (data || []).filter(function (g) { return g && g.name !== 'All'; });
                var items = allGroups.map(function (g) {
                    return { id: extractId(g.id), name: g.name || g.label || '' };
                });
                populateSelect(groupSel, items, '— Select Source Group —');
                groupSel.disabled = false;
                refreshTargetGroups();
            })
            .catch(function (e) {
                groupSel.innerHTML = '<option value="">— Select Group —</option>';
                showMessage('Could not load groups: ' + e.message, true);
            });
    }

    // ── Target groups ──────────────────────────────────────────────
    function loadTargetGroups() {
        if (!currentUser) { return; }

        targetGroupSel.innerHTML = '<option value="">Loading…</option>';
        allTargetGroups          = [];

        var ownerType = targetOwnerTypeSel.value;
        var ownerId   = ownerType === 'TENANT'
            ? extractId(currentUser.tenantId)
            : targetCustomerSel.value;

        if (!ownerId) {
            targetGroupSel.innerHTML = '<option value="">— Select Target Group —</option>';
            updateActionBtn();
            return;
        }

        apiFetch('/api/entityGroups/' + ownerType + '/' + ownerId + '/DEVICE')
            .then(function (data) {
                allTargetGroups = (data || []).filter(function (g) { return g && g.name !== 'All'; });
                refreshTargetGroups();
            })
            .catch(function (e) {
                targetGroupSel.innerHTML = '<option value="">— Select Target Group —</option>';
                showMessage('Could not load target groups: ' + e.message, true);
            });
    }

    // ── Refresh target dropdown (exclude source when same owner) ───
    function refreshTargetGroups() {
        var sourceId  = groupSel.value;
        var sameOwner = (ownerTypeSel.value === targetOwnerTypeSel.value) &&
                        (ownerTypeSel.value === 'TENANT' ||
                         customerSel.value  === targetCustomerSel.value);
        var groups    = sameOwner ? allGroups : allTargetGroups;
        var items     = groups
            .filter(function (g) { return !sameOwner || extractId(g.id) !== sourceId; })
            .map(function (g) { return { id: extractId(g.id), name: g.name || g.label || '' }; });
        populateSelect(targetGroupSel, items, '— Select Target Group —');
        updateActionBtn();
    }

    // ── Load devices ───────────────────────────────────────────────
    function loadDevices(groupId) {
        deviceSection.style.display     = 'block';
        deviceList.innerHTML            = '<p class="grp-empty">Loading devices…</p>';
        deviceSearch.style.display      = 'none';
        deviceSearch.value              = '';
        attrFilterSection.style.display = 'none';
        emptyMsg.style.display          = 'none';
        actionBtn.disabled              = true;
        statusMsg.style.display         = 'none';

        apiFetch('/api/entityGroup/' + groupId + '/entities?pageSize=1000&page=0')
            .then(function (resp) {
                var list = (resp && resp.data) ? resp.data
                         : Array.isArray(resp) ? resp : [];
                list = list.filter(Boolean);

                if (list.length === 0) {
                    deviceList.innerHTML    = '';
                    emptyMsg.style.display  = 'block';
                    deviceCount.textContent = '';
                    return;
                }

                var promises = list.map(function (d) {
                    var uuid = extractId(d.id) || extractId(d);

                    var sharedP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + uuid +
                        '/values/attributes/SHARED_SCOPE?keys=Property'
                    ).catch(function () { return []; });

                    var serverP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Apartment'
                    ).catch(function () { return []; });

                    return Promise.all([sharedP, serverP]).then(function (res) {
                        var map = {};
                        (res[0] || []).forEach(function (a) { map[a.key] = a.value; });
                        (res[1] || []).forEach(function (a) { map[a.key] = a.value; });
                        return { uuid: uuid, name: d.name || d.label || uuid || '—', attrs: map };
                    });
                });

                Promise.all(promises).then(renderDeviceRows);
            })
            .catch(function (e) {
                deviceList.innerHTML = '';
                showMessage('Could not load devices: ' + e.message, true);
            });
    }

    // ── Update button label ────────────────────────────────────────
    function updateBtnLabel() {
        if (isMove()) {
            actionBtn.textContent         = 'Move Selected to Group';
            actionBtn.style.background    = '';
            moveTargetField.style.display = 'block';
        } else {
            actionBtn.textContent         = 'Remove Selected from Group';
            actionBtn.style.background    = '';
            moveTargetField.style.display = 'none';
        }
        updateActionBtn();
    }

    // ── Events ─────────────────────────────────────────────────────
    ownerTypeSel.addEventListener('change', function () {
        statusMsg.style.display     = 'none';
        deviceSection.style.display = 'none';
        if (ownerTypeSel.value === 'CUSTOMER') {
            customerField.style.display = 'block';
            loadCustomers(customerSel);
        } else {
            customerField.style.display = 'none';
            loadGroups();
        }
    });

    customerSel.addEventListener('change', function () {
        statusMsg.style.display = 'none';
        loadGroups();
    });

    groupSel.addEventListener('change', function () {
        statusMsg.style.display = 'none';
        refreshTargetGroups();
        if (groupSel.value) { loadDevices(groupSel.value); }
        else { deviceSection.style.display = 'none'; }
    });

    targetOwnerTypeSel.addEventListener('change', function () {
        if (targetOwnerTypeSel.value === 'CUSTOMER') {
            targetCustomerField.style.display = 'block';
            loadCustomers(targetCustomerSel);
        } else {
            targetCustomerField.style.display  = 'none';
            targetCustomerSel.innerHTML        = '<option value="">— Select Customer —</option>';
            loadTargetGroups();
        }
        updateActionBtn();
    });

    targetCustomerSel.addEventListener('change', function () { loadTargetGroups(); });
    targetGroupSel.addEventListener('change', updateActionBtn);
    actionRemove.addEventListener('change', updateBtnLabel);
    actionMove.addEventListener('change', updateBtnLabel);

    document.getElementById('w1-selectAll').addEventListener('click', function (e) {
        e.preventDefault();
        deviceList.querySelectorAll('label.grp-item').forEach(function (label) {
            if (label.style.display !== 'none') {
                label.querySelector('input[type="checkbox"]').checked = true;
            }
        });
        updateActionBtn();
    });

    document.getElementById('w1-selectNone').addEventListener('click', function (e) {
        e.preventDefault();
        deviceList.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.checked = false;
        });
        updateActionBtn();
    });

    // ── Action button ──────────────────────────────────────────────
    actionBtn.addEventListener('click', function () {
        var checked = Array.from(
            deviceList.querySelectorAll('input[type="checkbox"]:checked')
        ).filter(function (cb) {
            return cb.closest('label').style.display !== 'none';
        });

        if (!checked.length) { return; }

        var payload    = checked.map(function (cb) { return cb.dataset.uuid; });
        var sourceId   = groupSel.value;
        var sourceName = groupSel.options[groupSel.selectedIndex].text;
        var moving     = isMove();
        var targetId   = targetGroupSel.value;
        var targetName = targetGroupSel.options[targetGroupSel.selectedIndex].text;

        if (moving && !targetId) {
            showMessage('Please select a target group.', true);
            return;
        }

        var confirmMsg = moving
            ? 'Move ' + payload.length + ' device(s)\n\nFrom: "' + sourceName + '"\nTo: "' + targetName + '"\n\nAre you sure?'
            : 'Remove ' + payload.length + ' device(s) from group "' + sourceName + '"?\n\nThis action cannot be undone.';

        if (!window.confirm(confirmMsg)) { return; }

        actionBtn.disabled    = true;
        actionBtn.textContent = moving ? 'Moving…' : 'Removing…';

        var task;

        if (!moving) {

            task = apiFetch('/api/entityGroup/' + sourceId + '/deleteEntities', {
                method: 'POST',
                body:   JSON.stringify(payload)
            });

        } else {

            var sourceOwnerType = ownerTypeSel.value;
            var sourceOwnerId   = sourceOwnerType === 'TENANT'
                ? extractId(currentUser.tenantId)
                : customerSel.value;
            var targetOwnerType = targetOwnerTypeSel.value;
            var targetOwnerId   = targetOwnerType === 'TENANT'
                ? extractId(currentUser.tenantId)
                : targetCustomerSel.value;
            var ownerChanging   = sourceOwnerId !== targetOwnerId;

            if (ownerChanging) {
                // ThingsBoard PE ownership change:
                // POST /api/owner/{CUSTOMER|TENANT}/{ownerId}/DEVICE/{deviceId}
                var ownerStep;
                if (targetOwnerType === 'CUSTOMER') {
                    ownerStep = Promise.all(payload.map(function (uuid) {
                        return apiFetch(
                            '/api/owner/CUSTOMER/' + targetOwnerId + '/DEVICE/' + uuid,
                            { method: 'POST' }
                        );
                    }));
                } else {
                    var tenantId = extractId(currentUser.tenantId);
                    ownerStep = Promise.all(payload.map(function (uuid) {
                        return apiFetch(
                            '/api/owner/TENANT/' + tenantId + '/DEVICE/' + uuid,
                            { method: 'POST' }
                        );
                    }));
                }

                task = ownerStep
                    .then(function () {
                        return apiFetch('/api/entityGroup/' + targetId + '/addEntities', {
                            method: 'POST',
                            body:   JSON.stringify(payload)
                        });
                    })
                    .then(function () {
                        return apiFetch('/api/entityGroup/' + sourceId + '/deleteEntities', {
                            method: 'POST',
                            body:   JSON.stringify(payload)
                        }).catch(function () {});
                    });

            } else {

                task = apiFetch('/api/entityGroup/' + targetId + '/addEntities', {
                    method: 'POST',
                    body:   JSON.stringify(payload)
                }).then(function () {
                    return apiFetch('/api/entityGroup/' + sourceId + '/deleteEntities', {
                        method: 'POST',
                        body:   JSON.stringify(payload)
                    });
                });

            }
        }

        task.then(function () {
            var msg = moving
                ? '✔ ' + payload.length + ' device(s) moved from "' + sourceName + '" to "' + targetName + '".'
                : '✔ ' + payload.length + ' device(s) removed from "' + sourceName + '".';

            actionBtn.textContent      = '✔ Done';
            actionBtn.style.background = '#2e7d32';
            showMessage(msg, false);
            loadDevices(sourceId);

            setTimeout(function () {
                actionBtn.textContent      = moving ? 'Move Selected to Group' : 'Remove Selected from Group';
                actionBtn.style.background = '';
                actionBtn.disabled         = false;
            }, 3000);

        }).catch(function (e) {
            showMessage('✖ Action failed: ' + e.message, true);
            actionBtn.disabled    = false;
            actionBtn.textContent = moving ? 'Move Selected to Group' : 'Remove Selected from Group';
        });
    });
};

self.onDestroy = function () {};
