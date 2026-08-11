// src/models/utils/dateHelpers.ts

/**
 * Formats a Date or date string as a MySQL DATETIME string (YYYY-MM-DD HH:MM:SS).
 * Uses UTC methods so the stored value matches UTC regardless of the server's
 * local timezone setting. Ensure MySQL is also configured to use UTC
 * (set time_zone = '+00:00' in my.cnf or via SET GLOBAL time_zone).
 */
export function formatDateForMySQL(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().slice(0, 19).replace("T", " ")
}
