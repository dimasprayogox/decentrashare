import { Router } from "express";
import {
  handleUpload,
  handleGetMyDocuments,
  handleArchiveDocument,
  handleRestoreDocument,
  handleUpdatePrivacy,
  handleShareToUser,
  handleRevokeAccess,
  handleGetSharedUsers,
  handleCreateFolder,   
  handleGetMyFolders,
  handleGetAllDocumentsAdmin,
  handleGetSystemStatsAdmin,
  handleGetRootDocuments,
  handleMoveMultipleDocuments,
} from "./document.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/role.middleware";
import { uploadMiddleware } from "../../middlewares/upload.middleware";

const router = Router();



// POST /api/documents/upload
router.post(
  "/upload", 
  authMiddleware, 
  uploadMiddleware.array("files", 10), 
  handleUpload
);

// GET /api/documents/me
router.get("/me", authMiddleware, handleGetMyDocuments);

// PATCH /api/documents/:id/archive
router.patch("/:id/archive", authMiddleware, handleArchiveDocument);

// PATCH /api/documents/:id/restore
router.patch("/:id/restore", authMiddleware, handleRestoreDocument);

// PATCH /api/documents/:id/privacy
router.patch("/:id/privacy", authMiddleware, handleUpdatePrivacy);

// POST /api/documents/:id/share  → share ke user
router.post("/:id/share", authMiddleware, handleShareToUser);

// DELETE /api/documents/:id/share → cabut akses
router.delete("/:id/share", authMiddleware, handleRevokeAccess);

// GET /api/documents/:id/share → lihat siapa yang punya akses
router.get("/:id/share", authMiddleware, handleGetSharedUsers);



router.post("/folders", authMiddleware, handleCreateFolder);

// GET /api/documents/folders - Lihat daftar folder saya
router.get("/folders", authMiddleware, handleGetMyFolders);

// Ambil file di root saja
router.get("/root", authMiddleware, handleGetRootDocuments);

// Pindahkan banyak file sekaligus
router.patch("/bulk-move", authMiddleware, handleMoveMultipleDocuments);



// GET /api/documents/admin/all
router.get("/admin/all", authMiddleware, requireAdmin, handleGetAllDocumentsAdmin);

// GET /api/documents/admin/stats
router.get("/admin/stats", authMiddleware, requireAdmin, handleGetSystemStatsAdmin);

export default router;