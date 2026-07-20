// =============================================
//  WeatherHealth — app.js
//  Replace YOUR_API_KEY with your OpenWeatherMap key
// =============================================

const BASE_URL = "https://weatherhealth-backend.vercel.app/api/weather";
// =============================================
//  USER AUTH CHECK
// =============================================
function checkLoginStatus() {
  const user = JSON.parse(localStorage.getItem("user"));
  const welcomeText = document.getElementById("welcomeText");

  if (user) {
    welcomeText.textContent = `Welcome, ${user.username}`;
  } else {
    welcomeText.textContent = "";
    window.location.href = "auth.html";
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "auth.html";
}

checkLoginStatus();
let currentUser = JSON.parse(localStorage.getItem("user"));
let currentCity = "";
let userConditions = [];
let userAge = null;
let userActivityLevel = null;
let lastWeatherData = null;
// ---- DOM References ----
const cityInput   = document.getElementById("cityInput");
const searchHint  = document.getElementById("searchHint");
const weatherCard = document.getElementById("weatherCard");
const heroPlaceholder = document.getElementById("heroPlaceholder");
const advisorySection = document.getElementById("advisorySection");
const advisoryGrid    = document.getElementById("advisoryGrid");
const advisoryCity    = document.getElementById("advisoryCity");

// ---- Allow Enter key to trigger search ----
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") getWeather();
});

// =============================================
//  MAIN: Fetch Weather Data
// =============================================
async function getWeather() {
  const city = cityInput.value.trim();

  if (!city) {
    showHint("Please enter a city name.", "error");
    return;
  }

  // Show loading state on button
  const btn = document.querySelector(".search-bar button");
  btn.innerHTML = `<span class="loader"></span> Searching...`;
  btn.disabled = true;
  searchHint.textContent = "";

 try {
    const url = `${BASE_URL}?city=${encodeURIComponent(city)}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) throw new Error("City not found. Check the spelling and try again.");
      if (response.status === 401) throw new Error("Something went wrong. Please try again.");
      throw new Error("Something went wrong. Please try again.");
    }

 const data = await response.json();
currentCity = data.city;
const lat = data.lat;
const lon = data.lon;
displayWeather(data);
await generateAdvisory(data);
checkWeatherAlerts(data);
loadSearchHistory();
loadForecast(city);
checkIfFavorited(data.city);
loadAirQuality(lat, lon, data.city);
loadUVIndex(lat, lon, data.city);
loadHourlyForecast(city);
 loadTemperatureChart(city);


  } catch (err) {
    showHint(err.message, "error");
    weatherCard.style.display = "none";
    heroPlaceholder.style.display = "flex";
    advisorySection.style.display = "none";

  } finally {
    btn.innerHTML = "Check Weather";
    btn.disabled  = false;
  }
}

// =============================================
//  DISPLAY: Populate Weather Card
// =============================================
function displayWeather(data) {
 
 document.getElementById("cardCity").textContent    = `${data.city}, ${data.country}`;
document.getElementById("cardTemp").textContent     = `${data.temperature}°C`;
document.getElementById("cardDesc").textContent     = data.description;
document.getElementById("cardHumidity").textContent = `${data.humidity}%`;
document.getElementById("cardWind").textContent     = `${data.wind_speed} m/s`;
document.getElementById("cardFeels").textContent    = `${data.feels_like}°C`;
document.getElementById("weatherIcon").src = `https://openweathermap.org/img/wn/${data.icon}@2x.png`;
document.getElementById("cardSunrise").textContent = data.sunrise;
document.getElementById("cardSunset").textContent = data.sunset;

heroPlaceholder.style.display = "none";
weatherCard.style.display = "block";
}

// =============================================
//  USER HEALTH PROFILE (for personalized advisories)
//  Fetches conditions, age, and activity level — all captured on the
//  profile form but previously unused by the advisory engine.
// =============================================
async function getUserHealthProfile() {
  if (!currentUser) return { conditions: [], age: null, activityLevel: null };
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/healthprofile/${currentUser.id}`);
    if (!res.ok) return { conditions: [], age: null, activityLevel: null };
    const profile = await res.json();
    return {
      conditions: profile.conditions || [],
      age: profile.age || null,
      activityLevel: profile.activityLevel || null,
    };
  } catch (error) {
    console.log("Could not load health profile for personalization:", error);
    return { conditions: [], age: null, activityLevel: null };
  }
}

// =============================================
//  HEALTH RISK SCORE
//  Combines weather severity, air quality, and the user's personal risk
//  factors (conditions, age, activity level) into a single 0-100 score.
//  This is a weighted rule-based score, not machine learning — but it
//  gives a single, easy-to-read "how risky is today, for you" figure.
// =============================================
function computeRiskScore(data, aqi) {
  const temp = data.temperature;
  const humidity = data.humidity;
  const wind = data.wind_speed;
  const desc = (data.condition || "").toLowerCase();

  let score = 0;

  // --- Weather severity ---
  if (temp >= 38) score += 35;
  else if (temp >= 33) score += 25;
  else if (temp >= 25) score += 5;
  else if (temp < 10) score += 20;

  if (humidity >= 80) score += 15;
  else if (humidity < 30) score += 10;

  if (wind >= 14) score += 10;

  if (desc.includes("thunder") || desc.includes("storm")) score += 20;
  else if (desc.includes("snow")) score += 10;
  else if (desc.includes("fog") || desc.includes("mist") || desc.includes("haze")) score += 8;

  // --- Air quality (added once AQI has loaded) ---
  if (aqi !== null && aqi !== undefined) {
    if (aqi >= 5) score += 25;
    else if (aqi >= 4) score += 18;
    else if (aqi >= 3) score += 10;
    else if (aqi >= 2) score += 3;
  }

  // --- Personal risk factors ---
  const conditionCount = (userConditions || []).length;
  score += Math.min(conditionCount * 6, 24);

  if ((userAge !== null && userAge >= 60) || (userAge !== null && userAge <= 12)) {
    score += 10;
  }

  if (userActivityLevel !== null && /high|active|intense/i.test(userActivityLevel)) {
    score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getRiskLevel(score) {
  if (score >= 71) return { label: "Severe", color: "#c0392b", bg: "#fdedec" };
  if (score >= 46) return { label: "High", color: "#d68910", bg: "#fef9e7" };
  if (score >= 21) return { label: "Moderate", color: "#2980b9", bg: "#eaf4fb" };
  return { label: "Low", color: "#1e8449", bg: "#eafaf1" };
}

function renderRiskScore(score, city) {
  const level = getRiskLevel(score);
  let banner = document.getElementById("riskScoreBanner");

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "riskScoreBanner";
    banner.style.cssText = "border-radius:14px; padding:20px 24px; margin-bottom:20px; display:flex; align-items:center; gap:20px; flex-wrap:wrap;";
    if (advisoryGrid && advisorySection.contains(advisoryGrid)) {
      advisorySection.insertBefore(banner, advisoryGrid);
    } else {
      advisorySection.appendChild(banner);
    }
  }

  banner.style.background = level.bg;
  banner.innerHTML = `
    <div style="font-size:2.4rem; font-weight:800; color:${level.color}; min-width:90px;">${score}<span style="font-size:1rem; font-weight:600;">/100</span></div>
    <div>
      <div style="font-weight:700; color:${level.color}; font-size:1.05rem;">Your Personal Risk Today: ${level.label}</div>
      <div style="font-size:0.9rem; color:#555; margin-top:2px;">Based on current weather in ${city} combined with your health profile — not a medical diagnosis, just a quick reference.</div>
    </div>
  `;
}

// =============================================
//  ADVISORY ENGINE
//  Maps weather conditions → health advisories
//  Also personalizes advisories based on the user's saved health profile
// =============================================
async function generateAdvisory(data) {
  const temp     = data.temperature;
  const humidity = data.humidity;
  const wind     = data.wind_speed;
  const desc     = data.condition.toLowerCase();
  const advisories = [];

  // Refresh the user's saved health profile each time so profile edits take effect immediately
  const profile = await getUserHealthProfile();
  userConditions = profile.conditions;
  userAge = profile.age;
  userActivityLevel = profile.activityLevel;
  const has = (condition) => userConditions.includes(condition);
  const isElderly = userAge !== null && userAge >= 60;
  const isChild = userAge !== null && userAge <= 12;
  const isHighlyActive = userActivityLevel !== null && /high|active|intense/i.test(userActivityLevel);

  // --- Temperature Advisories ---
  if (temp >= 38) {
    advisories.push({
      icon: "🌡️",
      iconBg: "#fdedec",
      title: "Extreme Heat Warning",
      message: "Dangerous heat levels detected. Avoid outdoor activities between 10am–4pm. Stay indoors, drink water every 15–20 minutes, and watch for signs of heat stroke.",
      level: "danger",
      badge: "🔴 High Risk",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  } else if (temp >= 33) {
    advisories.push({
      icon: "☀️",
      iconBg: "#fef9e7",
      title: "High Temperature Alert",
      message: "Very warm conditions. Stay hydrated, wear light clothing, and limit strenuous outdoor exercise. Apply sunscreen if going outside.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  } else if (temp >= 25) {
    advisories.push({
      icon: "🌤️",
      iconBg: "#eafaf1",
      title: "Warm & Pleasant",
      message: "Good conditions for outdoor activities. Stay hydrated and apply sunscreen. A great day for a walk or light exercise.",
      level: "good",
      badge: "🟢 Low Risk",
      badgeBg: "#eafaf1",
      badgeColor: "#1e8449"
    });
  } else if (temp < 10) {
    advisories.push({
      icon: "🧥",
      iconBg: "#eaf4fb",
      title: "Cold Weather Advisory",
      message: "Cold temperatures detected. Layer up with warm clothing, cover extremities, and limit exposure time. Those with respiratory conditions should be extra cautious.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  // --- Humidity Advisories ---
  if (humidity >= 80) {
    advisories.push({
      icon: "💧",
      iconBg: "#eaf4fb",
      title: "High Humidity",
      message: "High humidity makes it harder for sweat to evaporate, increasing the risk of heat exhaustion. Reduce physical activity and increase water intake.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  } else if (humidity < 30) {
    advisories.push({
      icon: "🏜️",
      iconBg: "#fef9e7",
      title: "Low Humidity — Dry Air",
      message: "Dry air can irritate the respiratory system and dry out skin. Use a moisturiser, drink plenty of water, and consider a humidifier indoors.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  // --- Wind Advisories ---
  if (wind >= 14) {
    advisories.push({
      icon: "💨",
      iconBg: "#f0f6ff",
      title: "Strong Wind Advisory",
      message: "Strong winds present. Secure loose outdoor items. People with respiratory conditions should keep windows closed to avoid dust and allergens carried by wind.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  // --- Condition-based Advisories (weather condition text) ---
  if (desc.includes("rain") || desc.includes("drizzle")) {
    advisories.push({
      icon: "🌧️",
      iconBg: "#eaf4fb",
      title: "Rainy Conditions",
      message: "Wet weather increases the risk of slipping and cold-related illness. Carry an umbrella, wear waterproof footwear, and dry off quickly after being in the rain.",
      level: "warning",
      badge: "🟡 Be Cautious",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (desc.includes("thunder") || desc.includes("storm")) {
    advisories.push({
      icon: "⛈️",
      iconBg: "#fdedec",
      title: "Thunderstorm Warning",
      message: "Thunderstorms are dangerous. Stay indoors, avoid tall trees and open fields. Unplug electronics and avoid bathing during a storm.",
      level: "danger",
      badge: "🔴 High Risk",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (desc.includes("snow")) {
    advisories.push({
      icon: "❄️",
      iconBg: "#eaf4fb",
      title: "Snow Advisory",
      message: "Icy or snowy conditions. Wear grippy footwear to avoid falls. Keep warm, watch for frostbite on exposed skin, and check on elderly neighbours.",
      level: "warning",
      badge: "🟡 Moderate Risk",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (desc.includes("fog") || desc.includes("mist") || desc.includes("haze")) {
    advisories.push({
      icon: "🌫️",
      iconBg: "#f0f6ff",
      title: "Fog / Poor Visibility",
      message: "Reduced visibility increases accident risk. Drive slowly with headlights on. People with asthma may experience irritation — carry inhalers.",
      level: "warning",
      badge: "🟡 Be Cautious",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (desc.includes("clear") && temp >= 20) {
    advisories.push({
      icon: "🕶️",
      iconBg: "#fef9e7",
      title: "UV Ray Protection",
      message: "Clear skies mean higher UV exposure. Apply sunscreen (SPF 30+), wear UV-protective sunglasses, and use a hat during peak sun hours.",
      level: "good",
      badge: "🟢 Good Day",
      badgeBg: "#eafaf1",
      badgeColor: "#1e8449"
    });
  }

  // --- PERSONALIZED Advisories (based on the user's saved health conditions) ---
  if (has("asthma") && (humidity >= 70 || desc.includes("fog") || desc.includes("mist") || desc.includes("haze") || wind >= 14)) {
    advisories.push({
      icon: "🫁",
      iconBg: "#fdedec",
      title: "Asthma Alert — For You",
      message: "Based on your health profile, today's conditions may trigger breathing difficulty. Keep your inhaler with you, avoid strenuous outdoor exercise, and stay indoors with windows closed if symptoms start.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("heart disease") && temp >= 33) {
    advisories.push({
      icon: "❤️",
      iconBg: "#fdedec",
      title: "Heart Health Alert — For You",
      message: "High temperatures put extra strain on the cardiovascular system. Based on your health profile, avoid outdoor exertion, rest often in shaded or cool areas, and monitor for chest discomfort or unusual fatigue.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("hypertension") && temp >= 33) {
    advisories.push({
      icon: "🩺",
      iconBg: "#fef9e7",
      title: "Blood Pressure Alert — For You",
      message: "Heat can affect blood pressure regulation. Based on your health profile, stay well hydrated, avoid sudden temperature changes, and monitor your blood pressure if you feel unwell.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("diabetes") && (temp >= 33 || humidity >= 80)) {
    advisories.push({
      icon: "🍬",
      iconBg: "#fef9e7",
      title: "Diabetes Advisory — For You",
      message: "Heat and humidity can affect blood sugar levels and insulin absorption. Based on your health profile, stay hydrated, check your blood sugar more frequently, and keep medication out of direct heat.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("arthritis") && (temp < 15 || humidity >= 80)) {
    advisories.push({
      icon: "🦴",
      iconBg: "#eaf4fb",
      title: "Joint Pain Advisory — For You",
      message: "Cold or damp weather commonly worsens joint pain. Based on your health profile, keep joints warm, do gentle stretches indoors, and avoid prolonged cold exposure.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("allergies") && (wind >= 14 || humidity >= 70 || desc.includes("haze") || desc.includes("dust"))) {
    advisories.push({
      icon: "🤧",
      iconBg: "#f0f6ff",
      title: "Allergy Alert — For You",
      message: "Windy, humid, or dusty conditions can carry more allergens today. Based on your health profile, keep windows closed, consider a mask outdoors, and have antihistamines on hand if needed.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("pregnancy") && (temp >= 33 || humidity >= 80)) {
    advisories.push({
      icon: "🤰",
      iconBg: "#fdedec",
      title: "Pregnancy Heat Advisory — For You",
      message: "Pregnant individuals are more prone to overheating and dehydration. Based on your health profile, stay well hydrated, avoid prolonged sun exposure, rest often, and seek medical advice if you feel dizzy or unwell.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("obesity") && temp >= 33) {
    advisories.push({
      icon: "⚖️",
      iconBg: "#fef9e7",
      title: "Heat Advisory — For You",
      message: "Higher body mass can make it harder to regulate body temperature in heat. Based on your health profile, avoid strenuous outdoor activity during peak heat, stay hydrated, and rest in cool or shaded areas.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("kidney disease") && (temp >= 33 || humidity >= 80)) {
    advisories.push({
      icon: "🩺",
      iconBg: "#fdedec",
      title: "Kidney Health Advisory — For You",
      message: "Heat and dehydration place extra strain on kidney function. Based on your health profile, keep well hydrated within your recommended fluid intake, avoid excessive sun exposure, and monitor for unusual fatigue or swelling.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("migraine") && (humidity >= 80 || wind >= 14 || desc.includes("storm") || desc.includes("thunder"))) {
    advisories.push({
      icon: "🤕",
      iconBg: "#f0f6ff",
      title: "Migraine Trigger Alert — For You",
      message: "Sudden pressure or humidity changes, storms, and strong winds are common migraine triggers. Based on your health profile, keep any prescribed medication nearby, stay hydrated, and rest in a calm, dim environment if a migraine starts.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("sickle cell disease") && (temp >= 33 || temp < 15 || humidity < 30)) {
    advisories.push({
      icon: "🩸",
      iconBg: "#fdedec",
      title: "Sickle Cell Advisory — For You",
      message: "Extreme heat, cold, and dehydration can increase the risk of a sickle cell crisis. Based on your health profile, stay well hydrated, dress appropriately for the temperature, and avoid sudden extreme temperature changes.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("skin conditions") && (humidity < 30 || (desc.includes("clear") && temp >= 20))) {
    advisories.push({
      icon: "🧴",
      iconBg: "#f0f6ff",
      title: "Skin Health Advisory — For You",
      message: "Dry air and strong sun can both aggravate skin conditions like eczema or psoriasis. Based on your health profile, moisturise regularly, use sunscreen if going outside, and avoid long hot showers that strip skin moisture.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("epilepsy") && (temp >= 35 || humidity >= 85)) {
    advisories.push({
      icon: "🧠",
      iconBg: "#fdedec",
      title: "Epilepsy Advisory — For You",
      message: "Extreme heat and dehydration can lower seizure threshold for some people with epilepsy. Based on your health profile, stay well hydrated, avoid overheating, and keep to your usual medication schedule.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("copd") && (humidity >= 70 || wind >= 14 || desc.includes("fog") || desc.includes("mist") || desc.includes("haze") || temp < 10)) {
    advisories.push({
      icon: "🫁",
      iconBg: "#fdedec",
      title: "COPD Advisory — For You",
      message: "Cold air, humidity, and poor air quality commonly trigger COPD flare-ups. Based on your health profile, keep your rescue inhaler close, avoid cold or dusty outdoor air, and consider a mask if you must go outside.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("anxiety/depression") && (desc.includes("storm") || desc.includes("thunder") || desc.includes("rain") || humidity >= 80)) {
    advisories.push({
      icon: "🧘",
      iconBg: "#f0f6ff",
      title: "Mood & Weather Advisory — For You",
      message: "Stormy, overcast, or heavily humid days can affect mood and energy for some people. Based on your health profile, be gentle with yourself today — keep to routines, stay connected with others, and reach out for support if you need it.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("autoimmune disorders") && ((desc.includes("clear") && temp >= 20) || temp >= 33 || temp < 10)) {
    advisories.push({
      icon: "🦋",
      iconBg: "#fdedec",
      title: "Autoimmune Flare Advisory — For You",
      message: "Strong sun and extreme temperatures are known triggers for autoimmune conditions such as lupus. Based on your health profile, use sunscreen and protective clothing outdoors, and avoid prolonged exposure to temperature extremes.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("thyroid disorders") && (temp >= 33 || temp < 15)) {
    advisories.push({
      icon: "🦢",
      iconBg: "#fef9e7",
      title: "Thyroid Advisory — For You",
      message: "Thyroid conditions can affect how well your body regulates temperature. Based on your health profile, dress appropriately for extremes and pay attention to unusual heat or cold intolerance today.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (has("hiv/immunocompromised") && (temp >= 33 || humidity >= 80)) {
    advisories.push({
      icon: "🛡️",
      iconBg: "#fdedec",
      title: "Immune Health Advisory — For You",
      message: "Extreme heat and humidity place extra strain on a weakened immune system. Based on your health profile, stay well hydrated, avoid prolonged outdoor exposure, and monitor for any signs of infection or unusual fatigue.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("cancer/chemotherapy") && (temp >= 33 || (desc.includes("clear") && temp >= 20))) {
    advisories.push({
      icon: "🎗️",
      iconBg: "#fdedec",
      title: "Treatment-Related Advisory — For You",
      message: "Some cancer treatments increase sensitivity to heat and sunlight. Based on your health profile, stay hydrated, avoid peak sun hours, and use sun protection if going outside.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("multiple sclerosis") && temp >= 30) {
    advisories.push({
      icon: "🌡️",
      iconBg: "#fdedec",
      title: "MS Heat Sensitivity Advisory — For You",
      message: "Many people with multiple sclerosis experience a temporary worsening of symptoms in warm conditions (Uhthoff's phenomenon). Based on your health profile, stay cool, avoid strenuous activity in the heat, and rest if symptoms increase.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (has("pneumonia") && (temp < 15 || humidity >= 80 || wind >= 14 || desc.includes("fog") || desc.includes("mist") || desc.includes("haze"))) {
    advisories.push({
      icon: "🫁",
      iconBg: "#fdedec",
      title: "Pneumonia Recovery Advisory — For You",
      message: "Cold, damp, or humid air can irritate the lungs and slow recovery from pneumonia. Based on your health profile, stay warm, avoid cold outdoor air where possible, and keep well hydrated to help your recovery.",
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  // --- PERSONALIZED Advisories based on age ---
  if (isElderly && temp >= 30) {
    advisories.push({
      icon: "👴",
      iconBg: "#fdedec",
      title: "Heat Advisory for Older Adults — For You",
      message: `Based on your profile (age ${userAge}), older adults are more vulnerable to heat-related illness even at moderately high temperatures. Avoid the midday sun, drink water regularly even without feeling thirsty, and check in with someone if you'll be alone outdoors.`,
      level: "danger",
      badge: "🔴 Personalized Warning",
      badgeBg: "#fdedec",
      badgeColor: "#c0392b"
    });
  }

  if (isElderly && temp <= 15) {
    advisories.push({
      icon: "🧣",
      iconBg: "#eaf4fb",
      title: "Cold Advisory for Older Adults — For You",
      message: `Based on your profile (age ${userAge}), older adults lose body heat faster and are at higher risk of cold-related complications. Dress warmly indoors and out, and keep your living space adequately heated.`,
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  if (isChild && (temp >= 33 || temp <= 10)) {
    advisories.push({
      icon: "🧒",
      iconBg: "#eaf4fb",
      title: "Weather Advisory for Children — For You",
      message: `Based on your profile (age ${userAge}), children regulate body temperature less efficiently than adults. Limit time outdoors during extreme conditions and dress appropriately for the weather.`,
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }

  // --- PERSONALIZED Advisory based on activity level ---
  if (isHighlyActive && (temp >= 33 || humidity >= 80)) {
    advisories.push({
      icon: "🏃",
      iconBg: "#fef9e7",
      title: "High Activity Heat Advisory — For You",
      message: "Based on your profile's activity level, intense exercise in hot or humid conditions significantly increases dehydration and heat exhaustion risk. Consider training earlier or later in the day, and increase your fluid intake beyond usual.",
      level: "warning",
      badge: "🟡 Personalized Advice",
      badgeBg: "#fef9e7",
      badgeColor: "#d68910"
    });
  }


  if (advisories.length === 0) {
    advisories.push({
      icon: "✅",
      iconBg: "#eafaf1",
      title: "Conditions Look Good",
      message: "Current weather conditions are mild and generally safe for outdoor activities. Stay hydrated and enjoy your day!",
      level: "good",
      badge: "🟢 All Clear",
      badgeBg: "#eafaf1",
      badgeColor: "#1e8449"
    });
  }

lastWeatherData = data;
renderRiskScore(computeRiskScore(data, null), data.city);
renderAdvisories(advisories, data.city);
}
// =============================================
//  RENDER: Inject Advisory Cards into DOM
// =============================================
function renderAdvisories(advisories, city) {
  advisoryGrid.innerHTML = "";
  advisoryCity.textContent = city;

  advisories.forEach(adv => {
    const card = document.createElement("div");
    card.className = `advisory-card ${adv.level}`;
    card.innerHTML = `
      <div class="advisory-card-icon" style="background:${adv.iconBg}; font-size:1.5rem;">
        ${adv.icon}
      </div>
      <h3>${adv.title}</h3>
      <p>${adv.message}</p>
      <span class="advisory-badge" style="background:${adv.badgeBg}; color:${adv.badgeColor};">
        ${adv.badge}
      </span>
    `;
    advisoryGrid.appendChild(card);
  });

  advisorySection.style.display = "block";

  // Smooth scroll to advisory section
  setTimeout(() => {
    advisorySection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 300);
}

// =============================================
//  UTILS
// =============================================
function showHint(message, type) {
  searchHint.textContent = message;
  searchHint.style.color = type === "error" ? "#e05a5a" : "#27ae60";
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function toggleMenu() {
  const menu = document.getElementById("mobileMenu");
  menu.classList.toggle("open");
}
// =============================================
//  SEARCH HISTORY
// =============================================
async function loadSearchHistory() {
  try {
    const res = await fetch("https://weatherhealth-backend.vercel.app/api/history");
    const history = await res.json();

    const historySection = document.getElementById("historySection");
    const historyGrid = document.getElementById("historyGrid");

    if (history.length === 0) {
      historySection.style.display = "none";
      return;
    }

    historyGrid.innerHTML = "";

    history.forEach(item => {
      const card = document.createElement("div");
      card.className = "history-card";
      card.onclick = () => {
        cityInput.value = item.city;
        getWeather();
      };

      const timeAgo = formatTimeAgo(new Date(item.searchedAt));

      card.innerHTML = `
        <div class="h-city">${item.city}</div>
        <div class="h-temp">${item.temperature}°C</div>
        
        <div class="h-time">${timeAgo}</div>
      `;
      historyGrid.appendChild(card);
    });

    historySection.style.display = "block";

  } catch (error) {
    console.log("Could not load search history:", error);
  }
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Load history when page loads
loadSearchHistory();
// =============================================
//  5-DAY FORECAST
// =============================================
async function loadForecast(city) {
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/forecast?city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("forecastSection").style.display = "none";
      return;
    }

    const forecastGrid = document.getElementById("forecastGrid");
    const forecastCity = document.getElementById("forecastCity");

    forecastCity.textContent = data.city;
    forecastGrid.innerHTML = "";

    data.forecast.forEach(day => {
      const dayName = new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" });

      const card = document.createElement("div");
      card.className = "forecast-card";
    card.innerHTML = `
        <div class="f-day">${dayName}</div>
      <img src="https://openweathermap.org/img/wn/${day.icon}@2x.png" alt="${day.description}" />
       
        <div class="f-temp">${day.temp}°C</div>
      `;
      forecastGrid.appendChild(card);
    });

    document.getElementById("forecastSection").style.display = "block";

  } catch (error) {
    console.log("Could not load forecast:", error);
  }
}

// =============================================
//  FAVORITES
// =============================================
async function addToFavorites() {
  if (!currentUser || !currentCity) return;

  try {
    const res = await fetch("https://weatherhealth-backend.vercel.app/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, city: currentCity }),
    });

    const data = await res.json();

    if (res.ok) {
      const btn = document.getElementById("favoriteBtn");
      btn.classList.add("saved");
      btn.innerHTML = `<i class="fas fa-star"></i> Saved to Favorites`;
      loadFavorites();
    } else {
      console.log(data.error);
    }
  } catch (error) {
    console.log("Could not add favorite:", error);
  }
}

async function checkIfFavorited(city) {
  if (!currentUser) return;

  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/favorites/${currentUser.id}`);
    const favorites = await res.json();

    const btn = document.getElementById("favoriteBtn");
    const isFavorited = favorites.some(f => f.city.toLowerCase() === city.toLowerCase());

    if (isFavorited) {
      btn.classList.add("saved");
      btn.innerHTML = `<i class="fas fa-star"></i> Saved to Favorites`;
    } else {
      btn.classList.remove("saved");
      btn.innerHTML = `<i class="fas fa-star"></i> Add to Favorites`;
    }
  } catch (error) {
    console.log("Could not check favorites:", error);
  }
}

async function loadFavorites() {
  if (!currentUser) return;

  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/favorites/${currentUser.id}`);
    const favorites = await res.json();

    const favoritesSection = document.getElementById("favoritesSection");
    const favoritesGrid = document.getElementById("favoritesGrid");

    if (favorites.length === 0) {
      favoritesSection.style.display = "none";
      return;
    }

    favoritesGrid.innerHTML = "";

    favorites.forEach(fav => {
      const card = document.createElement("div");
      card.className = "favorite-card";
      card.innerHTML = `
        <span class="fav-city" onclick="searchFavorite('${fav.city}')"><i class="fas fa-star" style="color:#f4a94e;"></i> ${fav.city}</span>
        <button class="remove-fav" onclick="removeFavorite('${fav._id}', event)"><i class="fas fa-trash"></i></button>
      `;
      favoritesGrid.appendChild(card);
    });

    favoritesSection.style.display = "block";

  } catch (error) {
    console.log("Could not load favorites:", error);
  }
}

function searchFavorite(city) {
  cityInput.value = city;
  getWeather();
}

async function removeFavorite(id, event) {
  event.stopPropagation();
  try {
    await fetch(`https://weatherhealth-backend.vercel.app/api/favorites/${id}`, { method: "DELETE" });
    loadFavorites();
  } catch (error) {
    console.log("Could not remove favorite:", error);
  }
}

// Load favorites when page loads
loadFavorites();
/// =============================================
//  DARK MODE
// =============================================
function toggleDarkMode() {
  const body = document.body;
  const btn = document.getElementById("darkModeToggle");

  body.classList.toggle("dark");

  if (body.classList.contains("dark")) {
    btn.innerHTML = '<i class="fas fa-sun"></i>';
    localStorage.setItem("darkMode", "enabled");
  } else {
    btn.innerHTML = '<i class="fas fa-moon"></i>';
    localStorage.setItem("darkMode", "disabled");
  }
}

// Check saved dark mode preference on page load
if (localStorage.getItem("darkMode") === "enabled") {
  document.body.classList.add("dark");
  document.getElementById("darkModeToggle").innerHTML = '<i class="fas fa-sun"></i>';
}



// =============================================
//  AIR QUALITY INDEX
// =============================================
async function loadAirQuality(lat, lon, city) {
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/airquality?lat=${lat}&lon=${lon}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("aqiSection").style.display = "none";
      return;
    }

    document.getElementById("aqiCity").textContent = city;
    document.getElementById("aqiScore").textContent = data.aqi;
    document.getElementById("aqiScore").style.color = data.color;
    document.getElementById("aqiLabel").textContent = data.label;
    document.getElementById("aqiLabel").style.color = data.color;
    document.getElementById("aqiAdvice").textContent = data.advice;

    const components = document.getElementById("aqiComponents");
    components.innerHTML = `
      <div class="aqi-component">PM2.5 <span>${data.components.pm2_5} μg/m³</span></div>
      <div class="aqi-component">PM10 <span>${data.components.pm10} μg/m³</span></div>
      <div class="aqi-component">CO <span>${data.components.co} μg/m³</span></div>
      <div class="aqi-component">NO₂ <span>${data.components.no2} μg/m³</span></div>
      <div class="aqi-component">O₃ <span>${data.components.o3} μg/m³</span></div>
    `;

    document.getElementById("aqiSection").style.display = "block";

    // Personalized AQI advisory: append an extra advisory card if the user has
    // a condition that AQI particularly affects, and air quality is poor enough to matter.
    addPersonalizedAqiAdvisory(data.aqi);
    if (lastWeatherData) {
      renderRiskScore(computeRiskScore(lastWeatherData, data.aqi), city);
    }

  } catch (error) {
    console.log("Could not load air quality:", error);
  }
}

function addPersonalizedAqiAdvisory(aqi) {
  if (aqi < 3) return; // only warn from "Moderate" (3) upward
  if (!advisoryGrid || advisorySection.style.display === "none") return;

  const sensitiveConditions = ["asthma", "heart disease", "kidney disease", "sickle cell disease", "copd", "hiv/immunocompromised", "cancer/chemotherapy", "pneumonia"];
  const affected = (userConditions || []).filter(c => sensitiveConditions.includes(c));
  const isHighlyActive = userActivityLevel !== null && /high|active|intense/i.test(userActivityLevel || "");

  if (affected.length === 0 && !isHighlyActive) return;

  // Avoid adding a duplicate card if one already exists for this search
  if (document.getElementById("personalizedAqiCard")) return;

  let reason;
  if (affected.length > 0 && isHighlyActive) {
    reason = `your health profile (${affected.join(", ")}) and your high activity level`;
  } else if (affected.length > 0) {
    reason = `your health profile (${affected.join(", ")})`;
  } else {
    reason = "your high activity level, which means more air is breathed in during exercise";
  }

  const card = document.createElement("div");
  card.id = "personalizedAqiCard";
  card.className = "advisory-card danger";
  card.innerHTML = `
    <div class="advisory-card-icon" style="background:#fdedec; font-size:1.5rem;">🌫️</div>
    <h3>Air Quality Alert — For You</h3>
    <p>Based on ${reason}, today's air quality (AQI ${aqi}) may affect you more than most people. Limit time outdoors, keep windows closed, and keep any prescribed medication close by.</p>
    <span class="advisory-badge" style="background:#fdedec; color:#c0392b;">🔴 Personalized Warning</span>
  `;
  advisoryGrid.appendChild(card);
}
// =============================================
//  GPS AUTO-LOCATION
// =============================================
function getLocationWeather() {
  if (!navigator.geolocation) {
    showHint("Geolocation is not supported by your browser.", "error");
    return;
  }

  const btn = document.querySelector(".location-btn");
  btn.innerHTML = `<span class="loader"></span> Detecting location...`;
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;

      try {
        const res = await fetch(`https://weatherhealth-backend.vercel.app/api/weather?lat=${latitude}&lon=${longitude}`);
        const data = await res.json();

        cityInput.value = data.city;
        getWeather();

      } catch (error) {
        showHint("Could not get weather for your location.", "error");
      } finally {
        btn.innerHTML = `<i class="fas fa-location-dot"></i> Use My Location`;
        btn.disabled = false;
      }
    },
    (error) => {
      showHint("Location access denied. Please allow location access.", "error");
      btn.innerHTML = `<i class="fas fa-location-dot"></i> Use My Location`;
      btn.disabled = false;
    }
  );
}
// =============================================
//  UV INDEX
// =============================================
async function loadUVIndex(lat, lon, city) {
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/uvindex?lat=${lat}&lon=${lon}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("uvSection").style.display = "none";
      return;
    }

    document.getElementById("uvCity").textContent = city;
    document.getElementById("uvScore").textContent = data.uvi;
    document.getElementById("uvScore").style.color = data.color;
    document.getElementById("uvLevel").textContent = data.level;
    document.getElementById("uvLevel").style.color = data.color;
    document.getElementById("uvAdvice").textContent = data.advice;

    document.getElementById("uvSection").style.display = "block";

  } catch (error) {
    console.log("Could not load UV index:", error);
  }
}
// =============================================
//  HOURLY FORECAST
// =============================================
async function loadHourlyForecast(city) {
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/hourly?city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("hourlySection").style.display = "none";
      return;
    }

    const hourlyGrid = document.getElementById("hourlyGrid");
    const hourlyCity = document.getElementById("hourlyCity");

    hourlyCity.textContent = data.city;
    hourlyGrid.innerHTML = "";

    data.hourly.forEach(hour => {
      const card = document.createElement("div");
      card.className = "hourly-card";
     card.innerHTML = `
        <div class="h-time">${hour.time}</div>
      <img src="https://openweathermap.org/img/wn/${hour.icon}@2x.png" alt="${hour.description}" />
        <div class="h-temp">${hour.temp}°C</div>
      `;
      hourlyGrid.appendChild(card);
    });

    document.getElementById("hourlySection").style.display = "block";

  } catch (error) {
    console.log("Could not load hourly forecast:", error);
  }
}
// =============================================
//  HEALTH PROFILE
// =============================================
async function saveHealthProfile() {
  if (!currentUser) return;

  const age = document.getElementById("profileAge").value;
  const activityLevel = document.getElementById("profileActivity").value;
  const checkboxes = document.querySelectorAll(".conditions-grid input[type='checkbox']:checked");
  const conditions = Array.from(checkboxes).map(cb => cb.value);
  const msg = document.getElementById("profileMsg");

  try {
    const res = await fetch("https://weatherhealth-backend.vercel.app/api/healthprofile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        age: parseInt(age),
        conditions,
        activityLevel,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      msg.textContent = "✅ Health profile saved successfully!";
      msg.style.color = "#27ae60";
      userConditions = conditions; // keep in sync so the next advisory search uses the update immediately
      userAge = parseInt(age) || null;
      userActivityLevel = activityLevel || null;
    } else {
      msg.textContent = "❌ Failed to save profile. Try again.";
      msg.style.color = "#e05a5a";
    }
  } catch (error) {
    msg.textContent = "❌ Could not connect to server.";
    msg.style.color = "#e05a5a";
  }
}

async function loadHealthProfile() {
  if (!currentUser) return;

  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/healthprofile/${currentUser.id}`);

    if (!res.ok) return;

    const profile = await res.json();

    if (profile.age) {
      document.getElementById("profileAge").value = profile.age;
    }

    if (profile.activityLevel) {
      document.getElementById("profileActivity").value = profile.activityLevel;
    }

    if (profile.conditions && profile.conditions.length > 0) {
      const checkboxes = document.querySelectorAll(".conditions-grid input[type='checkbox']");
      checkboxes.forEach(cb => {
        if (profile.conditions.includes(cb.value)) {
          cb.checked = true;
        }
      });
      userConditions = profile.conditions;
    }

  } catch (error) {
    console.log("Could not load health profile:", error);
  }
}

// Load health profile when page loads
loadHealthProfile();
// =============================================
//  WEATHER ALERTS & NOTIFICATIONS
// =============================================
function checkWeatherAlerts(data) {
  const temp = data.temperature;
  const humidity = data.humidity;
  const wind = data.wind_speed;
  const desc = data.condition.toLowerCase();

  let alertMessage = null;
  let alertLevel = "danger";

  // Check for dangerous conditions
  if (desc.includes("thunder") || desc.includes("storm")) {
    alertMessage = "⛈️ Thunderstorm Warning! Stay indoors and avoid open areas.";
    alertLevel = "danger";
  } else if (temp >= 40) {
    alertMessage = "🌡️ Extreme Heat Alert! Dangerous temperatures detected. Stay indoors and hydrate.";
    alertLevel = "danger";
  } else if (temp <= 0) {
    alertMessage = "❄️ Freezing Temperature Alert! Risk of frostbite and icy conditions.";
    alertLevel = "danger";
  } else if (desc.includes("heavy rain") || desc.includes("heavy intensity")) {
    alertMessage = "🌧️ Heavy Rain Warning! Risk of flooding. Avoid low-lying areas.";
    alertLevel = "danger";
  } else if (wind >= 20) {
    alertMessage = "💨 Strong Wind Warning! Secure loose objects and avoid outdoor activities.";
    alertLevel = "warning";
  } else if (temp >= 35) {
    alertMessage = "☀️ Heat Advisory! Very high temperatures. Drink water and limit sun exposure.";
    alertLevel = "warning";
  } else if (humidity >= 90) {
    alertMessage = "💧 High Humidity Alert! Feels much hotter than actual temperature. Stay cool.";
    alertLevel = "warning";
  }

  const banner = document.getElementById("alertBanner");
  const alertMsg = document.getElementById("alertMessage");

  if (alertMessage) {
    alertMsg.textContent = alertMessage;
    banner.className = `alert-banner ${alertLevel}`;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

function dismissAlert() {
  document.getElementById("alertBanner").style.display = "none";
}
// =============================================
//  EMAIL NOTIFICATIONS
// =============================================
async function sendWeatherEmail() {
  if (!currentUser || !currentCity) return;

  const btn = document.getElementById("emailBtn");
  btn.innerHTML = `<span class="loader"></span> Sending...`;
  btn.disabled = true;

  try {
    // Get current weather data from the card
    const weatherData = {
      temperature: document.getElementById("cardTemp").textContent.replace("°C", ""),
      description: document.getElementById("cardDesc").textContent,
      humidity: document.getElementById("cardHumidity").textContent.replace("%", ""),
      wind_speed: document.getElementById("cardWind").textContent.replace(" m/s", ""),
    };

    const res = await fetch("https://weatherhealth-backend.vercel.app/api/sendemail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: currentUser.email,
        city: currentCity,
        weatherData,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      btn.innerHTML = `<i class="fas fa-check"></i> Email Sent!`;
      btn.style.background = "rgba(46, 204, 143, 0.3)";
      setTimeout(() => {
        btn.innerHTML = `<i class="fas fa-envelope"></i> Email Report`;
        btn.style.background = "";
        btn.disabled = false;
      }, 3000);
    } else {
      btn.innerHTML = `<i class="fas fa-envelope"></i> Email Report`;
      btn.disabled = false;
    }
  } catch (error) {
    console.log("Could not send email:", error);
    btn.innerHTML = `<i class="fas fa-envelope"></i> Email Report`;
    btn.disabled = false;
  }
}// =============================================
//  MULTI-LANGUAGE SUPPORT
// =============================================
const translations = {
  en: {
    searchPlaceholder: "Enter city name e.g. Abuja...",
    checkWeather: "Check Weather",
    useLocation: "Use My Location",
    healthAdvisory: "Health Advisory",
    fiveDay: "5-Day Forecast",
    hourly: "Hourly Forecast",
    uvIndex: "UV Index",
    airQuality: "Air Quality Index",
    favorites: "Your Favorite Cities",
    recentSearches: "Your Recent Searches",
    healthProfile: "Your Health Profile",
    generalTips: "General Health Tips",
    addFavorites: "Add to Favorites",
    savedFavorites: "Saved to Favorites",
    emailReport: "Email Report",
    logout: "Logout",
    planAhead: "Plan ahead for",
    basedOn: "Based on current weather conditions in",
    saveProfile: "Save Profile",
  },
  fr: {
    searchPlaceholder: "Entrez le nom de la ville...",
    checkWeather: "Vérifier la météo",
    useLocation: "Utiliser ma position",
    healthAdvisory: "Avis de santé",
    fiveDay: "Prévisions sur 5 jours",
    hourly: "Prévisions horaires",
    uvIndex: "Indice UV",
    airQuality: "Indice de qualité de l'air",
    favorites: "Vos villes favorites",
    recentSearches: "Recherches récentes",
    healthProfile: "Votre profil de santé",
    generalTips: "Conseils de santé généraux",
    addFavorites: "Ajouter aux favoris",
    savedFavorites: "Sauvegardé",
    emailReport: "Rapport par email",
    logout: "Déconnexion",
    planAhead: "Planifiez pour",
    basedOn: "Basé sur les conditions météo actuelles à",
    saveProfile: "Sauvegarder le profil",
  },
  ar: {
    searchPlaceholder: "أدخل اسم المدينة...",
    checkWeather: "تحقق من الطقس",
    useLocation: "استخدم موقعي",
    healthAdvisory: "النصائح الصحية",
    fiveDay: "توقعات 5 أيام",
    hourly: "التوقعات بالساعة",
    uvIndex: "مؤشر الأشعة فوق البنفسجية",
    airQuality: "مؤشر جودة الهواء",
    favorites: "مدنك المفضلة",
    recentSearches: "عمليات البحث الأخيرة",
    healthProfile: "ملفك الصحي",
    generalTips: "نصائح صحية عامة",
    addFavorites: "إضافة إلى المفضلة",
    savedFavorites: "تم الحفظ",
    emailReport: "تقرير بالبريد",
    logout: "تسجيل خروج",
    planAhead: "التخطيط لـ",
    basedOn: "بناءً على الأحوال الجوية الحالية في",
    saveProfile: "حفظ الملف",
  },
  ha: {
    searchPlaceholder: "Shigar da sunan gari...",
    checkWeather: "Duba Yanayi",
    useLocation: "Yi amfani da wurina",
    healthAdvisory: "Shawarar Lafiya",
    fiveDay: "Tsinkaya na Kwana 5",
    hourly: "Tsinkaya ta Sa'a",
    uvIndex: "Ma'aunin UV",
    airQuality: "Ingancin Iska",
    favorites: "Garuruwan da kuka fi so",
    recentSearches: "Binciken kwanan nan",
    healthProfile: "Bayanan Lafiyarka",
    generalTips: "Shawarwarin Lafiya",
    addFavorites: "Ƙara zuwa Favorites",
    savedFavorites: "An adana",
    emailReport: "Rahoton Imel",
    logout: "Fita",
    planAhead: "Shirya don",
    basedOn: "Dangane da yanayin yanzu a",
    saveProfile: "Adana Bayanan",
  },
  yo: {
    searchPlaceholder: "Tẹ orukọ ilu...",
    checkWeather: "Ṣayẹwo Oju-ọjọ",
    useLocation: "Lo ipo mi",
    healthAdvisory: "Imọran Ilera",
    fiveDay: "Asọtẹlẹ Ọjọ 5",
    hourly: "Asọtẹlẹ Wakati",
    uvIndex: "Atọka UV",
    airQuality: "Didara Afẹfẹ",
    favorites: "Awọn ilu ayanfẹ rẹ",
    recentSearches: "Awọn wiwa aipẹ",
    healthProfile: "Profaili Ilera Rẹ",
    generalTips: "Awọn imọran Ilera",
    addFavorites: "Fi kun Awọn ayanfẹ",
    savedFavorites: "Ti fipamọ",
    emailReport: "Ijabọ Imeeli",
    logout: "Jade",
    planAhead: "Gbero fun",
    basedOn: "Da lori awọn ipo oju-ọjọ lọwọlọwọ ni",
    saveProfile: "Fipamọ Profaili",
  },
};

function switchLanguage(lang) {
  const t = translations[lang];
  localStorage.setItem("language", lang);

  // Update placeholder
  document.getElementById("cityInput").placeholder = t.searchPlaceholder;

  // Update buttons
  document.querySelector(".search-bar button").textContent = t.checkWeather;
  document.querySelector(".location-btn").innerHTML = `<i class="fas fa-location-dot"></i> ${t.useLocation}`;
  document.getElementById("logoutBtn").textContent = t.logout;

  // Update favorite button if visible
  const favBtn = document.getElementById("favoriteBtn");
  if (favBtn && !favBtn.classList.contains("saved")) {
    favBtn.innerHTML = `<i class="fas fa-star"></i> ${t.addFavorites}`;
  }

  // Update email button
  const emailBtn = document.getElementById("emailBtn");
  if (emailBtn) {
    emailBtn.innerHTML = `<i class="fas fa-envelope"></i> ${t.emailReport}`;
  }

  // Update section headers
  document.querySelector("#advisorySection .section-header h2").textContent = t.healthAdvisory;
  document.querySelector("#forecastSection .section-header h2").textContent = t.fiveDay;
  document.querySelector("#hourlySection .section-header h2").textContent = t.hourly;
  document.querySelector("#uvSection .section-header h2").textContent = t.uvIndex;
  document.querySelector("#aqiSection .section-header h2").textContent = t.airQuality;
  document.querySelector("#favoritesSection .section-header h2").textContent = t.favorites;
  document.querySelector("#historySection .section-header h2").textContent = t.recentSearches;
  document.querySelector("#profileSection .section-header h2").textContent = t.healthProfile;
  document.querySelector(".tips-section .section-header h2").textContent = t.generalTips;
  document.querySelector(".profile-save-btn").innerHTML = `<i class="fas fa-save"></i> ${t.saveProfile}`;

  // Set text direction for Arabic
  if (lang === "ar") {
    document.body.setAttribute("dir", "rtl");
  } else {
    document.body.setAttribute("dir", "ltr");
  }
}

// Load saved language on page load
const savedLanguage = localStorage.getItem("language");
if (savedLanguage && savedLanguage !== "en") {
  document.getElementById("languageSwitcher").value = savedLanguage;
  switchLanguage(savedLanguage);
}
// =============================================
//  PDF REPORT
// =============================================
function downloadPDFReport() {
  if (!currentCity) return;

  const btn = document.getElementById("pdfBtn");
  btn.innerHTML = `<span class="loader"></span> Generating...`;
  btn.disabled = true;

  const link = document.createElement("a");
  link.href = `https://weatherhealth-backend.vercel.app/api/report?city=${encodeURIComponent(currentCity)}`;
  link.download = `WeatherHealth_${currentCity}_Report.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    btn.innerHTML = `<i class="fas fa-file-pdf"></i> Download PDF`;
    btn.disabled = false;
  }, 2000);
}
// =============================================
//  SOCIAL SHARING
// =============================================
function getShareText() {
  const city = currentCity || "my city";
  const temp = document.getElementById("cardTemp").textContent;
  const desc = document.getElementById("cardDesc").textContent;
  const humidity = document.getElementById("cardHumidity").textContent;
  return `🌤️ Weather in ${city}: ${temp}, ${desc}. Humidity: ${humidity}. Stay healthy! Check WeatherHealth for your daily health advisory. #WeatherHealth #HealthTips`;
}

function shareOnWhatsApp() {
  const text = encodeURIComponent(getShareText());
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

function shareOnTwitter() {
  const text = encodeURIComponent(getShareText());
  window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
}

function shareOnFacebook() {
  const text = encodeURIComponent(getShareText());
  window.open(`https://www.facebook.com/sharer/sharer.php?quote=${text}&u=https://weatherhealth.app`, "_blank");
}
// =============================================
//  SYMPTOM CHECKER
// =============================================
function checkSymptoms() {
  const checkboxes = document.querySelectorAll(".symptom-grid input[type='checkbox']:checked");
  const symptoms = Array.from(checkboxes).map(cb => cb.value);

  if (symptoms.length === 0) {
    alert("Please select at least one symptom.");
    return;
  }

  const results = [];

  // Weather-related symptom advice
  symptoms.forEach(symptom => {
    switch (symptom) {
      case "headache":
        results.push({
          title: "🤕 Headache",
          message: "Headaches can be triggered by high temperatures, dehydration, or sudden weather changes. Drink plenty of water, rest in a cool place, and avoid direct sunlight. If the weather is very hot, stay indoors.",
          level: "warning"
        });
        break;

      case "fatigue":
        results.push({
          title: "😴 Fatigue",
          message: "Extreme heat and high humidity can drain your energy quickly. Rest in a cool environment, stay hydrated, and avoid strenuous activities during peak heat hours (10am–4pm).",
          level: "warning"
        });
        break;

      case "shortness of breath":
        results.push({
          title: "😮‍💨 Shortness of Breath",
          message: "Poor air quality, high humidity, or allergens in the air can worsen breathing. Check the AQI above — if it's moderate or poor, stay indoors with windows closed. Seek medical attention if severe.",
          level: "danger"
        });
        break;

      case "dizziness":
        results.push({
          title: "🌀 Dizziness",
          message: "Dizziness is often caused by dehydration or heat exhaustion. Move to a cool, shaded area immediately, drink water slowly, and sit or lie down. If it persists, seek medical help.",
          level: "danger"
        });
        break;

      case "nausea":
        results.push({
          title: "🤢 Nausea",
          message: "Heat and high humidity can cause nausea. Move to a cooler area, sip cold water slowly, and avoid eating heavy meals. If accompanied by fever or vomiting, seek medical attention.",
          level: "warning"
        });
        break;

      case "dry skin":
        results.push({
          title: "🌵 Dry Skin",
          message: "Low humidity causes skin to lose moisture quickly. Use a moisturiser regularly, drink more water, and consider using a humidifier indoors. Avoid hot showers which strip natural oils.",
          level: "good"
        });
        break;

      case "cough":
        results.push({
          title: "😷 Cough",
          message: "Dust, pollen, or poor air quality can trigger coughing. Check the AQI — if poor, wear a mask outdoors and keep windows closed. Dry weather can also irritate the throat — drink warm fluids.",
          level: "warning"
        });
        break;

      case "runny nose":
        results.push({
          title: "🤧 Runny Nose",
          message: "Weather changes, cold temperatures, or high pollen can cause a runny nose. Stay warm during cold weather, avoid outdoor activities on high-pollen days, and keep your environment clean.",
          level: "good"
        });
        break;

      case "joint pain":
        results.push({
          title: "🦴 Joint Pain",
          message: "Cold and damp weather can worsen joint pain, especially for arthritis sufferers. Keep joints warm with appropriate clothing, do gentle stretching indoors, and avoid prolonged exposure to cold.",
          level: "warning"
        });
        break;

      case "chest tightness":
        results.push({
          title: "💔 Chest Tightness",
          message: "⚠️ Chest tightness can be serious. It may be triggered by poor air quality, extreme heat, or cold air. Stop all physical activity immediately, rest, and seek medical attention if it persists.",
          level: "danger"
        });
        break;

      case "eye irritation":
        results.push({
          title: "👁️ Eye Irritation",
          message: "Wind, dust, high pollen, or UV rays can irritate the eyes. Wear UV-protective sunglasses outdoors, avoid rubbing your eyes, use eye drops if needed, and stay indoors on high-dust or high-pollen days.",
          level: "warning"
        });
        break;

      case "skin rash":
        results.push({
          title: "🔴 Skin Rash",
          message: "Heat rash is common in hot and humid weather. Wear loose, breathable clothing, stay in cool environments, and apply calamine lotion if needed. If the rash spreads or worsens, see a doctor.",
          level: "warning"
        });
        break;
    }
  });

  // Display results
  const resultsContainer = document.getElementById("symptomResults");
  resultsContainer.innerHTML = "";

  results.forEach(result => {
    const card = document.createElement("div");
    card.className = `symptom-result-card ${result.level}`;
    card.innerHTML = `
      <h3>${result.title}</h3>
      <p>${result.message}</p>
    `;
    resultsContainer.appendChild(card);
  });

  // Add general advice at the bottom
  const generalCard = document.createElement("div");
  generalCard.className = "symptom-result-card good";
  generalCard.innerHTML = `
    <h3>⚕️ General Advice</h3>
    <p>These suggestions are weather-related health tips and are not a substitute for professional medical advice. If your symptoms are severe or persist, please consult a qualified healthcare provider.</p>
  `;
  resultsContainer.appendChild(generalCard);

  resultsContainer.style.display = "flex";
  resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}
// =============================================
//  TEMPERATURE TREND CHART
// =============================================
let tempChartInstance = null;

async function loadTemperatureChart(city) {
  try {
    const res = await fetch(`https://weatherhealth-backend.vercel.app/api/hourly?city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("chartSection").style.display = "none";
      return;
    }

    document.getElementById("chartCity").textContent = data.city;

    const labels = data.hourly.map(h => h.time);
    const temps = data.hourly.map(h => h.temp);
    const humidity = data.hourly.map(h => h.humidity);

    // Destroy existing chart if it exists
    if (tempChartInstance) {
      tempChartInstance.destroy();
    }

    const ctx = document.getElementById("tempChart").getContext("2d");

    tempChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperature (°C)",
            data: temps,
            borderColor: "#1a6fb3",
            backgroundColor: "rgba(26, 111, 179, 0.1)",
            borderWidth: 3,
            pointBackgroundColor: "#1a6fb3",
            pointRadius: 5,
            tension: 0.4,
            fill: true,
          },
          {
            label: "Humidity (%)",
            data: humidity,
            borderColor: "#2ecc8f",
            backgroundColor: "rgba(46, 204, 143, 0.1)",
            borderWidth: 3,
            pointBackgroundColor: "#2ecc8f",
            pointRadius: 5,
            tension: 0.4,
            fill: true,
          }
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: {
              color: "rgba(0,0,0,0.05)",
            },
          },
          x: {
            grid: {
              color: "rgba(0,0,0,0.05)",
            },
          },
        },
      },
    });

    document.getElementById("chartSection").style.display = "block";

  } catch (error) {
    console.log("Could not load temperature chart:", error);
  }
}
