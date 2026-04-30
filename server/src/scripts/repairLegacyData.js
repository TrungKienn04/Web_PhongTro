import db from "../models/index.js";
import {
  ensureBootstrapAdminUser,
  repairLegacyPostMetadata,
} from "../services/databaseMaintenance.js";

async function main() {
  console.log("Starting legacy data repair...");

  const repairSummary = await repairLegacyPostMetadata();
  const adminSummary = await ensureBootstrapAdminUser();

  console.log(
    JSON.stringify(
      {
        repairSummary,
        adminSummary,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("Legacy data repair failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });

