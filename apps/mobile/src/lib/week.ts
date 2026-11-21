/** The seven days of the week a moment is in, Monday first, each at local midnight. */
export function weekOf(at: Date): Date[] {
  const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  // getDay: Sunday is 0, so Sunday goes back six days and Monday none.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

/** Parses a calendar date at local midnight without treating it as UTC. */
export function parseWeekDate(date: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const at = new Date(year, month, day);
  return at.getFullYear() === year && at.getMonth() === month && at.getDate() === day ? at : null;
}

export function plannedWorkoutTime(date: string, time: string): Date | null {
  const at = parseWeekDate(date);
  const parts = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!at || !parts) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  at.setHours(hour, minute);
  return at.getHours() === hour && at.getMinutes() === minute ? at : null;
}
