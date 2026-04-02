self.onInit = function () {

    // ── DOM refs (w3- prefix) ──────────────────────────────────────
    var ownerTypeSel  = document.getElementById('w3-ownerTypeSelect');
    var customerField = document.getElementById('w3-customerField');
    var customerSel   = document.getElementById('w3-customerSelect');
    var groupSel      = document.getElementById('w3-groupSelect');
    var startDateEl   = document.getElementById('w3-startDate');
    var endDateEl     = document.getElementById('w3-endDate');
    var calcBtn       = document.getElementById('w3-calcBtn');
    var statusMsg     = document.getElementById('w3-statusMsg');
    var resultsDiv    = document.getElementById('w3-results');
    var summaryDiv    = document.getElementById('w3-summary');
    var tableBody     = document.getElementById('w3-tableBody');

    var currentUser = null;
    var allDevices  = [];

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

    function showMessage(text, isError) {
        statusMsg.textContent   = text;
        statusMsg.className     = 'w3-message ' + (isError ? 'w3-msg-error' : 'w3-msg-success');
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

    function formatDate(ts) {
        if (!ts) return '—';
        var d = new Date(ts);
        return d.toLocaleDateString();
    }

    function formatNumber(val) {
        if (val === null || val === undefined) return '—';
        return Math.round(parseFloat(val)).toLocaleString();
    }

    function updateCalcBtn() {
        calcBtn.disabled = !(groupSel.value && startDateEl.value && endDateEl.value);
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
        showMessage('Could not load user: ' + e.message, true);
    });

    // ── Load customers ─────────────────────────────────────────────
    function loadCustomers() {
        customerSel.innerHTML   = '<option value="">Loading…</option>';
        groupSel.innerHTML      = '<option value="">— Select Group —</option>';
        groupSel.disabled       = true;
        resultsDiv.style.display = 'none';
        statusMsg.style.display  = 'none';

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

        groupSel.disabled        = true;
        groupSel.innerHTML       = '<option value="">Loading…</option>';
        resultsDiv.style.display = 'none';
        statusMsg.style.display  = 'none';

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
                updateCalcBtn();
            })
            .catch(function (e) {
                groupSel.innerHTML = '<option value="">— Select Group —</option>';
                showMessage('Could not load groups: ' + e.message, true);
            });
    }

    // ── Events ─────────────────────────────────────────────────────
    ownerTypeSel.addEventListener('change', function () {
        statusMsg.style.display  = 'none';
        resultsDiv.style.display = 'none';
        if (ownerTypeSel.value === 'CUSTOMER') {
            customerField.style.display = 'block';
            loadCustomers();
        } else {
            customerField.style.display = 'none';
            loadGroups();
        }
        updateCalcBtn();
    });

    customerSel.addEventListener('change', function () {
        statusMsg.style.display = 'none';
        loadGroups();
    });

    groupSel.addEventListener('change', updateCalcBtn);
    startDateEl.addEventListener('change', updateCalcBtn);
    endDateEl.addEventListener('change', updateCalcBtn);

    // ── Sort & Render ──────────────────────────────────────────────
    var lastResults    = [];
    var currentSortCol = 'apartment';
    var currentSortAsc = true;
    var exportBtn      = document.getElementById('w3-exportBtn');

    var SORT_FIELDS = {
        name:      function (r) { return (r.name || '').toLowerCase(); },
        property:  function (r) { return (r.property || '').toLowerCase(); },
        apartment: function (r) {
            var v = r.apartment;
            if (v === '—' || v === null || v === undefined) return 999999;
            var n = parseFloat(v);
            return isNaN(n) ? v.toString().toLowerCase() : n;
        },
        deviceState:   function (r) { return (r.deviceState || '').toLowerCase(); },
        replace:       function (r) { return (r.replace || '').toLowerCase(); },
        billable:      function (r) { return (r.billable || '').toLowerCase(); },
        leak:          function (r) { return (r.leak || '').toLowerCase(); },
        billingReview: function (r) { return (r.billingReview || '').toLowerCase(); },
        startTime: function (r) { return r.startTime || 0; },
        startVal:  function (r) { return r.startVal !== null ? r.startVal : -Infinity; },
        endTime:   function (r) { return r.endTime || 0; },
        endVal:    function (r) { return r.endVal !== null ? r.endVal : -Infinity; },
        diff:      function (r) { return r.diff !== null ? r.diff : -Infinity; },
        prevDiff:  function (r) { return r.prevDiff !== null ? r.prevDiff : -Infinity; },
        change:    function (r) { return r.change !== null ? Math.abs(r.change) : -Infinity; }
    };

    function sortResults(col) {
        if (currentSortCol === col) {
            currentSortAsc = !currentSortAsc;
        } else {
            currentSortCol = col;
            currentSortAsc = true;
        }
        renderResults();
    }

    function renderResults() {
        var sorted = lastResults.slice();
        var getter = SORT_FIELDS[currentSortCol] || SORT_FIELDS.apartment;
        sorted.sort(function (a, b) {
            var va = getter(a);
            var vb = getter(b);
            if (va < vb) return currentSortAsc ? -1 : 1;
            if (va > vb) return currentSortAsc ? 1 : -1;
            return 0;
        });

        // Update header arrows
        var ths = document.querySelectorAll('.w3-table th[data-sort]');
        ths.forEach(function (th) {
            var arrow = th.querySelector('.w3-sort-arrow');
            if (th.dataset.sort === currentSortCol) {
                arrow.textContent = currentSortAsc ? ' ▲' : ' ▼';
            } else {
                arrow.textContent = ' ⇅';
            }
        });

        tableBody.innerHTML = '';
        var totalDiff   = 0;
        var validCount  = 0;
        var noDataCount = 0;

        sorted.forEach(function (r) {
            var tr = document.createElement('tr');

            var tdName = document.createElement('td');
            tdName.textContent = r.name;

            var tdProp = document.createElement('td');
            tdProp.textContent = r.property;

            var tdApt = document.createElement('td');
            tdApt.textContent = r.apartment;

            var tdDeviceState = document.createElement('td');
            tdDeviceState.textContent = r.deviceState;

            var tdReplace = document.createElement('td');
            tdReplace.textContent = r.replace;

            var tdBillable = document.createElement('td');
            tdBillable.textContent = r.billable;

            var tdLeak = document.createElement('td');
            tdLeak.textContent = r.leak;

            var tdBillingReview = document.createElement('td');
            tdBillingReview.textContent = r.billingReview;

            var tdStartDate = document.createElement('td');
            tdStartDate.textContent = formatDate(r.startTime);
            if (!r.startTime) tdStartDate.className = 'w3-no-data';

            var tdStartVal = document.createElement('td');
            tdStartVal.textContent = r.startVal !== null ? formatNumber(r.startVal) : '—';
            if (r.startVal === null) tdStartVal.className = 'w3-no-data';

            var tdEndDate = document.createElement('td');
            tdEndDate.textContent = formatDate(r.endTime);
            if (!r.endTime) tdEndDate.className = 'w3-no-data';

            var tdEndVal = document.createElement('td');
            tdEndVal.textContent = r.endVal !== null ? formatNumber(r.endVal) : '—';
            if (r.endVal === null) tdEndVal.className = 'w3-no-data';

            var tdDiff = document.createElement('td');
            if (r.diff !== null) {
                tdDiff.textContent = formatNumber(r.diff);
                tdDiff.className   = r.diff > 0 ? 'w3-diff-pos'
                                   : r.diff < 0 ? 'w3-diff-neg'
                                   : 'w3-diff-zero';
                totalDiff += r.diff;
                validCount++;
            } else {
                tdDiff.textContent = 'No data';
                tdDiff.className   = 'w3-no-data';
                noDataCount++;
            }

            var tdPrevDiff = document.createElement('td');
            if (r.prevDiff !== null) {
                tdPrevDiff.textContent = formatNumber(r.prevDiff);
            } else {
                tdPrevDiff.textContent = '—';
                tdPrevDiff.className   = 'w3-no-data';
            }

            var tdChange = document.createElement('td');
            if (r.change !== null) {
                tdChange.textContent = Math.round(Math.abs(r.change)) + '%';
                tdChange.className   = r.change > 0 ? 'w3-diff-neg'
                                     : r.change < 0 ? 'w3-diff-pos'
                                     : 'w3-diff-zero';
            } else {
                tdChange.textContent = '—';
                tdChange.className   = 'w3-no-data';
            }

            var tdTrend = document.createElement('td');
            if (r.change !== null && r.change !== 0) {
                tdTrend.textContent = r.change > 0 ? '▲' : '▼';
                tdTrend.className   = r.change > 0 ? 'w3-trend-up' : 'w3-trend-down';
            } else if (r.change === 0) {
                tdTrend.textContent = '—';
                tdTrend.className   = 'w3-diff-zero';
            } else {
                tdTrend.textContent = '';
            }

            tr.appendChild(tdName);
            tr.appendChild(tdProp);
            tr.appendChild(tdApt);
            tr.appendChild(tdDeviceState);
            tr.appendChild(tdReplace);
            tr.appendChild(tdBillable);
            tr.appendChild(tdLeak);
            tr.appendChild(tdBillingReview);
            tr.appendChild(tdStartDate);
            tr.appendChild(tdStartVal);
            tr.appendChild(tdEndDate);
            tr.appendChild(tdEndVal);
            tr.appendChild(tdDiff);
            tr.appendChild(tdPrevDiff);
            tr.appendChild(tdChange);
            tr.appendChild(tdTrend);
            tableBody.appendChild(tr);
        });

        var summaryText = validCount + ' of ' + sorted.length + ' devices with data';
        if (validCount > 0) {
            summaryText += '  |  Total difference: ' + formatNumber(totalDiff);
        }
        if (noDataCount > 0) {
            summaryText += '  |  ' + noDataCount + ' without data in range';
        }
        summaryDiv.textContent = summaryText;
    }

    // ── Column header click → sort ─────────────────────────────────
    document.querySelectorAll('.w3-table th[data-sort]').forEach(function (th) {
        th.addEventListener('click', function () {
            sortResults(th.dataset.sort);
        });
    });

    // ── Export CSV ──────────────────────────────────────────────────
    exportBtn.addEventListener('click', function () {
        if (!lastResults.length) return;

        var rows = [['Device Name', 'Property', 'Apartment', 'Device State', 'Replace', 'Billable',
                     'Leak', 'Billing Review', 'Start Read Date',
                     'Start Read Value', 'End Read Date', 'End Read Value',
                     'Difference', 'Prev Period Diff', '% Change', 'Trend']];

        lastResults.forEach(function (r) {
            rows.push([
                r.name,
                r.property,
                r.apartment,
                r.deviceState,
                r.replace,
                r.billable,
                r.leak,
                r.billingReview,
                r.startTime ? new Date(r.startTime).toLocaleDateString() : '',
                r.startVal !== null ? r.startVal : '',
                r.endTime ? new Date(r.endTime).toLocaleDateString() : '',
                r.endVal !== null ? r.endVal : '',
                r.diff !== null ? r.diff : '',
                r.prevDiff !== null ? r.prevDiff : '',
                r.change !== null ? Math.round(Math.abs(r.change)) + '%' : '',
                r.change !== null ? (r.change > 0 ? 'Up' : r.change < 0 ? 'Down' : 'No change') : ''
            ]);
        });

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
        a.download = 'meter_readings_' + startDateEl.value + '_to_' + endDateEl.value + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    // ── Calculate ──────────────────────────────────────────────────
    calcBtn.addEventListener('click', function () {
        var groupId = groupSel.value;
        if (!groupId || !startDateEl.value || !endDateEl.value) return;

        var startTs = new Date(startDateEl.value).getTime();                    // start of day
        var endTs   = new Date(endDateEl.value).getTime() + 86400000 - 1;       // end of day (23:59:59.999)
        var rangeDays = Math.round((endTs - startTs) / 86400000);
        var prevStartTs = startTs - (rangeDays * 86400000);                     // previous period start
        var prevEndTs   = startTs - 1;                                          // previous period end

        if (startTs >= endTs) {
            showMessage('Start date must be before end date.', true);
            return;
        }

        calcBtn.disabled    = true;
        calcBtn.textContent = 'Calculating…';
        statusMsg.style.display  = 'none';
        resultsDiv.style.display = 'none';

        // Step 1: load devices in group
        apiFetch('/api/entityGroup/' + groupId + '/entities?pageSize=1000&page=0')
            .then(function (resp) {
                var list = (resp && resp.data) ? resp.data
                         : Array.isArray(resp) ? resp : [];
                list = list.filter(Boolean);

                if (list.length === 0) {
                    showMessage('No devices in this group.', false);
                    calcBtn.disabled    = false;
                    calcBtn.textContent = 'Calculate';
                    return;
                }

                allDevices = list.map(function (d) {
                    return {
                        uuid: extractId(d.id) || extractId(d),
                        name: d.name || d.label || '—'
                    };
                });

                // Step 2: fetch attributes + start & end readings for each device
                var promises = allDevices.map(function (d) {
                    // Property (SHARED_SCOPE)
                    var propP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/attributes/SHARED_SCOPE?keys=Property'
                    ).catch(function () { return []; });

                    // Apartment, Replace, Billable, Leak, Billing Review (SERVER_SCOPE)
                    var aptP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/attributes/SERVER_SCOPE?keys=Apartment,Replace,Billable,Leak,Billing Review'
                    ).catch(function () { return []; });

                    // deviceState (latest telemetry)
                    var stateP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/timeseries?keys=deviceState'
                    ).catch(function () { return null; });

                    // Current period: first reading
                    var startP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + startTs +
                        '&endTs=' + endTs +
                        '&limit=1&agg=NONE&orderBy=ASC'
                    ).catch(function () { return null; });

                    // Current period: last reading
                    var endP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + startTs +
                        '&endTs=' + endTs +
                        '&limit=1&agg=NONE&orderBy=DESC'
                    ).catch(function () { return null; });

                    // Previous period: first reading
                    var prevStartP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + prevStartTs +
                        '&endTs=' + prevEndTs +
                        '&limit=1&agg=NONE&orderBy=ASC'
                    ).catch(function () { return null; });

                    // Previous period: last reading
                    var prevEndP = apiFetch(
                        '/api/plugins/telemetry/DEVICE/' + d.uuid +
                        '/values/timeseries?keys=meterVal' +
                        '&startTs=' + prevStartTs +
                        '&endTs=' + prevEndTs +
                        '&limit=1&agg=NONE&orderBy=DESC'
                    ).catch(function () { return null; });

                    return Promise.all([propP, aptP, startP, endP, prevStartP, prevEndP, stateP]).then(function (res) {
                        var propArr   = res[0] || [];
                        var aptArr    = res[1] || [];
                        var property  = propArr.length ? propArr[0].value : '—';
                        var attrMap   = {};
                        aptArr.forEach(function (a) { attrMap[a.key] = a.value; });
                        var apartment     = attrMap['Apartment'] !== undefined ? attrMap['Apartment'] : '—';
                        var stateData     = res[6] && res[6].deviceState && res[6].deviceState[0];
                        var deviceState   = stateData ? stateData.value : '—';
                        var replace       = attrMap['Replace'] !== undefined ? String(attrMap['Replace']).toUpperCase() : '—';
                        var billable      = attrMap['Billable'] !== undefined ? String(attrMap['Billable']).toUpperCase() : '—';
                        var leak          = attrMap['Leak'] !== undefined ? String(attrMap['Leak']).toUpperCase() : '—';
                        var billingReview = attrMap['Billing Review'] !== undefined ? String(attrMap['Billing Review']).toUpperCase() : '—';

                        var startData = res[2] && res[2].meterVal && res[2].meterVal[0];
                        var endData   = res[3] && res[3].meterVal && res[3].meterVal[0];
                        var startVal  = startData ? parseFloat(startData.value) : null;
                        var endVal    = endData   ? parseFloat(endData.value)   : null;
                        var startTime = startData ? startData.ts : null;
                        var endTime   = endData   ? endData.ts   : null;
                        var diff      = (startVal !== null && endVal !== null) ? endVal - startVal : null;

                        var prevSData = res[4] && res[4].meterVal && res[4].meterVal[0];
                        var prevEData = res[5] && res[5].meterVal && res[5].meterVal[0];
                        var prevSVal  = prevSData ? parseFloat(prevSData.value) : null;
                        var prevEVal  = prevEData ? parseFloat(prevEData.value) : null;
                        var rawPrevDiff = (prevSVal !== null && prevEVal !== null) ? prevEVal - prevSVal : null;
                        var prevDiff    = (rawPrevDiff !== null && Math.abs(rawPrevDiff) >= 200) ? rawPrevDiff : null;
                        var change      = (prevDiff === null) ? null
                                        : (diff !== null && diff >= 500)
                                        ? ((diff - prevDiff) / Math.abs(prevDiff)) * 100
                                        : (diff !== null && diff < 500) ? 0 : null;

                        return {
                            name:          d.name,
                            property:      property,
                            apartment:     apartment,
                            deviceState:   deviceState,
                            replace:       replace,
                            billable:      billable,
                            leak:          leak,
                            billingReview: billingReview,
                            startVal:      startVal,
                            startTime: startTime,
                            endVal:    endVal,
                            endTime:   endTime,
                            diff:      diff,
                            prevDiff:  prevDiff,
                            change:    change
                        };
                    });
                });

                return Promise.all(promises);
            })
            .then(function (results) {
                if (!results) return;

                // Store results for sorting/export
                lastResults = results;
                currentSortCol = 'apartment';
                currentSortAsc = true;
                renderResults();

                resultsDiv.style.display = 'block';
                calcBtn.disabled    = false;
                calcBtn.textContent = 'Calculate';
            })
            .catch(function (e) {
                showMessage('Error: ' + e.message, true);
                calcBtn.disabled    = false;
                calcBtn.textContent = 'Calculate';
            });
    });

};

self.onDestroy = function () {};
