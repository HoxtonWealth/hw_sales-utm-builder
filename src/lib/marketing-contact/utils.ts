import { ACTIVITY_GROUPS } from "./constants";
import type { InputType, Activity, DateGroup } from "./types";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const EMAIL_ACTIVITY_IDS = ACTIVITY_GROUPS.email.activityIds;

export interface ContactTimeSuggestion {
  bestDay: string;
  bestHour: number;
  activityCount: number;
}

export interface BestTimeResult {
  overall: ContactTimeSuggestion | null;
  email: ContactTimeSuggestion | null;
}

function computeBestTime(activities: Activity[]): ContactTimeSuggestion | null {
  if (activities.length < 3) return null;

  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Array(24).fill(0);

  for (const a of activities) {
    const d = new Date(a.created_at);
    dayCounts[d.getDay()]++;
    hourCounts[d.getHours()]++;
  }

  let bestDayIdx = 0;
  let bestHourIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (dayCounts[i] > dayCounts[bestDayIdx]) bestDayIdx = i;
  }
  for (let i = 1; i < 24; i++) {
    if (hourCounts[i] > hourCounts[bestHourIdx]) bestHourIdx = i;
  }

  return {
    bestDay: DAY_NAMES[bestDayIdx],
    bestHour: bestHourIdx,
    activityCount: activities.length,
  };
}

export function getBestContactTime(activities: Activity[]): BestTimeResult {
  const emailActivities = activities.filter((a) =>
    EMAIL_ACTIVITY_IDS.includes(a.field_id)
  );
  return {
    overall: computeBestTime(activities),
    email: computeBestTime(emailActivities),
  };
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function detectInputType(input: string): InputType {
  if (input.includes("@")) return "email";
  if (input.toUpperCase().startsWith("HXT")) return "hxt_id";
  return "ortto_id";
}

export function getActivityColor(fieldId: string): {
  color: string;
  bg: string;
  label: string;
} {
  for (const group of Object.values(ACTIVITY_GROUPS)) {
    const match = group.activityIds.some((id) =>
      id.endsWith(":") ? fieldId.startsWith(id) : fieldId === id
    );
    if (match) return { color: group.color, bg: group.bg, label: group.label };
  }
  return { color: "text-slate-700", bg: "bg-slate-100", label: "Other" };
}

export function groupByDate(activities: Activity[]): DateGroup[] {
  const dateMap: Record<string, Activity[]> = {};

  for (const activity of activities) {
    const dateKey = new Date(activity.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (!dateMap[dateKey]) dateMap[dateKey] = [];
    dateMap[dateKey].push(activity);
  }

  return Object.entries(dateMap)
    .sort(
      ([, a], [, b]) =>
        new Date(b[0].created_at).getTime() -
        new Date(a[0].created_at).getTime()
    )
    .map(([date, acts]) => ({
      date,
      activities: acts.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    }));
}
