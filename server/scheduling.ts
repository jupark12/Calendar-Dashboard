import rrule from "rrule";
import type { Schedule } from "../shared/model";
import { addDays } from "../shared/time";
const { RRule } = rrule;
export function parseRule(schedule: Schedule) {
  if (/BY(HOUR|MINUTE|SECOND)|DTSTART/i.test(schedule.rule))
    throw new Error(
      "Pickup rules must use calendar dates, without time components",
    );
  const options = RRule.parseString(schedule.rule);
  if (
    ![RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY].includes(
      options.freq!,
    )
  )
    throw new Error("Use DAILY, WEEKLY, MONTHLY or YEARLY recurrence");
  if (options.interval !== undefined && options.interval < 1)
    throw new Error("Interval must be positive");
  return new RRule({
    ...options,
    dtstart: new Date(schedule.anchor + "T00:00:00Z"),
  });
}
export function nextPickup(schedule: Schedule, today: string): string | null {
  const rule = parseRule(schedule);
  const end = addDays(today, 730);
  const moved = new Set(schedule.overrides.map((o) => o.from));
  const dates = rule
    .between(new Date(today + "T00:00:00Z"), new Date(end + "T00:00:00Z"), true)
    .map((d) => d.toISOString().slice(0, 10))
    .filter((d) => !schedule.skips.includes(d) && !moved.has(d));
  dates.push(
    ...schedule.overrides
      .filter((o) => !schedule.skips.includes(o.to))
      .map((o) => o.to),
  );
  return dates.filter((d) => d >= today && d <= end).sort()[0] ?? null;
}
