const db = require("../src/models");

const TABLES = [
  "Users",
  "Posts",
  "Attributes",
  "Images",
  "Overviews",
  "Prices",
  "Areas",
  "Provinces",
  "Categories",
  "Labels",
  "SavedPosts",
];

async function check() {
  try {
    await db.sequelize.authenticate();
    console.log("Connected using current env-based Sequelize config.");

    for (const table of TABLES) {
      try {
        const [rows] = await db.sequelize.query(
          `SELECT COUNT(*)::int AS count FROM "${table}"`,
        );
        console.log(`${table}: ${rows[0]?.count ?? 0}`);
      } catch (error) {
        console.warn(`${table}: count failed: ${error?.message || error}`);
      }
    }

    process.exitCode = 0;
  } catch (error) {
    console.error("checkDb failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

check();
