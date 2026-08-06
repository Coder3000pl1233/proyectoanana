export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");

export const serverUrl = (path: string) =>
  `${SERVER_URL}${path.startsWith("/") ? path : `/${path}`}`;
