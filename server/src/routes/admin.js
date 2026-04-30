import express from "express";
import * as adminController from "../controllers/admin.js";
import verifyToken, { requireRole } from "../middlewares/verifyToken.js";
import { loadCurrentUser } from "../middlewares/authAccess.js";
import { loadPost } from "../middlewares/postAccess.js";

const router = express.Router();

router.use(verifyToken, loadCurrentUser, requireRole("admin"));

// Post management
router.get("/posts", adminController.getPosts);
router.get("/posts/:id", loadPost, adminController.getPostById);
router.patch("/posts/:id/status", loadPost, adminController.updatePostStatus);
router.delete("/posts/:id", loadPost, adminController.forceDeletePost);

// User management
router.get("/users", adminController.getUsers);
router.get("/users/:id", adminController.getUserById);
router.patch("/users/:id/status", adminController.updateUserStatus);
router.patch("/users/:id/role", adminController.promoteUserToAdmin);

export default router;
