self.onInit = function () {

    // -- DOM refs (w9- prefix) --
    var customerNameEl = document.getElementById('w9-customerName');
    var groupNameEl    = document.getElementById('w9-groupName');
    var csvFileEl      = document.getElementById('w9-csvFile');
    var importBtn      = document.getElementById('w9-importBtn');
    var mappingPanel   = document.getElementById('w9-mappingPanel');
    var mappingRow     = document.getElementById('w9-mappingRow');
    var previewPanel   = document.getElementById('w9-previewPanel');
    var previewCount   = document.getElementById('w9-previewCount');
    var previewHead    = document.getElementById('w9-previewHead');
    var previewBody    = document.getElementById('w9-previewBody');
    var statusMsg      = document.getElementById('w9-statusMsg');
    var progressPanel  = document.getElementById('w9-progressPanel');
    var progressFill   = document.getElementById('w9-progressFill');
    var progressText   = document.getElementById('w9-progressText');
    var logPanel       = document.getElementById('w9-logPanel');
    var logEl          = document.getElementById('w9-log');

    var currentUser = null;
    var csvHeaders  = [];
    var csvRows     = [];

    // Mapping targets
    var MAPPING_OPTIONS = [
        { value: '', label: '-- Skip --' },
        { value: 'deviceName', label: 'Device Name (required)' },
        { value: 'deviceLabel', label: 'Device Label' },
        { value: 'attr:Property', label: 'Attr: Property (SHARED)' },
        { value: 'attr:Apartment', label: 'Attr: Apartment (SERVER)' },
        { value: 'attr:Install Date', label: 'Attr: Install Date (SERVER)' },
        { value: 'attr:Install Notes', label: 'Attr: Install Notes (SERVER)' },
        { value: 'attr:pipesize', label: 'Attr: pipesize (SERVER)' },
        { value: 'attr:pipeType', label: 'Attr: pipeType (SERVER)' },
        { value: 'attr:Model', label: 'Attr: Model (SHARED)' },
        { value: 'attr:Type', label: 'Attr: Type (SERVER)' },
        { value: 'attr:location', label: 'Attr: location (SERVER)' },
        { value: 'custom', label: 'Custom Attribute...' }
    ];

    // Attributes that go to SHARED_SCOPE
    var SHARED_ATTRS = ['Property', 'Model', 'gen2fw', 'allowTiFotaVer'];

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
                        throw new Error('API ' + r.status + ': ' + errText);
                    });
                }
                return r.text().then(function (text) {
                    if (!text) return null;
                    return JSON.parse(text);
                });
            });
    }

    function extractId(obj) {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        if (obj.id) {
            if (typeof obj.id === 'string') return obj.id;
            if (obj.id.id) return obj.id.id;
        }
        return '';
    }

    // -- Message helpers --
    function showMessage(text, type) {
        statusMsg.textContent = text;
        statusMsg.className   = 'w9-message w9-msg-' + type;
        statusMsg.style.display = 'block';
    }
    function hideMessage() { statusMsg.style.display = 'none'; }

    function addLog(text, type) {
        var line = document.createElement('div');
        line.className = 'w9-log-' + (type || 'info');
        line.textContent = text;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function setProgress(pct, text) {
        progressFill.style.width = pct + '%';
        progressText.textContent = text;
    }

    // -- Parse CSV --
    function parseCSV(text) {
        var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
        if (lines.length < 2) return { headers: [], rows: [] };

        // Detect delimiter
        var firstLine = lines[0];
        var delimiter = ',';
        if (firstLine.indexOf('\t') !== -1) delimiter = '\t';
        else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';

        function parseLine(line) {
            var fields = [];
            var current = '';
            var inQuotes = false;
            for (var i = 0; i < line.length; i++) {
                var ch = line[i];
                if (inQuotes) {
                    if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else if (ch === '"') {
                        inQuotes = false;
                    } else {
                        current += ch;
                    }
                } else {
                    if (ch === '"') {
                        inQuotes = true;
                    } else if (ch === delimiter) {
                        fields.push(current.trim());
                        current = '';
                    } else {
                        current += ch;
                    }
                }
            }
            fields.push(current.trim());
            return fields;
        }

        var headers = parseLine(lines[0]);
        var rows = [];
        for (var i = 1; i < lines.length; i++) {
            var fields = parseLine(lines[i]);
            if (fields.length === headers.length) {
                var row = {};
                headers.forEach(function (h, idx) { row[h] = fields[idx]; });
                rows.push(row);
            }
        }
        return { headers: headers, rows: rows };
    }

    // -- Auto-guess mapping based on column name --
    function guessMapping(colName) {
        var lower = colName.toLowerCase().replace(/[_\s-]/g, '');
        if (lower === 'devicename' || lower === 'device' || lower === 'name' || lower === 'serialnumber' || lower === 'serial') return 'deviceName';
        if (lower === 'devicelabel' || lower === 'label') return 'deviceLabel';
        if (lower === 'property' || lower === 'propertyname') return 'attr:Property';
        if (lower === 'apartment' || lower === 'unit' || lower === 'unitname' || lower === 'unitnumber' || lower === 'apt') return 'attr:Apartment';
        if (lower === 'installdate' || lower === 'dateinstalled') return 'attr:Install Date';
        if (lower === 'installnotes' || lower === 'notes') return 'attr:Install Notes';
        if (lower === 'pipesize') return 'attr:pipesize';
        if (lower === 'pipetype') return 'attr:pipeType';
        if (lower === 'model') return 'attr:Model';
        if (lower === 'type' || lower === 'metertype') return 'attr:Type';
        if (lower === 'location') return 'attr:location';
        return '';
    }

    // -- Build mapping dropdowns --
    function buildMappings() {
        mappingRow.innerHTML = '';
        csvHeaders.forEach(function (col) {
            var item = document.createElement('div');
            item.className = 'w9-mapping-item';

            var lbl = document.createElement('label');
            lbl.textContent = col;
            item.appendChild(lbl);

            var sel = document.createElement('select');
            sel.dataset.col = col;
            MAPPING_OPTIONS.forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                sel.appendChild(o);
            });

            // Auto-guess
            var guess = guessMapping(col);
            if (guess) sel.value = guess;

            sel.addEventListener('change', function () {
                if (sel.value === 'custom') {
                    var customName = prompt('Enter the attribute name for column "' + col + '":');
                    if (customName && customName.trim()) {
                        // Add custom option
                        var co = document.createElement('option');
                        co.value = 'attr:' + customName.trim();
                        co.textContent = 'Attr: ' + customName.trim();
                        sel.insertBefore(co, sel.lastChild);
                        sel.value = co.value;
                    } else {
                        sel.value = '';
                    }
                }
                updateImportBtn();
            });

            item.appendChild(sel);
            mappingRow.appendChild(item);
        });
        mappingPanel.style.display = 'block';
        updateImportBtn();
    }

    // -- Render preview table --
    function renderPreview() {
        previewHead.innerHTML = '';
        previewBody.innerHTML = '';

        var headRow = document.createElement('tr');
        csvHeaders.forEach(function (h) {
            var th = document.createElement('th');
            th.textContent = h;
            headRow.appendChild(th);
        });
        previewHead.appendChild(headRow);

        var maxRows = Math.min(csvRows.length, 100);
        for (var i = 0; i < maxRows; i++) {
            var tr = document.createElement('tr');
            csvHeaders.forEach(function (h) {
                var td = document.createElement('td');
                td.textContent = csvRows[i][h] || '';
                tr.appendChild(td);
            });
            previewBody.appendChild(tr);
        }

        previewCount.textContent = csvRows.length + ' rows' + (csvRows.length > 100 ? ' (showing first 100)' : '');
        previewPanel.style.display = 'block';
    }

    // -- Update import button state --
    function updateImportBtn() {
        var hasCustomer = customerNameEl.value.trim() !== '';
        var hasGroup    = groupNameEl.value.trim() !== '';
        var hasFile     = csvRows.length > 0;
        var hasDevName  = false;

        var selects = mappingRow.querySelectorAll('select');
        selects.forEach(function (sel) {
            if (sel.value === 'deviceName') hasDevName = true;
        });

        importBtn.disabled = !(hasCustomer && hasGroup && hasFile && hasDevName);
    }

    // -- File change handler --
    csvFileEl.addEventListener('change', function () {
        var file = csvFileEl.files[0];
        if (!file) return;

        hideMessage();
        var reader = new FileReader();
        reader.onload = function (e) {
            var result = parseCSV(e.target.result);
            csvHeaders = result.headers;
            csvRows    = result.rows;

            if (csvHeaders.length === 0 || csvRows.length === 0) {
                showMessage('CSV file is empty or could not be parsed.', 'error');
                return;
            }

            buildMappings();
            renderPreview();
            showMessage('Parsed ' + csvRows.length + ' rows with ' + csvHeaders.length + ' columns.', 'info');
        };
        reader.readAsText(file);
    });

    customerNameEl.addEventListener('input', updateImportBtn);
    groupNameEl.addEventListener('input', updateImportBtn);

    // -- Get column mappings --
    function getMappings() {
        var mappings = {};
        var selects = mappingRow.querySelectorAll('select');
        selects.forEach(function (sel) {
            if (sel.value) {
                mappings[sel.dataset.col] = sel.value;
            }
        });
        return mappings;
    }

    // -- Import button handler --
    importBtn.addEventListener('click', function () {
        var customerName = customerNameEl.value.trim();
        var groupName    = groupNameEl.value.trim();
        var mappings     = getMappings();

        if (!customerName || !groupName || csvRows.length === 0) return;

        // Find device name column
        var deviceNameCol = null;
        var deviceLabelCol = null;
        Object.keys(mappings).forEach(function (col) {
            if (mappings[col] === 'deviceName') deviceNameCol = col;
            if (mappings[col] === 'deviceLabel') deviceLabelCol = col;
        });

        if (!deviceNameCol) {
            showMessage('Please map a column to "Device Name".', 'error');
            return;
        }

        if (!window.confirm(
            'This will create:\n' +
            '- Customer: "' + customerName + '"\n' +
            '- Device Group: "' + groupName + '"\n' +
            '- ' + csvRows.length + ' devices\n\n' +
            'Continue?'
        )) return;

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        progressPanel.style.display = 'block';
        logPanel.style.display = 'block';
        logEl.innerHTML = '';
        hideMessage();

        var customerId = null;
        var groupId    = null;
        var totalSteps = csvRows.length + 2; // customer + group + devices
        var completed  = 0;

        function tick(text) {
            completed++;
            setProgress(Math.round((completed / totalSteps) * 100), text);
        }

        // Step 1: Create customer
        addLog('Creating customer "' + customerName + '"...', 'info');
        setProgress(0, 'Creating customer...');

        apiFetch('/api/customer', {
            method: 'POST',
            body: JSON.stringify({ title: customerName })
        }).then(function (customer) {
            customerId = extractId(customer);
            addLog('Customer created: ' + customerId, 'ok');
            tick('Customer created');

            // Step 2: Create device group under customer
            addLog('Creating device group "' + groupName + '"...', 'info');
            return apiFetch('/api/entityGroup', {
                method: 'POST',
                body: JSON.stringify({
                    name: groupName,
                    type: 'DEVICE',
                    ownerId: {
                        id: customerId,
                        entityType: 'CUSTOMER'
                    }
                })
            });
        }).then(function (group) {
            groupId = extractId(group);
            addLog('Device group created: ' + groupId, 'ok');
            tick('Device group created');

            // Step 3: Create devices one by one
            return processDevices(0);
        }).then(function () {
            setProgress(100, 'Import complete!');
            showMessage('Import complete: ' + csvRows.length + ' devices created.', 'success');
            importBtn.textContent = 'Import';
            importBtn.disabled = false;
        }).catch(function (e) {
            addLog('ERROR: ' + e.message, 'err');
            showMessage('Import failed: ' + e.message, 'error');
            importBtn.textContent = 'Import';
            importBtn.disabled = false;
        });

        function processDevices(index) {
            if (index >= csvRows.length) return Promise.resolve();

            var row = csvRows[index];
            var devName  = row[deviceNameCol] || ('Device-' + (index + 1));
            var devLabel = deviceLabelCol ? (row[deviceLabelCol] || '') : '';

            var deviceBody = {
                name: devName,
                type: 'default'
            };
            if (devLabel) deviceBody.label = devLabel;

            addLog('(' + (index + 1) + '/' + csvRows.length + ') Creating device "' + devName + '"...', 'info');

            return apiFetch('/api/device', {
                method: 'POST',
                body: JSON.stringify(deviceBody)
            }).then(function (device) {
                var deviceId = extractId(device);

                // Assign ownership to customer
                return apiFetch('/api/owner/CUSTOMER/' + customerId + '/DEVICE/' + deviceId, {
                    method: 'POST'
                }).then(function () {
                    // Add to group
                    return apiFetch('/api/entityGroup/' + groupId + '/addEntities', {
                        method: 'POST',
                        body: JSON.stringify([deviceId])
                    });
                }).then(function () {
                    // Set attributes from mapped columns
                    var serverAttrs = {};
                    var sharedAttrs = {};

                    Object.keys(mappings).forEach(function (col) {
                        var target = mappings[col];
                        if (target.indexOf('attr:') === 0) {
                            var attrName = target.substring(5);
                            var val = row[col];
                            if (val !== undefined && val !== '') {
                                if (SHARED_ATTRS.indexOf(attrName) !== -1) {
                                    sharedAttrs[attrName] = val;
                                } else {
                                    serverAttrs[attrName] = val;
                                }
                            }
                        }
                    });

                    var attrPromises = [];
                    if (Object.keys(serverAttrs).length > 0) {
                        attrPromises.push(apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + deviceId + '/attributes/SERVER_SCOPE',
                            { method: 'POST', body: JSON.stringify(serverAttrs) }
                        ));
                    }
                    if (Object.keys(sharedAttrs).length > 0) {
                        attrPromises.push(apiFetch(
                            '/api/plugins/telemetry/DEVICE/' + deviceId + '/attributes/SHARED_SCOPE',
                            { method: 'POST', body: JSON.stringify(sharedAttrs) }
                        ));
                    }
                    return Promise.all(attrPromises);
                }).then(function () {
                    addLog('  Device "' + devName + '" created + assigned + attributes set', 'ok');
                    tick('Device ' + (index + 1) + ' of ' + csvRows.length);
                });
            }).catch(function (e) {
                addLog('  ERROR on "' + devName + '": ' + e.message, 'err');
                tick('Device ' + (index + 1) + ' (error)');
            }).then(function () {
                return processDevices(index + 1);
            });
        }
    });

    // -- Load current user --
    apiFetch('/api/auth/user').then(function (user) {
        currentUser = user;
    }).catch(function (e) {
        showMessage('Could not load user: ' + e.message, 'error');
    });
};

self.onDestroy = function () {};
