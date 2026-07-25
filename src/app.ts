import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { redis } from "./lib/redis.js";

const app: Express = express();
app.set("trust proxy", 1);

function createRedisRateLimitStore(prefix: string) {
  const client = redis;
  if (!client) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => (client.call as (...command: string[]) => Promise<number>)(...args),
  });
}

// Security
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

// CORS
const clientUrls = (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (clientUrls.includes(origin ?? "")) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Rate limiting
const apiRateLimitStore = createRedisRateLimitStore("hackhub:rate-limit:");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  ...(apiRateLimitStore ? { store: apiRateLimitStore } : {}),
});
app.use(limiter);

const authRateLimitStore = createRedisRateLimitStore("hackhub:auth-rate-limit:");
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...(authRateLimitStore ? { store: authRateLimitStore } : {}),
});
app.use("/api/auth", authLimiter);

// Logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/api", router);

// Keep API failures machine-readable; Express otherwise sends an HTML error page.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled API error");
  const isValidationError = err.name === "ValidationError" || err.name === "CastError";
  res.status(isValidationError ? 400 : 500).json({
    error: isValidationError ? "Invalid request data" : "Internal server error",
  });
};
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;
