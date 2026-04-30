import * as postService from "../services/post.js";
import { normalizePostFilterQuery } from "../ultis/postFilters.js";
import {
  normalizePostPayload,
  validatePostPayload,
} from "../ultis/postPayload.js";
import { isAdminRole, parsePostStatus } from "../ultis/accessControl.js";

const normalizePage = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const getPosts = async (_req, res) => {
  try {
    const response = await postService.getPostsService();
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const getPostsLimit = async (req, res) => {
  try {
    const { page, sort, filters } = normalizePostFilterQuery(req.query);

    const response = await postService.getPostsLimitService(page, filters, {
      priceNumber: filters.priceNumber,
      areaNumber: filters.areaNumber,
      sort,
    });

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: "Failed at post controller",
      response: null,
    });
  }
};

export const getNewPosts = async (_req, res) => {
  try {
    const response = await postService.getNewPostService();
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const getPostById = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await postService.getPostByIdService(id, req.user || {});
    return res.status(response?.err === 0 ? 200 : 404).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const createNewPost = async (req, res) => {
  try {
    const normalizedPayload = normalizePostPayload(req.body);
    const { categoryCode, title, priceNumber, areaNumber } = normalizedPayload;
    const { id } = req.user || {};

    if (!categoryCode || !id || !title || !priceNumber || !areaNumber) {
      return res.status(400).json({
        err: 1,
        msg: "Thiáº¿u dá»¯ liá»‡u Ä‘áº§u vÃ o.",
        response: null,
      });
    }

    const validationMessage = validatePostPayload(normalizedPayload);
    if (validationMessage) {
      return res.status(400).json({
        err: 1,
        msg: validationMessage,
        response: null,
      });
    }

    const response = await postService.createNewPostService(
      normalizedPayload,
      id,
    );
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const getPostsByCurrentUser = async (req, res) => {
  const { id, role } = req.user || {};

  try {
    const requestedStatus = String(req.query?.status || "").trim();
    let normalizedStatus;
    const filters = {};

    if (requestedStatus) {
      normalizedStatus = parsePostStatus(requestedStatus);

      if (!normalizedStatus) {
        return res.status(400).json({
          err: 1,
          msg: "Tráº¡ng thÃ¡i bÃ i Ä‘Äƒng khÃ´ng há»£p lá»‡.",
          response: null,
        });
      }
    }

    if (normalizedStatus) {
      filters.status = normalizedStatus;
    }

    if (req.query?.userId) {
      filters.userId = String(req.query.userId).trim();
    }

    if (req.query?.provinceCode) {
      filters.provinceCode = String(req.query.provinceCode).trim();
    }

    const response = isAdminRole(role)
      ? await postService.getAllManagedPostsService(filters, {
          page: normalizePage(req.query?.page),
          limit: req.query?.limit,
        })
      : await postService.getPostsByUserService(id, {
          status: normalizedStatus,
          page: normalizePage(req.query?.page),
          limit: req.query?.limit,
        });

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const updatePost = async (req, res) => {
  try {
    const normalizedPayload = normalizePostPayload(req.body);
    const { categoryCode, title, priceNumber, areaNumber } = normalizedPayload;
    const { id } = req.user || {};

    if (!categoryCode || !id || !title || !priceNumber || !areaNumber) {
      return res.status(400).json({
        err: 1,
        msg: "Thiáº¿u dá»¯ liá»‡u Ä‘áº§u vÃ o.",
        response: null,
      });
    }

    const validationMessage = validatePostPayload(normalizedPayload);
    if (validationMessage) {
      return res.status(400).json({
        err: 1,
        msg: validationMessage,
        response: null,
      });
    }

    const response = await postService.updatePostService(
      req.params.id,
      normalizedPayload,
      id,
    );

    return res.status(response?.err === 0 ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const deletePost = async (req, res) => {
  try {
    const response = await postService.deletePostService(
      req.params.id,
      req.user?.id,
    );
    return res.status(response?.err === 0 ? 200 : 400).json(response);
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};

export const uploadImage = async (req, res) => {
  try {
    if (!req.file?.filename) {
      return res.status(400).json({
        err: 1,
        msg: "KhÃ´ng nháº­n Ä‘Æ°á»£c tá»‡p áº£nh há»£p lá»‡.",
        response: null,
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      err: 0,
      msg: "OK",
      response: {
        secure_url: `${baseUrl}/uploads/posts/${req.file.filename}`,
        original_filename: req.file.originalname,
      },
      secure_url: `${baseUrl}/uploads/posts/${req.file.filename}`,
      original_filename: req.file.originalname,
    });
  } catch (error) {
    return res.status(500).json({
      err: -1,
      msg: `Failed at post controller: ${error}`,
      response: null,
    });
  }
};
