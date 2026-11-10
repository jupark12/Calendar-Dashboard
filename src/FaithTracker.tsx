import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, type DashboardData } from "./data";
import { useFaith } from "./useFaith";
import { addDays, dateKey } from "../shared/time";
import {
  growers,
  growerNames,
  faithStats,
  faithStreak,
  faithWeekStart,
  faithXP,
  type FaithEntry,
  type FaithGoals,
  type FaithInput,
  type Grower,
} from "../shared/faith";
import "./FaithTracker.css";

const paths: Record<string, string> = {
  sprout:
    "M12 21v-9M12 16C5 17 3 12 3 7c6 0 9 3 9 8M12 12c0-6 3-9 9-9 0 6-3 10-9 9M7 21h10",
  book: "M12 5v15M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-1-7-2-10 1",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  fire: "M12 2c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-6 3-7 0 4 2 4 2 4s3-4 1-9ZM12 14c-3 3-2 6 0 6s3-3 0-6",
  heart:
    "M20.5 4.5a5 5 0 0 0-7 0L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 20l8.5-8.5a5 5 0 0 0 0-7Z",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  trophy:
    "M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 14v6M8 21h8",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  flower:
    "M12 9c-7-10 7-10 0 0 10-7 10 7 0 0 7 10-7 10 0 0-10 7-10-7 0 0ZM12 13v9M12 19c-5 0-6-3-6-3 5 0 6 3 6 3M12 17c5 0 6-3 6-3-5 0-6 3-6 3",
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] ?? paths.sprout} />
    </svg>
  );
}
function Garden({ xp }: { xp: number }) {
  return (
    <svg viewBox="0 0 250 140" aria-hidden="true">
      <ellipse cx="125" cy="125" rx="110" ry="8" fill="#dfd9bd" />
      <path
        d="M8 122Q35 109 63 122Q95 107 127 122Q163 110 196 122Q220 112 242 122"
        fill="#c4c9a3"
      />
      <g stroke="#7e9460" strokeWidth="3" fill="none">
        <path d="M74 116V63M171 116V51M121 118V86" />
      </g>
      <g fill="#a1b282">
        <path d="M74 91Q41 94 43 68Q72 65 74 91M74 78Q100 81 103 55Q79 55 74 78M171 84Q142 88 140 62Q166 62 171 84M171 69Q199 69 203 47Q178 44 171 69M121 107Q98 108 100 91Q120 87 121 107M122 100Q144 102 147 81Q126 81 122 100" />
      </g>
      <path d="M50 102h49l-6 26H56Z" fill="#b9c391" />
      <path d="M147 101h48l-7 27h-34Z" fill="#c2afd0" />
      <path d="M104 111h34l-5 19h-25Z" fill="#d5bd89" />
      <rect x="47" y="100" width="55" height="7" rx="3" fill="#a9b580" />
      <rect x="144" y="100" width="54" height="7" rx="3" fill="#ae98bf" />
      <g fill="#b49bc5" opacity={xp >= 500 ? 1 : 0.25}>
        <ellipse cx="171" cy="37" rx="10" ry="16" />
        <ellipse cx="171" cy="59" rx="10" ry="16" />
        <ellipse cx="159" cy="48" rx="16" ry="10" />
        <ellipse cx="183" cy="48" rx="16" ry="10" />
      </g>
      <circle cx="171" cy="48" r="9" fill="#f1dfa4" />
      <g fill="#d9bd76" opacity={xp >= 250 ? 1 : 0.25}>
        <ellipse cx="74" cy="48" rx="8" ry="12" />
        <ellipse cx="74" cy="65" rx="8" ry="12" />
        <ellipse cx="65" cy="56" rx="12" ry="8" />
        <ellipse cx="83" cy="56" rx="12" ry="8" />
      </g>
      <circle cx="74" cy="56" r="6" fill="#f7edc7" />
      <g stroke="#b4b68b" strokeWidth="1.5">
        <path d="M29 42v10M24 47h10M219 77v8M215 81h8M117 26v10M112 31h10" />
      </g>
    </svg>
  );
}
const formatDay = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
type GardenReward = {
  id: string;
  person: Grower;
  xp: number;
  title: string;
  detail: string;
  special: boolean;
};

type DialogMode = "log" | "settings" | null;
export function FaithTracker({
  dashboard,
  now,
}: {
  dashboard: DashboardData;
  now: Date;
}) {
  const { data, error, busy, refresh, act } = useFaith();
  const [tab, setTab] = useState("garden");
  const [period, setPeriod] = useState("week");
  const [modal, setModal] = useState<DialogMode>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [person, setPerson] = useState<Grower>("jun");
  const [kind, setKind] = useState<FaithInput["kind"]>("reading");
  const [amount, setAmount] = useState(1);
  const today = dateKey(now, dashboard.settings.timezone);
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [goals, setGoals] = useState<FaithGoals>({
    reading: 1,
    prayer: 5,
    version: 0,
  });
  const [reward, setReward] = useState<GardenReward | null>(null);
  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => setReward(null), 5200);
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReward(null);
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", dismiss);
    };
  }, [reward]);
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{
    entry: FaithEntry;
    restore: boolean;
  } | null>(null);
  const [filter, setFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const unavailable = busy;
  const entries = data?.entries ?? [];
  const sorted = [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const from = period === "week" ? faithWeekStart(today) : "0000";
  const scores = {
    jun: faithStats(entries, "jun", from, today),
    soobin: faithStats(entries, "soobin", from, today),
  };
  const combined = growers.reduce(
    (n, p) => n + faithStats(entries, p, "0000", today).xp,
    0,
  );
  const target = combined < 250 ? 250 : (Math.floor(combined / 500) + 1) * 500;
  function openLog(p: Grower = "jun") {
    setPerson(p);
    setKind("reading");
    setAmount(1);
    setDay(today);
    setNote("");
    setModal("log");
  }
  async function add(input: Omit<FaithInput, "id">) {
    let saved: FaithEntry | undefined;
    const ok = await act(
      async () => {
        saved = (await api("/faith/entries", {
          ...input,
          id: crypto.randomUUID(),
        })) as FaithEntry;
        return saved;
      },
      (state, entry) => ({ ...state, entries: [...state.entries, entry] }),
    );
    if (ok) {
      // The response is authoritative; refresh picks up other growers' changes too.
      const entry = saved;
      setNotice(
        `${growerNames[input.person]} planted a seed! +${faithXP({ ...input, id: "" })} XP`,
      );
      if (entry) {
        setUndo({ entry, restore: false });
        const xp = faithXP(entry);
        const before = faithStats(entries, entry.person, "0000", today).xp;
        const counted = entry.date <= today;
        const level = Math.floor((before + (counted ? xp : 0)) / 100) + 1;
        const levelUp = level > Math.floor(before / 100) + 1;
        const daily = faithStats(entries, entry.person, today, today);
        const dailyDone = (stats: typeof daily) =>
          !!data &&
          stats.reading >= data.goals.reading &&
          stats.prayer >= data.goals.prayer;
        const questsComplete =
          entry.date === today &&
          !dailyDone(daily) &&
          dailyDone({
            ...daily,
            [entry.kind]: daily[entry.kind] + entry.amount,
          });
        const bloom =
          counted &&
          ((combined < 250 && combined + xp >= 250) ||
            Math.floor((combined + xp) / 500) > Math.floor(combined / 500));
        setReward({
          id: entry.id,
          person: entry.person,
          xp,
          title: bloom
            ? "Your garden is blooming!"
            : levelUp
              ? `Level ${level} unlocked!`
              : questsComplete
                ? "Daily goals complete!"
                : "A little faith. A little growth.",
          detail: [
            `${growerNames[entry.person]} ${entry.kind === "reading" ? "made time for the Word" : "made room for prayer"}.`,
            bloom && "A new garden milestone reached.",
            levelUp && `You’re now level ${level}.`,
            questsComplete && "Both of today’s goals, done!",
          ]
            .filter(Boolean)
            .join(" "),
          special: bloom || levelUp || questsComplete,
        });
      }
      setModal(null);
      void refresh();
    }
  }
  async function remove(entry: FaithEntry) {
    const ok = await act(
      () => api("/faith/entries/" + entry.id, {}, "DELETE"),
      (state) => ({
        ...state,
        entries: state.entries.filter((e) => e.id !== entry.id),
      }),
    );
    if (ok) {
      setReward(null);
      setNotice("Entry removed.");
      setUndo({ entry, restore: true });
      void refresh();
    }
  }
  async function undoLast() {
    if (!undo) return;
    const last = undo;
    if (last.restore) {
      await add({
        person: last.entry.person,
        kind: last.entry.kind,
        amount: last.entry.amount,
        date: last.entry.date,
        note: last.entry.note,
      });
    } else await remove(last.entry);
  }
  function backup() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { ...data, exportedAt: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `home-hq-faith-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function activity(rows: FaithEntry[], removable = false) {
    return rows.length ? (
      rows.map((e) => (
        <div className="activity-row" key={e.id}>
          <div className={`activity-icon ${e.person}`}>
            <Icon name={e.kind === "reading" ? "book" : "sun"} />
          </div>
          <div className="activity-content">
            <p>
              <strong>{growerNames[e.person]}</strong>{" "}
              {e.kind === "reading"
                ? `read ${e.amount} chapter${e.amount === 1 ? "" : "s"}`
                : `prayed for ${e.amount} min`}
            </p>
            <small>
              {e.date === today
                ? "Today"
                : `${formatDay(e.date)}, ${e.date.slice(0, 4)}`}
              {e.note && ` · ${e.note}`}
            </small>
          </div>
          <span className="activity-xp">+{faithXP(e)} XP</span>
          {removable && (
            <button
              className="activity-delete"
              disabled={busy}
              onClick={() => void remove(e)}
              aria-label={`Remove ${growerNames[e.person]}’s ${e.kind} entry on ${e.date}`}
            >
              ×
            </button>
          )}
        </div>
      ))
    ) : (
      <div className="empty-state">
        <Icon name="sprout" />A fresh patch, full of possibility.
        <br />
        Log a chapter or a prayer to plant your first seed.
      </div>
    );
  }
  return (
    <div className={`faith-screen ${tab === "garden" ? "garden-view" : ""}`}>
      {reward && (
        <div
          className={`garden-reward ${reward.person} ${reward.special ? "special" : ""}`}
          key={reward.id}
        >
          <div className="reward-particles" aria-hidden="true">
            {Array.from({ length: reward.special ? 36 : 22 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    "--angle": `${i * 137.5}deg`,
                    "--distance": `${160 + (i % 5) * 36}px`,
                    "--delay": `${(i % 6) * 45}ms`,
                    "--petal-color": [
                      "#9bb977",
                      "#baa0d2",
                      "#e6bb59",
                      "#e9ad9b",
                    ][i % 4],
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="reward-card" role="status" aria-atomic="true">
            <button
              className="reward-dismiss"
              aria-label="Dismiss celebration"
              onClick={() => setReward(null)}
            >
              ×
            </button>
            <div className="reward-emblem">
              <Icon name={reward.special ? "trophy" : "sprout"} />
            </div>
            <div className="reward-xp">
              +{reward.xp}
              <span>XP</span>
            </div>
            <h2>{reward.title}</h2>
            <p>{reward.detail}</p>
          </div>
        </div>
      )}
      <header className="header">
        <a className="brand" href="/">
          <span className="brand-icon">⌂</span>Home HQ
          <span className="brand-dot" />
        </a>
        <nav aria-label="Bible and prayer navigation">
          {[
            ["garden", "The garden"],
            ["milestones", "Milestones"],
            ["history", "Activity log"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`nav-button ${tab === id ? "active" : ""}`}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="faith-header-actions">
          <a href="/" className="text-button">
            ← Calendar
          </a>
          <button
            className="icon-button"
            aria-label="Garden settings"
            disabled={!data}
            onClick={() => {
              if (data) setGoals(data.goals);
              setModal("settings");
            }}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <Icon name="sprout" /> JUN & SOOBIN · BIBLE & PRAYER
            </div>
            <h1>
              {tab === "garden" ? (
                <>
                  Your little <em>garden.</em>
                </>
              ) : (
                <>
                  Grow in faith.
                  <br />
                  Grow <em>together.</em>
                </>
              )}
              <span className="title-spark">✳</span>
            </h1>
            <p>Small moments with God. Something beautiful growing.</p>
          </div>
          <div className="verse-card">
            <span className="verse-star">✦</span>
            <p>
              “As iron sharpens iron,
              <br />
              so one person sharpens another.”
            </p>
            <span>PROVERBS 27:17</span>
            <div className="verse-doodle">
              <Icon name="sprout" />
            </div>
          </div>
        </section>
        {error && (
          <div className="faith-notice error" role="alert">
            {error}{" "}
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
          </div>
        )}
        {!data ? (
          <div className="panel">
            {error
              ? "Your garden couldn’t be loaded. Please refresh to try again."
              : "Getting your garden ready…"}
          </div>
        ) : (
          <>
            {notice && (
              <div className="faith-notice celebration" role="status">
                <Icon name="sprout" />
                {notice}
                {undo && (
                  <button
                    disabled={unavailable}
                    onClick={() => void undoLast()}
                  >
                    Undo
                  </button>
                )}
                <button
                  className="dismiss"
                  aria-label="Dismiss notification"
                  onClick={() => {
                    setNotice("");
                    setUndo(null);
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {tab === "garden" && (
              <>
                <section className="together-card">
                  <div className="garden-art">
                    <Garden xp={combined} />
                  </div>
                  <div className="together-copy">
                    <div className="eyebrow">GROWING TOGETHER</div>
                    <h2>
                      {combined < 250
                        ? "Every seed is a beginning."
                        : combined < 500
                          ? "Your first flowers are here."
                          : "Look how far you’ve grown."}
                    </h2>
                    <p>
                      {combined
                        ? `${combined} XP planted together. Keep showing up, one day at a time.`
                        : "Plant your first seeds. Every chapter and prayer helps your shared garden grow."}
                    </p>
                    <div
                      className="shared-track"
                      role="progressbar"
                      aria-label="Shared garden progress"
                      aria-valuenow={combined}
                      aria-valuemin={0}
                      aria-valuemax={target}
                    >
                      <span
                        style={{ width: `${(combined / target) * 100}%` }}
                      />
                    </div>
                    <div className="shared-label">
                      <span>
                        {combined} / {target} shared XP
                      </span>
                      <span>
                        {combined < 250
                          ? "First bloom at 250 XP"
                          : combined < 500
                            ? "Purple bloom at 500 XP"
                            : `Garden milestone ${Math.floor(combined / 500) + 1}`}
                      </span>
                    </div>
                  </div>
                  <div className="shared-medallion">
                    <Icon name="heart" />
                  </div>
                </section>
                <section className="section-heading">
                  <div>
                    <h2>A little growth, every day</h2>
                    <p>
                      {period === "week"
                        ? `${formatDay(faithWeekStart(today))} – ${formatDay(addDays(faithWeekStart(today), 6))} · A new week to bloom`
                        : "Every little seed you’ve planted so far"}
                    </p>
                  </div>
                  <div className="segmented" aria-label="Score period">
                    {[
                      ["week", "This week"],
                      ["all", "All time"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={period === id ? "selected" : ""}
                        aria-pressed={period === id}
                        onClick={() => setPeriod(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <div className="players">
                  {growers.map((p) => {
                    const s = scores[p],
                      all = faithStats(entries, p, "0000", today),
                      lv = Math.floor(all.xp / 100) + 1,
                      other = scores[p === "jun" ? "soobin" : "jun"];
                    return (
                      <article
                        className={`player-card ${p}`}
                        key={p}
                        aria-label={`${growerNames[p]}’s tracker`}
                      >
                        <div className="player-top">
                          <div className="avatar">
                            <Icon name={p === "jun" ? "sprout" : "flower"} />
                          </div>
                          <div>
                            <h3 className="person-name">{growerNames[p]}</h3>
                            <div className="person-tag">
                              Level {lv} ·{" "}
                              {lv < 3
                                ? "Seedling"
                                : lv < 6
                                  ? "Taking root"
                                  : "In bloom"}
                            </div>
                          </div>
                          <span className="streak-pill">
                            <Icon name="fire" />
                            {faithStreak(entries, p, today)} day streak
                          </span>
                        </div>
                        <div className="score-area">
                          <div>
                            <div className="score">
                              {s.xp}
                              <small>XP</small>
                            </div>
                            <div className="score-caption">
                              earned{" "}
                              {period === "week" ? "this week" : "all time"}
                            </div>
                          </div>
                          <div className="leader-tag">
                            <Icon
                              name={s.xp > other.xp ? "trophy" : "sprout"}
                            />
                            {s.xp > other.xp
                              ? "A little ahead"
                              : s.xp === other.xp
                                ? "Growing side by side"
                                : "Keep on growing"}
                          </div>
                        </div>
                        <div className="level-row">
                          <div className="level-label">
                            <span>
                              {100 - (all.xp % 100)} XP to level {lv + 1}
                            </span>
                          </div>
                          <div
                            className="progress"
                            role="progressbar"
                            aria-label={`${growerNames[p]}’s level progress`}
                            aria-valuenow={all.xp % 100}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${all.xp % 100}%` }} />
                          </div>
                        </div>
                        <div className="counter-grid">
                          {(["reading", "prayer"] as const).map((k) => (
                            <div className="counter" key={k}>
                              <div className="counter-name">
                                <Icon name={k === "reading" ? "book" : "sun"} />
                                {k === "reading"
                                  ? "Bible reading"
                                  : "Prayer time"}
                              </div>
                              <div className="counter-number">
                                {s[k]}
                                <span>
                                  {k === "reading"
                                    ? s[k] === 1
                                      ? "chapter"
                                      : "chapters"
                                    : s[k] === 1
                                      ? "minute"
                                      : "minutes"}
                                </span>
                              </div>
                              <button
                                className="add-button"
                                disabled={busy}
                                onClick={() =>
                                  void add({
                                    person: p,
                                    kind: k,
                                    amount: k === "reading" ? 1 : 5,
                                    date: today,
                                    note: "",
                                  })
                                }
                              >
                                {k === "reading"
                                  ? "+ 1 chapter"
                                  : "+ 5 minutes"}
                                <span>↗</span>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="card-bottom">
                          <button
                            className="text-button"
                            disabled={unavailable}
                            onClick={() => openLog(p)}
                          >
                            Custom entry ↗
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="bottom-grid">
                  <section className="panel daily-panel">
                    <div className="panel-title">
                      <h2>
                        <Icon name="sun" />
                        Today’s little quests
                      </h2>
                      <span className="subtle">{formatDay(today)}</span>
                    </div>
                    {growers.map((p) => {
                      const s = faithStats(entries, p, today, today);
                      return (
                        <div className="quest" key={p}>
                          <div className="quest-person">
                            <span className={`dot ${p}`} />
                            {growerNames[p]}
                          </div>
                          {(["reading", "prayer"] as const).map((k) => (
                            <div
                              className={`quest-item ${s[k] >= data.goals[k] ? "done" : ""}`}
                              key={k}
                            >
                              <span className="quest-check">
                                {s[k] >= data.goals[k] ? "✓" : ""}
                              </span>
                              <span>
                                {k === "reading" ? "Read" : "Pray"}{" "}
                                {data.goals[k]}{" "}
                                {k === "reading"
                                  ? data.goals[k] === 1
                                    ? "chapter"
                                    : "chapters"
                                  : "min"}
                                <br />
                                <span className="subtle">
                                  {s[k]} / {data.goals[k]} today
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    <div className="kind-note">
                      <Icon name="heart" />
                      Show up, start small. Every moment counts.
                    </div>
                  </section>
                </div>
              </>
            )}
            {tab === "milestones" && (
              <section>
                <div className="section-heading">
                  <div>
                    <h2>Small steps, lovely milestones.</h2>
                    <p>Grow your collection, one faithful moment at a time.</p>
                  </div>
                </div>
                {growers.map((p) => {
                  const s = faithStats(entries, p, "0000", today),
                    streak = faithStreak(entries, p, today);
                  const badges = [
                    {
                      icon: "sprout",
                      name: "First seed",
                      desc: "Log your very first activity.",
                      earned: s.xp > 0,
                    },
                    {
                      icon: "book",
                      name: "In the Word",
                      desc: "Read 10 chapters in total.",
                      earned: s.reading >= 10,
                    },
                    {
                      icon: "sun",
                      name: "Quiet moments",
                      desc: "Spend 60 minutes in prayer.",
                      earned: s.prayer >= 60,
                    },
                    {
                      icon: "fire",
                      name: "Taking root",
                      desc: "Reach a 3-day current streak.",
                      earned: streak >= 3,
                    },
                    {
                      icon: "star",
                      name: "Faithful rhythm",
                      desc: "Reach a 7-day current streak.",
                      earned: streak >= 7,
                    },
                    {
                      icon: "trophy",
                      name: "In full bloom",
                      desc: "Earn 500 XP in total.",
                      earned: s.xp >= 500,
                    },
                  ];
                  return (
                    <div key={p}>
                      <h3 className="badge-person">
                        <span className={`dot ${p}`} /> {growerNames[p]}’s
                        milestones
                      </h3>
                      <div className="badge-grid">
                        {badges.map((b) => (
                          <div
                            key={b.name}
                            className={`badge ${p} ${b.earned ? "earned" : ""}`}
                          >
                            <Icon name={b.icon} />
                            <h3>{b.name}</h3>
                            <p>{b.desc}</p>
                            <span className="badge-status">
                              {b.earned ? "✓ Achieved" : "Keep growing"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {tab === "history" && (
              <section>
                <div className="section-heading">
                  <div>
                    <h2>Your growing story</h2>
                    <p>Every chapter and quiet moment, all in one place.</p>
                  </div>
                  <button
                    className="primary"
                    disabled={unavailable}
                    onClick={() => openLog()}
                  >
                    + Log activity
                  </button>
                </div>
                <div className="history-filters">
                  <label className="sr-only" htmlFor="faith-person">
                    Filter by person
                  </label>
                  <select
                    id="faith-person"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Both growers</option>
                    <option value="jun">Jun</option>
                    <option value="soobin">Soobin</option>
                  </select>
                  <label className="sr-only" htmlFor="faith-kind">
                    Filter by activity
                  </label>
                  <select
                    id="faith-kind"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value)}
                  >
                    <option value="all">All activities</option>
                    <option value="reading">Bible reading</option>
                    <option value="prayer">Prayer</option>
                  </select>
                </div>
                <div className="panel">
                  {activity(
                    sorted.filter(
                      (e) =>
                        (filter === "all" || e.person === filter) &&
                        (kindFilter === "all" || e.kind === kindFilter),
                    ),
                    true,
                  )}
                </div>
              </section>
            )}
          </>
        )}
        <footer>
          <span>
            <Icon name="sprout" />
            Rooted in grace. Growing at your own pace.
          </span>
          <span>
            Shared with your household ·{" "}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh
            </button>{" "}
            ·{" "}
            <button className="text-button" disabled={!data} onClick={backup}>
              Download backup
            </button>
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        aria-labelledby="faith-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">MAKE IT YOUR RHYTHM</div>
            <h2 id="faith-dialog-title">
              {modal === "log" ? "Make a little progress." : "Garden settings"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close"
            onClick={() => setModal(null)}
          >
            ✕
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {modal === "log" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add({ person, kind, amount, date: day, note: note.trim() });
            }}
          >
            <div className="form-grid">
              <label>
                Grower
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value as Grower)}
                >
                  <option value="jun">Jun</option>
                  <option value="soobin">Soobin</option>
                </select>
              </label>
              <label>
                Activity
                <select
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as FaithInput["kind"];
                    setKind(k);
                    setAmount(k === "reading" ? 1 : 5);
                  }}
                >
                  <option value="reading">Bible reading</option>
                  <option value="prayer">Prayer</option>
                </select>
              </label>
              <label>
                {kind === "reading" ? "Chapters read" : "Minutes in prayer"}
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={amount}
                  required
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  max={today}
                  value={day}
                  required
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
            </div>
            <label>
              A little note (optional)
              <input
                maxLength={160}
                placeholder="e.g. John 1 · A fresh beginning"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="form-hint">
              This little seed earns {amount * (kind === "reading" ? 10 : 2)}{" "}
              XP.
            </p>
            <button className="primary wide" disabled={unavailable}>
              {busy ? "Saving…" : "Plant this seed ↗"}
            </button>
          </form>
        )}
        {modal === "settings" && (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await act(
                  () =>
                    api("/faith/goals", goals, "PUT") as Promise<FaithGoals>,
                  (s, next) => ({ ...s, goals: next }),
                );
                if (ok) {
                  setModal(null);
                  setNotice("Your daily goals are saved.");
                  setUndo(null);
                  void refresh();
                }
              }}
            >
              <p className="dialog-description">
                Set a gentle daily goal for both growers. Either activity keeps
                a streak growing.
              </p>
              <div className="form-grid">
                <label>
                  Daily chapters
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    value={goals.reading}
                    onChange={(e) =>
                      setGoals({ ...goals, reading: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Daily prayer minutes
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    value={goals.prayer}
                    onChange={(e) =>
                      setGoals({ ...goals, prayer: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <button className="primary wide" disabled={unavailable}>
                {busy ? "Saving…" : "Save daily goals"}
              </button>
            </form>
            <div className="settings-explainer">
              <h3>How your garden grows</h3>
              <p>
                1 chapter = 10 XP · 1 prayer minute = 2 XP
                <br />
                Every 100 XP unlocks a new level. Weekly scores restart each
                Monday; all-time progress stays.
              </p>
              <p>
                Saved in your household dashboard and shared across connected
                devices. Dates follow {dashboard.settings.timezone}. Updates
                appear within 30 seconds while this screen is open.
              </p>
              <button className="secondary" onClick={backup}>
                Download backup
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
