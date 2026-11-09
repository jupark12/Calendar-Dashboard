# Home HQ

A quiet, always-on household dashboard for a landscape Android frame. React 18, TypeScript, Vite and Tailwind on the frontend; Express and SQLite on one small server. No Google login is needed on the frame.

## Start locally

Use **Node 24 LTS** (`nvm use` if you use nvm) and npm. Node 22.13+ also supplies the required SQLite API; Node 23 is not a supported deployment target. No separate database installation is needed.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000** for the display and **http://localhost:3000/manage** for editing. Both are served by the same process. Demo mode is the default: it uses clearly labeled example weather/events and seeds real persistent sample lists in `data/demo.sqlite`. It never calls external integrations. The current household date and night schedule are real; after 10 PM, use **Show dashboard for 15 minutes** to preview the day layout.

```sh
npm run validate       # typecheck, ESLint, unit/API tests, production build
npm run build
NODE_ENV=production npm start  # local production demo
```

The demo has no authentication and binds to loopback by default. Do not publish demo mode. Copy `.env.example` to `.env` when configuring live mode. Do not mix demo and live databases: the server detects and rejects that mistake. Deleting a demo database resets the sample lists; do not delete a live database.

## What is implemented

- Month, week and paginated daily agenda; distinct calendar colors; all-day/multi-day events; recurring events, exceptions and cancellations; upcoming countdowns and celebration reminders.
- Current weather, feels-like, highs/lows, sunrise/sunset, a compact hourly strip, full next-24-hour detail in management, seven-day forecast, probabilistic rain notices and official NWS alerts.
- Grocery and to-do lists with add/edit/complete/delete, category, priority and due date. SQLite is the source of truth. Updates appear on other devices within 30 seconds; version checks reject conflicting edits.
- Independent trash/recycling RRULE schedules, biweekly anchors, skipped dates and holiday replacements.
- Scheduled night mode, optional sunrise/sunset, and expiring manual overrides. The night screen shows tomorrow’s first event, weather, alerts and tomorrow’s pickups. CSS changes appearance, **not physical backlight brightness**.
- Display-only authentication; a separately authenticated responsive `/manage` interface. Loading, errors, partial integration failures, offline status and last-known data.

At 1280×800 the calendar, weather, upcoming events, lists and pickups fit without scrolling. On narrower or shorter displays a **Calendar / Weather & upcoming** switch prioritizes legibility. Dense calendar days open a paginated agenda. The management page intentionally scrolls on phones. Temperatures are Fahrenheit. NWS alerts cover US locations; outside its coverage, the alert panel reports unavailable status rather than claiming there are no alerts.

## Connect your Google Calendars

Private iCal feeds are deliberately used instead of OAuth. This is a read-only household display: no Google application registration, consent-screen setup, refresh-token maintenance, or frame sign-in is necessary. **A secret iCal URL is a bearer credential to the calendar**, so it belongs only on your server. OAuth would provide explicit scopes and token revocation but add significant operational complexity; it is not implemented here.

For each of the two personal calendars, shared household calendar and dedicated birthday calendar:

1. On a computer, open Google Calendar → Settings → the calendar under “Settings for my calendars” → **Integrate calendar**.
2. Copy **Secret address in iCal format**, not the public sharing URL. Never make the calendar public for this app. See [Google’s instructions](https://support.google.com/calendar/answer/37648).
3. Put the URLs in the server’s `.env`, using the corresponding IDs below. The following values are examples, not usable credentials:

```dotenv
DEMO_MODE=false
DATABASE_PATH=./data/home-hq.sqlite
APP_ORIGIN=http://localhost:3000
ADMIN_PASSWORD=replace-with-a-unique-random-value-at-least-20-characters
DISPLAY_PASSWORD=replace-with-a-different-random-value-at-least-20-characters
COOKIE_SECURE=false
CALENDAR_FEEDS={"person1":"https://calendar.google.com/calendar/ical/REPLACE/private-REPLACE/basic.ics","person2":"https://calendar.google.com/calendar/ical/REPLACE/private-REPLACE/basic.ics","home":"https://calendar.google.com/calendar/ical/REPLACE/private-REPLACE/basic.ics","birthdays":"https://calendar.google.com/calendar/ical/REPLACE/private-REPLACE/basic.ics"}
WEATHER_USER_AGENT=HomeHQ/1.0 (contact: your-real-email@example.com)
```

4. Restart the server. Sign in at `/manage` with the admin password. In **Home & calendars**, change names, colors and which calendars appear in upcoming events. IDs must match `CALENDAR_FEEDS`. Remove unused calendar definitions so they do not report a missing feed.
5. Check **Weather & status** for the last successful calendar sync, then verify a known event and a recurring event against Google Calendar.

Use a dedicated calendar with yearly recurring all-day birthday/anniversary events if Google’s special Contacts birthday calendar does not offer a secret URL. Some Workspace administrators disable private feeds; use a calendar for which private feeds are permitted. This version does not fall back to OAuth.

Feeds refresh every 15 minutes; Google’s feed publication can introduce additional latency. Recurrences expand from six weeks before today to 100 days ahead. Old and future navigation outside that range is labeled as unavailable. Feed HTTP validators avoid re-downloading unchanged ICS. The parser supports timezone-aware recurrence, EXDATE and RECURRENCE-ID overrides; floating times without an explicit timezone are treated as UTC by the library, so export timezone-qualified events from Google. All-day dates retain their source calendar date and use exclusive end dates. Duplicate occurrences with the same iCal UID and start are merged in configured calendar order. Independent copies with different UIDs are retained deliberately: matching titles alone would hide legitimate events.

Google HTTPS feed hosts are allowlisted, redirects are rejected, response sizes/timeouts are bounded, and raw feeds never reach the browser or logs. Last-known raw ICS is stored in the server database to re-expand unchanged series as dates advance. Protect database backups as private calendar data. Reset the secret URL in Google and update `.env` if it leaks.

## Weather and household settings

The initial location is Centreville, Virginia (38.8404, -77.4289), with `America/New_York` time. Change the location name, latitude, longitude and IANA time zone in `/manage`. No geolocation permissions are needed.

[Open-Meteo](https://open-meteo.com/en/docs) forecasts refresh every 15 minutes. [NWS](https://www.weather.gov/documentation/services-web-api) alerts refresh every 5 minutes; set a real contact in `WEATHER_USER_AGENT`. Rain notices use a 40% threshold and show the actual probability, never certainty. The compact strip samples the next 18 hours at three-hour intervals; **Weather & status** provides each of the next 24 hours. Sunrise/sunset night mode falls back to configured clock times when today’s solar data is missing. Check provider usage terms before commercial use; this project is intended for personal household use.

Schedules in **Pickup schedules** use local dates, not UTC instants. Examples:

```text
FREQ=WEEKLY;BYDAY=TU,FR           Tuesday and Friday
FREQ=WEEKLY;INTERVAL=2;BYDAY=TH  Every other Thursday, based on the anchor
FREQ=MONTHLY;BYDAY=1MO           First Monday of every month
```

The anchor should be a known real collection date. Skip lists take one `YYYY-MM-DD` per line. Overrides replace an original date with a new collection date; skipping the replacement date cancels it too. Time-of-day and secondly/minutely/hourly recurrence are intentionally rejected. The next occurrence is searched up to two years ahead. Evening-before highlighting starts at 6 PM in the household time zone. Default schedules are examples and **must be checked against your actual service**.

Night mode defaults to 10 PM–6:30 AM. Equal start/end times disable clock-based night mode. Management overrides expire after 1–12 hours, with the backend enforcing a 24-hour upper limit; the frame’s temporary wake expires after 15 minutes.

## Deploy independently of your MacBook

Recommended: a single small always-on Linux host with Docker Compose and a persistent disk. This can be an existing mini PC/NAS or a low-cost VPS of your choice. Avoid ephemeral free hosting that sleeps or discards local SQLite files. One process and one disk are sufficient for a two-person household; do not horizontally scale this SQLite deployment.

The included Dockerfile builds the frontend, removes development dependencies and runs as the unprivileged `node` user. `compose.yaml` adds Caddy for HTTPS and a named `household` volume for SQLite. There is no published application port; only Caddy is exposed. Docker restart policies and bounded logs are included.

1. Install [Docker Engine and Compose](https://docs.docker.com/compose/install/) on the host.
2. Point a DNS hostname (for example `home.example.com`) at it. Allow inbound TCP 80/443 so [Caddy can provision HTTPS](https://caddyserver.com/docs/automatic-https). For a home host this requires appropriate router configuration; alternatively use a VPS or your own authenticated private-network reverse proxy.
3. Clone this repository onto that host. Copy `.env.example` to `.env` and configure the feeds/passwords. Generate each password separately with `openssl rand -base64 32`. Keep the file private (`chmod 600 .env`). Never paste real secrets into Git.
4. Set these production values in `.env`:

```dotenv
DOMAIN=home.example.com
APP_ORIGIN=https://home.example.com
DEMO_MODE=false
COOKIE_SECURE=true
NODE_ENV=production
```

5. Start and inspect:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 app caddy
```

6. Visit `https://home.example.com/manage` on a phone/computer and sign in with the admin password. Open `https://home.example.com/` on the frame and sign in **once with the display password**. No Google sign-in occurs on the frame.

The display cookie lasts 90 days; management sessions last 12 hours. Both are HttpOnly, SameSite=Strict and Secure in production. Expired sessions return to the access screen. Do not sign into the frame as admin. Anyone with physical access to a paired display can read the household information; choose its placement accordingly. Passwords are shared household access, not individual user accounts, and there is no password-reset email flow.

Production live startup refuses insecure cookie/origin configuration or weak/equal passwords. Mutating API calls require the configured exact Origin and JSON content type. Login attempts are rate-limited. The app does not trust forwarded IP headers, so the Caddy proxy shares one login limit; this conservative choice is adequate for two household members. Access tokens are random, stored only as SHA-256 hashes in SQLite, and are not embedded in JavaScript or URLs.

## Updates, migrations, backups and recovery

Schema migration 1 is idempotently applied on startup by `server/database.ts`; SQLite WAL and a busy timeout are enabled. Future schema changes should add numbered transactional migrations. Always back up before updating. Keep the database on local disk, not NFS.

To create a consistent live SQLite backup inside the container:

```sh
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('/app/data/home-hq.sqlite'); d.exec(\"VACUUM INTO '/app/data/backup.sqlite'\"); d.close()"
docker compose cp app:/app/data/backup.sqlite ./home-hq-backup.sqlite
```

`VACUUM INTO` requires a filename that does not already exist: use a new dated filename for each backup. Store backups encrypted outside the host. Do not copy just the main SQLite file while the app is writing; WAL files can contain the latest changes.

Update with `git pull`, `docker compose up -d --build`, and check `/healthz`. The named volume survives container rebuilds. **Do not run `docker compose down -v`** unless you intend to erase household data.

To restore: stop the app, use `docker compose cp ./home-hq-backup.sqlite app:/app/data/home-hq.sqlite` while the existing container is stopped, remove obsolete `home-hq.sqlite-wal` and `home-hq.sqlite-shm` sidecars from that volume, ensure files are owned by UID 1000, then start the app. Preserve the original files first if investigating a failure. Restores should be rehearsed on a separate deployment.

To revoke all paired sessions (for example after losing a device), run the following and change the relevant password in `.env` before restarting:

```sh
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('/app/data/home-hq.sqlite'); d.exec('DELETE FROM sessions'); d.close()"
docker compose up -d --force-recreate app
```

Password rotation alone does not revoke existing sessions.

## PF1508 setup and compatibility

The PF1508’s actual browser/WebView version is not known and was not available for physical testing. The supported baseline is **Chromium/WebView 90+**, with JavaScript, cookies and Intl IANA time-zone data enabled. Use a current maintained browser when possible. Vite targets Chrome 90; the layout uses CSS Grid, flex gap and modern Intl formatting. No blanket polyfill bundle is included. An older browser that cannot load ES modules or required Intl features needs an updated browser/WebView; CSS alone cannot make it compatible.

1. Check the installed browser version in its About settings. Update using a source supported by your customized device.
2. Connect Wi-Fi, enable automatic date/time, lock landscape orientation, and open the stable HTTPS URL. Set the display password once and allow first load to finish.
3. Set that URL as the browser’s home/start page. In your existing customized launcher, configure this browser/start URL as its boot action/default home app if that launcher supports it. Menu names vary by firmware; this repository cannot set Android boot behavior through a website.
4. Disable screen timeout and battery optimization for the browser if those controls exist. Use Android’s own brightness setting for physical dimming. CSS night mode cannot guarantee a dark backlight.
5. Reboot the frame and verify automatic launch, Wi-Fi reconnection and cookie retention. If the launcher has no boot/start-URL feature, configuring or replacing it is a separate device setup step.
6. Test at the actual resolution and normal viewing distance. Use the compact view switch if needed. Prefer the Week or Day view for longer event titles.

A suspended tab resumes synchronization when visible. A single non-overlapping browser request runs about every 30 seconds, with a 15-second timeout and exponential backoff to five minutes; reconnect/visibility events request an immediate refresh. ETags suppress unchanged payloads. One shared clock updates on minute boundaries. Effects clean up timers, listeners and aborted requests. There are no animations, webfonts, image downloads, heavy icon packages or continual per-widget timers.

The backend has one synchronization scheduler and per-provider retry backoff. Last successful provider results survive restarts in SQLite. A single bounded last-known snapshot in `sessionStorage` lets an already-open display reload through brief outages; it is cleared on an authentication rejection. **It is not a source of truth for edits**, and closing the browser can remove it. The production service worker caches only the app shell/static assets, never authenticated API responses. Offline startup requires a prior successful production load and browser service-worker support. An in-memory display continues if browser storage is disabled. Already-displayed private information remains readable while offline; a remote session revocation is recognized on the next successful connection.

If Wi-Fi fails, leave the page open: it keeps last-known information and retries. Check `/manage` → Weather & status after reconnection. For a blank first load, check the host `/healthz`, network, browser version and HTTPS certificate. If an obsolete service worker causes problems after an update, clear **site data for this origin** and reconnect the display. A forced Android reboot may require the stable URL to be reopened by the launcher.

## Project map

```text
src/                 Display, responsive management, polling, styles
shared/              Zod contracts, household time/date helpers
server/app.ts        API, sessions, role checks, validation, conflicts
server/database.ts   SQLite schema and persistence
server/integrations.ts  Google ICS, Open-Meteo, NWS, cache/backoff
server/scheduling.ts Pickup recurrence and exceptions
server/demo.ts       Explicit example data only
public/sw.js         Optional offline static shell
tests/              Date/recurrence tests and real HTTP API tests
Dockerfile           Production image
compose.yaml         Persistent app + HTTPS reverse proxy
```

See [verification notes](docs/VERIFICATION.md) for tests actually performed and remaining deployment/device checks. No real household secrets or live Google feed are included. Docker hosting, DNS, private calendar configuration and the physical PF1508 still require your environment.
