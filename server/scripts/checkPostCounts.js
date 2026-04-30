import db from "../src/models/index.js";

const run = async () => {
  try {
    await db.sequelize.authenticate();
    const total = await db.Post.count();
    const grouped = await db.Post.findAll({
      raw: true,
      attributes: [
        "status",
        [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      ],
      group: ["status"],
    });

    console.log(JSON.stringify({ total, grouped }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(
      "checkPostCounts failed:",
      error && error.message ? error.message : error,
    );
    process.exit(2);
  }
};

run();
