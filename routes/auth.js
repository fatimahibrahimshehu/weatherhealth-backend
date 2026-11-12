const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Favorite = require("../models/Favorite");
const HealthProfile = require("../models/HealthProfile");
const Search = require("../models/Search");
const { requireAuth } = require("../middleware/auth");

// =============================================
//  ROUTE: Register a new user
// =============================================
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    // Generate token
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed. Try again." });
  }
});

// =============================================
//  ROUTE: Login user
// =============================================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed. Try again." });
  }
});

module.exports = router;
// =============================================
//  ROUTE: Update Profile
// =============================================
router.put("/update/:id", async (req, res) => {
  const { username, email } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { new: true }
    );

    res.json({
      message: "Profile updated successfully",
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// =============================================
//  ROUTE: Change Password
// =============================================
router.put("/changepassword/:id", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

// =============================================
//  ROUTE: Delete Account (and all associated data)
//  Requires a valid token for the same user AND their current password.
// =============================================
router.delete("/delete/:id", requireAuth, async (req, res) => {
  const { password } = req.body || {};

  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: "You can only delete your own account" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required to delete your account" });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Incorrect password" });

    await Promise.all([
      Favorite.deleteMany({ userId: user._id }),
      HealthProfile.deleteMany({ userId: user._id }),
      Search.deleteMany({ userId: user._id }),
    ]);
    await User.findByIdAndDelete(user._id);

    res.json({ message: "Account and all associated data deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete account" });
  }
});
