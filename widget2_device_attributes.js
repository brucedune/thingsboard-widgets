self.onInit = function () {

    // ── DOM refs (w2- prefix to avoid ID collision with other widgets) ──
    var ownerTypeSel   = document.getElementById('w2-ownerTypeSelect');
    var customerField  = document.getElementById('w2-customerField');
    var customerSel    = document.getElementById('w2-customerSelect');
    var groupSel       = document.getElementById('w2-groupSelect');
    var controlSection = document.getElementById('w2-controlSection');
    var deviceCount    = document.getElementById('w2-deviceCount');
    var attrSel        = document.getElementById('w2-attrSelect');
    var actionSel      = document.getElementById('w2-actionSelect');
    var valueField     = document.getElementById('w2-valueField');
    var valueInput     = document.getElementById('w2-valueInput');
    var valueBool      = document.getElementById('w2-valueBool');
    var applyBtn       = document.getElementById('w2-applyBtn');
    var statusMsg      = document.getElementById('w2-statusMsg');

    var currentUser  = null;
    var currentAttrs = [];
    var allDevices   = [];

    // ── Fixed attribute list ───────────────────────────────────────
    var ATTRIBUTES = [
        { key: 'gen2fw',      scope: 'SHARED_SCOPE' },
        { key: 'Apartment',     scope: 'SERVER_SCOPE'  },
        { key: 'Install Notes', scope: 'SHARED_SCOPE' },
        { key: 'pipesize',      scope: 'SHARED_SCOPE' },
        { key: 'pipeType',      scope: 'SHARED_SCOPE' },
        { key: 'Model',         scope: 'SHARED_SCOPE' },
        { key: 'Install Date',  scope: 'SERVER_SCOPE'  },
        { key: 'Type',          scope: 'SERVER_SCOPE'  },
        { key: 'location',      scope: 'SERVER_SCOPE'  },
        { key: 'Move Date',     scope: 'SERVER_SCOPE'  },
        { key: 'recordNoneventFlow', scope: 'SHARED_SCOPE' },
        { key: 'radioOnEventEnd',    scope: 'SHARED_SCOPE' },
        { key: 'checkInPeriod',      scope: 'SHARED_SCOPE' },
        { key: 'allowTiFotaVer',     scope: 'SHARED_SCOPE' }
    ];

    // ── Get JWT token ──────────────────────────────────────────────
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // ── API fetch ──────────────────────────────────────────────────
    function apiFetch(path, options, allowNotFound) {
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
                if (r.status === 404 && allowNotFound) { return null; }
                if (!r.ok) { throw new Error('HTTP ' + r.status + ' — ' + path); }
                return r.text().then(function (text) {
                    if (!text || text.trim() === '') return null;
                    try { return JSON.parse(text); } catch (e) { return null; }
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

    function showMessage(text, isError) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'grp-message ' + (isError ? 'msg-error' : 'msg-success');
        statusMsg.style.display = 'block';
    }

    function detectType(value) {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number')  return 'number';
        return 'string';
    }

    function populateSelect(selectEl, items, placeholder) {
        selectEl.innerHTML = '<option value="">' + placeholder + '</option>';
        items.forEach(function (item) {
            var opt = document.createElement('option');
            opt.value       = item.id;
            opt.textContent = item.name;
            selectEl.appendChild(opt);
        });
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
    makeSearchable(attrSel);

    // ── Update value input based on selected attribute type ────────
    function updateValueInput() {
        var attrVal = attrSel.value;
        var action  = actionSel.value;

        valueField.style.display = 'none';
        valueInput.style.display = 'none';
        valueBool.style.display  = 'none';
        applyBtn.disabled        = !attrVal || !action;

        if (!attrVal || action !== 'change') return;

        var selected = currentAttrs.find(function (a) { return a.id === attrVal; });
        if (!selected) return;

        valueField.style.display = 'block';
        applyBtn.disabled        = false;

        if (selected.type === 'boolean') {
            valueBool.style.display  = 'block';
            valueInput.style.display = 'none';
        } else if (selected.type === 'number') {
            valueInput.type          = 'number';
            valueInput.style.display = 'block';
            valueBool.style.display  = 'none';
        } else {
            valueInput.type          = 'text';
            valueInput.style.display = 'block';
            valueBool.style.display  = 'none';
        }
    }

    // ── Load current user ──────────────────────────────────────────
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
        loadGroups();
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, true);
    });

    // ── Load customers ─────────────────────────────────────────────
    function loadCustomers() {
        customerSel.innerHTML        = '<option value="">Loading…</option>';
        groupSel.innerHTML           = '<option value="">— Select Group —</option>';
        groupSel.disabled            = true;
        controlSection.style.display = 'none';
        statusMsg.style.display      = 'none';

        apiFetch('/api/customers?pageSize=1000&page=0').then(function (resp) {
            var list  = (resp && resp.data) ? resp.data.filter(Boolean) : [];
            var items = list.map(function (c) {
                return { id: extractId(c.id), name: c.title || c.name || '' };
            });
            populateSelect(customerSel, items, '— Select Customer —');
        }).catch(function (e) {
            showMessage('Could not load customers: ' + e.message, true);
        });
    }

    // ── Load groups ────────────────────────────────────────────────
    function loadGroups() {
        if (!currentUser) return;

        groupSel.disabled            = true;
        groupSel.innerHTML           = '<option value="">Loading…</option>';
        controlSection.style.display = 'none';
        statusMsg.style.display      = 'none';

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
                showMessage('Could not load groups: ' + e.message, true);
            });
    }

    // ── Load devices in group ──────────────────────────────────────
    function loadDevices(groupId) {
        controlSection.style.display = 'none';
        statusMsg.style.display      = 'none';
        allDevices                   = [];
        currentAttrs                 = [];
        attrSel.innerHTML            = '<option value="">— Select Attribute —</option>';
        actionSel.value              = '';
        valueField.style.display     = 'none';
        applyBtn.disabled            = true;
        deviceCount.textContent      = 'Loading…';

        apiFetch('/api/entityGroup/' + groupId + '/entities?pageSize=1000&page=0')
            .then(function (resp) {
                var list = (resp && resp.data) ? resp.data
                         : Array.isArray(resp) ? resp : [];
                list = list.filter(Boolean);

                if (list.length === 0) {
                    showMessage('No devices in this group.', false);
                    return;
                }

                allDevices = list.map(function (d) {
                    return {
                        uuid: extractId(d.id) || extractId(d),
                        name: d.name || d.label || '—'
                    };
                });

                deviceCount.textContent      = allDevices.length + ' devices in this group';
                controlSection.style.display = 'block';

                loadAttributeKeys(allDevices[0].uuid);
            })
            .catch(function (e) {
                showMessage('Could not load devices: ' + e.message, true);
            });
    }

    // ── Load attribute keys (sample values from first device) ──────
    function loadAttributeKeys(uuid) {
        currentAttrs      = [];
        attrSel.innerHTML = '<option value="">Loading…</option>';

        var sharedKeys = ATTRIBUTES
            .filter(function (a) { return a.scope === 'SHARED_SCOPE'; })
            .map(function (a) { return a.key; }).join(',');

        var serverKeys = ATTRIBUTES
            .filter(function (a) { return a.scope === 'SERVER_SCOPE'; })
            .map(function (a) { return a.key; }).join(',');

        var sharedP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid +
            '/values/attributes/SHARED_SCOPE?keys=' + encodeURIComponent(sharedKeys)
        ).catch(function () { return []; });

        var serverP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid +
            '/values/attributes/SERVER_SCOPE?keys=' + encodeURIComponent(serverKeys)
        ).catch(function () { return []; });

        Promise.all([sharedP, serverP]).then(function (results) {
            var valueMap = {};
            (results[0] || []).forEach(function (a) { valueMap[a.key] = a; });
            (results[1] || []).forEach(function (a) { valueMap[a.key] = a; });

            attrSel.innerHTML = '<option value="">— Select Attribute —</option>';

            ATTRIBUTES.forEach(function (a) {
                var current = valueMap[a.key];
                var val   = (current !== undefined && current.value !== undefined)
                            ? current.value : '—';
                var type  = (current !== undefined && current.value !== undefined)
                            ? detectType(current.value) : 'string';
                var scope = a.scope === 'SHARED_SCOPE' ? 'Shared' : 'Server';
                var note  = (val === '—') ? ' ⚠ not set on sample device' : '';
                var label = a.key + ': ' + val + ' (' + scope + ')' + note;

                currentAttrs.push({
                    id:    a.scope + '|' + a.key,
                    name:  label,
                    key:   a.key,
                    scope: a.scope,
                    type:  type
                });

                var opt = document.createElement('option');
                opt.value       = a.scope + '|' + a.key;
                opt.textContent = label;
                attrSel.appendChild(opt);
            });
        });
    }

    // ── Events ─────────────────────────────────────────────────────
    ownerTypeSel.addEventListener('change', function () {
        statusMsg.style.display      = 'none';
        controlSection.style.display = 'none';
        if (ownerTypeSel.value === 'CUSTOMER') {
            customerField.style.display = 'block';
            loadCustomers();
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
        if (groupSel.value) loadDevices(groupSel.value);
        else controlSection.style.display = 'none';
    });

    attrSel.addEventListener('change', updateValueInput);
    actionSel.addEventListener('change', updateValueInput);

    // ── Apply button ───────────────────────────────────────────────
    applyBtn.addEventListener('click', function () {
        var attrVal = attrSel.value;
        var action  = actionSel.value;
        if (!attrVal || !action) return;

        var selected = currentAttrs.find(function (a) { return a.id === attrVal; });
        if (!selected) return;

        var groupName = groupSel.options[groupSel.selectedIndex].text;
        var newValue;

        if (action === 'change') {
            if (selected.type === 'boolean') {
                newValue = valueBool.value === 'true';
            } else if (selected.type === 'number') {
                newValue = parseFloat(valueInput.value);
                if (isNaN(newValue)) {
                    showMessage('Please enter a valid number.', true);
                    return;
                }
            } else {
                newValue = valueInput.value;
                if (newValue === '') {
                    showMessage('Please enter a value.', true);
                    return;
                }
            }
        }

        var confirmMsg = action === 'delete'
            ? 'Delete attribute "' + selected.key + '" from ALL ' + allDevices.length +
              ' devices in "' + groupName + '"?\n\nThis cannot be undone.'
            : 'Set "' + selected.key + '" = "' + newValue + '" on ALL ' +
              allDevices.length + ' devices in "' + groupName + '"?';

        if (!window.confirm(confirmMsg)) return;

        applyBtn.disabled    = true;
        applyBtn.textContent = action === 'delete' ? 'Deleting…' : 'Applying…';
        statusMsg.style.display = 'none';

        var promises = allDevices.map(function (d) {
            if (action === 'delete') {
                return apiFetch(
                    '/api/plugins/telemetry/DEVICE/' + d.uuid +
                    '/' + selected.scope +
                    '?keys=' + encodeURIComponent(selected.key),
                    { method: 'DELETE' },
                    true
                ).then(function () {
                    return { ok: true };
                }).catch(function (e) {
                    return { error: e.message, device: d.name };
                });
            } else {
                var body = {};
                body[selected.key] = newValue;
                return apiFetch(
                    '/api/plugins/telemetry/DEVICE/' + d.uuid +
                    '/' + selected.scope,
                    { method: 'POST', body: JSON.stringify(body) }
                ).then(function () {
                    return { ok: true };
                }).catch(function (e) {
                    return { error: e.message, device: d.name };
                });
            }
        });

        Promise.all(promises).then(function (results) {
            var errors  = results.filter(function (r) { return r && r.error; });
            var success = results.length - errors.length;

            if (errors.length > 0) {
                var errDetails = errors.slice(0, 3).map(function (e) {
                    return e.device + ': ' + e.error;
                }).join('; ');
                showMessage(
                    '⚠ ' + success + ' succeeded, ' + errors.length + ' failed. ' + errDetails,
                    true
                );
            } else {
                var msg = action === 'delete'
                    ? '✔ "' + selected.key + '" deleted from ' + success + ' devices.'
                    : '✔ "' + selected.key + '" set to "' + newValue + '" on ' + success + ' devices.';
                showMessage(msg, false);
            }

            applyBtn.textContent      = '✔ Done';
            applyBtn.style.background = errors.length > 0 ? '#b71c1c' : '#2e7d32';

            setTimeout(function () {
                applyBtn.textContent      = 'Apply to All Devices';
                applyBtn.style.background = '';
                applyBtn.disabled         = false;
                if (allDevices.length > 0) loadAttributeKeys(allDevices[0].uuid);
            }, 3000);
        });
    });

};

self.onDestroy = function () {};
