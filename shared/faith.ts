import { z } from "zod";
import { dateKeySchema } from "./model";
import { addDays } from "./time";

export const faithEntrySchema = z.object({
  id: z.string().uuid(),
  person: z.enum(["jun", "soobin"]),
  kind: z.enum(["reading", "prayer"]),
  amount: z.number().int().min(1).max(1000),
  date: dateKeySchema,
  note: z.string().trim().max(160).default(""),
});
export const faithGoalsSchema = z.object({
  reading: z.number().int().min(1).max(1000),
  prayer: z.number().int().min(1).max(1000),
  version: z.number().int().nonnegative(),
});
export type FaithInput = z.infer<typeof faithEntrySchema>;
export type FaithEntry = FaithInput & { createdAt: string };
export type FaithGoals = z.infer<typeof faithGoalsSchema>;
export type FaithState = { entries: FaithEntry[]; goals: FaithGoals };
export type Grower = FaithEntry["person"];
export const defaultFaithGoals: FaithGoals = {
  reading: 1,
  prayer: 5,
  version: 0,
};
export const growers: Grower[] = ["jun", "soobin"];
export const growerNames = { jun: "Jun", soobin: "Soobin" };
export const faithXP = (e: FaithInput) =>
  e.amount * (e.kind === "reading" ? 10 : 2);
export function faithWeekStart(today: string) {
  return addDays(
    today,
    -((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7),
  );
}
export function faithStats(
  entries: FaithEntry[],
  person: Grower,
  from = "0000",
  to = "9999",
) {
  return entries
    .filter((e) => e.person === person && e.date >= from && e.date <= to)
    .reduce(
      (s, e) => ({
        ...s,
        [e.kind]: s[e.kind] + e.amount,
        xp: s.xp + faithXP(e),
      }),
      { reading: 0, prayer: 0, xp: 0 },
    );
}
export function faithStreak(
  entries: FaithEntry[],
  person: Grower,
  today: string,
) {
  const days = new Set(
    entries.filter((e) => e.person === person).map((e) => e.date),
  );
  let day = days.has(today) ? today : addDays(today, -1),
    count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}
export function sameFaithEntry(a: FaithInput, b: FaithInput) {
  return (
    a.id === b.id &&
    a.person === b.person &&
    a.kind === b.kind &&
    a.amount === b.amount &&
    a.date === b.date &&
    a.note === b.note
  );
}
