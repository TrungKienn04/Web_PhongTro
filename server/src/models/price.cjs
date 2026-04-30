"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Price extends Model {
    static associate(models) {
      // define association here
    }
  }
  Price.init(
    {
      code: DataTypes.STRING,
      value: DataTypes.STRING,
      order: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Price",
    },
  );
  return Price;
};
