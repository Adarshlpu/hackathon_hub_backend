import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: "student" | "college_admin" | "judge" | "recruiter" | "company" | "sponsor" | "super_admin";
  avatar?: string;
  isVerified: boolean;
  isBanned: boolean;
  banReason?: string;
  googleId?: string;
  githubId?: string;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  refreshToken?: string;
  profile: {
    bio?: string;
    github?: string;
    linkedin?: string;
    portfolio?: string;
    skills: string[];
    collegeName?: string;
    resumeUrl?: string;
  };
  shortlistedBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    role: {
      type: String,
      enum: ["student", "college_admin", "judge", "recruiter", "company", "sponsor", "super_admin"],
      default: "student",
    },
    avatar: String,
    isVerified: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    banReason: String,
    googleId: String,
    githubId: String,
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    refreshToken: String,
    profile: {
      bio: String,
      github: String,
      linkedin: String,
      portfolio: String,
      skills: [{ type: String }],
      collegeName: String,
      resumeUrl: String,
    },
    shortlistedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.index({ role: 1 });
UserSchema.index({ "profile.skills": 1 });

export const User = mongoose.model<IUser>("User", UserSchema);
