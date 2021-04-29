const mongoose = require("mongoose");

const reqString = {
  type: String,
  required: true,
};

const prefixSchema = new mongoose.Schema({
  // Guild ID
  _id: reqString,
  prefix: reqString,
});

module.exports = mongoose.model("wokcommands-prefixes", prefixSchema);
