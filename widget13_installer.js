self.onInit = function () {

    // ── Valid PINs → installer display names ──
    // Add / remove PINs here. Keys are 4-digit strings, values are display names.
    var VALID_PINS = {
        '1234': 'Installer 1',
        '5678': 'Installer 2',
        '0000': 'Admin'
    };

    // ── DOM refs (w13- prefix) ──
    var pinScreen   = document.getElementById('w13-pinScreen');
    var pinDots     = document.getElementById('w13-pinDots').querySelectorAll('.w13-pin-dot');
    var pinPad      = document.getElementById('w13-pinPad');
    var pinError    = document.getElementById('w13-pinError');
    var app         = document.getElementById('w13-app');
    var userNameEl  = document.getElementById('w13-userName');
    var logoutBtn   = document.getElementById('w13-logoutBtn');
    var statusMsg   = document.getElementById('w13-statusMsg');
    var deviceInput = document.getElementById('w13-deviceInput');
    var lookupBtn   = document.getElementById('w13-lookupBtn');
    var scanSection = document.getElementById('w13-scanSection');
    var deviceCard  = document.getElementById('w13-deviceCard');
    var devNameEl   = document.getElementById('w13-devName');
    var devLabelEl  = document.getElementById('w13-devLabel');
    var devOwnerEl  = document.getElementById('w13-devOwner');
    var devModelEl  = document.getElementById('w13-devModel');
    var devPropertyEl  = document.getElementById('w13-devProperty');
    var devInstalledEl = document.getElementById('w13-devInstalled');
    var devReadingEl   = document.getElementById('w13-devReading');
    var devReadingDate = document.getElementById('w13-devReadingDate');
    var fApartment  = document.getElementById('w13-fApartment');
    var fLocation   = document.getElementById('w13-fLocation');
    var fPipeSize   = document.getElementById('w13-fPipeSize');
    var fPipeType   = document.getElementById('w13-fPipeType');
    var fInstallDate = document.getElementById('w13-fInstallDate');
    var fNotes      = document.getElementById('w13-fNotes');
    var photoInput  = document.getElementById('w13-photoInput');
    var photoPreview = document.getElementById('w13-photoPreview');
    var saveBtn     = document.getElementById('w13-saveBtn');
    var completeBtn = document.getElementById('w13-completeBtn');
    var replaceBtn  = document.getElementById('w13-replaceBtn');

    var currentInstaller = null;   // display name after PIN
    var selectedDevice   = null;   // { uuid, name, label }
    var pinEntry         = '';     // digits entered so far
    var pinLocked        = false;  // lock input during shake animation

    // ── Get JWT token ──
    // Works for both authenticated and public dashboards.
    // TB issues a session JWT even for public dashboard access (publicId + secret).
    function getToken() {
        try { var t = self.ctx.authService.getCurrentJWTToken(); if (t) return t; } catch (e) {}
        try { var t = localStorage.getItem('jwt_token'); if (t) return t; } catch (e) {}
        return '';
    }

    // ── API fetch ──
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
        return obj.id || '';
    }

    // ── Status messages ──
    function showMessage(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = 'w13-status ' + (type || 'info');
    }
    function hideMessage() {
        statusMsg.className = 'w13-status';
        statusMsg.textContent = '';
    }

    // ── Format number with commas ──
    function formatNumber(n) {
        if (n == null || isNaN(n)) return '--';
        return Math.round(n).toLocaleString();
    }

    // ═══════════════════════════════════════════
    //  PIN AUTHENTICATION
    // ═══════════════════════════════════════════

    function updatePinDots() {
        for (var i = 0; i < pinDots.length; i++) {
            pinDots[i].classList.remove('filled', 'error');
            if (i < pinEntry.length) pinDots[i].classList.add('filled');
        }
    }

    function shakePin() {
        pinLocked = true;
        for (var i = 0; i < pinDots.length; i++) {
            pinDots[i].classList.add('error');
        }
        pinError.textContent = 'Invalid PIN';
        setTimeout(function () {
            pinEntry = '';
            updatePinDots();
            pinError.textContent = '';
            pinLocked = false;
        }, 800);
    }

    function validatePin() {
        var name = VALID_PINS[pinEntry];
        if (name) {
            currentInstaller = name;
            pinScreen.style.display = 'none';
            app.style.display = 'flex';
            userNameEl.textContent = name;

            // Auto-load device from TB state controller (set by QR → landing page → TB redirect)
            loadDeviceFromState();
        } else {
            shakePin();
        }
    }

    pinPad.addEventListener('click', function (e) {
        if (pinLocked) return;
        var key = e.target.getAttribute('data-key');
        if (!key) return;

        if (key === 'del') {
            if (pinEntry.length > 0) {
                pinEntry = pinEntry.slice(0, -1);
                updatePinDots();
            }
            return;
        }

        if (pinEntry.length >= 4) return;
        pinEntry += key;
        updatePinDots();

        if (pinEntry.length === 4) {
            setTimeout(validatePin, 150);
        }
    });

    // ── Logout ──
    logoutBtn.addEventListener('click', function () {
        currentInstaller = null;
        selectedDevice = null;
        pinEntry = '';
        updatePinDots();
        app.style.display = 'none';
        pinScreen.style.display = 'flex';
        deviceCard.style.display = 'none';
        deviceInput.value = '';
        hideMessage();
        clearForm();
    });

    // ═══════════════════════════════════════════
    //  DEVICE FROM TB STATE CONTROLLER
    // ═══════════════════════════════════════════
    //
    //  The QR flow:
    //    1. QR scan  → dunelabs.ai/meters/?sn=SERIAL&tk=TOKEN
    //    2. Landing  → redirects to TB public dashboard URL with state param:
    //         /dashboard/{dashId}?publicId=...&state=BASE64&secret=...
    //    3. The state param decodes to JSON:
    //         [{"id":"default","params":{
    //            "entityId":{"id":"UUID","entityType":"DEVICE"},
    //            "entityName":"Device 65831763",
    //            "entityLabel":"Device 65831763"
    //         }}]
    //    4. TB injects this into stateController so widgets can read it.
    //
    //  When state provides a device, we hide the search bar and auto-load.
    //  When no state (standalone mode), show search bar for manual lookup.

    function loadDeviceFromState() {
        var stateDevice = null;

        // Method 1: TB stateController (preferred)
        try {
            var stateParams = self.ctx.stateController.getStateParams();
            if (stateParams && stateParams.entityId) {
                stateDevice = {
                    uuid: extractId(stateParams.entityId),
                    name: stateParams.entityName || '',
                    label: stateParams.entityLabel || ''
                };
            }
        } catch (e) {}

        // Method 2: Parse state param from URL directly (fallback)
        if (!stateDevice) {
            try {
                var params = new URLSearchParams(window.location.search);
                var stateB64 = params.get('state');
                if (stateB64) {
                    var stateJson = JSON.parse(atob(stateB64));
                    if (Array.isArray(stateJson) && stateJson.length > 0) {
                        var p = stateJson[0].params;
                        if (p && p.entityId) {
                            stateDevice = {
                                uuid: extractId(p.entityId),
                                name: p.entityName || '',
                                label: p.entityLabel || ''
                            };
                        }
                    }
                }
            } catch (e) {}
        }

        // Method 3: Check for deviceId/deviceName URL params (direct link)
        if (!stateDevice) {
            try {
                var params = new URLSearchParams(window.location.search);
                var devId   = params.get('deviceId') || params.get('deviceid');
                var devName = params.get('deviceName') || params.get('devicename');
                if (devId) {
                    deviceInput.value = devId;
                    lookupDevice(devId, 'id');
                    return;
                } else if (devName) {
                    deviceInput.value = devName;
                    lookupDevice(devName, 'name');
                    return;
                }
            } catch (e) {}
        }

        if (stateDevice && stateDevice.uuid) {
            // Device came from QR/state → hide search, auto-load
            scanSection.style.display = 'none';
            selectedDevice = stateDevice;
            showMessage('Loading ' + (stateDevice.name || stateDevice.uuid) + '...', 'info');

            loadDeviceDetails(stateDevice.uuid).then(function () {
                deviceCard.style.display = 'block';
                enableButtons(true);
                showMessage('Device loaded: ' + selectedDevice.name, 'success');
            }).catch(function (err) {
                showMessage('Error loading device: ' + err.message, 'error');
                // Show search as fallback
                scanSection.style.display = '';
            });
        } else {
            // No device in state → show search bar
            scanSection.style.display = '';
        }
    }

    // ═══════════════════════════════════════════
    //  MANUAL DEVICE LOOKUP (fallback / standalone)
    // ═══════════════════════════════════════════

    lookupBtn.addEventListener('click', function () {
        var val = deviceInput.value.trim();
        if (!val) return;
        // Detect UUID format
        var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        lookupDevice(val, isUuid ? 'id' : 'name');
    });

    // Also allow Enter key in search field
    deviceInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            lookupBtn.click();
        }
    });

    function lookupDevice(value, mode) {
        lookupBtn.disabled = true;
        lookupBtn.textContent = 'Searching...';
        hideMessage();
        deviceCard.style.display = 'none';
        clearForm();

        var promise;
        if (mode === 'id') {
            // Direct device fetch by UUID
            promise = apiFetch('/api/device/' + value)
                .then(function (dev) {
                    if (!dev) throw new Error('Device not found');
                    return dev;
                });
        } else {
            // Search by name -- use device search API
            promise = apiFetch(
                '/api/tenant/devices?pageSize=10&page=0&textSearch=' +
                encodeURIComponent(value)
            ).then(function (result) {
                var devices = (result && result.data) ? result.data : [];
                // Exact name match first, then partial
                var exact = devices.find(function (d) {
                    return d.name.toLowerCase() === value.toLowerCase();
                });
                if (exact) return exact;
                if (devices.length > 0) return devices[0];
                throw new Error('No device found matching "' + value + '"');
            });
        }

        promise.then(function (dev) {
            selectedDevice = {
                uuid: extractId(dev.id),
                name: dev.name || '',
                label: dev.label || ''
            };
            return loadDeviceDetails(selectedDevice.uuid);
        }).then(function () {
            deviceCard.style.display = 'block';
            enableButtons(true);
            showMessage('Device loaded: ' + selectedDevice.name, 'success');
        }).catch(function (err) {
            showMessage(err.message, 'error');
        }).then(function () {
            lookupBtn.disabled = false;
            lookupBtn.textContent = 'Lookup';
        });
    }

    // ═══════════════════════════════════════════
    //  LOAD DEVICE DETAILS
    // ═══════════════════════════════════════════

    function loadDeviceDetails(uuid) {
        // Fetch attributes + latest telemetry in parallel (2 combined attr calls)
        var srvP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid +
            '/values/attributes/SERVER_SCOPE?keys=' +
            encodeURIComponent('Apartment,Installed,Replace,Install Date,Install Notes,pipesize,pipeType,location')
        ).catch(function () { return []; });

        var shrP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid +
            '/values/attributes/SHARED_SCOPE?keys=' +
            encodeURIComponent('Property,Model')
        ).catch(function () { return []; });

        var tsP = apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid +
            '/values/timeseries?keys=meterValFlash' +
            '&startTs=0&endTs=' + (Date.now() + 86400000) +
            '&limit=1&agg=NONE&orderBy=DESC'
        ).catch(function () { return {}; });

        // Get device owner info
        var ownerP = apiFetch('/api/device/' + uuid)
            .then(function (dev) {
                if (dev && dev.customerId && extractId(dev.customerId)) {
                    var custId = extractId(dev.customerId);
                    // Check if it's the "public" null customer
                    if (custId === '13814000-1dd2-11b2-8080-808080808080') return 'Tenant';
                    return apiFetch('/api/customer/' + custId)
                        .then(function (c) { return c && c.title ? c.title : 'Unknown'; })
                        .catch(function () { return 'Unknown'; });
                }
                return 'Tenant';
            }).catch(function () { return '--'; });

        return Promise.all([srvP, shrP, tsP, ownerP]).then(function (res) {
            var srvMap = {};
            (res[0] || []).forEach(function (a) { srvMap[a.key] = a.value; });
            var shrMap = {};
            (res[1] || []).forEach(function (a) { shrMap[a.key] = a.value; });
            var tsData = res[2] || {};
            var owner  = res[3] || '--';

            // Populate device card
            devNameEl.textContent     = selectedDevice.name;
            devLabelEl.textContent    = selectedDevice.label || '';
            devOwnerEl.textContent    = owner;
            devModelEl.textContent    = shrMap['Model'] || '--';
            devPropertyEl.textContent = shrMap['Property'] || '--';

            var isInstalled = srvMap['Installed'] === true || srvMap['Installed'] === 'true';
            var isReplace   = srvMap['Replace'] === true || srvMap['Replace'] === 'true';
            if (isReplace) {
                devInstalledEl.textContent = '🔄 Replace';
                devInstalledEl.style.color = '#e65100';
            } else if (isInstalled) {
                devInstalledEl.textContent = '✅ Yes';
                devInstalledEl.style.color = '#2e7d32';
            } else {
                devInstalledEl.textContent = '❌ No';
                devInstalledEl.style.color = '#c62828';
            }

            // Latest reading
            var mvf = tsData.meterValFlash;
            if (mvf && mvf.length > 0) {
                devReadingEl.textContent = formatNumber(parseFloat(mvf[0].value));
                devReadingDate.textContent = new Date(mvf[0].ts).toLocaleDateString();
            } else {
                devReadingEl.textContent = '--';
                devReadingDate.textContent = '';
            }

            // Pre-fill form with current attribute values
            fApartment.value   = srvMap['Apartment'] || '';
            fLocation.value    = srvMap['location']  || '';
            fPipeSize.value    = srvMap['pipesize']  || '';
            fPipeType.value    = srvMap['pipeType']  || '';
            fInstallDate.value = srvMap['Install Date'] || '';
            fNotes.value       = srvMap['Install Notes'] || '';

            // Default install date to today if empty
            if (!fInstallDate.value) {
                var today = new Date();
                var mm = String(today.getMonth() + 1).padStart(2, '0');
                var dd = String(today.getDate()).padStart(2, '0');
                fInstallDate.value = today.getFullYear() + '-' + mm + '-' + dd;
            }
        });
    }

    // ═══════════════════════════════════════════
    //  FORM / CLEAR
    // ═══════════════════════════════════════════

    function clearForm() {
        fApartment.value   = '';
        fLocation.value    = '';
        fPipeSize.value    = '';
        fPipeType.value    = '';
        fInstallDate.value = '';
        fNotes.value       = '';
        photoPreview.innerHTML = '';
        selectedDevice = null;
        enableButtons(false);
    }

    function enableButtons(on) {
        saveBtn.disabled     = !on;
        completeBtn.disabled = !on;
        replaceBtn.disabled  = !on;
    }

    function getFormAttributes() {
        var attrs = {};
        if (fApartment.value.trim())   attrs['Apartment']     = fApartment.value.trim();
        if (fLocation.value.trim())    attrs['location']      = fLocation.value.trim();
        if (fPipeSize.value)           attrs['pipesize']      = fPipeSize.value;
        if (fPipeType.value)           attrs['pipeType']      = fPipeType.value;
        if (fInstallDate.value)        attrs['Install Date']  = fInstallDate.value;
        if (fNotes.value.trim())       attrs['Install Notes'] = fNotes.value.trim();
        return attrs;
    }

    // ── Save SERVER_SCOPE attributes ──
    function saveAttributes(uuid, attrs) {
        if (Object.keys(attrs).length === 0) {
            return Promise.resolve();
        }
        return apiFetch(
            '/api/plugins/telemetry/DEVICE/' + uuid + '/attributes/SERVER_SCOPE',
            {
                method: 'POST',
                body: JSON.stringify(attrs)
            }
        );
    }

    // ═══════════════════════════════════════════
    //  PHOTO CAPTURE
    // ═══════════════════════════════════════════

    photoInput.addEventListener('change', function () {
        if (!photoInput.files || !photoInput.files.length) return;
        var file = photoInput.files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = document.createElement('img');
            img.className = 'w13-photo-thumb';
            img.src = e.target.result;
            photoPreview.appendChild(img);
        };
        reader.readAsDataURL(file);
        // Reset input so the same file can be re-selected
        photoInput.value = '';
    });

    // ═══════════════════════════════════════════
    //  ACTION BUTTONS
    // ═══════════════════════════════════════════

    // ── Save Attributes ──
    saveBtn.addEventListener('click', function () {
        if (!selectedDevice) return;
        var attrs = getFormAttributes();
        if (Object.keys(attrs).length === 0) {
            showMessage('No attributes to save.', 'error');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = '💾 Saving...';
        hideMessage();

        saveAttributes(selectedDevice.uuid, attrs).then(function () {
            showMessage('Attributes saved for ' + selectedDevice.name + '.', 'success');
        }).catch(function (err) {
            showMessage('Save failed: ' + err.message, 'error');
        }).then(function () {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Save Attributes';
        });
    });

    // ── Mark Installed ──
    completeBtn.addEventListener('click', function () {
        if (!selectedDevice) return;

        var confirmed = confirm(
            'Mark ' + selectedDevice.name + ' as INSTALLED?\n\n' +
            'This will save all form attributes and set Installed = true.'
        );
        if (!confirmed) return;

        completeBtn.disabled = true;
        completeBtn.textContent = '✅ Saving...';
        hideMessage();

        var attrs = getFormAttributes();
        attrs['Installed'] = true;
        attrs['Replace']   = false;

        saveAttributes(selectedDevice.uuid, attrs).then(function () {
            devInstalledEl.textContent = '✅ Yes';
            devInstalledEl.style.color = '#2e7d32';
            showMessage(selectedDevice.name + ' marked as INSTALLED.', 'success');
        }).catch(function (err) {
            showMessage('Error: ' + err.message, 'error');
        }).then(function () {
            completeBtn.disabled = false;
            completeBtn.innerHTML = '✅ Mark Installed';
        });
    });

    // ── Flag for Replace ──
    replaceBtn.addEventListener('click', function () {
        if (!selectedDevice) return;

        var confirmed = confirm(
            'Flag ' + selectedDevice.name + ' for REPLACEMENT?\n\n' +
            'This sets Replace = true.'
        );
        if (!confirmed) return;

        replaceBtn.disabled = true;
        replaceBtn.textContent = '🔄 Saving...';
        hideMessage();

        var attrs = getFormAttributes();
        attrs['Replace'] = true;

        saveAttributes(selectedDevice.uuid, attrs).then(function () {
            devInstalledEl.textContent = '🔄 Replace';
            devInstalledEl.style.color = '#e65100';
            showMessage(selectedDevice.name + ' flagged for REPLACEMENT.', 'success');
        }).catch(function (err) {
            showMessage('Error: ' + err.message, 'error');
        }).then(function () {
            replaceBtn.disabled = false;
            replaceBtn.innerHTML = '🔄 Flag for Replace';
        });
    });

};

self.onDestroy = function () {};
