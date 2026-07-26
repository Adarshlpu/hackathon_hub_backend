import "dotenv/config";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { connectDB } from "./lib/db.js";
import { logger } from "./lib/logger.js";

async function seedSuperAdmin() {
  await connectDB();

  const email = process.env.SUPER_ADMIN_EMAIL || "admin@hackhub.com";
  const password = process.env.SUPER_ADMIN_PASSWORD || "Admin@123";
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  const existing = await User.findOne({ email });
  if (existing) {
    logger.info({ email }, "Super admin already exists, skipping creation");
    await mongoose.disconnect();
    return;
  }

  const user = await User.create({
    name,
    email,
    password,
    role: "super_admin",
    isVerified: true,
    isBanned: false,
  });

  logger.info(
    { _id: user._id, email: user.email, role: user.role },
    "Super admin created successfully",
  );

  console.log("\n========================================");
  console.log("  Super Admin Created!");
  console.log("========================================");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     super_admin`);
  console.log("========================================\n");

  await mongoose.disconnect();
}

seedSuperAdmin().catch((err) => {
  logger.error({ err }, "Failed to seed super admin");
  process.exit(1);
});