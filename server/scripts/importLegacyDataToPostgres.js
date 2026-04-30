import fs from "fs";
import path from "path";
import db from "../src/models/index.js";
import {
  ensureBootstrapAdminUser,
  repairLegacyPostMetadata,
} from "../src/services/databaseMaintenance.js";

const TABLE_MAPPINGS = [
  {
    sourceTable: "categorys",
    targetTable: "Categories",
    modelName: "Category",
    columnMap: {
      subtitle: "subheader",
    },
  },
  {
    sourceTable: "prices",
    targetTable: "Prices",
    modelName: "Price",
  },
  {
    sourceTable: "areas",
    targetTable: "Areas",
    modelName: "Area",
  },
  {
    sourceTable: "provinces",
    targetTable: "Provinces",
    modelName: "Province",
  },
  {
    sourceTable: "users",
    targetTable: "Users",
    modelName: "User",
  },
  {
    sourceTable: "labels",
    targetTable: "Labels",
    modelName: "Label",
  },
  {
    sourceTable: "attributes",
    targetTable: "Attributes",
    modelName: "Attribute",
  },
  {
    sourceTable: "images",
    targetTable: "Images",
    modelName: "Image",
  },
  {
    sourceTable: "overviews",
    targetTable: "Overviews",
    modelName: "Overview",
  },
  {
    sourceTable: "posts",
    targetTable: "Posts",
    modelName: "Post",
  },
];

const TABLE_MAPPING_BY_SOURCE = TABLE_MAPPINGS.reduce((accumulator, item) => {
  accumulator[item.sourceTable] = item;
  return accumulator;
}, {});

const chunkArray = (items, size) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const splitTuples = (block) => {
  const tuples = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const character of block) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && inString) {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "'") {
      inString = !inString;
      current += character;
      continue;
    }

    if (!inString && character === "(") {
      if (depth > 0) {
        current += character;
      }
      depth += 1;
      continue;
    }

    if (!inString && character === ")") {
      depth -= 1;
      if (depth === 0) {
        tuples.push(current);
        current = "";
        continue;
      }
    }

    if (!inString && depth === 0 && character === ",") {
      continue;
    }

    if (depth > 0) {
      current += character;
    }
  }

  return tuples;
};

const splitValues = (tuple) => {
  const values = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (const character of tuple) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && inString) {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "'") {
      inString = !inString;
      current += character;
      continue;
    }

    if (!inString && character === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.length) {
    values.push(current.trim());
  }

  return values;
};

const decodeSqlString = (value) =>
  value
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, "\"")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\0/g, "\0");

const parseValue = (value) => {
  if (value === "NULL") {
    return null;
  }

  if (/^'.*'$/.test(value)) {
    return decodeSqlString(value.slice(1, -1));
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    return Number(value);
  }

  return value;
};

const normalizeDateValue = (value) => {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (
      !normalized
      || normalized.toLowerCase() === "invalid date"
      || normalized === "0000-00-00 00:00:00"
    ) {
      return null;
    }

    const parsedDate = new Date(normalized);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  return value;
};

const normalizeRecord = (model, record) => {
  const normalizedRecord = { ...record };

  Object.entries(model.rawAttributes).forEach(([attributeName, attribute]) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedRecord, attributeName)) {
      return;
    }

    if (attribute.type?.key === "DATE") {
      normalizedRecord[attributeName] = normalizeDateValue(
        normalizedRecord[attributeName],
      );
    }
  });

  return normalizedRecord;
};

const applyTableDefaults = (tableName, record) => {
  if (tableName === "Posts" && !record.status) {
    return {
      ...record,
      status: "published",
    };
  }

  if (tableName === "Users" && !record.status) {
    return {
      ...record,
      status: "active",
      role: record.role || "user",
    };
  }

  return record;
};

const extractRecords = (sql) => {
  const groupedRecords = new Map();
  const insertPattern = /INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*([\s\S]*?);/g;
  let match;

  while ((match = insertPattern.exec(sql)) !== null) {
    const sourceTable = match[1].toLowerCase();
    const mapping = TABLE_MAPPING_BY_SOURCE[sourceTable];

    if (!mapping) {
      continue;
    }

    const columns = match[2]
      .split(",")
      .map((column) => column.replace(/`/g, "").trim());
    const tuples = splitTuples(match[3]);

    const records = tuples.map((tuple) => {
      const values = splitValues(tuple).map(parseValue);
      const record = {};

      columns.forEach((sourceColumn, index) => {
        const targetColumn = mapping.columnMap?.[sourceColumn] || sourceColumn;

        if (!targetColumn) {
          return;
        }

        record[targetColumn] = values[index];
      });

      return record;
    });

    const existingRecords = groupedRecords.get(mapping.targetTable) || [];
    groupedRecords.set(mapping.targetTable, existingRecords.concat(records));
  }

  return groupedRecords;
};

const resetSequence = async (tableName) => {
  await db.sequelize.query(`
    SELECT setval(
      pg_get_serial_sequence('"${tableName}"', 'id'),
      COALESCE((SELECT MAX("id") FROM "${tableName}"), 1),
      true
    )
  `);
};

const importLegacyData = async () => {
  const sqlPath = path.resolve(process.cwd(), "phongtro123.sql");

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Legacy SQL dump not found: ${sqlPath}`);
  }

  console.log(`Reading legacy dump: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const recordsByTable = extractRecords(sql);

  await db.sequelize.authenticate();
  // await db.sequelize.sync();

  for (const tableMapping of TABLE_MAPPINGS) {
    const records = recordsByTable.get(tableMapping.targetTable) || [];
    const model = db[tableMapping.modelName];

    if (!model || records.length === 0) {
      continue;
    }

    const existingCount = await model.count();
    if (existingCount > 0) {
      console.log(
        `Skipping ${tableMapping.targetTable}: table already has ${existingCount} rows.`,
      );
      continue;
    }

    const normalizedRecords = records.map((record) =>
      normalizeRecord(
        model,
        applyTableDefaults(tableMapping.targetTable, record),
      ),
    );

    for (const batch of chunkArray(normalizedRecords, 200)) {
      await model.bulkCreate(batch, { validate: false });
    }

    console.log(
      `Imported ${records.length} rows into ${tableMapping.targetTable}.`,
    );

    if (records.some((item) => Number.isInteger(item.id))) {
      await resetSequence(tableMapping.targetTable);
    }
  }

  const repairSummary = await repairLegacyPostMetadata();
  const adminSummary = await ensureBootstrapAdminUser();

  console.log(
    "Post-import repair summary:",
    JSON.stringify(
      {
        repairSummary,
        adminSummary,
      },
      null,
      2,
    ),
  );
};

importLegacyData()
  .then(async () => {
    console.log("Legacy data import completed.");
    await db.sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Legacy data import failed:", error);
    await db.sequelize.close();
    process.exit(1);
  });

