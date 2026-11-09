import { useState } from "react";
import type { CalendarEvent, Settings } from "../shared/model";
import {
  addDays,
  dateKey,
  dayDifference,
  eventOnDay,
  eventTime,
  isUpcoming,
  nightActive,
  weatherIcon,
  weatherLabel,
} from "../shared/time";
import type { DashboardData } from "./data";
const format = (
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(
    date,
  );
function dayName(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(key + "T12:00:00Z"));
}
function Calendar({ data, now }: { data: DashboardData; now: Date }) {
  const [view, setView] = useState("month");
  const [offset, setOffset] = useState(0);
  const [dayPage, setDayPage] = useState(0);
  const celebration = data.events.find(
    (e) =>
      isUpcoming(e, now, data.settings.timezone) &&
      data.settings.calendars.some(
        (c) =>
          c.id === e.calendarId &&
          c.upcoming &&
          (c.kind === "birthday" || c.kind === "anniversary"),
      ),
  );
  const today = dateKey(now, data.settings.timezone);
  const base = new Date(today + "T12:00:00Z");
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + offset);
  const first = base.toISOString().slice(0, 10);
  const monthEnd = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  const start =
    view === "month"
      ? addDays(first, -base.getUTCDay())
      : view === "week"
        ? addDays(
            today,
            -new Date(today + "T12:00:00Z").getUTCDay() + offset * 7,
          )
        : addDays(today, offset);
  const count =
    view === "month"
      ? Math.ceil((base.getUTCDay() + Number(monthEnd.slice(-2))) / 7) * 7
      : view === "week"
        ? 7
        : 1;
  const inRange =
    start >= data.calendarRange.start &&
    addDays(start, count - 1) <= data.calendarRange.end;
  return (
    <section className="calendar panel">
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">A LITTLE PLANNING, MORE LIVING</p>
          <h2>
            {view === "month"
              ? dayName(first, { month: "long" })
              : view === "week"
                ? "This week"
                : "Daily agenda"}{" "}
            <span>
              {view === "month"
                ? base.getUTCFullYear()
                : dayName(start, { month: "short", day: "numeric" })}
            </span>
          </h2>
        </div>
        <div className="view-switch" aria-label="Calendar view">
          {["month", "week", "today"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setOffset(0);
              }}
            >
              {v === "today" ? "Day" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-sub">
        <div className="legend">
          {data.settings.calendars.map((c) => (
            <span key={c.id}>
              <i style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
        <div className="calendar-nav">
          <button
            aria-label="Previous period"
            disabled={!inRange && offset < 0}
            onClick={() => setOffset((n) => n - 1)}
          >
            ‹
          </button>
          <button onClick={() => setOffset(0)}>Today</button>
          <button
            aria-label="Next period"
            disabled={!inRange && offset > 0}
            onClick={() => setOffset((n) => n + 1)}
          >
            ›
          </button>
        </div>
      </div>
      {!inRange && (
        <p className="inline-notice">
          Calendar sync covers the previous 6 weeks and next 100 days.
        </p>
      )}
      {view !== "today" && (
        <div className="weekday-row">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      )}
      <div
        className={`calendar-grid ${view}`}
        style={{
          gridTemplateRows: `repeat(${Math.ceil(count / 7)}, minmax(0,1fr))`,
        }}
      >
        {Array.from({ length: count }, (_, i) => {
          const day = addDays(start, i);
          const events = data.events.filter((e) =>
            eventOnDay(e, day, data.settings.timezone),
          );
          const max = view === "month" ? 1 : view === "week" ? 3 : 6;
          const page =
            view === "today"
              ? dayPage % Math.max(1, Math.ceil(events.length / max))
              : 0;
          return (
            <div
              key={day}
              className={`day-cell ${day === today ? "is-today" : ""} ${view === "month" && day.slice(0, 7) !== first.slice(0, 7) ? "outside" : ""}`}
            >
              <div className="day-number">
                {view === "today"
                  ? dayName(day, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : Number(day.slice(-2))}
                {day === today && <small>TODAY</small>}
              </div>
              <div className="cell-events">
                {events.slice(page * max, (page + 1) * max).map((e) => (
                  <EventPill
                    key={e.id}
                    event={e}
                    settings={data.settings}
                    expanded={view !== "month"}
                  />
                ))}
                {events.length > max && (
                  <button
                    className="more-events"
                    onClick={() => {
                      if (view === "today") setDayPage((n) => n + 1);
                      else {
                        setDayPage(0);
                        setView("today");
                        setOffset(dayDifference(day, today));
                      }
                    }}
                  >
                    {view === "today"
                      ? `Next events · ${page + 1}/${Math.ceil(events.length / max)}`
                      : `+${events.length - max} more`}
                  </button>
                )}
                {!events.length && view === "today" && (
                  <p className="empty">
                    A little breathing room. Nothing planned today.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="calendar-bottom">
        <span>
          ◷{" "}
          {data.demo
            ? "Sample household calendar"
            : data.sync.calendar.lastSuccess
              ? "Synced " +
                format(
                  new Date(data.sync.calendar.lastSuccess),
                  data.settings.timezone,
                  { hour: "numeric", minute: "2-digit" },
                )
              : "Calendar not yet synchronized"}
        </span>
        <span>
          {data.sync.calendar.error
            ? "Calendar needs attention"
            : celebration
              ? `✧ ${celebration.title} · ${Math.max(0, dayDifference(celebration.start.slice(0, 10), today))} days`
              : "Room for the everyday."}
        </span>
      </div>
    </section>
  );
}
function EventPill({
  event,
  settings,
  expanded,
}: {
  event: CalendarEvent;
  settings: Settings;
  expanded: boolean;
}) {
  const c = settings.calendars.find((c) => c.id === event.calendarId);
  return (
    <div
      className={`event-pill ${expanded ? "expanded" : ""}`}
      title={`${event.title} · ${eventTime(event, settings.timezone)}`}
      style={{
        borderColor: c?.color,
        background: (c?.color ?? "#779782") + "1c",
      }}
    >
      <span>
        {c?.kind === "birthday" || c?.kind === "anniversary" ? "✧ " : ""}
        {event.title}
      </span>
      {expanded && <small>{eventTime(event, settings.timezone)}</small>}
    </div>
  );
}
function WeatherCard({ data, now }: { data: DashboardData; now: Date }) {
  const [forecast, setForecast] = useState(false);
  const weather = data.weather;
  const today = dateKey(now, data.settings.timezone);
  const daily = weather?.daily.find((d) => d.date === today);
  const hourly =
    weather?.hourly
      .filter((h) => Date.parse(h.time) >= now.getTime() - 3600000)
      .slice(0, 24) ?? [];
  const rain = hourly.find((h) => h.rain >= 40);
  return (
    <section className="weather panel">
      <div className="section-heading">
        <p className="eyebrow">{data.settings.location.name}</p>
        <button className="text-button" onClick={() => setForecast(!forecast)}>
          {forecast ? "Current weather" : "7-day forecast"} ↗
        </button>
      </div>
      {!weather ? (
        <p className="empty">
          Weather will appear after the first successful sync.
        </p>
      ) : forecast ? (
        <div className="daily-forecast">
          {weather.daily.map((d) => (
            <div key={d.date}>
              <span>
                {d.date === today
                  ? "Today"
                  : dayName(d.date, { weekday: "short" })}
              </span>
              <span className="weather-symbol">{weatherIcon(d.code)}</span>
              <strong>{Math.round(d.high)}°</strong>
              <span>{Math.round(d.low)}°</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="current-weather">
            <div>
              <div className="temperature">
                {Math.round(weather.current.temperature)}
                <span>°</span>
              </div>
              <p>{weatherLabel(weather.current.code)}</p>
              <small>
                Feels like {Math.round(weather.current.feelsLike)}°
                {daily &&
                  ` · H ${Math.round(daily.high)}°  L ${Math.round(daily.low)}°`}
              </small>
            </div>
            <div
              className="hero-weather"
              aria-label={weatherLabel(weather.current.code)}
            >
              {weatherIcon(weather.current.code)}
            </div>
          </div>
          <div className="hourly-forecast">
            {hourly
              .filter((_, i) => i % 3 === 0)
              .slice(0, 6)
              .map((h, i) => (
                <div key={h.time}>
                  <small>
                    {i === 0
                      ? "Now"
                      : format(new Date(h.time), data.settings.timezone, {
                          hour: "numeric",
                        })}
                  </small>
                  <span className="weather-symbol">{weatherIcon(h.code)}</span>
                  <strong>{Math.round(h.temperature)}°</strong>
                  <small className="rain-chance">{h.rain}%</small>
                </div>
              ))}
          </div>
          <div className="weather-note">
            <span>☂</span>
            {rain
              ? `${rain.rain}% chance of rain ${Math.max(0, Math.round((Date.parse(rain.time) - now.getTime()) / 3600000)) === 0 ? "this hour" : `in ~${Math.round((Date.parse(rain.time) - now.getTime()) / 3600000)} hours`}`
              : "Less than 40% rain chance in the next 24 hours"}
          </div>
          {daily && (
            <div className="sun-times">
              <span>
                ↑ Sunrise{" "}
                {format(new Date(daily.sunrise), data.settings.timezone, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span>
                ↓ Sunset{" "}
                {format(new Date(daily.sunset), data.settings.timezone, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function Upcoming({ data, now }: { data: DashboardData; now: Date }) {
  const today = dateKey(now, data.settings.timezone);
  const events = data.events
    .filter(
      (e) =>
        isUpcoming(e, now, data.settings.timezone) &&
        data.settings.calendars.some(
          (c) => c.id === e.calendarId && c.upcoming,
        ),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);
  return (
    <section className="upcoming panel">
      <div className="section-heading">
        <h3>On the horizon</h3>
        <span className="eyebrow">UP NEXT</span>
      </div>
      {events.length ? (
        events.map((e, i) => {
          const day = e.allDay
            ? e.start
            : dateKey(e.start, data.settings.timezone);
          const diff = dayDifference(day, today);
          const calendar = data.settings.calendars.find(
            (c) => c.id === e.calendarId,
          );
          return (
            <div
              className={`upcoming-event ${diff === 0 ? "happening-today" : ""}`}
              key={e.id}
            >
              <div className="event-date">
                <small>
                  {diff === 0 ? "TODAY" : dayName(day, { month: "short" })}
                </small>
                <strong>{Number(day.slice(-2))}</strong>
              </div>
              <div className="upcoming-detail">
                <strong>{e.title}</strong>
                <small>
                  <i style={{ background: calendar?.color }} />
                  {eventTime(e, data.settings.timezone)} · {calendar?.name}
                </small>
              </div>
              <span className="countdown">
                {diff < 0
                  ? "Ongoing"
                  : diff === 0
                    ? e.allDay
                      ? "Today"
                      : Date.parse(e.start) <= now.getTime()
                        ? "Now"
                        : Date.parse(e.start) - now.getTime() >= 3600000
                          ? `~${Math.ceil((Date.parse(e.start) - now.getTime()) / 3600000)}h`
                          : `${Math.ceil((Date.parse(e.start) - now.getTime()) / 60000)}m`
                    : diff === 1
                      ? "Tomorrow"
                      : `${diff} days`}
                {i === 0 && <b>↗</b>}
              </span>
            </div>
          );
        })
      ) : (
        <p className="empty">Nothing coming up. Enjoy the open space.</p>
      )}
    </section>
  );
}
export function Dashboard({
  data,
  now,
  status,
}: {
  data: DashboardData;
  now: Date;
  status: string;
}) {
  const [manualDayUntil, setManualDayUntil] = useState(0);
  const [brief, setBrief] = useState(false);
  const today = dateKey(now, data.settings.timezone);
  const night =
    nightActive(data.settings, now, data.weather) &&
    now.getTime() >= manualDayUntil;
  const tomorrow = data.events
    .filter((e) => eventOnDay(e, addDays(today, 1), data.settings.timezone))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const stale = Object.values(data.sync).some((s) => s.error);
  if (night)
    return (
      <main className="night-screen">
        <div className="night-top">
          <span>⌂ HOME HQ</span>
          <span>
            {status === "offline"
              ? "Offline · last known information"
              : "Settling in for the night"}
          </span>
        </div>
        <div className="night-clock">
          {format(now, data.settings.timezone, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
        <p className="night-date">
          {format(now, data.settings.timezone, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="night-details">
          <div>
            <p className="eyebrow">TOMORROW</p>
            <h2>{tomorrow?.title ?? "A fresh start. Nothing planned."}</h2>
            {tomorrow && <p>{eventTime(tomorrow, data.settings.timezone)}</p>}
          </div>
          {data.weather && (
            <div>
              <p className="eyebrow">OUTSIDE</p>
              <h2>
                {weatherIcon(data.weather.current.code)}{" "}
                {Math.round(data.weather.current.temperature)}°
              </h2>
              <p>{weatherLabel(data.weather.current.code)}</p>
            </div>
          )}
        </div>
        {data.alerts.slice(0, 2).map((a) => (
          <p className="night-alert" key={a.id}>
            {a.title}
          </p>
        ))}
        {data.pickups
          .filter((p) => p.date === addDays(today, 1))
          .map((p) => (
            <p key={p.id}>Tomorrow: {p.id} pickup</p>
          ))}
        {stale && (
          <small>Some integrations are unavailable · last known data</small>
        )}
        <button
          onClick={() => setManualDayUntil(Date.now() + 15 * 60000)}
          className="night-wake"
        >
          Show dashboard for 15 minutes ↗
        </button>
      </main>
    );
  const groceries = data.items.filter(
    (i) => i.list === "grocery" && !i.completed,
  );
  const todos = data.items.filter((i) => i.list === "todo" && !i.completed);
  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <a href="/" className="brand">
          <span className="brand-icon">⌂</span>
          <div>
            Home HQ<small>{data.settings.household}</small>
          </div>
        </a>
        <div className="header-date">
          <strong>
            {format(now, data.settings.timezone, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </strong>
          <span>
            <i
              className={`status-dot ${status === "offline" || stale ? "warning" : ""}`}
            />
            {data.demo
              ? "Demo home"
              : status === "offline"
                ? "Offline · last known data"
                : stale
                  ? "Some data needs attention"
                  : "Home is up to date"}
            <a href="/manage" aria-label="Manage Home HQ">
              Manage ↗
            </a>
          </span>
        </div>
        <div className="header-clock">
          {format(now, data.settings.timezone, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </header>
      {data.alerts.length > 0 && (
        <div className="alert-strip">
          ⚠ {data.alerts[0].title} <a href="/manage#alerts">Details →</a>
        </div>
      )}
      <div className="compact-switch view-switch">
        <button aria-pressed={!brief} onClick={() => setBrief(false)}>
          Calendar
        </button>
        <button aria-pressed={brief} onClick={() => setBrief(true)}>
          Weather & upcoming
        </button>
        <a href="/manage">Manage ↗</a>
      </div>
      <div className={`dashboard-body ${brief ? "show-brief" : ""}`}>
        <Calendar data={data} now={now} />
        <aside>
          <WeatherCard data={data} now={now} />
          <Upcoming data={data} now={now} />
        </aside>
      </div>
      <div className="household-row">
        <section className="list-summary panel">
          <div className="summary-icon">♧</div>
          <div>
            <h3>
              Pick up a few things <span>{groceries.length}</span>
            </h3>
            <p>
              {groceries
                .slice(0, 4)
                .map((i) => i.text)
                .join(" · ") || "The pantry is looking good."}
            </p>
          </div>
          <a href="/manage" aria-label="Manage grocery list">
            ↗
          </a>
        </section>
        <section className="list-summary panel">
          <div className="summary-icon peach">✓</div>
          <div>
            <h3>
              Around the house <span>{todos.length}</span>
            </h3>
            <p>
              {todos
                .slice(0, 2)
                .map((i) => i.text)
                .join(" · ") || "All caught up. Take a breath."}
            </p>
          </div>
          <a href="/manage" aria-label="Manage tasks">
            ↗
          </a>
        </section>
        <section className="pickups panel">
          {data.pickups.map((p) => {
            const tomorrow = p.date === addDays(today, 1);
            const evening =
              Number(
                format(now, data.settings.timezone, {
                  hour: "2-digit",
                  hourCycle: "h23",
                }),
              ) >= 18;
            return (
              <div
                key={p.id}
                className={tomorrow && evening ? "pickup-due" : ""}
              >
                <span className="pickup-icon">
                  {p.id === "trash" ? "♜" : "♻"}
                </span>
                <div>
                  <strong>
                    {data.settings.schedules.find((s) => s.id === p.id)?.label}
                  </strong>
                  <small>
                    {p.date === today
                      ? "Today"
                      : tomorrow
                        ? evening
                          ? "Set out tonight"
                          : "Tomorrow"
                        : p.date
                          ? dayName(p.date, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : "No scheduled pickup"}
                  </small>
                </div>
              </div>
            );
          })}
        </section>
      </div>
      <footer className="dashboard-footer">
        <span>A place for everything. Time for each other.</span>
        <span>
          {data.sync.weather.error ? "Weather may be outdated · " : ""}
          {data.sync.alerts.error ? "Alerts unavailable · " : ""}
          {data.demo ? "EXAMPLE DATA · " : ""}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Weather by Open-Meteo
          </a>{" "}
          · NWS alerts
        </span>
      </footer>
    </main>
  );
}
