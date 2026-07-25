import { Router, type IRouter } from "express";
import crypto from "crypto";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import {
  generateTokens,
  verifyRefreshToken,
  authenticate,
  AuthRequest,
} from "../middlewares/auth.js";
import { sendEmail, verificationEmailHtml, passwordResetEmailHtml } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const { name, email, password, role, collegeName } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email, and password are required" });
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const user = await User.create({
    name,
    email,
    password,
    role: role || "student",
    emailVerificationToken: verificationToken,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    profile: { collegeName },
  });

  try {
    await sendEmail({
      to: email,
      subject: "Verify your HackHub email",
      html: verificationEmailHtml(name, verificationToken),
    });
  } catch (err) {
    req.log.warn({ err }, "Verification email failed");
  }

  const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
  user.refreshToken = refreshToken;
  await user.save();

  res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isVerified: user.isVerified,
      isBanned: user.isBanned,
      profile: user.profile,
      createdAt: user.createdAt,
    },
  });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !user.password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: "Account has been banned" });
    return;
  }

  const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
  user.refreshToken = refreshToken;
  await user.save();

  res.json({
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isVerified: user.isVerified,
      isBanned: user.isBanned,
      profile: user.profile,
      createdAt: user.createdAt,
    },
  });
});

// POST /auth/logout
router.post("/auth/logout", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user) {
    req.user.refreshToken = undefined;
    await req.user.save();
  }
  res.json({ message: "Logged out successfully" });
});

// POST /auth/refresh
router.post("/auth/refresh", async (req, res): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token required" });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.userId);
    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const tokens = generateTokens(user._id.toString(), user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        isBanned: user.isBanned,
        profile: user.profile,
        createdAt: user.createdAt,
      },
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// POST /auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists
    res.json({ message: "If that email exists, a reset link has been sent" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = token;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  try {
    await sendEmail({
      to: email,
      subject: "Reset your HackHub password",
      html: passwordResetEmailHtml(user.name, token),
    });
  } catch (err) {
    req.log.warn({ err }, "Password reset email failed");
  }

  res.json({ message: "If that email exists, a reset link has been sent" });
});

// POST /auth/reset-password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: "Token and password are required" });
    return;
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined;
  await user.save();

  res.json({ message: "Password reset successfully" });
});

// GET /auth/verify-email
router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ error: "Invalid or expired verification token" });
    return;
  }

  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.json({ message: "Email verified successfully" });
});

// GET /auth/me
router.get("/auth/me", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const user = req.user!;
  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isVerified: user.isVerified,
    isBanned: user.isBanned,
    profile: user.profile,
    createdAt: user.createdAt,
  });
});

export default router;
