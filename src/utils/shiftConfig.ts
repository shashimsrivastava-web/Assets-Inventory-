export interface ShiftOption {
  value: string;
  label: string;
  startHour: number;
  endHour: number;
}

export const HOURLY_SHIFTS: ShiftOption[] = [
  { value: "18:00 - 03:00 Shift", label: "18:00 - 03:00 Shift", startHour: 18, endHour: 3 },
  { value: "19:00 - 04:00 Shift", label: "19:00 - 04:00 Shift", startHour: 19, endHour: 4 },
  { value: "20:00 - 05:00 Shift", label: "20:00 - 05:00 Shift", startHour: 20, endHour: 5 },
  { value: "21:00 - 06:00 Shift", label: "21:00 - 06:00 Shift", startHour: 21, endHour: 6 },
  { value: "22:00 - 07:00 Shift", label: "22:00 - 07:00 Shift", startHour: 22, endHour: 7 },
  { value: "23:00 - 08:00 Shift", label: "23:00 - 08:00 Shift", startHour: 23, endHour: 8 },
  { value: "00:00 - 09:00 Shift", label: "00:00 - 09:00 Shift", startHour: 0, endHour: 9 }
];

/**
 * Returns the matching shift based on the current real-world hour.
 * Accounts for 9-hour shifts spanning across midnight and prefers the most recently started shift.
 */
export function getRecommendedShiftByTime(date: Date = new Date()): string {
  const currentHour = date.getHours();
  
  // Try to find an exact start hour match first
  const exactMatch = HOURLY_SHIFTS.find((shift) => shift.startHour === currentHour);
  if (exactMatch) {
    return exactMatch.value;
  }

  // Find all shifts that cover the current hour
  const activeShifts = HOURLY_SHIFTS.filter((shift) => {
    const { startHour, endHour } = shift;
    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Spans midnight (e.g. 18:00 to 03:00)
      return currentHour >= startHour || currentHour < endHour;
    }
  });

  if (activeShifts.length > 0) {
    // Recommend the shift that has started most recently (minimum elapsed time)
    return activeShifts.reduce((best, current) => {
      const elapsedBest = (currentHour >= best.startHour) ? (currentHour - best.startHour) : (currentHour + 24 - best.startHour);
      const elapsedCur = (currentHour >= current.startHour) ? (currentHour - current.startHour) : (currentHour + 24 - current.startHour);
      return elapsedCur < elapsedBest ? current : best;
    }).value;
  }

  // Fallback to the first shift
  return "18:00 - 03:00 Shift";
}
