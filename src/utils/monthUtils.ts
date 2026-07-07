import { useState, useEffect, useRef } from 'react';

export const PORTUGUESE_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const SEEDED_MONTHS = [
  'Janeiro/2026',
  'Fevereiro/2026',
  'Março/2026',
  'Abril/2026',
  'Maio/2026',
  'Junho/2026'
];

/**
 * Returns the current active month in the application's standard format (e.g., "Julho/2026").
 * Always informs the current month ("mês atual/vigente").
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${PORTUGUESE_MONTHS[now.getMonth()]}/${now.getFullYear()}`;
}

/**
 * Returns the previous month relative to the given reference month (or current month if omitted).
 */
export function getPreviousMonth(refMonth?: string): string {
  const current = refMonth || getCurrentMonth();
  const parts = current.split('/');
  if (parts.length !== 2) {
    const now = new Date();
    let idx = now.getMonth() - 1;
    let yr = now.getFullYear();
    if (idx < 0) {
      idx = 11;
      yr -= 1;
    }
    return `${PORTUGUESE_MONTHS[idx]}/${yr}`;
  }
  const monthName = parts[0].trim();
  const year = parseInt(parts[1].trim(), 10) || new Date().getFullYear();
  let idx = PORTUGUESE_MONTHS.indexOf(monthName);
  let targetYear = year;
  if (idx <= 0) {
    idx = 11;
    targetYear -= 1;
  } else {
    idx -= 1;
  }
  return `${PORTUGUESE_MONTHS[idx]}/${targetYear}`;
}

/**
 * Generates an array of available reference months starting from Janeiro/2026
 * up to at least December of the current year (or next year).
 */
export function getAvailableMonths(): string[] {
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(2027, currentYear + 1);
  const months: string[] = [];
  for (let y = 2026; y <= maxYear; y++) {
    for (const m of PORTUGUESE_MONTHS) {
      months.push(`${m}/${y}`);
    }
  }
  return months;
}

/**
 * Checks if a reference month is after June 2026 (unseeded/future periods requiring replication or new data).
 */
export function isUnseededMonth(monthStr: string): boolean {
  return !SEEDED_MONTHS.includes(monthStr);
}

/**
 * Hook to manage the reference month filter state.
 * 1. Initializes the state with the current active month ("mês atual/vigente").
 * 2. Automatically updates the filter to the new month whenever a new period arrives ("virar o mês").
 */
export function useCurrentMonthFilter(initialOverride?: string) {
  const [referenceMonth, setReferenceMonth] = useState<string>(() => {
    return initialOverride || getCurrentMonth();
  });

  const lastTrackedMonthRef = useRef<string>(getCurrentMonth());

  useEffect(() => {
    const checkAndAdvanceMonth = () => {
      const activeMonth = getCurrentMonth();
      // Whenever the calendar month turns over ("virar o mês")
      if (activeMonth !== lastTrackedMonthRef.current) {
        lastTrackedMonthRef.current = activeMonth;
        // Automatically adjust the filter to the new current month ("mês vigente")
        setReferenceMonth(activeMonth);
      }
    };

    window.addEventListener('focus', checkAndAdvanceMonth);
    const interval = setInterval(checkAndAdvanceMonth, 60_000);

    return () => {
      window.removeEventListener('focus', checkAndAdvanceMonth);
      clearInterval(interval);
    };
  }, []);

  return [referenceMonth, setReferenceMonth] as const;
}
