const mongoose = require("mongoose");

const PushSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: String, auth: String },
  city: { type: String, default: "" },
  lastAlert: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);