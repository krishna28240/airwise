/**
 * Thin JSON client for the AirWise API. Throws an Error carrying the server's message on failure.
 */

/**
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<any>}
 */
export async function request(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/** POST a JSON body. */
export const postJson = (url, body) => request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request('/api/health'),
  plan: (profile) => postJson('/api/plan', profile),
  chat: (question, profile) => postJson('/api/chat', { question, profile }),
  compare: (cities) => request(`/api/compare?cities=${encodeURIComponent(cities.join(','))}`),
  history: () => request('/api/history'),
  savedPlan: (id) => request(`/api/history/${id}`),
  deletePlan: (id) => request(`/api/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),
  stats: () => request('/api/stats'),
};
