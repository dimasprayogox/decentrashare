import { Router } from "express";
import {
  handleUpload,
  handleGetMyDocuments,
  handleGetMyStorageUsage,
  handlePreviewDocument,
  handleDownloadDocument,
  handleBulkDownloadDocuments,
  handleGetDocumentDetail,
  handleSearchPublicDocuments,
  handleUpdateDocumentMetadata,
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
  handleGetActivityLogs,
  confirmDocumentOnChain,
  triggerBlockchainConfirmation,
  confirmBatchComplete,
  triggerBatchBlockchainConfirmation,
  handleCheckHashesOnChain
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
router.get("/me/storage-usage", handleGetMyStorageUsage);


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
router.post("/shared-details", handleGetSharedUsers);

router.get("/shared-with-me", handleGetSharedWithMe);

router.post("/batch/confirm-complete", confirmBatchComplete);
router.post("/batch/trigger-blockchain", triggerBatchBlockchainConfirmation);
router.post("/check-hashes-onchain", handleCheckHashesOnChain);

router.get('/logs', handleGetActivityLogs);
router.post('/bulk-download', handleBulkDownloadDocuments);
router.get("/root", handleGetRootDocuments);
router.get("/public/search", handleSearchPublicDocuments);
router.patch("/move", handleMoveDocuments);

router.patch("/:id/confirm-onchain", confirmDocumentOnChain);
router.post("/:id/trigger-blockchain", triggerBlockchainConfirmation); 
router.patch("/:id/edit", handleUpdateDocumentMetadata);

// routes/storage.ts
router.get('/:id/preview',handlePreviewDocument);

router.get('/:id/download',handleDownloadDocument);
router.get("/:id", handleGetDocumentDetail);

// GET /api/documents/admin/all
router.get("/admin/all", requireAdmin, handleGetAllDocumentsAdmin);

// GET /api/documents/admin/stats
router.get("/admin/stats", requireAdmin, handleGetSystemStatsAdmin);

export default router;