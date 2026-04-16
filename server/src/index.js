import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { API_PREFIX, APP_NAME } from "@flowstock/shared";
import { registerRoutes } from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const port = Number(process.env.PORT) || 8000;

const ALLOWED_ORIGINS = [
  "https://flowstock.pages.dev",
  "https://flowstock-sbpd.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) + all listed production/dev origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
}));
// Raise limit to 20 MB — needed for base64-encoded proof photos from drivers
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));


registerRoutes(app);

app.get("/", (_req, res) => {
  res.json({ name: APP_NAME, message: "FlowStock API — use /api/* routes." });
});

// ── Global error handler — catches any thrown errors from route handlers ──────
// Must have 4 arguments for Express to treat it as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`[${APP_NAME}] server listening on http://localhost:${port}${API_PREFIX}`);
});
