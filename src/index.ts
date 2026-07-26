import "dotenv/config";
import http from "http";
import { Server as SocketIO } from "socket.io";
import app from "./app.js";
import { connectDB } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { clientUrls, port } from "./lib/config.js";

const httpServer = http.createServer(app);

const io = new SocketIO(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (clientUrls.includes("*") || clientUrls.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by Socket.IO CORS"));
    },
    credentials: true,
  },
  path: "/ws/socket.io",
});

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  socket.on("join-room", (room: string) => {
    socket.join(room);
    logger.info({ socketId: socket.id, room }, "Socket joined room");
  });

  socket.on("leave-room", (room: string) => {
    socket.leave(room);
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

// Make io accessible to routes
app.set("io", io);

async function start() {
  await connectDB();

  httpServer.listen(port, () => {
    logger.info({ port }, "HackHub API server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
