import { useEffect, useState } from "react";
import type { Snapshot } from "../shared/model";
export type DashboardData = Snapshot & {
  pickups: { id: string; date: string | null }[];
};
export async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Connection timed out. Refresh to check whether your change saved before retrying.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
const cacheKey = "home-hq-last-snapshot-v1";
const dashboardPollMs = 60 * 60 * 1000;
function readCache(): DashboardData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    const cached = raw ? JSON.parse(raw) : null;
    return cached?.settings?.timezone &&
      Array.isArray(cached.events) &&
      Array.isArray(cached.items) &&
      Array.isArray(cached.pickups) &&
      cached.sync?.calendar &&
      cached.calendarRange
      ? cached
      : null;
  } catch {
    return null;
  }
}
export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(readCache);
  const [status, setStatus] = useState<
    "loading" | "online" | "offline" | "locked"
  >("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let failures = 0;
    let etag = "";
    let pending = false;
    async function refresh() {
      if (pending || cancelled) return;
      clearTimeout(timer);
      if (document.hidden) return;
      pending = true;
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 15000);
      try {
        const response = await fetch("/api/dashboard", {
          credentials: "same-origin",
          headers: etag ? { "If-None-Match": etag } : {},
          signal: controller.signal,
        });
        if (cancelled) return;
        if (response.status === 401) {
          try {
            sessionStorage.removeItem(cacheKey);
          } catch {
            /* Storage can be disabled. */
          }
          setData(null);
          setStatus("locked");
          return;
        }
        if (response.status !== 304) {
          if (!response.ok) throw new Error("Unavailable");
          const next = (await response.json()) as DashboardData;
          etag = response.headers.get("etag") || "";
          setData(next);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(next));
          } catch {
            /* Display can continue without browser storage. */
          }
        }
        failures = 0;
        setStatus("online");
      } catch {
        if (!cancelled) {
          failures++;
          setStatus("offline");
        }
      } finally {
        clearTimeout(deadline);
        pending = false;
        if (!cancelled)
          timer = setTimeout(
            refresh,
            failures
              ? Math.min(300000, 30000 * 2 ** Math.min(failures, 4))
              : dashboardPollMs,
          );
      }
    }
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [revision]);
  return { data, status, refresh: () => setRevision((n) => n + 1) };
}
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      if (!document.hidden)
        timer = setTimeout(tick, 60000 - (Date.now() % 60000));
    };
    tick();
    const resume = () => {
      clearTimeout(timer);
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return now;
}
