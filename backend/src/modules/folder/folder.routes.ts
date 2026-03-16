import { Router } from "express";
import { 
  handleGetMyFolders,
  handleGetRootDocuments,
  handleMoveMultipleDocuments,
handleCreateFolder,
handleGetFolderDetail,
handleRenameFolder,
handleDeleteMultipleFolders,
handleRestoreFolders,
handleGetFolderContents,
handleShareFolder,
handleGetSharedUsers,
handleUpdateMultipleFolderAccess,
handleRevokeMultipleFolderAccess,
handleGetSharedWithMe,
handleGetPublicFolder,
handleUpdatePrivacy
} from "./folder.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// --- RUTE PUBLIK ---
router.get("/open/:token", handleGetPublicFolder);

// --- SEMUA RUTE DI BAWAH INI BUTUH LOGIN ---
router.use(authMiddleware);

router.post("/me", handleCreateFolder);
router.get("/me", handleGetMyFolders);

// 1. Taruh rute statis di sini
router.get("/root", handleGetRootDocuments);
router.get("/shared-with-me", handleGetSharedWithMe); // <--- Di atas :id

// 3. Rute aksi lainnya
router.patch("/move", handleMoveMultipleDocuments);

// Detail, Rename, dan Delete ditaruh di sini

router.delete("/", handleDeleteMultipleFolders);
router.patch("/restore", handleRestoreFolders);
router.patch("/:id", handleRenameFolder);
router.get("/:id", handleGetFolderDetail);

// 2. Rute dengan parameter :id di bawah
router.get("/:id/contents", handleGetFolderContents);
router.patch("/:id/privacy", handleUpdatePrivacy);

router.post("/:id/shared", handleShareFolder);
router.get("/:id/shared", handleGetSharedUsers);
router.patch('/:id/shared', handleUpdateMultipleFolderAccess);
router.delete('/:id/shared', handleRevokeMultipleFolderAccess);



export default router;