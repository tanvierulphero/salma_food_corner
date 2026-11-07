/**
 * Salma Food Corner - Date Formatting Utility
 * Enforces universal "দিন>মাস>বছর" (Day-Month-Year: DD-MM-YYYY) format across the entire application.
 */

export function formatDateDMY(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const str = typeof dateInput === 'string' ? dateInput.trim() : dateInput.toISOString();
  if (!str) return '';

  // Match YYYY-MM-DD or YYYY/MM/DD with optional trailing time e.g. "2026-11-07" or "2026-11-07 10:34 AM" or "2026-11-07T10:34:00"
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    const rest = ymdMatch[4];
    if (rest && rest.startsWith('T')) {
      return `${day}-${month}-${year}`;
    }
    return `${day}-${month}-${year}${rest}`;
  }

  // If already DD-MM-YYYY or DD/MM/YYYY, normalize to DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    const rest = dmyMatch[4];
    return `${day}-${month}-${year}${rest}`;
  }

  // Fallback to JS Date parse
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch {
    // Return original string
  }

  return str;
}

/**
 * Returns today's date formatted as DD-MM-YYYY
 */
export function getTodayDMY(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}
