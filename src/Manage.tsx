import { useEffect, useState } from "react";
import type { Item, Settings } from "../shared/model";
import { eventTime, weatherIcon } from "../shared/time";
import { api, type DashboardData } from "./data";
type Props = { data: DashboardData; refresh: () => void; status: string };
const blank = {
  list: "grocery" as const,
  text: "",
  category: "",
  priority: "normal" as const,
  due: null,
  completed: false,
};
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
                        {weatherIcon(h.code)} {Math.round(h.temperature)}°F
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
type Action = (fn: () => Promise<unknown>) => Promise<boolean>;
function Lists({
  data,
  act,
  busy,
}: {
  data: DashboardData;
  act: Action;
  busy: boolean;
}) {
  const [list, setList] = useState<"grocery" | "todo">("grocery");
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, "id" | "version">>(blank);
  const items = data.items
    .filter((i) => i.list === list)
    .sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        Number(b.priority === "high") - Number(a.priority === "high"),
    );
  function reset() {
    setEditing(null);
    setForm({ ...blank, list });
  }
  return (
    <div className="manage-list-layout">
      <section className="panel list-editor">
        <div className="view-switch">
          <button
            aria-pressed={list === "grocery"}
            onClick={() => {
              setList("grocery");
              setEditing(null);
              setForm({ ...blank, list: "grocery" });
            }}
          >
            Groceries
          </button>
          <button
            aria-pressed={list === "todo"}
            onClick={() => {
              setList("todo");
              setEditing(null);
              setForm({ ...blank, list: "todo" });
            }}
          >
            To-do
          </button>
        </div>
        <h2>
          {list === "grocery"
            ? "Good things for the pantry."
            : "Make a little progress."}
        </h2>
        <p>
          {items.filter((i) => !i.completed).length} left to{" "}
          {list === "grocery" ? "pick up" : "do"}
        </p>
        {!items.length && (
          <p className="empty">
            Your list is clear. Add something on the right.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`manage-item ${item.completed ? "completed" : ""}`}
          >
            <input
              type="checkbox"
              aria-label={`Complete ${item.text}`}
              checked={item.completed}
              disabled={busy}
              onChange={() =>
                void act(() =>
                  api(
                    "/items/" + item.id,
                    { ...item, completed: !item.completed },
                    "PUT",
                  ),
                )
              }
            />
            <div>
              <strong>{item.text}</strong>
              <small>
                {[
                  item.category,
                  item.priority === "high" ? "High priority" : "",
                  item.due ? "Due " + item.due : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(item);
                setForm(item);
              }}
            >
              Edit
            </button>
            <button
              className="delete"
              disabled={busy}
              aria-label={`Delete ${item.text}`}
              onClick={() =>
                void act(() =>
                  api("/items/" + item.id, { version: item.version }, "DELETE"),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </section>
      <section className="panel item-form">
        <h2>{editing ? "Edit item" : "Add to the list"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act(() =>
                editing
                  ? api(
                      "/items/" + editing.id,
                      { ...form, version: editing.version },
                      "PUT",
                    )
                  : api("/items", form),
              )
            )
              reset();
          }}
        >
          <label>
            What do we need?
            <input
              required
              maxLength={160}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder={
                list === "grocery"
                  ? "e.g. Fresh strawberries"
                  : "e.g. Book the car service"
              }
            />
          </label>
          <label>
            Category <span>optional</span>
            <input
              maxLength={40}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Produce, home, errands…"
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({
                  ...form,
                  priority: e.target.value as "normal" | "high",
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Due date <span>optional</span>
            <input
              type="date"
              value={form.due ?? ""}
              onChange={(e) =>
                setForm({ ...form, due: e.target.value || null })
              }
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add item"}
          </button>
          {editing && (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
function SettingsForm({
  tab,
  data,
  act,
  busy,
}: {
  tab: string;
  data: DashboardData;
  act: Action;
  busy: boolean;
}) {
  const [settings, setSettings] = useState<Settings>(() =>
    structuredCloneFallback(data.settings),
  );
  const [previous, setPrevious] = useState(() => JSON.stringify(data.settings));
  const [overrideHours, setOverrideHours] = useState(2);
  return (
    <section className="panel settings-panel">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const next = {
            ...settings,
            night:
              tab !== "night"
                ? settings.night.overrideUntil &&
                  Date.parse(settings.night.overrideUntil) <= Date.now()
                  ? {
                      ...settings.night,
                      override: "auto" as const,
                      overrideUntil: null,
                    }
                  : settings.night
                : {
                    ...settings.night,
                    overrideUntil:
                      settings.night.override === "auto"
                        ? null
                        : new Date(
                            Date.now() + overrideHours * 3600000,
                          ).toISOString(),
                  },
          };
          if (
            await act(() =>
              api("/settings", { settings: next, previous }, "PUT"),
            )
          ) {
            setSettings(next);
            setPrevious(JSON.stringify(next));
          }
        }}
      >
        {tab === "settings" ? (
          <>
            <h2>Your household</h2>
            <div className="form-grid">
              <label>
                Household subtitle
                <input
                  required
                  maxLength={60}
                  value={settings.household}
                  onChange={(e) =>
                    setSettings({ ...settings, household: e.target.value })
                  }
                />
              </label>
              <label>
                Time zone
                <input
                  required
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                />
              </label>
              <label>
                Location name
                <input
                  required
                  value={settings.location.name}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      location: { ...settings.location, name: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={settings.location.latitude}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      location: {
                        ...settings.location,
                        latitude: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={settings.location.longitude}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      location: {
                        ...settings.location,
                        longitude: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <h2>Your calendars</h2>
            <p>
              Match each ID to a server-side CALENDAR_FEEDS entry. Secret feed
              URLs are never entered or displayed here.
            </p>
            {settings.calendars.map((c, i) => (
              <fieldset key={i}>
                <legend>Calendar {i + 1}</legend>
                <div className="form-grid">
                  <label>
                    ID
                    <input
                      required
                      pattern="[a-z0-9_-]{1,32}"
                      value={c.id}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          calendars: settings.calendars.map((x, j) =>
                            j === i ? { ...x, id: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Name
                    <input
                      required
                      value={c.name}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          calendars: settings.calendars.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Color
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          calendars: settings.calendars.map((x, j) =>
                            j === i ? { ...x, color: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={c.kind}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          calendars: settings.calendars.map((x, j) =>
                            j === i
                              ? { ...x, kind: e.target.value as typeof c.kind }
                              : x,
                          ),
                        })
                      }
                    >
                      {["personal", "household", "birthday", "anniversary"].map(
                        (v) => (
                          <option key={v}>{v}</option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={c.upcoming}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        calendars: settings.calendars.map((x, j) =>
                          j === i ? { ...x, upcoming: e.target.checked } : x,
                        ),
                      })
                    }
                  />{" "}
                  Include in upcoming events
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      calendars: settings.calendars.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remove calendar
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={settings.calendars.length >= 12}
              onClick={() =>
                setSettings({
                  ...settings,
                  calendars: [
                    ...settings.calendars,
                    {
                      id: "calendar" + Date.now().toString().slice(-6),
                      name: "New calendar",
                      color: "#779782",
                      kind: "household",
                      upcoming: true,
                    },
                  ],
                })
              }
            >
              + Add calendar
            </button>
          </>
        ) : tab === "pickups" ? (
          <>
            <h2>A place for the bins.</h2>
            <p>
              Schedules use household calendar dates. An override replaces one
              occurrence; a skipped date cancels pickup.
            </p>
            {settings.schedules.map((s, i) => {
              const update = (patch: Partial<typeof s>) =>
                setSettings({
                  ...settings,
                  schedules: settings.schedules.map((x, j) =>
                    j === i ? { ...x, ...patch } : x,
                  ),
                });
              return (
                <fieldset key={s.id}>
                  <legend>{s.id === "trash" ? "Trash" : "Recycling"}</legend>
                  <div className="form-grid">
                    <label>
                      Label
                      <input
                        required
                        value={s.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                    </label>
                    <label>
                      First pickup / recurrence anchor
                      <input
                        type="date"
                        required
                        value={s.anchor}
                        onChange={(e) => update({ anchor: e.target.value })}
                      />
                    </label>
                    <label>
                      Quick schedule
                      <select
                        value="custom"
                        onChange={(e) => {
                          if (e.target.value !== "custom")
                            update({ rule: e.target.value });
                        }}
                      >
                        <option value="custom">Custom rule below</option>
                        <option value="FREQ=WEEKLY">
                          Weekly on anchor weekday
                        </option>
                        <option value="FREQ=WEEKLY;INTERVAL=2">
                          Every other week
                        </option>
                        <option value="FREQ=WEEKLY;BYDAY=TU,FR">
                          Tuesday & Friday
                        </option>
                      </select>
                    </label>
                    <label>
                      Recurrence rule
                      <input
                        required
                        value={s.rule}
                        onChange={(e) => update({ rule: e.target.value })}
                      />
                    </label>
                  </div>
                  <small>
                    Examples: FREQ=WEEKLY;BYDAY=MO,TH · FREQ=WEEKLY;INTERVAL=2 ·
                    FREQ=MONTHLY;BYDAY=1MO
                  </small>
                  <label>
                    Skipped dates, one per line
                    <textarea
                      value={s.skips.join("\n")}
                      onChange={(e) =>
                        update({ skips: e.target.value.split("\n") })
                      }
                      onBlur={() =>
                        update({
                          skips: s.skips.map((x) => x.trim()).filter(Boolean),
                        })
                      }
                      placeholder="2026-12-25"
                    />
                  </label>
                  <h3>Holiday overrides</h3>
                  {s.overrides.map((o, j) => (
                    <div className="override-row" key={j}>
                      <label>
                        Instead of
                        <input
                          type="date"
                          required
                          value={o.from}
                          onChange={(e) =>
                            update({
                              overrides: s.overrides.map((v, k) =>
                                j === k ? { ...v, from: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <span>→</span>
                      <label>
                        Collect on
                        <input
                          type="date"
                          required
                          value={o.to}
                          onChange={(e) =>
                            update({
                              overrides: s.overrides.map((v, k) =>
                                j === k ? { ...v, to: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="Remove override"
                        onClick={() =>
                          update({
                            overrides: s.overrides.filter((_, k) => j !== k),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        overrides: [...s.overrides, { from: "", to: "" }],
                      })
                    }
                  >
                    + Add override
                  </button>
                </fieldset>
              );
            })}
          </>
        ) : (
          <>
            <h2>Let the house wind down.</h2>
            <p>
              A quieter display for the evening. This changes the visual theme;
              physical screen brightness is controlled by Android.
            </p>
            <div className="form-grid">
              <label>
                Night starts
                <input
                  type="time"
                  required
                  value={settings.night.start}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      night: { ...settings.night, start: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Day starts
                <input
                  type="time"
                  required
                  value={settings.night.end}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      night: { ...settings.night, end: e.target.value },
                    })
                  }
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.night.solar}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    night: { ...settings.night, solar: e.target.checked },
                  })
                }
              />{" "}
              Follow local sunset and sunrise when forecast data is available
            </label>
            <div className="form-grid">
              <label>
                Temporary override
                <select
                  value={settings.night.override}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      night: {
                        ...settings.night,
                        override: e.target.value as "auto" | "day" | "night",
                      },
                    })
                  }
                >
                  <option value="auto">Automatic schedule</option>
                  <option value="day">Keep day mode on</option>
                  <option value="night">Switch to night mode</option>
                </select>
              </label>
              {settings.night.override !== "auto" && (
                <label>
                  Return to automatic after
                  <select
                    value={overrideHours}
                    onChange={(e) => setOverrideHours(Number(e.target.value))}
                  >
                    {[1, 2, 4, 8, 12].map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {settings.night.overrideUntil && (
              <p>
                Current override expires{" "}
                {new Date(settings.night.overrideUntil).toLocaleString()}.
              </p>
            )}
          </>
        )}
        <div className="save-settings">
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSettings(structuredCloneFallback(data.settings));
              setPrevious(JSON.stringify(data.settings));
            }}
          >
            Reload saved settings
          </button>
        </div>
      </form>
    </section>
  );
}
function structuredCloneFallback<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
