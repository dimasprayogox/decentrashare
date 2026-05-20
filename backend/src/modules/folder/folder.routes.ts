import { Router } from "express";
import { 
  handleGetMyFolders,
  handleCreateFolder,
  handleGetFolderDetail,
  handleFolderPath,
  handleRenameFolder,
  handleDestroyFolders,
  handleGetArchivedFolders,
  handleArchiveFolders,
  handleRestoreFolders,
  handleGetFolderContents,
  handleShareFolder,
  handleGetFolderSharedUsers,
  handleRevokeFolderAccess,
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

router.post("/", handleCreateFolder);
router.get("/", handleGetMyFolders);

// 1. Taruh rute statis di sini
router.get("/shared-with-me", handleGetSharedWithMe); // <--- Di atas :id

router.post("/shared-details", handleGetFolderSharedUsers);
router.post("/shared", handleShareFolder);
router.delete('/shared', handleRevokeFolderAccess);

router.patch("/privacy", handleUpdatePrivacy);

router.get("/archived", handleGetArchivedFolders);
router.patch("/archive", handleArchiveFolders);    
router.patch("/restore", handleRestoreFolders);      
router.delete("/destroy", handleDestroyFolders);   


router.get("/path/:id", handleFolderPath);

router.patch("/:id", handleRenameFolder);
router.get("/:id", handleGetFolderDetail);

// 2. Rute dengan parameter :id di bawah
router.get("/:id/contents", handleGetFolderContents);


export default router;