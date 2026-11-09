# Verification record

Verified locally on November 9, 2026. Host runtime: Node 23.7.0 on macOS; deploy with Node 24 LTS as specified by `.nvmrc` and Dockerfile. Node 23 is outside the declared supported engine range. SQLite emits an experimental warning on the host runtime.

## Automated checks

- TypeScript strict check passed.
- ESLint passed.
- Vite production build passed; approximately 56 KB gzip JavaScript and 6 KB gzip CSS. No external fonts or frontend image dependencies.
- All 19 Node test cases passed. Coverage includes household time zones, DST, exclusive all-day ends, ongoing events, yearly birthdays, recurring-event cancellation/movement, EXDATE, duplicate UID occurrences, weekly/biweekly/monthly pickup rules, skips/overrides, night schedules/solar fallback/override expiry, schema validation, API authorization and CSRF, list persistence and version conflicts, settings conflicts, session revocation, and conditional GETs.
- Provider adapter tests cover normalized forecast probabilities, NWS alert records, cached data after failure, retry backoff, recovery, unconfigured live calendars, Google HTTP 304 feed reuse, and discarding an in-flight forecast after a location change.
- `npm audit` and production-only audit reported zero known vulnerabilities at verification time. A minimatch override selects the patched 11.x implementation; typecheck/lint/build were verified with that override.

Tests use temporary databases and a real local HTTP listener. Calendar tests use explicit ICS fixtures and mock provider responses; they do not contact a private Google calendar.

## Real provider checks

- The actual Open-Meteo adapter successfully fetched current conditions, 168 hourly entries and seven daily entries for the default Centreville location.
- The actual NWS adapter successfully returned an empty active-alert array for that point. This verifies access and response parsing, not the delivery of a live severe-weather alert. Alert rendering and normalization use controlled fixture data in tests/source.
- No private Google feed was supplied, so authentication/access to the household’s real Google Calendar is **not verified**.

## Browser checks

Used the available in-app browser with explicit viewport overrides:

- 1280×800 landscape: full dashboard has no document overflow; every main panel’s content fits its allocated height.
- 1024×600 landscape: compact calendar and weather/upcoming views work without document or visible panel overflow.
- 390×844 phone: management form and lists fit the width and intentionally scroll vertically.
- Month, week and daily agenda navigation and seven-day weather toggle were exercised.
- Added a demo grocery item, completed it, renamed it and reloaded; the persisted item remained completed. The local demo database retains that harmless completed sample.
- Saved an expiring day override, verified it on the display, then restored automatic scheduling and observed night mode.
- Served the production build locally with its service worker. After a successful load/reload, stopped the server and reloaded again: the app shell and last-known snapshot remained visible with an explicit offline label. Restarted the server and reloaded: normal status returned.
- The production startup check produced no browser console errors. Transient Vite errors during source edits were resolved by reload and are not production failures.

Screenshots: [dashboard](dashboard-preview.png), [phone management](management-preview.png), [night mode](night-preview.png).

## Still requires the deployment environment

- Docker is not installed on this host. Dockerfile/Compose/Caddy configuration has been prepared and reviewed, but image build, TLS issuance and remote deployment have **not** been executed.
- Private Google feed sync must be checked with the actual calendars after configuration.
- The PF1508’s firmware, browser version, launcher boot configuration, network recovery and display brightness must be tested on the physical device.
- This session did not conduct a weeks-long memory soak test, a physical Wi-Fi disconnect/reconnect test, load testing or a security penetration test. The implementation bounds caches and recurrence windows, cleans up frontend timers/listeners, limits polling and provider responses, and uses retry/backoff, but these safeguards are not a substitute for a long device soak.
- Remote backups/restores and host reboot recovery should be rehearsed on the selected host before relying on it permanently.
