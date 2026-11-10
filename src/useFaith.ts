import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./data";
import type { FaithState } from "../shared/faith";

export function useFaith({
  enabled = true,
  refreshMode = "poll",
  pollMs = 30000,
}: {
  enabled?: boolean;
  refreshMode?: "once" | "poll";
  pollMs?: number;
} = {}) {
  const [data, setData] = useState<FaithState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  const loaded = useRef(false);
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const request = ++generation.current;
    try {
      const next = await api("/faith");
      if (mounted.current && request === generation.current) {
        loaded.current = true;
        setData(next as FaithState);
        setError("");
      }
    } catch (e) {
      if (mounted.current && request === generation.current)
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    if (refreshMode !== "once" || !loaded.current) void refresh();
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    const timer = refreshMode === "poll" ? setInterval(resume, pollMs) : null;
    if (refreshMode === "poll") {
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
    }
    return () => {
      mounted.current = false;
      generation.current++;
      if (timer !== null) clearInterval(timer);
      if (refreshMode === "poll") {
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("online", resume);
      }
    };
  }, [enabled, refreshMode, pollMs, refresh]);
  async function act<T>(
    request: () => Promise<T>,
    update?: (state: FaithState, response: T) => FaithState,
  ) {
    if (writing.current) return false;
    writing.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const response = await request();
      if (!mounted.current) return false;
      if (update)
        setData((current) => (current ? update(current, response) : current));
      return true;
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
      return false;
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { data, error, busy, refresh, act };
}
