require("./loadEnv.cjs");

const toBoolean = (value, defaultValue = false) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = `${value}`.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const buildSequelizeOptions = () => {
  const dialect = process.env.DB_DIALECT || "postgres";
  const host = String(process.env.DB_HOST || "").trim();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const port = Number(
    process.env.DB_PORT || (dialect === "postgres" ? 5432 : 3306),
  );
  const shouldDefaultToSsl =
    dialect === "postgres" &&
    /(render\.com|supabase\.co|railway\.app|neon\.tech|amazonaws\.com)/i.test(
      `${host} ${databaseUrl}`,
    );
  const useSsl = toBoolean(process.env.DB_SSL, shouldDefaultToSsl);

  const options = {
    host,
    port,
    dialect,
    logging: false,
    timezone: "+07:00",
    query: {
      raw: true,
    },
  };

  if (useSsl && dialect === "postgres") {
    options.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    };
  }

  return options;
};

const getSequelizeConfig = () => {
  const options = buildSequelizeOptions();

  if (process.env.DATABASE_URL) {
    return {
      url: process.env.DATABASE_URL,
      options,
    };
  }

  return {
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options,
  };
};

module.exports = {
  buildSequelizeOptions,
  getSequelizeConfig,
};
