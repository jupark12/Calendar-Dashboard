import { useState } from "react";
import { CalendarCat } from "./CalendarCat";
import {
  addDays,
  dateKey,
  eventOnDay,
  eventTime,
  nightActive,
  weatherLabel,
} from "../shared/time";
import type { DashboardData } from "./data";
import { WeatherIcon } from "./WeatherIcon";
import { format, dayName } from "./dashboardFormat";
import { Calendar } from "./DashboardCalendar";
import { WeatherCard } from "./DashboardWeather";
import { Upcoming } from "./DashboardUpcoming";
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
          <CalendarCat sleeping />
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
                <WeatherIcon code={data.weather.current.code} />{" "}
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
    (i) => i.list === "grocery" && !i.completed
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
        <CalendarCat />
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
                })
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
