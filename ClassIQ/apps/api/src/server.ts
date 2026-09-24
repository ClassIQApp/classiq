import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "lecture-interpreter-api" });
});

app.get("/materials", async (_req, res) => {
  if (!pool) {
    return res.json([]);
  }

  const result = await pool.query(
    "SELECT id, name, original_name, created_at FROM materials ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post("/materials", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  if (!pool) {
    return res.json({
      message: "File received. Connect PostgreSQL to persist materials.",
      file: req.file.originalname
    });
  }

  const result = await pool.query(
    `INSERT INTO materials (name, original_name, storage_path)
     VALUES ($1, $2, $3)
     RETURNING id, name, original_name, created_at`,
    [req.file.filename, req.file.originalname, req.file.path]
  );

  res.status(201).json(result.rows[0]);
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});