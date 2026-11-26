'use strict';

/**
 * Convert an ISO-like local time ('YYYY-MM-DDTHH:mm') into a 12-hour label.
 * @param {string} iso
 * @returns {string} e.g. '1 PM'
 */
function formatHour(iso) {
  if (!iso) return '';
  const h = Number(String(iso).slice(11, 13));
  if (!Number.isFinite(h)) return String(iso);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1} ${suffix}`;
}

module.exports = { formatHour };
