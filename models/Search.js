const mongoose = require("mongoose");

const SearchSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true,
  },
  country: {
    type: String,
  },
  temperature: {
    type: Number,
  },
  humidity: {
    type: Number,
  },
  wind_speed: {
    type: Number,
  },
  description: {
    type: String,
  },
  condition: {
    type: String,
  },
  searchedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Search", SearchSchema);