"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Overview extends Model {
    static associate(models) {
      // define association here
    }
  }

  Overview.init(
    {
      // Explicit STRING primary key to match migration (not auto-increment)
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      code: DataTypes.STRING,
      area: DataTypes.STRING,
      type: DataTypes.STRING,
      target: DataTypes.STRING,
      bonus: DataTypes.STRING,
      created: DataTypes.STRING,
      expired: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "Overview",
    },
  );

  return Overview;
};
