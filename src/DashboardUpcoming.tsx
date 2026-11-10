import {
  dateKey,
  dayDifference,
  eventTime,
  isUpcoming,
} from "../shared/time";
import type { DashboardData } from "./data";
import { dayName } from "./dashboardFormat";
export function Upcoming({ data, now }: { data: DashboardData; now: Date }) {
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
