import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Op } from "sequelize";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import initRoutes from "./src/routes/index.js";
import connectDatabase from "./src/config/connectDatabase.js";
import db from "./src/models/index.js";
import { dataPrice, dataArea } from "./src/ultis/data.js";
import {
  ensureBootstrapAdminUser,
  repairLegacyPostMetadata,
} from "./src/services/databaseMaintenance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const {
  DEFAULT_PROVINCES,
  createProvinceCode,
  extractProvinceNameFromAddress,
} = require("./src/ultis/provinceCode");

const DEFAULT_CATEGORIES = [
  {
    code: "CTPT",
    value: "Cho thuê phòng trọ",
    header: "Phòng trọ, nhà trọ",
    subheader: "Tìm phòng trọ, nhà trọ theo khu vực và mức giá phù hợp",
  },
  {
    code: "NCT",
    value: "Nhà cho thuê",
    header: "Nhà nguyên căn",
    subheader: "Tổng hợp tin cho thuê nhà nguyên căn cập nhật",
  },
  {
    code: "CTCH",
    value: "Cho thuê căn hộ",
    header: "Căn hộ, căn hộ mini",
    subheader: "Tìm căn hộ và căn hộ mini tiện nghi, dễ lọc",
  },
  {
    code: "CTMB",
    value: "Cho thuê mặt bằng",
    header: "Mặt bằng kinh doanh",
    subheader: "Danh sách mặt bằng cho thuê theo khu vực nổi bật",
  },
];

const app = express();
const rawAllowed = (process.env.CLIENT_URL || "").toString();
const allowedOrigins = rawAllowed
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes("*")) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["POST", "GET", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));

initRoutes(app);

connectDatabase().then(async () => {
  try {
    // await db.sequelize.sync();
    console.log("Database schema ensured.");

    const priceCount = await db.Price.count();
    const areaCount = await db.Area.count();

    if (!priceCount) {
      await db.Price.bulkCreate(
        dataPrice.map((item, index) => ({
          code: item.code,
          value: item.value,
          order: index + 1,
        })),
      );
      console.log("Seeded Price table");
    }

    if (!areaCount) {
      await db.Area.bulkCreate(
        dataArea.map((item, index) => ({
          code: item.code,
          value: item.value,
          order: index + 1,
        })),
      );
      console.log("Seeded Area table");
    }

    const categoryCount = await db.Category.count();
    if (!categoryCount) {
      await db.Category.bulkCreate(DEFAULT_CATEGORIES);
      console.log("Seeded default categories");
    }

    const provinceCount = await db.Province.count();
    if (!provinceCount) {
      await db.Province.bulkCreate(DEFAULT_PROVINCES);
      console.log("Seeded default provinces");
    }

    const currentProvinces = await db.Province.findAll({
      raw: true,
      attributes: ["code", "value"],
    });
    const provinceMap = new Map(
      currentProvinces.map((item) => [item.code, item.value]),
    );
    const postsForProvinceBackfill = await db.Post.findAll({
      raw: true,
      attributes: ["provinceCode", "address"],
    });
    const missingProvinceRecords = [];

    postsForProvinceBackfill.forEach((post) => {
      const provinceName = extractProvinceNameFromAddress(post.address || "");
      const provinceCode =
        post.provinceCode || createProvinceCode(provinceName);

      if (!provinceCode || provinceMap.has(provinceCode)) {
        return;
      }

      provinceMap.set(provinceCode, provinceName || provinceCode);
      missingProvinceRecords.push({
        code: provinceCode,
        value: provinceName || provinceCode,
      });
    });

    if (missingProvinceRecords.length) {
      await db.Province.bulkCreate(missingProvinceRecords);
      console.log(
        `Backfilled ${missingProvinceRecords.length} provinces from posts`,
      );
    }

    try {
      const queryInterface = db.sequelize.getQueryInterface();
      const userDesc = await queryInterface.describeTable("Users");

      if (!userDesc.fbUrl) {
        await queryInterface.addColumn("Users", "fbUrl", {
          type: db.Sequelize.STRING,
          allowNull: true,
        });
        console.log("Added Users.fbUrl column");
      }

      if (!userDesc.avatar) {
        await queryInterface.addColumn(
          "Users",
          "avatar",
          db.Sequelize.BLOB("long"),
        );
        console.log("Added Users.avatar column");
      }

      if (!userDesc.email) {
        await queryInterface.addColumn("Users", "email", {
          type: db.Sequelize.STRING,
          allowNull: true,
        });
        console.log("Added Users.email column");
      }

      if (!userDesc.role) {
        await queryInterface.addColumn("Users", "role", {
          type: db.Sequelize.STRING,
          allowNull: false,
          defaultValue: "user",
        });
        console.log("Added Users.role column");
      }

      if (!userDesc.status) {
        await queryInterface.addColumn("Users", "status", {
          type: db.Sequelize.STRING,
          allowNull: false,
          defaultValue: "active",
        });
        console.log("Added Users.status column");
      }

      if (!userDesc.blockedAt) {
        await queryInterface.addColumn("Users", "blockedAt", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
        console.log("Added Users.blockedAt column");
      }

      if (!userDesc.blockedReason) {
        await queryInterface.addColumn("Users", "blockedReason", {
          type: db.Sequelize.STRING,
          allowNull: true,
        });
        console.log("Added Users.blockedReason column");
      }

      await db.User.update(
        { role: "user" },
        {
          where: {
            [Op.or]: [{ role: null }, { role: "" }],
          },
        },
      );

      await db.User.update(
        { status: "active" },
        {
          where: {
            [Op.or]: [{ status: null }, { status: "" }],
          },
        },
      );

      const userIndexes = await queryInterface.showIndex("Users");
      const hasEmailUniqueIndex = userIndexes.some(
        (index) =>
          index.unique &&
          Array.isArray(index.fields) &&
          index.fields.length === 1 &&
          index.fields[0]?.attribute === "email",
      );

      if (!hasEmailUniqueIndex) {
        await queryInterface.addIndex("Users", ["email"], {
          unique: true,
          name: "users_email_unique",
        });
        console.log("Added Users.email unique index");
      }

      const hasUsersStatusRoleIndex = userIndexes.some(
        (index) => index.name === "users_status_role_idx",
      );

      if (!hasUsersStatusRoleIndex) {
        await queryInterface.addIndex("Users", ["status", "role"], {
          name: "users_status_role_idx",
        });
        console.log("Added Users status/role index");
      }
    } catch (error) {
      console.error(
        "Ensure Users columns failed (safe to ignore if table missing):",
        error && error.message ? error.message : error,
      );
    }

    try {
      const queryInterface = db.sequelize.getQueryInterface();
      const postDesc = await queryInterface.describeTable("Posts");

      if (!postDesc.status) {
        await queryInterface.addColumn("Posts", "status", {
          type: db.Sequelize.STRING,
          allowNull: false,
          defaultValue: "published",
        });
        console.log("Added Posts.status column");
      }

      if (!postDesc.moderatedAt) {
        await queryInterface.addColumn("Posts", "moderatedAt", {
          type: db.Sequelize.DATE,
          allowNull: true,
        });
        console.log("Added Posts.moderatedAt column");
      }

      if (!postDesc.moderatedBy) {
        await queryInterface.addColumn("Posts", "moderatedBy", {
          type: db.Sequelize.STRING,
          allowNull: true,
        });
        console.log("Added Posts.moderatedBy column");
      }

      if (!postDesc.moderationReason) {
        await queryInterface.addColumn("Posts", "moderationReason", {
          type: db.Sequelize.TEXT,
          allowNull: true,
        });
        console.log("Added Posts.moderationReason column");
      }

      if (!postDesc.deletedFromStatus) {
        await queryInterface.addColumn("Posts", "deletedFromStatus", {
          type: db.Sequelize.STRING,
          allowNull: true,
        });
        console.log("Added Posts.deletedFromStatus column");
      }

      await db.Post.update(
        { status: "published" },
        {
          where: {
            [Op.or]: [{ status: null }, { status: "" }],
          },
        },
      );

      await db.Post.update(
        { status: "pending" },
        {
          where: db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("status")),
            "draft",
          ),
        },
      );

      const postIndexes = await queryInterface.showIndex("Posts");
      const hasPostsStatusCreatedAtIndex = postIndexes.some(
        (index) => index.name === "posts_status_created_at_idx",
      );
      const hasPostsUserStatusCreatedAtIndex = postIndexes.some(
        (index) => index.name === "posts_user_status_created_at_idx",
      );

      if (!hasPostsStatusCreatedAtIndex) {
        await queryInterface.addIndex("Posts", ["status", "createdAt"], {
          name: "posts_status_created_at_idx",
        });
        console.log("Added Posts status/createdAt index");
      }

      if (!hasPostsUserStatusCreatedAtIndex) {
        await queryInterface.addIndex(
          "Posts",
          ["userId", "status", "createdAt"],
          {
            name: "posts_user_status_created_at_idx",
          },
        );
        console.log("Added Posts user/status/createdAt index");
      }
    } catch (error) {
      console.error(
        "Ensure Posts columns failed (safe to ignore if table missing):",
        error && error.message ? error.message : error,
      );
    }

    try {
      const queryInterface = db.sequelize.getQueryInterface();

      try {
        await queryInterface.describeTable("SavedPosts");
      } catch (error) {
        await queryInterface.createTable("SavedPosts", {
          id: {
            type: db.Sequelize.INTEGER,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          userId: {
            type: db.Sequelize.STRING,
            allowNull: false,
          },
          postId: {
            type: db.Sequelize.STRING,
            allowNull: false,
          },
          createdAt: {
            type: db.Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: db.Sequelize.DATE,
            allowNull: false,
          },
        });
        console.log("Created SavedPosts table");
      }

      const savedPostIndexes = await queryInterface.showIndex("SavedPosts");
      const hasUniqueIndex = savedPostIndexes.some(
        (index) => index.name === "saved_posts_user_post_unique",
      );
      const hasUserCreatedAtIndex = savedPostIndexes.some(
        (index) => index.name === "saved_posts_user_created_at_idx",
      );

      if (!hasUniqueIndex) {
        await queryInterface.addIndex("SavedPosts", ["userId", "postId"], {
          unique: true,
          name: "saved_posts_user_post_unique",
        });
        console.log("Added SavedPosts unique user/post index");
      }

      if (!hasUserCreatedAtIndex) {
        await queryInterface.addIndex("SavedPosts", ["userId", "createdAt"], {
          name: "saved_posts_user_created_at_idx",
        });
        console.log("Added SavedPosts user/createdAt index");
      }
    } catch (error) {
      console.error(
        "Ensure SavedPosts table failed (safe to ignore if DB missing):",
        error && error.message ? error.message : error,
      );
    }

    const repairSummary = await repairLegacyPostMetadata();
    console.log(
      "Legacy post repair summary:",
      JSON.stringify(repairSummary, null, 2),
    );

    const adminBootstrapSummary = await ensureBootstrapAdminUser();
    console.log(
      "Admin bootstrap summary:",
      JSON.stringify(adminBootstrapSummary, null, 2),
    );
  } catch (error) {
    console.error("Seeding prices/areas failed:", error);
  }
});

const port = process.env.PORT || 8888;
const listener = app.listen(port, () => {
  console.log(`Server is running on the port ${listener.address().port}`);
});
