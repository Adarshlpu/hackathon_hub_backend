// src/lib/config.ts

/**
 * Allowed client URLs for CORS and Socket.IO
 * Defaults to local Vite and Next.js ports
 */
export const clientUrls = (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/**
 * Server configuration
 */
export const port = Number(process.env.PORT || "5000");
export const nodeEnv = process.env.NODE_ENV || "development";
export const isDev = nodeEnv === "development";

/**
 * Validate port on startup
 */
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT environment variable: "${process.env.PORT}"`);
}