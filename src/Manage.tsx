import { useEffect, useState } from "react";
import { eventTime } from "../shared/time";
import { api, type DashboardData } from "./data";
import { WeatherIcon } from "./WeatherIcon";
import { Lists } from "./ManageLists";
import { SettingsForm } from "./ManageSettings";
type Props = { data: DashboardData; refresh: () => void; status: string };
export function Manage({ data, refresh, status }: Props) {
  const [role, setRole] = useState<string | null>(data.demo ? "admin" : null);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState(
    location.hash === "#alerts" ? "weather" : "lists",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api("/session")
      .then((s) => setRole(s.role))
      .catch(() => setError("Unable to check management access."));
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      refresh();
      setNotice("Saved. Your household displays will update shortly.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="manage">
      <header className="manage-header">
        <a className="brand" href="/">
          <span className="brand-icon">⌂</span>Home HQ
        </a>
        <a href="/">Back to display ↗</a>
      </header>
      <div className="manage-intro">
        <p className="eyebrow">A HOME THAT RUNS TOGETHER</p>
        <h1>A little household care.</h1>
        <p>Lists, plans, and the small things that make a day easier.</p>
      </div>
      {data.demo && (
        <div className="inline-notice">
          Demo mode · example integrations, real local edits. Do not expose this
          mode to the internet.
        </div>
      )}
      {status === "offline" && (
        <div className="inline-notice">
          Disconnected. Changes require a connection; no edits are silently
          queued.
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {role !== "admin" ? (
        <section className="panel management-login">
          <h2>Management access</h2>
          <p>
            This device has read-only access. Enter your management password to
            edit.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api("/login", { role: "admin", password });
                setRole("admin");
                setPassword("");
              });
            }}
          >
            <label>
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Sign in
            </button>
          </form>
        </section>
      ) : (
        <>
          <nav className="manage-tabs">
            {[
              ["lists", "Shared lists"],
              ["settings", "Home & calendars"],
              ["pickups", "Pickup schedules"],
              ["night", "Night mode"],
              ["weather", "Weather & status"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setError("");
                  setNotice("");
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "lists" ? (
            <Lists data={data} act={act} busy={busy} />
          ) : tab === "weather" ? (
            <section className="panel settings-panel">
              <h2>Weather & connection</h2>
              <div className="sync-grid">
                {Object.entries(data.sync).map(([name, s]) => (
                  <div key={name}>
                    <h3>{name}</h3>
                    <p>{s.error ?? "Up to date"}</p>
                    <small>
                      Last success:{" "}
                      {s.lastSuccess
                        ? new Date(s.lastSuccess).toLocaleString()
                        : "Never"}
                    </small>
                  </div>
                ))}
              </div>
              <h3 id="alerts">Official alerts</h3>
              {data.alerts.length ? (
                data.alerts.map((a) => (
                  <article className="alert-detail" key={a.id}>
                    <strong>
                      {a.severity} · {a.title}
                    </strong>
                    <p>{a.description}</p>
                    <small>
                      Expires {new Date(a.expires).toLocaleString()}
                    </small>
                  </article>
                ))
              ) : (
                <p>
                  {data.sync.alerts.error
                    ? "Alert status is unknown. Check weather.gov for your location."
                    : "No active alerts returned for this location."}
                </p>
              )}
              <h3>Next 24 hours</h3>
              <div className="weather-table">
                {data.weather?.hourly
                  .filter((h) => Date.parse(h.time) > Date.now() - 3600000)
                  .slice(0, 24)
                  .map((h) => (
                    <div key={h.time}>
                      <span>
                        {new Date(h.time).toLocaleTimeString("en-US", {
                          timeZone: data.settings.timezone,
                          hour: "numeric",
                        })}
                      </span>
                      <span>
                        <WeatherIcon code={h.code} />{" "}
                        {Math.round(h.temperature)}°F
                      </span>
                      <span>{h.rain}% precipitation chance</span>
                    </div>
                  ))}
              </div>
              <h3>Upcoming events</h3>
              <p>
                Events are synchronized from six weeks ago through 100 days
                ahead.
              </p>
              {data.events
                .filter((e) =>
                  e.allDay
                    ? e.end >= new Date().toISOString().slice(0, 10)
                    : Date.parse(e.end) > Date.now(),
                )
                .slice(0, 30)
                .map((e) => (
                  <p key={e.id}>
                    {e.title} · {e.start.slice(0, 10)} ·{" "}
                    {eventTime(e, data.settings.timezone)}
                  </p>
                ))}
            </section>
          ) : (
            <SettingsForm
              key={tab}
              tab={tab}
              data={data}
              act={act}
              busy={busy}
            />
          )}
          <div className="manage-bottom">
            <span>
              Changes are shared with every connected household device.
            </span>
            {!data.demo && (
              <button
                onClick={() =>
                  void act(async () => {
                    await api("/logout", {});
                    location.href = "/";
                  })
                }
              >
                Sign out this device
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
