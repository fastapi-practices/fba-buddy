const configuredOrigin = String(import.meta.env.VITE_GLOB_API_URL ?? "").replace(/\/$/, "")

export const API_ORIGIN = configuredOrigin

export const API_V1 = configuredOrigin ? `${configuredOrigin}/api/v1` : "/api/v1"
