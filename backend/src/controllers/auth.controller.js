import { User } from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { upsertStreamUser, streamClient } from "../lib/stream.js";

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. Hash the password (Security)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Create User in MongoDB
    // Note: 'role' will default to "candidate" unless you manually change it in DB later
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    // 4. Sync with Stream (Video Backend) - IMMEDIATE SYNC
    try {
      await upsertStreamUser(user);
    } catch (streamError) {
      console.warn("Stream sync failed during signup, but account was created:", streamError.message);
    }

    // 5. Generate API Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role, // <--- ADDED: Sends role to frontend
      token,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find User
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 2. Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3. Generate API Token (for your app)
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 4. Generate Stream Token (CRITICAL for Video Calls)
    const streamToken = streamClient.createToken(user._id.toString());

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role, // <--- ADDED: Frontend checks this to redirect to /admin
      token,           // Used to keep them logged in
      streamToken,     // Used to connect to video calls
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};