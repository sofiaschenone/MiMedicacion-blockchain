/**
 * @file api/index.js
 * @description Adaptador Serverless para despliegue en Vercel
 */

const { requestHandler } = require("../src/server");

module.exports = (req, res) => {
  return requestHandler(req, res);
};
