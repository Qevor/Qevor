const PRODUCTION_HOSTS = new Set(['qevor.xyz', 'www.qevor.xyz']);

export const getQevorApiUrl = () => {
  if (typeof window !== 'undefined' && PRODUCTION_HOSTS.has(window.location.hostname)) {
    return 'https://api.qevor.xyz';
  }

  return import.meta.env.VITE_QEVOR_API_URL?.replace(/\/$/, '') ?? '';
};
