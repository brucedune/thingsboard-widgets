# ThingsBoard PE Custom Widgets

## Overview
Custom widgets for ThingsBoard Professional Edition (PE) managing IoT devices (water meters). These run as "Latest values" widget type in ThingsBoard dashboards with no datasource configured — all data is fetched via REST API using JWT auth.

## Instance
- ThingsBoard PE at `thingsboard.dunelabs.ai`
- Auth: `self.ctx.authService.getCurrentJWTToken()` with fallback to `localStorage.getItem('jwt_token')`

## Widgets

### Widget 1 — Move/Remove Devices (`w1-` prefix)
- **Files:** `widget1_template.html` (HTML + CSS), `widget1_move_remove.js`
- **Purpose:** Select devices from a source group and either remove them or move them to a target group (including cross-owner moves)
- **Features:**
  - Owner type selector (Tenant/Customer)
  - Searchable dropdowns for Customer, Source Group, Target Customer, Target Group
  - Live device search filter (name, property, apartment)
  - Attribute-based device selection filter (Installed/Replace boolean, TRUE/FALSE)
  - Cross-owner moves using ThingsBoard PE ownership API
  - Confirmation dialogs before destructive actions

### Widget 2 — Device Attribute Management (`w2-` prefix)
- **Files:** `widget2_template.html` (HTML + CSS), `widget2_device_attributes.js`
- **Purpose:** Bulk change or delete attributes across all devices in a group
- **Features:**
  - Searchable dropdowns for Customer, Group, Attribute
  - Hardcoded attribute list: gen2fw, Apartment, Install Notes, pipesize, pipeType, Model, Install Date, Type, location, Move Date
  - Auto-detects attribute type (boolean/number/string) from sample device
  - Change value or delete attribute actions
  - Per-device error reporting

### Widget 3 — Meter Reading Comparison (`w3-` prefix)
- **Files:** `widget3_template.html` (HTML + CSS), `widget3_meter_diff.js`
- **Purpose:** Calculate meterValFlash telemetry difference between two dates for all devices in a group, with previous period comparison
- **Features:**
  - All inputs on one row (full-width dashboard layout)
  - Fetches first/last `meterValFlash` reading in date range
  - Automatic previous period calculation (same duration, immediately prior)
  - Sortable columns (click header to sort, click again to reverse)
  - Sticky table headers
  - % Change column (absolute magnitude for sorting — used as error function)
  - Trend arrows (▲ red = up, ▼ green = down)
  - CSV export with all columns
  - Default sort: Apartment ascending (numeric sort)

## Key Architecture Decisions

### ID Prefixing Convention
Every widget uses a unique prefix for all HTML element IDs (`w1-`, `w2-`, `w3-`, etc.) because all widgets on a ThingsBoard dashboard share the same `document`. Without prefixes, `document.getElementById` returns the wrong element. **Always increment the prefix for new widgets.**

### No Framework Dependencies
All widgets use pure DOM manipulation — no Angular directives, no jQuery. This is intentional for compatibility across ThingsBoard versions.

### Searchable Dropdowns (`makeSearchable`)
Custom dropdown replacement: hides the native `<select>`, creates a face div + dropdown panel with search input. Key details:
- `autocomplete="off"` plus `autocorrect`, `autocapitalize`, `spellcheck` off, and random `name` attribute to prevent browser autofill hijacking
- `MutationObserver` syncs the face text when `populateSelect` rebuilds options programmatically
- Overrides the `disabled` property to mirror styling to the face div

### ThingsBoard PE API Specifics
- **Entity groups:** `GET /api/entityGroups/{ownerType}/{ownerId}/DEVICE` — returns groups, filter out "All"
- **Group entities:** `GET /api/entityGroup/{groupId}/entities?pageSize=1000&page=0`
- **Add to group:** `POST /api/entityGroup/{groupId}/addEntities` — body is plain UUID string array `["uuid1","uuid2"]` (NOT entity objects)
- **Remove from group:** `POST /api/entityGroup/{groupId}/deleteEntities` — same format
- **Change device owner (PE only):** `POST /api/owner/CUSTOMER/{customerId}/DEVICE/{deviceId}` — no body needed. The CE endpoint `/api/customer/{id}/device/{id}` does NOT exist in PE (returns 404 "No static resource")
- **Return to tenant:** `POST /api/owner/TENANT/{tenantId}/DEVICE/{deviceId}`
- **Cross-owner move flow:** Change ownership first, then addEntities to target group, then deleteEntities from source (source delete may fail silently if PE auto-removed it — that's OK)
- **Telemetry attributes:** `GET /api/plugins/telemetry/DEVICE/{uuid}/values/attributes/{scope}?keys=...`
- **Timeseries:** `GET /api/plugins/telemetry/DEVICE/{uuid}/values/timeseries?keys=...&startTs=...&endTs=...&limit=1&agg=NONE&orderBy=ASC|DESC`

### apiFetch Error Handling
- Checks for HTML content-type (indicates session expiry redirect)
- Uses `r.text()` then `JSON.parse()` instead of `r.json()` to handle empty/non-JSON responses gracefully (the PE ownership endpoint returns non-standard responses)
- Widget 2 has `allowNotFound` parameter for DELETE operations where 404 = attribute didn't exist

## Device Attributes Reference
- **Property:** SHARED_SCOPE
- **Apartment:** SERVER_SCOPE
- **Installed:** SERVER_SCOPE (boolean)
- **Replace:** SERVER_SCOPE (boolean)
- **Telemetry key for meter readings:** `meterValFlash`

## Adding a New Widget
1. Create `widgetN_template.html` and `widgetN_whatever.js`
2. Use `wN-` prefix on ALL element IDs (HTML and JS `getElementById` calls)
3. Use `wN-` prefix on radio button `name` attributes
4. Copy the `apiFetch`, `getToken`, `extractId`, `populateSelect`, and `makeSearchable` functions from an existing widget
5. In ThingsBoard: create as "Latest values" widget type, add a dummy datasource (Current tenant + any key) to enable the Add button
6. CSS goes in a `<style>` block inside the HTML template
