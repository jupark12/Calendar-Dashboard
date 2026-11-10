import { useState } from "react";
import type { Settings } from "../shared/model";
import { api, type DashboardData } from "./data";
import type { Action } from "./manageTypes";
export function SettingsForm({
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
