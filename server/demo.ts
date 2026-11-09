import type { CalendarEvent, Settings, Weather } from "../shared/model";
import { addDays, dateKey, localTime } from "../shared/time";
import type { Store } from "./database";
export function demoEvents(
  settings: Settings,
  now = new Date(),
): CalendarEvent[] {
  const today = dateKey(now, settings.timezone);
  const entries: [number, string, string, string, number?][] = [
    [0, "home", "Weekly reset", "17:00"],
    [1, "person1", "Design catch-up", "14:00"],
    [1, "person2", "Pilates", "18:00"],
    [2, "home", "Dinner with the Parkers", "19:00"],
    [3, "person1", "Dentist appointment", "10:00"],
    [4, "home", "Weekend in the mountains", "all", 3],
    [5, "birthdays", "Mom’s birthday", "all"],
    [7, "person2", "Book club", "18:30"],
    [9, "home", "Date night", "19:00"],
    [11, "person1", "Team lunch", "12:00"],
    [13, "home", "Farmers market", "09:00"],
    [16, "birthdays", "Our anniversary", "all"],
    [19, "home", "Friendsgiving", "18:00"],
    [-3, "person2", "Coffee with Emma", "10:00"],
    [-6, "home", "Movie night", "19:00"],
    [-10, "person1", "Project review", "14:00"],
  ];
  return entries.map(([offset, calendarId, title, time, duration], i) => {
    const date = addDays(today, offset);
    const allDay = time === "all"; // Place sample daytime appointments at their intended household wall-clock time.
    const desired = Date.parse(date + "T" + (allDay ? "12:00" : time) + ":00Z");
    let instant = desired;
    for (let i = 0; i < 2; i++) {
      const guess = new Date(instant);
      const local = Date.parse(
        dateKey(guess, settings.timezone) +
          "T" +
          localTime(guess, settings.timezone) +
          ":00Z",
      );
      instant += desired - local;
    }
    const start = allDay ? date : new Date(instant).toISOString();
    return {
      id: "demo-" + i,
      uid: "demo-" + i,
      calendarId,
      title,
      start,
      end: allDay
        ? addDays(date, duration ?? 1)
        : new Date(Date.parse(start) + 3600000).toISOString(),
      allDay,
    };
  });
}
export function demoWeather(settings: Settings, now = new Date()): Weather {
  const today = dateKey(now, settings.timezone);
  const codes = [2, 3, 61, 2, 0, 0, 3];
  return {
    current: { temperature: 64, feelsLike: 62, code: 2 },
    hourly: Array.from({ length: 24 }, (_, i) => ({
      time: new Date(now.getTime() + i * 3600000).toISOString(),
      temperature: Math.round(62 + 8 * Math.sin(i / 5)),
      rain: i > 4 && i < 9 ? 55 : 10,
      code: i > 4 && i < 9 ? 61 : 2,
    })),
    daily: codes.map((code, i) => ({
      date: addDays(today, i),
      high: [68, 65, 61, 63, 67, 69, 64][i],
      low: [48, 47, 45, 44, 46, 49, 47][i],
      code,
      sunrise: addDays(today, i) + "T11:40:00Z",
      sunset: addDays(today, i) + "T22:05:00Z",
    })),
  };
}
export function seedDemo(store: Store) {
  if (store.get("demoSeeded")) return;
  for (const [list, text, category] of [
    ["grocery", "Avocados", "Produce"],
    ["grocery", "Oat milk", "Dairy & alternatives"],
    ["grocery", "Sourdough bread", "Bakery"],
    ["grocery", "Blueberries", "Produce"],
    ["todo", "Book annual checkups", "Health"],
    ["todo", "Water the plants", "Home"],
    ["todo", "Plan our weekend away", "Together"],
  ] as const)
    store.add({
      list,
      text,
      category,
      completed: false,
      priority: text === "Book annual checkups" ? "high" : "normal",
      due: null,
    });
  store.set("demoSeeded", true);
}
