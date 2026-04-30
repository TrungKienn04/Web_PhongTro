"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // Associations can be added here if needed
    }
  }

  User.init(
    {
      name: DataTypes.STRING,
      phone: DataTypes.STRING,
      email: { type: DataTypes.STRING, allowNull: true },
      password: DataTypes.STRING,
      zalo: DataTypes.STRING,

      // Social / legacy login identifier
      fbUrl: { type: DataTypes.STRING, allowNull: true },

      // Avatar stored as binary (legacy)
      avatar: { type: DataTypes.BLOB("long"), allowNull: true },

      // Role & status
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "user",
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active",
      },

      // Block metadata — required for .save() to persist them
      blockedAt: { type: DataTypes.DATE, allowNull: true },
      blockedReason: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: "User",
    },
  );

  return User;
};
