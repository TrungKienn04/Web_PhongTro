"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Post extends Model {
    static associate(models) {
      Post.belongsTo(models.User, { foreignKey: "userId", as: "user" });
      Post.belongsTo(models.Attribute, {
        foreignKey: "attributesId",
        as: "attributes",
      });
      Post.belongsTo(models.Image, { foreignKey: "imagesId", as: "images" });
      Post.belongsTo(models.Overview, {
        foreignKey: "overviewId",
        as: "overview",
      });
    }
  }

  Post.init(
    {
      // Core
      title: DataTypes.STRING,
      star: { type: DataTypes.STRING, defaultValue: "0" },
      labelCode: DataTypes.STRING,
      address: DataTypes.STRING,
      description: DataTypes.TEXT,

      // Foreign keys
      userId: DataTypes.STRING,
      attributesId: DataTypes.STRING,
      imagesId: DataTypes.STRING,
      overviewId: DataTypes.STRING,

      // Category / filter codes
      categoryCode: DataTypes.STRING,
      areaCode: DataTypes.STRING,
      priceCode: DataTypes.STRING,
      provinceCode: DataTypes.STRING,

      // Numeric filters
      priceNumber: DataTypes.FLOAT,
      areaNumber: DataTypes.FLOAT,

      // Status workflow
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
      },

      // Moderation metadata — required for .save() to persist them
      moderatedAt: { type: DataTypes.DATE, allowNull: true },
      moderatedBy: { type: DataTypes.STRING, allowNull: true },
      moderationReason: { type: DataTypes.TEXT, allowNull: true },

      // Soft-delete tracking — required for restore workflow
      deletedFromStatus: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: "Post",
    },
  );

  return Post;
};
