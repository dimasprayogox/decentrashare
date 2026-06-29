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

// ✅ Allowed types sesuai frontend (termasuk format iPhone/iOS seperti MOV, QuickTime, HEIC, HEIF)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/tiff',
  'image/bmp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-quicktime',
  'video/x-m4v',
  'video/3gpp',
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
                      (file.mimetype.startsWith('image/') && /\.(jpeg|jpg|png|gif|webp|heic|heif|tiff|tif|bmp|svg)$/.test(ext)) ||
                      (file.mimetype.startsWith('video/') && /\.(mp4|webm|mov|qt|m4v|3gp)$/.test(ext)) ||
                      (file.mimetype.startsWith('audio/') && /\.(mp3|wav|ogg)$/.test(ext)) ||
                      (/\.(mp3|wav|ogg|mov|qt|heic|heif|m4v)$/.test(ext) && ['application/octet-stream', ''].includes(file.mimetype));

    if (isAllowed) {
      cb(null, true);
    } else {
      const extensionLabel = ext || 'unknown extension';
      cb(new Error(`Unsupported file type: ${file.originalname} (${extensionLabel}). Supported previewable formats: PDF, images (JPG/PNG/GIF/WebP/HEIC/HEIF), video (MP4/WebM/MOV), audio (MP3/WAV/OGG), text, CSV, and JSON.`), false);
    }
  }
});