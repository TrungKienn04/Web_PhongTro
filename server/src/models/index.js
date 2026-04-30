"use strict";

import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fs = require("fs");
const Sequelize = require("sequelize");

require("../config/loadEnv.cjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basename = path.basename(__filename);
const db = {};

const dbConfigModule = require("../config/dbConfig.cjs");
const getSequelizeConfig =
  (dbConfigModule && dbConfigModule.getSequelizeConfig) ||
  dbConfigModule?.default ||
  (typeof dbConfigModule === "function" ? dbConfigModule : null);

if (!getSequelizeConfig || typeof getSequelizeConfig !== "function") {
  throw new Error(
    "[models/index] getSequelizeConfig is not a function; loaded module keys: " +
      Object.keys(dbConfigModule || {}).join(", "),
  );
}

const config = getSequelizeConfig();

let sequelize;
if (config.url) {
  sequelize = new Sequelize(config.url, config.options);
} else {
  sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    config.options,
  );
}

const loadModelFromFile = (file) => {
  const moduleExport = require(path.join(__dirname, file));

  const modelFactory =
    typeof moduleExport === "function"
      ? moduleExport
      : typeof moduleExport?.default === "function"
        ? moduleExport.default
        : null;

  if (!modelFactory) {
    throw new Error(
      `[models/index] Invalid model export in file "${file}". ` +
        `Expected a function export, got: ${typeof moduleExport}`,
    );
  }

  const model = modelFactory(sequelize, Sequelize.DataTypes);

  if (!model || !model.name) {
    throw new Error(
      `[models/index] Model in file "${file}" did not return a valid Sequelize model.`,
    );
  }

  db[model.name] = model;
};

fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 &&
      file !== basename &&
      (file.slice(-3) === ".js" || file.slice(-4) === ".cjs")
    );
  })
  .forEach(loadModelFromFile);

Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === "function") {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
