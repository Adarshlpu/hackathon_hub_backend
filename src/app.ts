
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
import { clientUrls } from "./lib/config.js";

const app: Express = express();
app.set("trust proxy", 1);

// --- Helper: Redis Rate Limiter Factory ---
function createRedisStore(prefix: string) {
  const r = redis;
  if (!r) {
    logger.warn("Redis unavailable, falling back to memory rate limiter");
    return undefined;
  }
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => (r.call as (...args: string[]) => Promise<any>)(...args),
  });
}

// --- Security & CORS ---
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (clientUrls.includes("*") || clientUrls.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --- Rate Limiting ---
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("hackhub:rl:"),
}));

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Stricter limit for auth routes
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("hackhub:rl:auth:"),
}));

// --- Middleware ---
app.use(pinoHttp({
  logger,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes ---
app.get("/", (_req, res) => {
  res.json({
    name: "HackHub API",
    version: "1.0.0",
    baseUrl: "/api",
    docs: "https://github.com/your-org/hackhub",
  });
});

app.use("/api", router);

// --- 404 Catch-all ---
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// --- Global Error Handler ---
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err.status === 403 && err.message?.includes("CORS")) {
    res.status(403).json({ error: err.message });
    return;
  }

  logger.error({ err }, err.message || "Unhandled error");

  let statusCode = 500;
  let message = "Internal server error";

  if (err.name === "ValidationError" || err.name === "CastError") {
    statusCode = 400;
    message = "Invalid request data";
  } else if (err.name === "MongoServerError" && err.code === 11000) {
    statusCode = 409;
    message = "A record with this data already exists";
  } else if (typeof err.status === "number" && err.status >= 400 && err.status < 600) {
    statusCode = err.status;
    message = err.message;
  }

  res.status(statusCode).json({ error: message });
};

app.use(errorHandler);

export default app;