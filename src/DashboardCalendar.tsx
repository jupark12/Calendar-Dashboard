import { useState } from "react";
import type { CalendarEvent, Settings } from "../shared/model";
import {
  addDays,
  dateKey,
  dayDifference,
  eventOnDay,
  eventTime,
  isUpcoming,
} from "../shared/time";
import type { DashboardData } from "./data";
import { format, dayName } from "./dashboardFormat";
export function Calendar({ data, now }: { data: DashboardData; now: Date }) {
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
