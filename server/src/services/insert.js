import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import db from "../models/index.js";
import generateCode from "../ultis/generateCode.js";
import { dataArea, dataPrice } from "../ultis/data.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chothuecanho = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../data/chothuecanho.json"),
    "utf8",
  ),
);
const chothuematbang = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../data/chothuematbang.json"),
    "utf8",
  ),
);
const chothuephongtro = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../data/chothuephongtro.json"),
    "utf8",
  ),
);
const nhachothue = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../data/nhachothue.json"),
    "utf8",
  ),
);

import {
  createProvinceCode,
  DEFAULT_PROVINCES,
  mergeProvinceCatalog,
  resolveProvinceCodeFromAddress,
} from "../ultis/provinceCode.js";
import { derivePostPriceAreaCodes } from "../ultis/priceAreaCode.js";
import "../config/loadEnv.cjs";

const dataBody = [
  {
    body: chothuephongtro.body,
    code: "CTPT",
  },
  {
    body: chothuematbang.body,
    code: "CTMB",
  },
  {
    body: chothuecanho.body,
    code: "CTCH",
  },
  {
    body: nhachothue.body,
    code: "NCT",
  },
];

const hashPassword = (password) =>
  bcrypt.hashSync(password, bcrypt.genSaltSync(12));

const getNestedValue = (content = [], ...labels) =>
  content.find((item) => labels.includes(item.name))?.content || null;

export const insertService = () =>
  new Promise(async (resolve, reject) => {
    try {
      const provinceCodes = [];
      const labelCodes = [];
      const currentProvinces = await db.Province.findAll({
        raw: true,
        attributes: ["code", "value"],
      });
      const provinceCatalog = mergeProvinceCatalog(currentProvinces);

      for (const category of dataBody) {
        for (const item of category.body) {
          const transaction = await db.sequelize.transaction();

          try {
            const postId = v4();
            const labelCode = generateCode(
              item?.header?.class?.classType || category.code,
            ).trim();

            if (labelCodes.every((entry) => entry?.code !== labelCode)) {
              labelCodes.push({
                code: labelCode,
                value: item?.header?.class?.classType?.trim() || category.code,
              });
            }

            const provinceValue =
              item?.header?.address?.split(",")?.slice(-1)[0]?.trim() || "";
            let provinceCode = resolveProvinceCodeFromAddress(
              item?.header?.address,
              provinceCatalog,
            );

            if (!provinceCode) {
              provinceCode = createProvinceCode(provinceValue);
            }

            if (
              provinceCode &&
              provinceCodes.every((entry) => entry?.code !== provinceCode)
            ) {
              provinceCodes.push({
                code: provinceCode,
                value: provinceValue,
              });
            }

            const attributesId = v4();
            const userId = v4();
            const imagesId = v4();
            const overviewId = v4();
            const description = JSON.stringify(
              item?.mainContent?.content || [],
            );
            const derivedCodes = derivePostPriceAreaCodes({
              priceText: item?.header?.attributes?.price,
              acreageText: item?.header?.attributes?.acreage,
              priceCatalog: dataPrice,
              areaCatalog: dataArea,
            });

            await db.Post.create(
              {
                id: postId,
                title: item?.header?.title,
                star: item?.header?.star,
                labelCode,
                address: item?.header?.address,
                attributesId,
                categoryCode: category.code,
                description,
                userId,
                overviewId,
                imagesId,
                areaCode: derivedCodes.areaCode,
                priceCode: derivedCodes.priceCode,
                provinceCode,
                priceNumber: derivedCodes.priceNumber,
                areaNumber: derivedCodes.areaNumber,
                status: "published",
              },
              { transaction },
            );

            await db.Attribute.create(
              {
                id: attributesId,
                price: item?.header?.attributes?.price,
                acreage: item?.header?.attributes?.acreage,
                published: item?.header?.attributes?.published,
                hashtag: item?.header?.attributes?.hashtag,
              },
              { transaction },
            );

            await db.Image.create(
              {
                id: imagesId,
                image: JSON.stringify(item?.images || []),
              },
              { transaction },
            );

            await db.Overview.create(
              {
                id: overviewId,
                code: getNestedValue(
                  item?.overview?.content,
                  "MÃ£ tin:",
                  "MÃƒÂ£ tin:",
                ),
                area: getNestedValue(
                  item?.overview?.content,
                  "Khu vá»±c",
                  "Khu vÃ¡Â»Â±c",
                ),
                type: getNestedValue(
                  item?.overview?.content,
                  "Loáº¡i tin rao:",
                  "LoÃ¡ÂºÂ¡i tin rao:",
                ),
                target: getNestedValue(
                  item?.overview?.content,
                  "Äá»‘i tÆ°á»£ng thuÃª:",
                  "Ã„ÂÃ¡Â»â€˜i tÃ†Â°Ã¡Â»Â£ng thuÃƒÂª:",
                ),
                bonus: getNestedValue(
                  item?.overview?.content,
                  "GÃ³i tin:",
                  "GÃƒÂ³i tin:",
                ),
                created: getNestedValue(
                  item?.overview?.content,
                  "NgÃ y Ä‘Äƒng:",
                  "NgÃƒÂ y Ã„â€˜Ã„Æ’ng:",
                ),
                expired: getNestedValue(
                  item?.overview?.content,
                  "NgÃ y háº¿t háº¡n:",
                  "NgÃƒÂ y hÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n:",
                ),
              },
              { transaction },
            );

            await db.User.create(
              {
                id: userId,
                name: getNestedValue(
                  item?.contact?.content,
                  "LiÃªn há»‡:",
                  "LiÃƒÂªn hÃ¡Â»â€¡:",
                ),
                password: hashPassword("123456"),
                phone: getNestedValue(
                  item?.contact?.content,
                  "Äiá»‡n thoáº¡i:",
                  "Ã„ÂiÃ¡Â»â€¡n thoÃ¡ÂºÂ¡i:",
                ),
                zalo: getNestedValue(item?.contact?.content, "Zalo"),
              },
              { transaction },
            );

            await transaction.commit();
          } catch (error) {
            await transaction.rollback();
            throw error;
          }
        }
      }

      for (const item of mergeProvinceCatalog([
        ...DEFAULT_PROVINCES,
        ...provinceCodes,
      ])) {
        await db.Province.findOrCreate({
          where: { code: item.code },
          defaults: item,
        });
      }

      for (const item of labelCodes) {
        await db.Label.findOrCreate({
          where: { code: item.code },
          defaults: item,
        });
      }

      resolve("Done.");
    } catch (error) {
      reject(error);
    }
  });

export const createPricesAndAreas = () =>
  new Promise(async (resolve, reject) => {
    try {
      for (const [index, item] of dataPrice.entries()) {
        await db.Price.findOrCreate({
          where: { code: item.code },
          defaults: {
            code: item.code,
            value: item.value,
            order: index + 1,
          },
        });
      }

      for (const [index, item] of dataArea.entries()) {
        await db.Area.findOrCreate({
          where: { code: item.code },
          defaults: {
            code: item.code,
            value: item.value,
            order: index + 1,
          },
        });
      }

      resolve("OK");
    } catch (error) {
      reject(error);
    }
  });
