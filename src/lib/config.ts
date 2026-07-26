// src/lib/config.ts

/**
 * Allowed client URLs for CORS and Socket.IO
 * Normalizes entries to handle missing protocols (https://), trailing slashes, and wildcards.
 */
const rawClientUrls = process.env.CLIENT_URL || "http://localhost:5173,http://localhost:3000";

export const clientUrls = rawClientUrls
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)
  .flatMap((url) => {
    const cleaned = url.replace(/\/+$/, "");
    if (cleaned === "*") return ["*"];
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return [cleaned];
    }
    // If protocol is missing in environment variable, add both https:// and http://
    return [`https://${cleaned}`, `http://${cleaned}`];
  });

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