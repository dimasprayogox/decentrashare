import { Router } from "express";
import {
  handleUpload,
  handleGetMyDocuments,
  handlePreviewDocument,
  handleDownloadDocument,
  handleBulkDownloadDocuments,
  handleGetDocumentDetail,
  handleRenameDocument,
  handleArchiveDocuments,
  handleGetArchivedDocuments,
  handleRestoreDocuments,
  handlePermanentDelete,
  handleUpdateDocumentPrivacy,
  handleShareDocuments,
  handleRevokeAccess,
  handleGetSharedUsers,   
  handleGetAllDocumentsAdmin,
  handleGetSystemStatsAdmin,
  handleGetRootDocuments,
  handleMoveDocuments,
  handleGetSharedWithMe,
  handleGetActivityLogs
} from "./document.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/role.middleware";
import { uploadMiddleware } from "../../middlewares/upload.middleware";

const router = Router();

router.use(authMiddleware);

// POST /api/documents/upload
router.post("/upload", uploadMiddleware.array("files", 10), handleUpload);

// GET /api/documents/me
router.get("/", handleGetMyDocuments);


// Rute massal (statis) di atas
router.patch("/archive", handleArchiveDocuments);
router.get("/archived", handleGetArchivedDocuments);
router.patch("/restore", handleRestoreDocuments);
router.delete('/destroy', handlePermanentDelete);
// PATCH /api/documents/:id/privacy
router.patch("/privacy", handleUpdateDocumentPrivacy);



// POST /api/documents/:id/share  → share ke user
router.post("/shared", handleShareDocuments);
// DELETE /api/documents/:id/share → cabut akses
router.delete("/shared", handleRevokeAccess);
// GET /api/documents/:id/share → lihat siapa yang punya akses
router.post("/shared-details", handleGetSharedUsers);

router.get("/shared-with-me", handleGetSharedWithMe);

router.get('/logs', handleGetActivityLogs);

// Rute dengan ID di bawah
// GET /api/documents/:id
router.get("/:id", handleGetDocumentDetail);
router.patch("/:id/rename", handleRenameDocument);

// routes/storage.ts
router.get('/:id/preview', authMiddleware, handlePreviewDocument);

router.get('/:id/download', authMiddleware, handleDownloadDocument);

router.post('/bulk-download', 
  authMiddleware, 
  handleBulkDownloadDocuments
);

// Ambil file di root saja
router.get("/root", handleGetRootDocuments);

// Pindahkan banyak file sekaligus
router.patch("/move", handleMoveDocuments);



// GET /api/documents/admin/all
router.get("/admin/all", requireAdmin, handleGetAllDocumentsAdmin);

// GET /api/documents/admin/stats
router.get("/admin/stats", requireAdmin, handleGetSystemStatsAdmin);

export default router;