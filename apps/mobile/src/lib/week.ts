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
