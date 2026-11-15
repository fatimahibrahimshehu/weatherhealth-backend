const mongoose = require("mongoose");

const AndroidDeviceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  city: { type: String, default: "" },
  lastAlert: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AndroidDevice", AndroidDeviceSchema);