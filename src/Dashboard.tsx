import { startTransition, useEffect, useState } from "react";
import { CalendarCat } from "./CalendarCat";
import { useMorningCatMessage } from "./useMorningCatMessage";
import {
  addDays,
  dateKey,
  eventOnDay,
  eventTime,
  weatherLabel,
} from "../shared/time";
import type { DashboardData } from "./data";
import { WeatherIcon } from "./WeatherIcon";
import { format, dayName } from "./dashboardFormat";
import { Calendar } from "./DashboardCalendar";
import { WeatherCard } from "./DashboardWeather";
import { Upcoming } from "./DashboardUpcoming";
import { faithStreak, growers, growerNames } from "../shared/faith";
import { useFaith } from "./useFaith";
import { PhotoAlbum } from "./PhotoAlbum";

function Carnation({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 80 100" aria-hidden="true">
      <path
        d="M40 91 C39 72 42 59 40 45 M40 72 C29 68 23 64 19 57 M41 65 C52 61 57 56 61 51"
        fill="none"
        stroke="#718977"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M39 73 C27 62 17 66 17 57 C29 56 36 62 39 73 Z M41 66 C51 54 62 58 63 49 C52 49 44 55 41 66 Z"
        fill="#78937b"
        opacity=".8"
      />
      <g fill="currentColor" stroke="#ad8790" strokeWidth=".7">
        <path d="M40 45 C22 51 16 37 22 26 L19 22 L24 20 L23 16 L29 17 L30 12 L35 16 L40 10 L45 16 L50 12 L52 18 L58 16 L57 21 L63 23 L59 27 C65 41 55 52 40 45 Z" />
        <path
          d="M40 45 C30 45 25 37 29 29 L27 26 L32 25 L32 21 L37 24 L40 20 L44 24 L49 21 L49 26 L54 27 L51 30 C55 38 49 45 40 45 Z"
          fill="none"
        />
        <path
          d="M31 32 Q35 27 40 32 Q45 27 49 32 M34 39 Q40 35 46 39"
          fill="none"
        />
      </g>
      <path
        d="M34 46 Q40 53 46 46"
        fill="none"
        stroke="#718977"
        strokeWidth="2"
      />
    </svg>
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
  const [tile, setTile] = useState<"calendar" | "photos">(() => {
    try {
      return localStorage.getItem("home-hq-main-tile") === "photos"
        ? "photos"
        : "calendar";
    } catch {
      return "calendar";
    }
  });
  const [waking, setWaking] = useState(false);
  const [dismissedPickups, setDismissedPickups] = useState<Record<string, string>>(
    () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("home-hq-dismissed-pickups") ?? "{}"
        );
        return saved && typeof saved === "object" && !Array.isArray(saved)
          ? saved
          : {};
      } catch {
        return {};
      }
    }
  );
  const morningCat = useMorningCatMessage(now, data.settings.timezone);
  const night = now.getTime() >= manualDayUntil;
  const { data: faith } = useFaith({ enabled: !night, refreshMode: "once" });
  useEffect(() => {
    if (!waking) return;
    // Let the cat wake and the night screen glow before showing the dashboard.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const timer = window.setTimeout(
      () => {
        startTransition(() => {
          setManualDayUntil(Date.now() + 15 * 60000);
          setWaking(false);
        });
      },
      reducedMotion ? 0 : 1250
    );
    return () => window.clearTimeout(timer);
  }, [waking]);
  const today = dateKey(now, data.settings.timezone);
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(today, index - dayOfWeek)
  );
  const catMessage = today.endsWith("-02-22")
    ? "Happy Birthday Soobin!"
    : morningCat.message;
  const tomorrow = data.events
    .filter((e) => eventOnDay(e, addDays(today, 1), data.settings.timezone))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const stale = Object.values(data.sync).some((s) => s.error);
  const tomorrowPickups = data.pickups.filter(
    (pickup) =>
      pickup.date === addDays(today, 1) &&
      dismissedPickups[pickup.id] !== pickup.date
  );
  function dismissPickup(id: string, date: string) {
    const next = { ...dismissedPickups, [id]: date };
    setDismissedPickups(next);
    try {
      localStorage.setItem("home-hq-dismissed-pickups", JSON.stringify(next));
    } catch {
      /* The reminder stays dismissed until this page is reloaded. */
    }
  }
  if (night)
    return (
      <main className={`night-screen${waking ? " night-screen-waking" : ""}`}>
        <Carnation className="carnation carnation-pink night-flower-left" />
        <Carnation className="carnation carnation-white night-flower-right" />
        <Carnation className="carnation carnation-white night-flower-upper-left" />
        <Carnation className="carnation carnation-pink night-flower-upper-right" />
        <Carnation className="carnation carnation-pink night-flower-mid-left" />
        <div className="night-top">
          <svg
            className="night-eucalyptus"
            viewBox="0 0 1200 150"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <path
                id="eucalyptus-leaf"
                d="M0 0 C 13 -18 31 -21 42 -8 C 30 5 13 10 0 0 Z"
              />
              <g
                id="eucalyptus-sprig"
                fill="none"
                stroke="#667f6d"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M0 0 C 42 19 80 42 145 100" />
                <path d="M31 15 L25 49 M52 27 L72 5 M75 43 L65 75 M96 61 L122 35 M116 78 L105 109" />
                <g fill="#718e79" stroke="none" opacity=".78">
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(25 49) rotate(-88) scale(.76)"
                  />
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(72 5) rotate(-32) scale(.72)"
                  />
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(65 75) rotate(-86) scale(.82)"
                  />
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(122 35) rotate(-29) scale(.78)"
                  />
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(105 109) rotate(-83) scale(.68)"
                  />
                  <use
                    href="#eucalyptus-leaf"
                    transform="translate(143 99) rotate(38) scale(.68)"
                  />
                </g>
              </g>
            </defs>
            <use
              href="#eucalyptus-sprig"
              transform="translate(0 -8) rotate(3)"
            />
            <use
              href="#eucalyptus-sprig"
              transform="translate(270 6) rotate(-10) scale(.75)"
              opacity=".7"
            />
            <use
              href="#eucalyptus-sprig"
              transform="translate(1200 -8) scale(-1 1) rotate(3)"
            />
            <use
              href="#eucalyptus-sprig"
              transform="translate(930 6) scale(-.75 .75) rotate(-10)"
              opacity=".7"
            />
          </svg>
        </div>
        <div className="night-clock">
          {format(now, data.settings.timezone, {
            hour: "numeric",
            minute: "2-digit",
          })}
          <CalendarCat sleeping waking={waking} />
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
        {tomorrowPickups.length > 0 && (
          <div className="night-pickup-toasts" aria-label="Pickup reminders">
            {tomorrowPickups.map((pickup) => {
              const label =
                data.settings.schedules.find((s) => s.id === pickup.id)
                  ?.label ?? pickup.id;
              return (
                <div className="night-pickup-toast" role="status" key={pickup.id}>
                  <span className="night-pickup-toast-icon" aria-hidden="true">
                    {pickup.id === "trash" ? "🗑" : "♻"}
                  </span>
                  <div className="night-pickup-toast-copy">
                    <span className="night-pickup-toast-kicker">PICKUP REMINDER</span>
                    <strong>{label} pickup tomorrow</strong>
                    <span>Set it out tonight.</span>
                  </div>
                  <button
                    className="night-pickup-toast-dismiss"
                    type="button"
                    aria-label={`Dismiss ${label} pickup reminder`}
                    onClick={() => dismissPickup(pickup.id, addDays(today, 1))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {stale && (
          <small>Some integrations are unavailable · last known data</small>
        )}
        <button
          onClick={() => setWaking(true)}
          disabled={waking}
          aria-busy={waking}
          className="night-wake"
        >
          {waking ? "Waking up…" : "Show dashboard for 15 minutes ↗"}
        </button>
      </main>
    );
  const groceries = data.items.filter(
    (i) => i.list === "grocery" && !i.completed
  );
  const todos = data.items.filter((i) => i.list === "todo" && !i.completed);
  return (
    <main className="dashboard">
      <Carnation className="carnation carnation-pink day-flower-left" />
      <Carnation className="carnation carnation-white day-flower-right" />
      <Carnation className="carnation carnation-white day-flower-upper-left" />
      <Carnation className="carnation carnation-pink day-flower-mid-right" />
      <Carnation className="carnation carnation-white day-flower-lower-right" />
      <header className="dashboard-header">
        <a className="brand" href="/">
          <div className="brand" aria-hidden="true">
            <span className="brand-icon">⌂</span>
          </div>
        </a>
        <div className="tile-toggle view-switch" aria-label="Main tile">
          {(["calendar", "photos"] as const).map((choice) => (
            <button
              key={choice}
              aria-pressed={tile === choice}
              onClick={() => {
                setTile(choice);
                try {
                  localStorage.setItem("home-hq-main-tile", choice);
                } catch {
                  /* Preference remains for this visit. */
                }
              }}
            >
              {choice === "calendar" ? "Calendar" : "Photos"}
            </button>
          ))}
        </div>
        <a
          className="header-faith"
          href="/faith"
          aria-label="Bible and Prayer streaks for Jun and Soobin"
        >
          {growers.map((person) => {
            const streak = faith
              ? faithStreak(faith.entries, person, today)
              : null;
            const activeDays = new Set(
              faith?.entries
                .filter((entry) => entry.person === person)
                .map((entry) => entry.date) ?? []
            );
            return (
              <span className="header-streak-card" key={person}>
                <span className="header-streak-count">
                  <span className="header-streak-name">
                    {growerNames[person]}
                  </span>
                  <span className="header-streak-number">
                    <span aria-hidden="true">
                      {streak === null ? (
                        ""
                      ) : streak > 0 ? (
                        "🔥"
                      ) : (
                        <svg
                          className="header-sad-face"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <circle
                            cx="8.5"
                            cy="9"
                            r="1"
                            fill="currentColor"
                            stroke="none"
                          />
                          <circle
                            cx="15.5"
                            cy="9"
                            r="1"
                            fill="currentColor"
                            stroke="none"
                          />
                          <path d="M7.5 17c.8-2 2.3-3 4.5-3s3.7 1 4.5 3" />
                        </svg>
                      )}
                    </span>
                    {streak ?? "–"}
                  </span>
                  <span className="header-streak-caption">DAY STREAK</span>
                </span>
                <span
                  className="header-streak-week"
                  aria-label={`${growerNames[person]} activity this week, Sunday through Saturday`}
                >
                  {weekDays.map((day) => (
                    <span
                      className={`header-streak-day ${activeDays.has(day) ? "active" : ""}`}
                      key={day}
                    >
                      <span>
                        {new Date(`${day}T12:00:00Z`).toLocaleDateString(
                          "en-US",
                          { weekday: "narrow", timeZone: "UTC" }
                        )}
                      </span>
                      <i
                        aria-label={`${day}: ${activeDays.has(day) ? "active" : "no activity"}`}
                      />
                    </span>
                  ))}
                </span>
              </span>
            );
          })}
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
          {tile === "calendar" ? "Calendar" : "Photos"}
        </button>
        <button aria-pressed={brief} onClick={() => setBrief(true)}>
          Weather & upcoming
        </button>
        <a href="/faith">Bible & Prayer ↗</a>
        <a href="/manage">Manage ↗</a>
      </div>
      <div className={`dashboard-body ${brief ? "show-brief" : ""}`}>
        {tile === "calendar" ? (
          <>
            <CalendarCat message={catMessage} onActivate={morningCat.dismiss} />
            <Calendar data={data} now={now} />
          </>
        ) : (
          <PhotoAlbum />
        )}
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
