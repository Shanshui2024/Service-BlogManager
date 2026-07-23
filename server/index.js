// server/index.js — Express server for BlogManager (ESM)
import express from "express";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAuthRoutes } from "./auth.js";
import { createGitHubProxy } from "./routes/github.js";

const FileStore = FileStoreFactory(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Trust proxy for reverse proxy setups (1Panel, nginx, etc.)
app.set("trust proxy", 1);

// Session middleware
app.use(
  session({
    store: new FileStore({
      path: path.join(__dirname, "..", ".sessions"),
      ttl: 86400, // 24 hours
      retries: 2,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GitHub OAuth config
const ghClientId = process.env.GH_CLIENT_ID;
const ghClientSecret = process.env.GH_CLIENT_SECRET;
const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

// Auth routes
app.use("/api/auth", createAuthRoutes({ ghClientId, ghClientSecret, baseUrl }));

// GitHub API proxy (requires auth)
app.use("/api/github", createGitHubProxy());

// Serve static files from public/
app.use(express.static(path.join(__dirname, "..", "public")));

// SPA fallback: serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`BlogManager running at http://localhost:${PORT}`);
});
