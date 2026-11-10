import React, { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { useClock, useDashboard, api } from "./data";
import { Dashboard } from "./Dashboard";
import { Manage } from "./Manage";
const FaithTracker = lazy(() =>
  import("./FaithTracker").then((module) => ({ default: module.FaithTracker })),
);
import "./styles.css";
function App() {
  const { data, status, refresh } = useDashboard();
  const now = useClock();
  const manage = location.pathname.startsWith("/manage");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (status === "locked" || (!data && status !== "loading"))
    return (
      <main className="access-page">
        <div className="access-card">
          <div className="brand-icon">⌂</div>
          <p className="eyebrow">WELCOME HOME</p>
          <h1>Home HQ</h1>
          <p>
            {status === "locked"
              ? manage
                ? "Sign in to look after your household."
                : "Connect this display to your household."
              : "Home HQ is temporarily unreachable."}
          </p>
          {status === "locked" ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("/login", {
                    role: manage ? "admin" : "display",
                    password,
                  });
                  setPassword("");
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {manage ? "Management" : "Display"} password
                <input
                  autoComplete="current-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Connecting…" : "Connect to Home HQ"}
              </button>
            </form>
          ) : (
            <button onClick={refresh}>Try again</button>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <a href={manage ? "/" : "/manage"}>
            {manage ? "Go to display" : "Manage your home"} →
          </a>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="access-page">
        <p>Getting your home ready…</p>
      </main>
    );
  if (location.pathname === "/faith" || location.pathname === "/faith/")
    return (
      <Suspense
        fallback={
          <main className="access-page">Getting your garden ready…</main>
        }
      >
        <FaithTracker dashboard={data} now={now} />
      </Suspense>
    );
  return manage ? (
    <Manage data={data} refresh={refresh} status={status} />
  ) : (
    <Dashboard data={data} now={now} status={status} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Offline shell is optional on unsupported devices. */
      });
    },
    { once: true },
  );
