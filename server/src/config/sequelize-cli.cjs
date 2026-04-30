require("./loadEnv.cjs");

const { getSequelizeConfig } = require("./dbConfig.cjs");

const buildCliConfig = () => {
  const config = getSequelizeConfig();

  if (config.url) {
    return {
      use_env_variable: "DATABASE_URL",
      ...config.options,
    };
  }

  return {
    username: config.username,
    password: config.password,
    database: config.database,
    host: config.options.host,
    port: config.options.port,
    dialect: config.options.dialect,
    logging: config.options.logging,
    dialectOptions: config.options.dialectOptions,
  };
};

module.exports = {
  development: buildCliConfig(),
  test: buildCliConfig(),
  production: buildCliConfig(),
};
