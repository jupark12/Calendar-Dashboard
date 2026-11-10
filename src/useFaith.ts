import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./data";
import type { FaithState } from "../shared/faith";

export function useFaith() {
  const [data, setData] = useState<FaithState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const request = ++generation.current;
    try {
      const next = await api("/faith");
      if (mounted.current && request === generation.current) {
        setData(next as FaithState);
        setError("");
      }
    } catch (e) {
      if (mounted.current && request === generation.current)
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(resume, 30000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [refresh]);
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
