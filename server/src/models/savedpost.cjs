"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class SavedPost extends Model {
    static associate(models) {
      // Required: getSavedPostsService includes Post via this association.
      // Without it, Sequelize throws "Post is not associated to SavedPost!"
      SavedPost.belongsTo(models.Post, { foreignKey: "postId", as: "post" });
    }
  }

  SavedPost.init(
    {
      userId: { type: DataTypes.STRING, allowNull: false },
      postId: { type: DataTypes.STRING, allowNull: false },
    },
    {
      sequelize,
      modelName: "SavedPost",
    },
  );

  return SavedPost;
};
