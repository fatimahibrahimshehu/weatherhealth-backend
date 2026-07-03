const mongoose = require("mongoose");

const HealthProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  age: {
    type: Number,
  },
  conditions: {
    type: [String],
    default: [],
    // e.g. ["asthma", "diabetes", "heart disease", "hypertension"]
  },
  activityLevel: {
    type: String,
    enum: ["sedentary", "moderate", "active"],
    default: "moderate",
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("HealthProfile", HealthProfileSchema);