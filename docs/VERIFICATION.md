# Verification record

Verified locally on November 9, 2026. The full updated suite passed under Node 24 on macOS, matching the AWS Lambda/Vercel target and `.nvmrc`. The host default is Node 23.7.0; an isolated Node 24 runtime was used for final verification.

## Automated checks

- TypeScript strict check passed.
- ESLint passed.
- Vite production build passed; approximately 56 KB gzip JavaScript and 6 KB gzip CSS. No external fonts or frontend image dependencies.
- All 25 Node test cases passed. Coverage includes household time zones, DST, exclusive all-day ends, ongoing events, yearly birthdays, recurring-event cancellation/movement, EXDATE, duplicate UID occurrences, weekly/biweekly/monthly pickup rules, skips/overrides, night schedules/solar fallback/override expiry, schema validation, API authorization and CSRF, list persistence and version conflicts, settings conflicts, session revocation, and conditional GETs.
- Provider adapter tests cover normalized forecast probabilities, NWS alert records, cached data after failure, retry backoff, recovery, unconfigured live calendars, Google HTTP 304 feed reuse, and discarding an in-flight forecast after a location change.
- `npm audit` and production-only audit reported zero known vulnerabilities at verification time. A minimatch override selects the patched 11.x implementation; typecheck/lint/build were verified with that override.

Tests use temporary databases and a real local HTTP listener. Calendar tests use explicit ICS fixtures and mock provider responses; they do not contact a private Google calendar.

## Real provider checks

- The actual Open-Meteo adapter successfully fetched current conditions, 168 hourly entries and seven daily entries for the default Centreville location.
- The actual NWS adapter successfully returned an empty active-alert array for that point. This verifies access and response parsing, not the delivery of a live severe-weather alert. Alert rendering and normalization use controlled fixture data in tests/source.
- Deployment dry-runs validated six private feed URLs, both passwords, the SSM Standard size limit, and six stored calendar definitions with matching feed IDs. These checks made no AWS calls and printed no secret values. Live calendar connectivity from the deployed AWS Lambda remains unverified.

## AWS/Vercel preparation checks

- Cloud API tests cover secure cookies, admin/display roles, origin/content-type enforcement, expired/revoked sessions, password rotation, login throttling across handler instances, list/settings conflicts, ETags, expired alert filtering, and cache invalidation after location changes.
- Sync tests cover the distributed lease, settings edits during refresh, cache publication and lease release after a storage failure. DynamoDB command tests verify conditional writes and pagination using a mocked SDK client; no real DynamoDB table was created.
- Both Lambda artifacts were bundled, imported as CommonJS, and exercised without AWS/network access. The compiled sync artifact successfully parsed a timezone-qualified recurring ICS fixture while handling independent weather failures.
- CloudFormation/SAM template passed `cfn-lint` for `us-east-1`. CI also runs `sam validate --lint`. No cloud resources were provisioned.
- Production dependency audit reported zero vulnerabilities after adding AWS SDK dependencies.
- Git candidate-file scan found no private Google feed tokens; `.env`, SQLite databases, deployment artifacts, and local SAM configuration are ignored.

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
- AWS IAM/resource creation, Vercel proxy cookie behavior, live provider sync from Lambda, cloud data import, account quotas/billing, and frame access must be checked after deployment using [the deployment guide](AWS-VERCEL.md).
- The PF1508’s firmware, browser version, launcher boot configuration, network recovery and display brightness must be tested on the physical device.
- This session did not conduct a weeks-long memory soak test, a physical Wi-Fi disconnect/reconnect test, load testing or a security penetration test. The implementation bounds caches and recurrence windows, cleans up frontend timers/listeners, limits polling and provider responses, and uses retry/backoff, but these safeguards are not a substitute for a long device soak.
- Remote backups/restores and host reboot recovery should be rehearsed on the selected host before relying on it permanently.
