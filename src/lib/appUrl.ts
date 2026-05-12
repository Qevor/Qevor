export function getAppUrl() {
  const configured = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, '')

  if (configured) {
    return configured
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }

  return 'http://localhost:5173'
}
