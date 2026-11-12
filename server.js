const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const Search = require("./models/Search");
const Favorite = require("./models/Favorite");
const HealthProfile = require("./models/HealthProfile");
const authRoutes = require("./routes/auth");
const path = require("path");
const webpush = require("web-push");
const PushSubscription = require("./models/PushSubscription");

dotenv.config();
console.log("VAPID key lengths:", (process.env.VAPID_PUBLIC_KEY || "").length, (process.env.VAPID_PRIVATE_KEY || "").length);

webpush.setVapidDetails(
  "mailto:" + process.env.EMAIL_USER,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// =============================================
//  CONNECT TO MONGODB (cached for serverless environments)
// =============================================
// On platforms like Vercel, each "cold start" re-runs this file. Without
// caching, every request could try to open a brand new DB connection,
// which is slow and sometimes fails before it finishes connecting.
// This caches the connection so warm invocations reuse it instantly,
// and makes every route wait for a ready connection before querying.
let cachedConnection = global._mongooseConnection;

async function connectDB() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }
  if (!cachedConnection) {
    cachedConnection = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 20000,
      })
      .then((conn) => {
        console.log("✅ MongoDB Connected Successfully");
        return conn;
      })
      .catch((err) => {
        console.log("❌ MongoDB Connection Error:", err.message);
        cachedConnection = null;
        throw err;
      });
    global._mongooseConnection = cachedConnection;
  }
  return cachedConnection;
}

// Make sure every /api request waits for a ready DB connection first
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(503).json({ error: "Database unavailable, please try again shortly" });
  }
});

app.use("/api/auth", authRoutes);

// =============================================
//  EMAIL SETUP
// =============================================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =============================================
//  ROUTE: Get Weather by City
// =============================================
app.get("/api/weather", async (req, res) => {
  const { city, lat, lon } = req.query;
  if (!city && !(lat && lon)) {
    return res.status(400).json({ error: "City name or coordinates (lat & lon) are required" });
  }

  try {
    const params = lat && lon
      ? { lat, lon, appid: process.env.API_KEY, units: "metric" }
      : { q: city, appid: process.env.API_KEY, units: "metric" };

    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params,
    });
    const data = response.data;
   const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const weatherData = {
      city: data.name,
      country: data.sys.country,
      temperature: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      wind_speed: data.wind.speed,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      condition: data.weather[0].main,
      lat: data.coord.lat,
      lon: data.coord.lon,
      sunrise,
      sunset,
    };
    // Link the search to the user if a valid token was sent (optional)
    let searchUserId;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        searchUserId = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET).id;
      } catch (e) { /* anonymous search */ }
    }
    const newSearch = new Search({ ...weatherData, userId: searchUserId });
    await newSearch.save();
    console.log(`📍 Search saved: ${weatherData.city}`);
    res.json(weatherData);
  } catch (error) {
    if (error.response && error.response.status === 404) return res.status(404).json({ error: "City not found" });
    res.status(500).json({ error: "Failed to fetch weather data" });
  }
});

// =============================================
//  ROUTE: Get UV Index
// =============================================
app.get("/api/uvindex", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "Latitude and longitude are required" });

  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/uvi`, {
      params: { lat, lon, appid: process.env.API_KEY },
    });
    const uvi = response.data.value;
    let level, advice, color;
    if (uvi <= 2) { level = "Low"; color = "#27ae60"; advice = "No protection needed. You can safely stay outside."; }
    else if (uvi <= 5) { level = "Moderate"; color = "#f39c12"; advice = "Some protection required. Wear sunscreen SPF 30+ and a hat."; }
    else if (uvi <= 7) { level = "High"; color = "#e67e22"; advice = "Protection essential. Reduce time in the sun between 10am–4pm."; }
    else if (uvi <= 10) { level = "Very High"; color = "#e74c3c"; advice = "Extra protection needed. Avoid sun exposure during midday hours."; }
    else { level = "Extreme"; color = "#8e44ad"; advice = "Stay indoors! If outside, shirt, sunscreen and hat are essential."; }
    res.json({ uvi, level, color, advice });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch UV index data" });
  }
});

// =============================================
//  ROUTE: Get Air Quality Index
// =============================================
app.get("/api/airquality", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "Latitude and longitude are required" });

  try {
    const response = await axios.get(`http://api.openweathermap.org/data/2.5/air_pollution`, {
      params: { lat, lon, appid: process.env.API_KEY },
    });
    const aqi = response.data.list[0].main.aqi;
    const components = response.data.list[0].components;
    const aqiLabels = {
      1: { label: "Good", color: "#27ae60", advice: "Air quality is excellent. Perfect for outdoor activities!" },
      2: { label: "Fair", color: "#f39c12", advice: "Air quality is acceptable. Sensitive individuals should limit prolonged outdoor activity." },
      3: { label: "Moderate", color: "#e67e22", advice: "Sensitive groups may experience health effects. Consider reducing outdoor activities." },
      4: { label: "Poor", color: "#e74c3c", advice: "Everyone may begin to experience health effects. Limit outdoor activities." },
      5: { label: "Very Poor", color: "#8e44ad", advice: "Health alert! Everyone may experience serious health effects. Avoid outdoor activities." },
    };
    res.json({ aqi, ...aqiLabels[aqi], components: { pm2_5: components.pm2_5, pm10: components.pm10, co: components.co, no2: components.no2, o3: components.o3 } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch air quality data" });
  }
});

// =============================================
//  ROUTE: Get Hourly Forecast
// =============================================
app.get("/api/hourly", async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: "City name is required" });

  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast`, {
      params: { q: city, appid: process.env.API_KEY, units: "metric" },
    });
    const data = response.data;
    const hourly = data.list.slice(0, 8).map(item => ({
      time: item.dt_txt.split(" ")[1].slice(0, 5),
      temp: Math.round(item.main.temp),
      description: item.weather[0].description,
      icon: item.weather[0].icon,
      humidity: item.main.humidity,
      wind_speed: item.wind.speed,
    }));
    res.json({ city: data.city.name, hourly });
  } catch (error) {
    if (error.response && error.response.status === 404) return res.status(404).json({ error: "City not found" });
    res.status(500).json({ error: "Failed to fetch hourly forecast" });
  }
});

// =============================================
//  ROUTE: Get 5-Day Forecast
// =============================================
app.get("/api/forecast", async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: "City name is required" });

  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast`, {
      params: { q: city, appid: process.env.API_KEY, units: "metric" },
    });
    const data = response.data;
    const dailyForecasts = data.list.filter(item => item.dt_txt.includes("12:00:00"));
    const forecast = dailyForecasts.map(item => ({
      date: item.dt_txt.split(" ")[0],
      temp: Math.round(item.main.temp),
      description: item.weather[0].description,
      icon: item.weather[0].icon,
      humidity: item.main.humidity,
      wind_speed: item.wind.speed,
    }));
    res.json({ city: data.city.name, forecast });
  } catch (error) {
    if (error.response && error.response.status === 404) return res.status(404).json({ error: "City not found" });
    res.status(500).json({ error: "Failed to fetch forecast data" });
  }
});

// =============================================
//  ROUTE: Get Search History
// =============================================
app.get("/api/history", async (req, res) => {
  try {
    const history = await Search.find().sort({ searchedAt: -1 }).limit(10);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// =============================================
//  ROUTE: Add Favorite City
// =============================================
app.post("/api/favorites", async (req, res) => {
  const { userId, city } = req.body;
  if (!userId || !city) return res.status(400).json({ error: "User ID and city are required" });

  try {
    const existing = await Favorite.findOne({ userId, city });
    if (existing) return res.status(400).json({ error: "City already in favorites" });
    const newFavorite = new Favorite({ userId, city });
    await newFavorite.save();
    res.status(201).json({ message: "Added to favorites", favorite: newFavorite });
  } catch (error) {
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

// =============================================
//  ROUTE: Get User's Favorite Cities
// =============================================
app.get("/api/favorites/:userId", async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.params.userId }).sort({ addedAt: -1 });
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// =============================================
//  ROUTE: Remove Favorite City
// =============================================
app.delete("/api/favorites/:id", async (req, res) => {
  try {
    await Favorite.findByIdAndDelete(req.params.id);
    res.json({ message: "Removed from favorites" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

// =============================================
//  ROUTE: Save Health Profile
// =============================================
app.post("/api/healthprofile", async (req, res) => {
  const { userId, age, conditions, activityLevel } = req.body;
  if (!userId) return res.status(400).json({ error: "User ID is required" });

  try {
    const profile = await HealthProfile.findOneAndUpdate(
      { userId },
      { userId, age, conditions, activityLevel, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    res.json({ message: "Health profile saved successfully", profile });
  } catch (error) {
    res.status(500).json({ error: "Failed to save health profile" });
  }
});

// =============================================
//  ROUTE: Get Health Profile
// =============================================
app.get("/api/healthprofile/:userId", async (req, res) => {
  try {
    const profile = await HealthProfile.findOne({ userId: req.params.userId });
    if (!profile) return res.status(404).json({ error: "No profile found" });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch health profile" });
  }
});

// =============================================
//  ROUTE: Send Email
// =============================================
app.post("/api/sendemail", async (req, res) => {
  const { email, city, weatherData } = req.body;
  if (!email || !city || !weatherData) return res.status(400).json({ error: "Email, city and weather data are required" });

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `🌤️ WeatherHealth Daily Report — ${city}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a6fb3;">🌤️ WeatherHealth Daily Report</h2>
          <h3 style="color: #333;">${city} — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
          <div style="background: linear-gradient(135deg, #0d4a7a, #1a6fb3); color: white; border-radius: 12px; padding: 24px; margin: 20px 0;">
            <h1 style="margin: 0; font-size: 3rem;">${weatherData.temperature}°C</h1>
            <p style="margin: 8px 0; text-transform: capitalize;">${weatherData.description}</p>
            <p style="margin: 4px 0;">💧 Humidity: ${weatherData.humidity}% | 💨 Wind: ${weatherData.wind_speed} m/s</p>
          </div>
          <div style="background: #f0f6ff; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #1a6fb3; margin-top: 0;">🏥 Health Advisory</h3>
            ${weatherData.temperature >= 35 ? '<p>⚠️ <strong>High Temperature Alert:</strong> Stay hydrated and avoid outdoor activities during peak hours.</p>' : ''}
            ${weatherData.humidity >= 80 ? '<p>💧 <strong>High Humidity:</strong> Drink extra water and take it easy today.</p>' : ''}
            <p>✅ Stay safe and take care of your health today!</p>
          </div>
          <p style="color: #888; font-size: 0.85rem; text-align: center;">WeatherHealth — Final Year Project © 2026</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    res.json({ message: "Email sent successfully!" });
  } catch (error) {
    console.log("Email error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// =============================================
//  ROUTE: Generate PDF Report
// =============================================
app.get("/api/report", async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: "City name is required" });

  try {
    const weatherRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: { q: city, appid: process.env.API_KEY, units: "metric" },
    });
    const data = weatherRes.data;
    const temp = Math.round(data.main.temp);
    const humidity = data.main.humidity;
    const wind = data.wind.speed;
    const desc = data.weather[0].description;
    const feels = Math.round(data.main.feels_like);
    const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=WeatherHealth_${city}_Report.pdf`);
    doc.pipe(res);

    doc.fontSize(24).fillColor("#1a6fb3").text("WeatherHealth Report", { align: "center" });
    doc.fontSize(12).fillColor("#6b8096").text(`Generated on ${date}`, { align: "center" });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#d6e4f0").stroke();
    doc.moveDown();
    doc.fontSize(20).fillColor("#1a2a3a").text(`${data.name}, ${data.sys.country}`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(36).fillColor("#1a6fb3").text(`${temp}°C`, { align: "center" });
    doc.fontSize(14).fillColor("#6b8096").text(desc.charAt(0).toUpperCase() + desc.slice(1), { align: "center" });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#d6e4f0").stroke();
    doc.moveDown();
    doc.fontSize(16).fillColor("#1a2a3a").text("Weather Details");
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#333");
    doc.text(`Humidity: ${humidity}%`);
    doc.text(`Wind Speed: ${wind} m/s`);
    doc.text(`Feels Like: ${feels}°C`);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#d6e4f0").stroke();
    doc.moveDown();
    doc.fontSize(16).fillColor("#1a2a3a").text("Health Advisory");
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#333");

    if (temp >= 38) {
      doc.fillColor("#e74c3c").text("EXTREME HEAT WARNING");
      doc.fillColor("#333").text("Dangerous heat levels. Stay indoors, drink water every 15-20 minutes.");
    } else if (temp >= 33) {
      doc.fillColor("#e67e22").text("HIGH TEMPERATURE ALERT");
      doc.fillColor("#333").text("Stay hydrated, wear light clothing, limit outdoor exercise.");
    } else if (temp >= 25) {
      doc.fillColor("#27ae60").text("WARM & PLEASANT");
      doc.fillColor("#333").text("Good conditions for outdoor activities. Stay hydrated.");
    } else if (temp < 10) {
      doc.fillColor("#3498db").text("COLD WEATHER ADVISORY");
      doc.fillColor("#333").text("Layer up with warm clothing, limit exposure time.");
    } else {
      doc.fillColor("#27ae60").text("CONDITIONS LOOK GOOD");
      doc.fillColor("#333").text("Weather conditions are mild and safe for outdoor activities.");
    }

    if (humidity >= 80) {
      doc.moveDown(0.5);
      doc.fillColor("#e67e22").text("HIGH HUMIDITY ALERT");
      doc.fillColor("#333").text("Drink extra water and reduce physical activity.");
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#d6e4f0").stroke();
    doc.moveDown();
    doc.fontSize(16).fillColor("#1a2a3a").text("General Health Tips");
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#333");
    doc.text("- Drink at least 8 glasses of water daily.");
    doc.text("- Apply SPF 30+ sunscreen before going outside.");
    doc.text("- Wear breathable clothing in hot weather.");
    doc.text("- Monitor your health if you have chronic conditions.");
    doc.text("- Maintain 7-9 hours of sleep daily.");
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#d6e4f0").stroke();
    doc.moveDown();
    doc.fontSize(10).fillColor("#6b8096").text("WeatherHealth — Final Year Project © 2026", { align: "center" });
    doc.text("Weather data provided by OpenWeatherMap", { align: "center" });
    doc.end();

  } catch (error) {
    console.log("PDF error:", error);
    res.status(500).json({ error: "Failed to generate PDF report" });
  }
});

// =============================================
//  ROUTE: Admin Login
// =============================================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      { role: "admin", username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.json({ message: "Admin login successful", token });
  } else {
    res.status(401).json({ error: "Invalid admin credentials" });
  }
});
// =============================================
//  ROUTE: Admin Dashboard Stats (PROTECTED)
// =============================================
app.get("/api/admin/stats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  try {
    const User = require("./models/User");

    // Total users
    const totalUsers = await User.countDocuments();

    // Total searches
    const totalSearches = await Search.countDocuments();

    // Most searched cities
    const topCities = await Search.aggregate([
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Searches in last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSearches = await Search.countDocuments({ searchedAt: { $gte: last24h } });

    // Total favorites
    const totalFavorites = await Favorite.countDocuments();

    // New users this week
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsers = await User.countDocuments({ createdAt: { $gte: lastWeek } });

    res.json({
      totalUsers,
      totalSearches,
      recentSearches,
      totalFavorites,
      newUsers,
      topCities,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});// =============================================
//  PUSH NOTIFICATIONS
// =============================================
app.get("/api/push/key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});
  
app.post("/api/push/subscribe", async (req, res) => {
  const { userId, subscription, city } = req.body;
  if (!userId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "User ID and subscription are required" });
  }
  try {
    // keep only one subscription per user
    await PushSubscription.deleteMany({ userId, endpoint: { $ne: subscription.endpoint } });
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { userId, endpoint: subscription.endpoint, keys: subscription.keys, city: city || "", lastAlert: "" },
      { upsert: true, new: true }
    );
    res.status(201).json({ message: "Subscribed to alerts" });
  } catch (error) {
    res.status(500).json({ error: "Failed to save subscription" });
  }
});
// Same alert rules as the app, but run on the server
function getPushAlert(w, conditions) {
  const temp = w.temperature;
  const humidity = w.humidity;
  const wind = w.wind_speed;
  const desc = w.condition.toLowerCase();
  const has = (c) => conditions.includes(c);

  if (desc.includes("thunder") || desc.includes("storm")) return "⛈️ Thunderstorm Warning! Stay indoors and avoid open areas.";
  if (temp >= 40) return "🌡️ Extreme Heat Alert! Dangerous temperatures detected. Stay indoors and hydrate.";
  if (temp <= 0) return "❄️ Freezing Temperature Alert! Risk of frostbite and icy conditions.";
  if (desc.includes("heavy rain") || desc.includes("heavy intensity")) return "🌧️ Heavy Rain Warning! Risk of flooding. Avoid low-lying areas.";
  if (has("asthma") && (humidity >= 70 || wind >= 14 || desc.includes("fog") || desc.includes("mist") || desc.includes("haze"))) return "🫁 Asthma Alert! Today's conditions may trigger breathing difficulty. Keep your inhaler with you.";
  if (has("heart disease") && temp >= 33) return "❤️ Heart Health Alert! High temperature puts extra strain on your heart. Avoid outdoor exertion.";
  if (wind >= 20) return "💨 Strong Wind Warning! Secure loose objects and avoid outdoor activities.";
  if (temp >= 35) return "☀️ Heat Advisory! Very high temperatures. Drink water and limit sun exposure.";
  if (has("diabetes") && (temp >= 33 || humidity >= 80)) return "🍬 Diabetes Alert! Heat or humidity can affect your blood sugar. Stay hydrated and check it more often.";
  if (humidity >= 90) return "💧 High Humidity Alert! Feels much hotter than actual temperature. Stay cool.";
  return null;
}

// This route is called on a schedule (for example by cron-job.org)
app.get("/api/push/check", async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "Not allowed" });
  }
  try {
    const subs = await PushSubscription.find({ city: { $ne: "" } });
    let sent = 0;

    for (const sub of subs) {
      try {
        const weatherRes = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
          params: { q: sub.city, appid: process.env.API_KEY, units: "metric" },
        });
        const d = weatherRes.data;
        const w = {
          temperature: Math.round(d.main.temp),
          humidity: d.main.humidity,
          wind_speed: d.wind.speed,
          condition: d.weather[0].main + " " + d.weather[0].description,
        };
        const profile = await HealthProfile.findOne({ userId: sub.userId });
        const message = getPushAlert(w, profile && profile.conditions ? profile.conditions : []);
                console.log("Push check ->", sub.city, "| message:", message, "| last:", sub.lastAlert);

        if (!message) {
          if (sub.lastAlert) { sub.lastAlert = ""; await sub.save(); }
          continue;
        }
          if (message === sub.lastAlert && req.query.force !== "1") continue;

        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify({ title: "WeatherHealth Alert", body: message })
        );
        sub.lastAlert = message;
        await sub.save();
        sent++;
            } catch (err) {
        console.log("Push error:", err.statusCode, err.body || err.message);
        if ([401, 403, 404, 410].includes(err.statusCode)) {
          await PushSubscription.deleteOne({ _id: sub._id }); // bad or old subscription
        }
      }
    }
    res.json({ checked: subs.length, sent });
  } catch (error) {
    res.status(500).json({ error: "Push check failed" });
  }
});

// =============================================
//  SERVE FRONTEND
// =============================================
app.use(express.static(path.join(__dirname, "public")));
// =============================================
//  START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});