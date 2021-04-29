const mongoose = require("mongoose");

const reqString = {
  type: String,
  required: true,
};

const friendCodes = mongoose.Schema({
  //Guild ID
  _id: reqString,
  friendCode: reqString,
});

module.exports = mongoose.model("friend-codes", friendCodes);
