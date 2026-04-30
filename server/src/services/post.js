import db from "../models/index.js";
import { v4 } from "uuid";

import generateCode from "../ultis/generateCode.js";
import { dataArea, dataPrice } from "../ultis/data.js";
import { buildPostWhereClause } from "../ultis/postFilters.js";

import {
  canTransitionPostStatus,
  normalizeDeletedFromStatus,
  normalizePostStatus,
  parsePostStatus,
  POST_STATUS_DELETED,
  POST_STATUS_PENDING,
  POST_STATUS_PUBLISHED,
} from "../ultis/accessControl.js";

import { normalizeImageList, normalizeDescription } from "../ultis/postData.js";
import {
  createProvinceCode,
  resolveProvinceCodeFromAddress,
} from "../ultis/provinceCode.js";
import {
  derivePostPriceAreaCodes,
  formatAreaAttribute,
  formatPriceAttribute,
} from "../ultis/priceAreaCode.js";

// ================= CONFIG =================
const DEFAULT_EXPIRED_DAYS = 10;
const LIMIT = Number(process.env.LIMIT) || 10;

// ================= INCLUDE =================
const baseListIncludes = [
  { model: db.Image, as: "images", attributes: ["image"] },
  {
    model: db.Attribute,
    as: "attributes",
    attributes: ["price", "acreage", "published", "hashtag"],
  },
];

const publicPostIncludes = [
  ...baseListIncludes,
  {
    model: db.User,
    as: "user",
    attributes: ["name", "zalo", "phone", "email", "fbUrl"],
  },
];

// ================= HELPER =================
const mapPostResponse = (record) => ({
  ...record,
  status: normalizePostStatus(record?.status),
  deletedFromStatus: normalizeDeletedFromStatus(record?.deletedFromStatus),
  user: record?.user
    ? { ...record.user, email: record.user.email || record.user.fbUrl || "" }
    : null,
  images: { image: normalizeImageList(record?.images?.image) },
  description: normalizeDescription(record?.description),
});

const serializeDescription = (value) =>
  JSON.stringify(
    (Array.isArray(value) ? value : String(value || "").split("\n"))
      .map((i) => i.trim())
      .filter(Boolean),
  );

const normalizeImagePayload = (images) =>
  normalizeImageList(images).filter(Boolean);

const buildPostWritePayload = async (body = {}) => {
  const [priceCatalog, areaCatalog, category] = await Promise.all([
    db.Price.findAll({ raw: true }),
    db.Area.findAll({ raw: true }),
    db.Category.findOne({
      raw: true,
      where: { code: body.categoryCode },
    }),
  ]);

  const derivedCodes = derivePostPriceAreaCodes({
    priceNumber: body.priceNumber,
    areaNumber: body.areaNumber,
    priceCatalog: priceCatalog.length ? priceCatalog : dataPrice,
    areaCatalog: areaCatalog.length ? areaCatalog : dataArea,
  });

  const provinceName =
    body.province || body.address?.split(",").slice(-1)[0]?.trim() || "";

  return {
    category,
    derivedCodes,
    normalizedImages: normalizeImagePayload(body.images),
    priceNumber: derivedCodes.priceNumber ?? Number(body.priceNumber),
    areaNumber: derivedCodes.areaNumber ?? Number(body.areaNumber),
    provinceCode:
      body.provinceCode ||
      resolveProvinceCodeFromAddress(provinceName, []) ||
      createProvinceCode(provinceName),
    provinceName,
  };
};

// ================= HELPERS for countsByStatus =================

/**
 * Count posts grouped by status for a given WHERE clause (without status filter).
 * Returns an object like { pending: 3, published: 10, ... }
 */
const fetchCountsByStatus = async (where = {}) => {
  const rows = await db.Post.findAll({
    where,
    attributes: [
      "status",
      [db.sequelize.fn("COUNT", db.sequelize.literal("*")), "count"],
    ],
    group: ["status"],
    raw: true,
  });

  const counts = {};
  (rows || []).forEach((row) => {
    const normalized = normalizePostStatus(row.status);
    counts[normalized] = (counts[normalized] || 0) + Number(row.count || 0);
  });
  return counts;
};

// ================= SERVICE =================

// GET ALL (public)
export const getPostsService = async () => {
  const response = await db.Post.findAll({
    where: { status: POST_STATUS_PUBLISHED },
    raw: true,
    nest: true,
    include: publicPostIncludes,
  });

  return {
    err: 0,
    msg: "OK",
    response: response.map(mapPostResponse),
  };
};

// GET WITH PAGINATION (public)
export const getPostsLimitService = async (
  page,
  query,
  { priceNumber, areaNumber },
) => {
  const offset = !page || +page <= 1 ? 0 : +page - 1;

  const where = {
    ...buildPostWhereClause({
      ...query,
      priceNumber,
      areaNumber,
    }),
    status: POST_STATUS_PUBLISHED,
  };

  const rows = await db.Post.findAll({
    where,
    raw: true,
    nest: true,
    offset: offset * LIMIT,
    limit: LIMIT,
    order: [["createdAt", "DESC"]],
    include: publicPostIncludes,
  });

  const count = await db.Post.count({ where });

  return {
    err: 0,
    msg: "OK",
    response: {
      rows: rows.map(mapPostResponse),
      count,
    },
  };
};

// CREATE
export const createNewPostService = async (body, userId) => {
  const transaction = await db.sequelize.transaction();

  try {
    const postId = v4();
    const attributesId = v4();
    const imagesId = v4();
    const overviewId = v4();

    const {
      derivedCodes,
      normalizedImages,
      priceNumber,
      areaNumber,
      provinceCode,
      provinceName,
    } = await buildPostWritePayload(body);

    const now = new Date();
    const expired = new Date(now.getTime() + DEFAULT_EXPIRED_DAYS * 86400000);

    await db.Post.create(
      {
        id: postId,
        title: body.title,
        labelCode: generateCode(body.categoryCode),
        address: body.address || "",
        categoryCode: body.categoryCode,
        description: serializeDescription(body.description),
        userId,
        attributesId,
        imagesId,
        overviewId,
        priceNumber,
        areaNumber,
        provinceCode,
        areaCode: derivedCodes.areaCode,
        priceCode: derivedCodes.priceCode,
        status: POST_STATUS_PENDING,
      },
      { transaction },
    );

    await db.Attribute.create(
      {
        id: attributesId,
        price: formatPriceAttribute(priceNumber),
        acreage: formatAreaAttribute(areaNumber),
        published: now.toLocaleDateString("vi-VN"),
        hashtag: `#${Math.floor(Math.random() * 1e6)}`,
      },
      { transaction },
    );

    await db.Image.create(
      {
        id: imagesId,
        image: JSON.stringify(normalizedImages),
      },
      { transaction },
    );

    // Create Overview record so getPostById can populate overview.area, overview.target etc.
    await db.Overview.create(
      {
        id: overviewId,
        code: generateCode(body.categoryCode),
        area: provinceName,
        type: "Nhà ở",
        target: String(body.target || "Tất cả").trim(),
        bonus: body.title,
        created: now.toLocaleDateString("vi-VN"),
        expired: expired.toLocaleDateString("vi-VN"),
      },
      { transaction },
    );

    await transaction.commit();

    return { err: 0, msg: "OK" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// UPDATE STATUS (admin)
export const updatePostStatusService = async (
  postId,
  status,
  moderatorId,
  moderationReason = "",
) => {
  const post = await db.Post.findOne({ where: { id: postId } });

  if (!post) {
    return { err: 1, msg: "Không tìm thấy tin đăng" };
  }

  const nextStatus = parsePostStatus(status);
  const currentStatus = normalizePostStatus(post.status);

  if (!canTransitionPostStatus(currentStatus, nextStatus)) {
    return { err: 1, msg: "Không được phép chuyển trạng thái" };
  }

  // When soft-deleting via admin status change, record which status we came from
  if (nextStatus === POST_STATUS_DELETED) {
    post.deletedFromStatus = currentStatus;
  } else {
    // Restoring from deleted — clear the tracker
    post.deletedFromStatus = null;
  }

  post.status = nextStatus;
  post.moderatedBy = moderatorId;
  post.moderatedAt = new Date();
  post.moderationReason = String(moderationReason || "").trim() || null;

  await post.save();

  return { err: 0, msg: "OK" };
};

// GET ALL MANAGED (admin)
export const getAllManagedPostsService = async (filters = {}, options = {}) => {
  const page = Number(options.page) || 1;
  const limit = Number(options.limit) || LIMIT;
  const offset = (page - 1) * limit;

  // Build base WHERE (all filters including status if provided)
  const where = buildPostWhereClause(filters);
  if (filters.status) where.status = filters.status;
  if (filters.userId) where.userId = filters.userId;
  if (filters.provinceCode) where.provinceCode = filters.provinceCode;

  // Build WHERE without status filter for the counts summary
  const whereForCounts = buildPostWhereClause(filters);
  if (filters.userId) whereForCounts.userId = filters.userId;
  if (filters.provinceCode) whereForCounts.provinceCode = filters.provinceCode;

  const [rows, count, countsByStatus] = await Promise.all([
    db.Post.findAll({
      where,
      raw: true,
      nest: true,
      offset,
      limit,
      order: [["createdAt", "DESC"]],
      include: [
        ...baseListIncludes,
        {
          model: db.User,
          as: "user",
          attributes: ["name", "zalo", "phone", "email", "fbUrl"],
        },
      ],
    }),
    db.Post.count({ where }),
    fetchCountsByStatus(whereForCounts),
  ]);

  return {
    err: 0,
    msg: "OK",
    response: {
      rows: rows.map(mapPostResponse),
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 0,
      countsByStatus,
    },
  };
};

// GET POSTS BY USER (user dashboard)
export const getPostsByUserService = async (
  userId,
  { page = 1, limit = LIMIT, status } = {},
) => {
  const perPage = Math.min(Number(limit) || LIMIT, LIMIT);
  const offset = (Number(page) - 1) * perPage;

  const where = { userId };
  if (status) where.status = status;

  const [rows, count, countsByStatus] = await Promise.all([
    db.Post.findAll({
      where,
      raw: true,
      nest: true,
      offset,
      limit: perPage,
      order: [["createdAt", "DESC"]],
      include: [
        ...baseListIncludes,
        {
          model: db.User,
          as: "user",
          attributes: ["name", "zalo", "phone", "email", "fbUrl"],
        },
      ],
    }),
    db.Post.count({ where }),
    // Count all statuses for this user (no status filter)
    fetchCountsByStatus({ userId }),
  ]);

  return {
    err: 0,
    msg: "OK",
    response: {
      rows: rows.map(mapPostResponse),
      count,
      page: Number(page),
      limit: perPage,
      totalPages: Math.ceil(count / perPage) || 0,
      countsByStatus,
    },
  };
};

// GET POST BY ID
export const getPostByIdService = async (id, currentUser = {}) => {
  const post = await db.Post.findOne({
    where: { id },
    raw: true,
    nest: true,
    include: [
      ...baseListIncludes,
      {
        model: db.User,
        as: "user",
        attributes: ["name", "zalo", "phone", "email", "fbUrl"],
      },
      { model: db.Overview, as: "overview" },
    ],
  });

  if (!post) return { err: 1, msg: "Không tìm thấy tin đăng", response: null };

  return { err: 0, msg: "OK", response: mapPostResponse(post) };
};

// GET NEW POSTS (latest published)
export const getNewPostService = async (limit = 6) => {
  const rows = await db.Post.findAll({
    where: { status: POST_STATUS_PUBLISHED },
    raw: true,
    nest: true,
    limit,
    order: [["createdAt", "DESC"]],
    include: publicPostIncludes,
  });

  return { err: 0, msg: "OK", response: rows.map(mapPostResponse) };
};

// UPDATE POST (owner)
export const updatePostService = async (postId, payload = {}, userId) => {
  const transaction = await db.sequelize.transaction();

  try {
    const post = await db.Post.findOne({ where: { id: postId }, transaction });

    if (!post) {
      await transaction.rollback();
      return { err: 1, msg: "Không tìm thấy tin đăng" };
    }

    if (String(post.userId) !== String(userId)) {
      await transaction.rollback();
      return { err: 1, msg: "Forbidden" };
    }

    const {
      derivedCodes,
      normalizedImages,
      priceNumber,
      areaNumber,
      provinceCode,
      provinceName,
    } = await buildPostWritePayload(payload);

    const updated = {
      title: payload.title,
      labelCode: generateCode(payload.categoryCode),
      address: payload.address || "",
      categoryCode: payload.categoryCode,
      description: serializeDescription(payload.description),
      priceNumber,
      areaNumber,
      provinceCode,
      areaCode: derivedCodes.areaCode,
      priceCode: derivedCodes.priceCode,
    };

    await db.Post.update(updated, { where: { id: postId }, transaction });

    if (post.attributesId) {
      await db.Attribute.update(
        {
          price: formatPriceAttribute(priceNumber),
          acreage: formatAreaAttribute(areaNumber),
          published: new Date().toLocaleDateString("vi-VN"),
        },
        { where: { id: post.attributesId }, transaction },
      );
    }

    if (post.imagesId) {
      await db.Image.update(
        { image: JSON.stringify(normalizedImages) },
        { where: { id: post.imagesId }, transaction },
      );
    }

    // Update overview.area if it exists
    if (post.overviewId && provinceName) {
      await db.Overview.update(
        {
          area: provinceName,
          target: String(payload.target || "Tất cả").trim(),
        },
        { where: { id: post.overviewId }, transaction },
      );
    }

    await transaction.commit();

    return { err: 0, msg: "OK" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// SOFT DELETE (user deletes own post)
export const deletePostService = async (postId, userId) => {
  const transaction = await db.sequelize.transaction();

  try {
    const post = await db.Post.findOne({
      where: { id: postId, userId },
      transaction,
    });

    if (!post) {
      await transaction.rollback();
      return { err: 1, msg: "Không tìm thấy tin đăng" };
    }

    const prev = normalizePostStatus(post.status);

    await db.Post.update(
      { status: POST_STATUS_DELETED, deletedFromStatus: prev },
      { where: { id: postId }, transaction },
    );

    await transaction.commit();
    return { err: 0, msg: "OK" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// FORCE DELETE (hard delete) — only allowed when post.status === deleted
export const forceDeletePostService = async (postId) => {
  const transaction = await db.sequelize.transaction();

  try {
    const post = await db.Post.findOne({ where: { id: postId }, transaction });

    if (!post) {
      await transaction.rollback();
      return { err: 1, msg: "Không tìm thấy tin đăng" };
    }

    if (normalizePostStatus(post.status) !== POST_STATUS_DELETED) {
      await transaction.rollback();
      return {
        err: 1,
        statusCode: 400,
        msg: "Post must be in deleted state before force delete",
      };
    }

    // Destroy Post first, then related records (test contract: Post → Image → Attribute → Overview)
    await db.Post.destroy({ where: { id: postId }, transaction });

    if (post.imagesId)
      await db.Image.destroy({ where: { id: post.imagesId }, transaction });
    if (post.attributesId)
      await db.Attribute.destroy({
        where: { id: post.attributesId },
        transaction,
      });
    if (post.overviewId)
      await db.Overview.destroy({
        where: { id: post.overviewId },
        transaction,
      });

    await transaction.commit();
    return { err: 0, msg: "OK" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
