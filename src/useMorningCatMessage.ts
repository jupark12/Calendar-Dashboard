import { useEffect, useState } from "react";
import { dateKey, localTime } from "../shared/time";

const phrases = [
  "You got this Soob",
  "I love you - Jun",
  "My name is Lilertron, the digital version of Lily",
  "I'm a cat that doesn't poop or shed!",
  "Click Me for a fun surprise!",
];
const storageKey = "home-hq-morning-cat";
type Morning = { day: string; phrase: number; dismissed: boolean };

function readMorning(): Morning | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return saved &&
      typeof saved.day === "string" &&
      Number.isInteger(saved.phrase) &&
      saved.phrase >= 0 &&
      saved.phrase < phrases.length &&
      typeof saved.dismissed === "boolean"
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function useMorningCatMessage(now: Date, timezone: string) {
  const today = dateKey(now, timezone);
  const time = localTime(now, timezone);
  const [morning, setMorning] = useState(readMorning);

  useEffect(() => {
    setMorning((current) =>
      current?.day === today
        ? current
        : {
            day: today,
            phrase: Math.floor(Math.random() * phrases.length),
            dismissed: false,
          },
    );
  }, [today]);

  useEffect(() => {
    if (!morning) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(morning));
    } catch {
      // Dismissal still works for this visit when storage is unavailable.
    }
  }, [morning]);

  return {
    message:
      morning?.day === today &&
      !morning.dismissed &&
      time >= "06:00" &&
      time < "10:00"
        ? phrases[morning.phrase]
        : undefined,
    dismiss: () =>
      setMorning((current) => ({
        day: today,
        phrase: current?.day === today ? current.phrase : 0,
        dismissed: true,
      })),
  };
}
