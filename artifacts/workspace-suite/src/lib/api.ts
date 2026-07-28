// API server is a sibling service at the shared "/api" path prefix (when deployed).
// Use an absolute "/api/..." path rather than import.meta.env.BASE_URL.
export function getApiUrl(path: string) {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `/api/${normalized}`;
}
