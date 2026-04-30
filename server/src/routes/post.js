import express from "express";
import * as postController from "../controllers/post.js";
import verifyToken, { attachUserIfPresent } from "../middlewares/verifyToken.js";
import uploadSinglePostImage from "../middlewares/uploadSinglePostImage.js";
import { loadCurrentUser, requireActiveUser } from "../middlewares/authAccess.js";
import { loadPost, requirePostOwner } from "../middlewares/postAccess.js";

const router = express.Router();

router.get("/all", postController.getPosts);
router.get("/limit", postController.getPostsLimit);
router.get("/new-post", postController.getNewPosts);

// Legacy authenticated aliases. Canonical write routes live under /user and /admin.
router.get("/manage/all", verifyToken, loadCurrentUser, postController.getPostsByCurrentUser);
router.post(
  "/upload-image",
  verifyToken,
  loadCurrentUser,
  requireActiveUser,
  uploadSinglePostImage,
  postController.uploadImage,
);
router.post(
  "/create-new",
  verifyToken,
  loadCurrentUser,
  requireActiveUser,
  postController.createNewPost,
);
router.put(
  "/:id",
  verifyToken,
  loadCurrentUser,
  requireActiveUser,
  loadPost,
  requirePostOwner,
  postController.updatePost,
);
router.delete(
  "/:id",
  verifyToken,
  loadCurrentUser,
  requireActiveUser,
  loadPost,
  requirePostOwner,
  postController.deletePost,
);
router.get("/:id", attachUserIfPresent, postController.getPostById);

export default router;

