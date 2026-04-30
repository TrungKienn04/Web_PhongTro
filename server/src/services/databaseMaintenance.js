import { Op } from "sequelize";
import db from "../models/index.js";
import { dataArea, dataPrice } from "../ultis/data.js";
import {
  buildProvinceCodeUpdates,
  createProvinceCode,
  extractProvinceNameFromAddress,
  mergeProvinceCatalog,
} from "../ultis/provinceCode.js";
import { derivePostPriceAreaCodes } from "../ultis/priceAreaCode.js";

const normalizePhone = (phone) =>
  String(phone || "")
    .trim()
    .replace(/\s+/g, "");

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

export const repairLegacyPostMetadata = async () => {
  const summary = {
    scannedPosts: 0,
    provinceCodesUpdated: 0,
    priceAreaUpdated: 0,
    createdProvinces: 0,
    unmatchedProvinceCount: 0,
    unmatchedPriceAreaCount: 0,
    unmatchedProvinceItems: [],
    unmatchedPriceAreaItems: [],
  };

  const provinces = await db.Province.findAll({
    raw: true,
    attributes: ["code", "value"],
  });

  const postsMissingProvinceCode = await db.Post.findAll({
    raw: true,
    attributes: ["id", "address", "provinceCode"],
    where: {
      [Op.or]: [{ provinceCode: null }, { provinceCode: "" }],
    },
  });

  const missingProvinceRecords = [];
  const knownProvinceCodes = new Set(
    mergeProvinceCatalog(provinces).map((province) => province.code),
  );

  postsMissingProvinceCode.forEach((post) => {
    const provinceName = extractProvinceNameFromAddress(post.address);
    const provinceCode = createProvinceCode(provinceName);

    if (
      !provinceName ||
      !provinceCode ||
      knownProvinceCodes.has(provinceCode)
    ) {
      return;
    }

    knownProvinceCodes.add(provinceCode);
    missingProvinceRecords.push({
      code: provinceCode,
      value: provinceName,
    });
  });

  if (missingProvinceRecords.length) {
    await db.Province.bulkCreate(missingProvinceRecords);
  }

  const mergedProvinceCatalog = mergeProvinceCatalog([
    ...provinces,
    ...missingProvinceRecords,
  ]);
  const provinceUpdates = buildProvinceCodeUpdates(
    postsMissingProvinceCode,
    mergedProvinceCatalog,
  );

  for (const item of provinceUpdates.updates) {
    await db.Post.update(
      { provinceCode: item.provinceCode },
      { where: { id: item.id } },
    );
  }

  const [priceCatalog, areaCatalog, postsMissingPriceArea] = await Promise.all([
    db.Price.findAll({
      raw: true,
      attributes: ["code", "value", "order"],
    }),
    db.Area.findAll({
      raw: true,
      attributes: ["code", "value", "order"],
    }),
    db.Post.findAll({
      raw: true,
      nest: true,
      include: [
        {
          model: db.Attribute,
          as: "attributes",
          attributes: ["price", "acreage"],
        },
      ],
      where: {
        [Op.or]: [
          { priceCode: null },
          { priceCode: "" },
          { areaCode: null },
          { areaCode: "" },
          { priceNumber: null },
          { areaNumber: null },
        ],
      },
      attributes: [
        "id",
        "title",
        "priceCode",
        "areaCode",
        "priceNumber",
        "areaNumber",
      ],
    }),
  ]);

  const effectivePriceCatalog = priceCatalog.length ? priceCatalog : dataPrice;
  const effectiveAreaCatalog = areaCatalog.length ? areaCatalog : dataArea;

  for (const post of postsMissingPriceArea) {
    const derived = derivePostPriceAreaCodes({
      priceText: post?.attributes?.price,
      acreageText: post?.attributes?.acreage,
      priceNumber: post.priceNumber,
      areaNumber: post.areaNumber,
      priceCatalog: effectivePriceCatalog,
      areaCatalog: effectiveAreaCatalog,
    });

    const nextValues = {};

    if (
      derived.priceNumber !== null &&
      Number(post.priceNumber) !== derived.priceNumber
    ) {
      nextValues.priceNumber = derived.priceNumber;
    }

    if (
      derived.areaNumber !== null &&
      Number(post.areaNumber) !== derived.areaNumber
    ) {
      nextValues.areaNumber = derived.areaNumber;
    }

    if (derived.priceCode && post.priceCode !== derived.priceCode) {
      nextValues.priceCode = derived.priceCode;
    }

    if (derived.areaCode && post.areaCode !== derived.areaCode) {
      nextValues.areaCode = derived.areaCode;
    }

    if (!derived.priceCode || !derived.areaCode) {
      summary.unmatchedPriceAreaItems.push({
        id: post.id,
        title: post.title,
        price: post?.attributes?.price || null,
        acreage: post?.attributes?.acreage || null,
        derived,
      });
    }

    if (!Object.keys(nextValues).length) {
      continue;
    }

    await db.Post.update(nextValues, {
      where: { id: post.id },
    });
    summary.priceAreaUpdated += 1;
  }

  summary.scannedPosts = new Set([
    ...postsMissingProvinceCode.map((post) => post.id),
    ...postsMissingPriceArea.map((post) => post.id),
  ]).size;
  summary.provinceCodesUpdated = provinceUpdates.updates.length;
  summary.createdProvinces = missingProvinceRecords.length;
  summary.unmatchedProvinceCount = provinceUpdates.unmatched.length;
  summary.unmatchedProvinceItems = provinceUpdates.unmatched.slice(0, 20);
  summary.unmatchedPriceAreaCount = summary.unmatchedPriceAreaItems.length;
  summary.unmatchedPriceAreaItems = summary.unmatchedPriceAreaItems.slice(
    0,
    20,
  );

  return summary;
};

export const ensureBootstrapAdminUser = async () => {
  const adminCount = await db.User.count({
    where: { role: "admin" },
  });

  if (adminCount > 0) {
    return {
      changed: false,
      reason: "admin-already-exists",
      adminCount,
    };
  }

  const bootstrapEmail = normalizeEmail(
    process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.DEFAULT_ADMIN_EMAIL,
  );
  const bootstrapPhone = normalizePhone(
    process.env.BOOTSTRAP_ADMIN_PHONE || process.env.DEFAULT_ADMIN_PHONE,
  );

  if (!bootstrapEmail && !bootstrapPhone) {
    return {
      changed: false,
      reason: "bootstrap-admin-not-configured",
      adminCount,
    };
  }

  const candidateClauses = [];

  if (bootstrapEmail) {
    candidateClauses.push({ email: bootstrapEmail }, { fbUrl: bootstrapEmail });
  }

  if (bootstrapPhone) {
    candidateClauses.push({ phone: bootstrapPhone });
  }

  const candidate = await db.User.findOne({
    where:
      candidateClauses.length === 1
        ? candidateClauses[0]
        : { [Op.or]: candidateClauses },
    raw: true,
  });

  if (!candidate) {
    return {
      changed: false,
      reason: "bootstrap-admin-user-not-found",
      adminCount,
      bootstrapEmail,
      bootstrapPhone,
    };
  }

  await db.User.update(
    {
      role: "admin",
      status: "active",
    },
    {
      where: { id: candidate.id },
    },
  );

  return {
    changed: true,
    reason: "bootstrap-admin-promoted",
    adminCount: 1,
    userId: candidate.id,
    email: candidate.email || null,
    phone: candidate.phone || null,
  };
};
