self.onInit = function () {

    // -- DOM refs (w11- prefix) --
    var refreshBtn    = document.getElementById('w11-refreshBtn');
    var filterSel     = document.getElementById('w11-filterReviewed');
    var resetAllBtn   = document.getElementById('w11-resetAllBtn');
    var countDisplay  = document.getElementById('w11-countDisplay');
    var statusMsg     = document.getElementById('w11-statusMsg');
    var tableWrap     = document.querySelector('.w11-table-wrap');
    var tbody         = document.getElementById('w11-tbody');
    var placeholder   = document.getElementById('w11-placeholder');
    var headers       = document.querySelectorAll('.w11-sortable');

    var allRows       = [];   // { customer, group, groupId, reviewDate, reviewed }
    var sortCol       = 'customer';
    var sortAsc       = true;
    var currentUser   = null;

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
        statusMsg.className     = 'w11-message w11-msg-' + (type || 'info');
        statusMsg.style.display = 'block';
    }

    function hideMessage() { statusMsg.style.display = 'none'; }

    function formatDate(val) {
        if (!val) return '--';
        var d = new Date(val);
        if (isNaN(d.getTime())) {
            // Try parsing as a string date directly
            return String(val);
        }
        return d.toLocaleDateString();
    }

    // -- Sort & render --
    function updateSortHeaders() {
        headers.forEach(function (th) {
            th.classList.remove('w11-sort-asc', 'w11-sort-desc');
            if (th.dataset.col === sortCol) {
                th.classList.add(sortAsc ? 'w11-sort-asc' : 'w11-sort-desc');
            }
        });
    }

    function getVisibleRows() {
        var filterVal = filterSel.value;
        return allRows.filter(function (row) {
            if (filterVal === 'ALL') return true;
            var rev = String(row.reviewed).toUpperCase();
            return rev === filterVal;
        });
    }

    function renderTable() {
        var visible = getVisibleRows();

        // Sort
        visible.sort(function (a, b) {
            var va = a[sortCol];
            var vb = b[sortCol];
            if (va === null || va === undefined) va = '';
            if (vb === null || vb === undefined) vb = '';

            if (sortCol === 'reviewDate') {
                // Sort as dates
                var da = new Date(va);
                var db = new Date(vb);
                var ta = isNaN(da.getTime()) ? 0 : da.getTime();
                var tb = isNaN(db.getTime()) ? 0 : db.getTime();
                return sortAsc ? ta - tb : tb - ta;
            }
            if (sortCol === 'reviewed') {
                var sa = String(va).toUpperCase();
                var sb = String(vb).toUpperCase();
                if (sa < sb) return sortAsc ? -1 : 1;
                if (sa > sb) return sortAsc ? 1 : -1;
                return 0;
            }
            // String sort
            va = String(va).toLowerCase();
            vb = String(vb).toLowerCase();
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });

        tbody.innerHTML = '';
        visible.forEach(function (row) {
            var tr = document.createElement('tr');

            var tdCustomer = document.createElement('td');
            tdCustomer.textContent = row.customer;
            tr.appendChild(tdCustomer);

            var tdGroup = document.createElement('td');
            tdGroup.textContent = row.group;
            tr.appendChild(tdGroup);

            var tdDate = document.createElement('td');
            tdDate.textContent = formatDate(row.reviewDate);
            tr.appendChild(tdDate);

            var tdReviewed = document.createElement('td');
            var revStr = String(row.reviewed).toUpperCase();
            tdReviewed.textContent = revStr;
            tdReviewed.className = revStr === 'TRUE' ? 'w11-reviewed-true' : 'w11-reviewed-false';
            tr.appendChild(tdReviewed);

            var tdAction = document.createElement('td');
            var btn = document.createElement('button');
            btn.textContent = 'Reset';
            btn.className = 'w11-reset-btn';
            btn.addEventListener('click', function () { resetRow(row, btn); });
            tdAction.appendChild(btn);
            tr.appendChild(tdAction);

            tbody.appendChild(tr);
        });

        countDisplay.textContent = visible.length + ' of ' + allRows.length + ' groups';
        updateSortHeaders();

        // Enable/disable Reset All
        var hasAny = visible.some(function (r) {
            return String(r.reviewed).toUpperCase() === 'TRUE';
        });
        resetAllBtn.disabled = !hasAny;
    }

    // -- Sort click handlers --
    headers.forEach(function (th) {
        th.addEventListener('click', function () {
            var col = th.dataset.col;
            if (sortCol === col) {
                sortAsc = !sortAsc;
            } else {
                sortCol = col;
                sortAsc = true;
            }
            renderTable();
        });
    });

    // -- Filter change --
    filterSel.addEventListener('change', function () { renderTable(); });

    // -- Reset single row --
    function resetRow(row, btn) {
        btn.disabled = true;
        btn.textContent = '...';
        apiFetch('/api/plugins/telemetry/ENTITY_GROUP/' + row.groupId + '/attributes/SERVER_SCOPE', {
            method: 'POST',
            body: JSON.stringify({ 'Engineering Reviewed': false })
        }).then(function () {
            row.reviewed = false;
            btn.textContent = 'Reset';
            btn.disabled = false;
            renderTable();
            showMessage('Reset "' + row.group + '" to FALSE', 'success');
            setTimeout(hideMessage, 3000);
        }).catch(function (e) {
            btn.textContent = 'Reset';
            btn.disabled = false;
            showMessage('Reset failed: ' + e.message, 'error');
        });
    }

    // -- Reset All visible --
    resetAllBtn.addEventListener('click', function () {
        var visible = getVisibleRows().filter(function (r) {
            return String(r.reviewed).toUpperCase() === 'TRUE';
        });
        if (visible.length === 0) return;
        if (!confirm('Reset Engineering Reviewed to FALSE for ' + visible.length + ' group(s)?')) return;

        resetAllBtn.disabled = true;
        resetAllBtn.textContent = 'Resetting...';
        var done = 0;
        var errors = 0;

        function next(idx) {
            if (idx >= visible.length) {
                resetAllBtn.textContent = 'Reset All Visible';
                resetAllBtn.disabled = false;
                renderTable();
                showMessage('Reset complete: ' + done + ' succeeded, ' + errors + ' failed', done > 0 ? 'success' : 'error');
                setTimeout(hideMessage, 4000);
                return;
            }
            var row = visible[idx];
            apiFetch('/api/plugins/telemetry/ENTITY_GROUP/' + row.groupId + '/attributes/SERVER_SCOPE', {
                method: 'POST',
                body: JSON.stringify({ 'Engineering Reviewed': false })
            }).then(function () {
                row.reviewed = false;
                done++;
                showMessage('Resetting... ' + (idx + 1) + '/' + visible.length, 'info');
                next(idx + 1);
            }).catch(function () {
                errors++;
                next(idx + 1);
            });
        }
        next(0);
    });

    // -- Main scan logic --
    function loadEngReviewTable() {
        allRows = [];
        tbody.innerHTML = '';
        placeholder.style.display = 'none';
        tableWrap.style.display = 'block';
        refreshBtn.disabled = true;
        showMessage('Loading current user...', 'info');

        var userPromise = currentUser
            ? Promise.resolve(currentUser)
            : apiFetch('/api/auth/user').then(function (u) { currentUser = u; return u; });

        userPromise.then(function (user) {
            var tenantId = extractId(user.tenantId);

            // Build list of owners to scan: { type, id, name }
            var owners = [{ type: 'TENANT', id: tenantId, name: 'Tenant' }];

            showMessage('Fetching customers...', 'info');
            return fetchAllCustomers().then(function (customers) {
                customers.forEach(function (c) {
                    owners.push({ type: 'CUSTOMER', id: extractId(c.id), name: c.title || c.name || 'Unknown' });
                });
                return processOwners(owners);
            });
        }).then(function () {
            refreshBtn.disabled = false;
            if (allRows.length === 0) {
                showMessage('No groups found with "Engineering Review Date" attribute.', 'info');
            } else {
                showMessage('Found ' + allRows.length + ' group(s) with Engineering Review Date.', 'success');
                setTimeout(hideMessage, 4000);
            }
            renderTable();
        }).catch(function (e) {
            refreshBtn.disabled = false;
            showMessage('Error: ' + e.message, 'error');
        });
    }

    function fetchAllCustomers() {
        // Paginate through customers
        var all = [];
        function fetchPage(page) {
            return apiFetch('/api/customers?pageSize=1000&page=' + page + '&sortProperty=title&sortOrder=ASC')
                .then(function (resp) {
                    if (!resp || !resp.data) return all;
                    all = all.concat(resp.data);
                    if (resp.hasNext) return fetchPage(page + 1);
                    return all;
                });
        }
        return fetchPage(0);
    }

    function processOwners(owners) {
        var idx = 0;
        function nextOwner() {
            if (idx >= owners.length) return Promise.resolve();
            var owner = owners[idx++];
            showMessage('Scanning ' + owner.name + ' (' + idx + '/' + owners.length + ')...', 'info');
            return apiFetch('/api/entityGroups/' + owner.type + '/' + owner.id + '/DEVICE')
                .then(function (groups) {
                    if (!groups || !Array.isArray(groups)) return;
                    // Filter out "All" group
                    groups = groups.filter(function (g) { return g.name !== 'All'; });
                    return processGroupsBatched(groups, owner.name);
                })
                .then(nextOwner);
        }
        return nextOwner();
    }

    function processGroupsBatched(groups, ownerName) {
        var batchSize = 3;
        var idx = 0;

        function nextBatch() {
            if (idx >= groups.length) return Promise.resolve();
            var batch = groups.slice(idx, idx + batchSize);
            idx += batchSize;

            var promises = batch.map(function (grp) {
                var groupId = extractId(grp.id);
                return apiFetch('/api/plugins/telemetry/ENTITY_GROUP/' + groupId + '/values/attributes/SERVER_SCOPE?keys=Engineering Review Date,Engineering Reviewed')
                    .then(function (attrs) {
                        if (!attrs || !Array.isArray(attrs)) return;
                        var reviewDateAttr = null;
                        var reviewedAttr = null;
                        attrs.forEach(function (a) {
                            if (a.key === 'Engineering Review Date') reviewDateAttr = a;
                            if (a.key === 'Engineering Reviewed') reviewedAttr = a;
                        });
                        // Only include if Engineering Review Date exists
                        if (reviewDateAttr) {
                            allRows.push({
                                customer: ownerName,
                                group: grp.name,
                                groupId: groupId,
                                reviewDate: reviewDateAttr.value,
                                reviewed: reviewedAttr ? reviewedAttr.value : false
                            });
                        }
                    })
                    .catch(function (e) {
                        console.warn('Failed to fetch attrs for group ' + grp.name + ':', e.message);
                    });
            });

            return Promise.all(promises).then(nextBatch);
        }
        return nextBatch();
    }

    // -- Refresh button --
    refreshBtn.addEventListener('click', function () {
        loadEngReviewTable();
    });

};
