import { Router } from "express";
import {
  handleUpload,
  handleGetMyDocuments,
  handleGetDocumentDetail,
  handleRenameDocument,
  handleArchiveMultipleDocuments,
  handleRestoreMultipleDocuments,
  handleUpdateMultipleDocumentsPrivacy,
  handleShareToUser,
  handleRevokeAccess,
  handleGetSharedUsers,   
  handleGetAllDocumentsAdmin,
  handleGetSystemStatsAdmin,
  handleGetRootDocuments,
  handleMoveMultipleDocuments,
} from "./document.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/role.middleware";
import { uploadMiddleware } from "../../middlewares/upload.middleware";

const router = Router();

router.use(authMiddleware);

// POST /api/documents/upload
router.post("/upload", uploadMiddleware.array("files", 10), handleUpload);

// GET /api/documents/me
router.get("/me", handleGetMyDocuments);

// GET /api/documents/:id
router.get("/:id", handleGetDocumentDetail);

// Rute massal (statis) di atas
router.patch("/archive", handleArchiveMultipleDocuments);
router.patch("/estore", handleRestoreMultipleDocuments);
// PATCH /api/documents/:id/privacy
router.patch("/privacy", handleUpdateMultipleDocumentsPrivacy);

// Rute dengan ID di bawah
router.patch("/:id/rename", handleRenameDocument);


// POST /api/documents/:id/share  → share ke user
router.post("/:id/share", handleShareToUser);

// DELETE /api/documents/:id/share → cabut akses
router.delete("/:id/share", handleRevokeAccess);

// GET /api/documents/:id/share → lihat siapa yang punya akses
router.get("/:id/share", handleGetSharedUsers);




// Ambil file di root saja
router.get("/root", handleGetRootDocuments);

// Pindahkan banyak file sekaligus
router.patch("/bulk-move", handleMoveMultipleDocuments);



// GET /api/documents/admin/all
router.get("/admin/all", requireAdmin, handleGetAllDocumentsAdmin);

// GET /api/documents/admin/stats
router.get("/admin/stats", requireAdmin, handleGetSystemStatsAdmin);

export default router;