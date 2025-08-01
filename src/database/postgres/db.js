const { PrismaClient } = require("./generated/prisma/client");

const client = new PrismaClient();

module.exports = client;
