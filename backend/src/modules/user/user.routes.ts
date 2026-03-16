import { Router } from "express";
import * as userController from "./user.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

// Tempatkan di sini, Bos
router.get("/search", authMiddleware, userController.handleSearchUsers);

export default router;