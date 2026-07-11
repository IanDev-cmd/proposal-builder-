// The api-server artifact is routed at the shared "/api" path prefix
// (see artifacts/api-server/.replit-artifact/artifact.toml). It is a sibling
// service, not nested under this artifact's own BASE_URL, so we address it
// with an absolute "/api/..." path rather than import.meta.env.BASE_URL.
export function getApiUrl(path: string) {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `/api/${normalized}`;
}
