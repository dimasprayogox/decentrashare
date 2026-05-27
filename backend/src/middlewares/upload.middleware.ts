// src/middlewares/upload.middleware.ts
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `doc-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// ✅ Allowed types sesuai frontend
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'text/plain',
  'text/csv',
  'application/json'
];

export const uploadMiddleware = multer({ 
  storage,
  limits: { 
    fileSize: 100 * 1024 * 1024,  // ✅ 100MB per file
    files: 10                      // ✅ Max 10 files per request (masuk ke limits!)
  },
  fileFilter: (req, file, cb) => {
    // ✅ Cek MIME type + extension fallback
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype) ||
                      (file.mimetype.startsWith('image/') && /\.(jpeg|jpg|png|gif|webp)$/.test(ext)) ||
                      (file.mimetype.startsWith('video/') && /\.(mp4|webm)$/.test(ext)) ||
                      (file.mimetype.startsWith('audio/') && /\.(mp3|wav|ogg)$/.test(ext)) ||
                      (/\.(mp3|wav|ogg)$/.test(ext) && ['application/octet-stream', ''].includes(file.mimetype));

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}. Supported previewable formats: PDF, DOCX, images (JPG/PNG/GIF/WebP), video (MP4/WebM), audio (MP3/WAV/OGG), text, CSV, and JSON.`), false);
    }
  }
});