const jwt = require("jsonwebtoken");

// Requires a valid user JWT. Sets req.user = { id, username }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const payload = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if (!payload.id) return res.status(403).json({ error: "Invalid token" });
    req.user = payload;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
