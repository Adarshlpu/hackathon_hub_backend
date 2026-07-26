import mongoose, { Document, Schema } from "mongoose";

export interface ICollege extends Document {
  name: string;
  slug: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  adminId: mongoose.Types.ObjectId;
  isVerified: boolean;
  totalStudents: number;
  totalHackathons: number;
  totalRegistrations: number;
  totalTeams: number;
  totalSubmissions: number;
  createdAt: Date;
  updatedAt: Date;
}

const CollegeSchema = new Schema<ICollege>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    logoUrl: String,
    bannerUrl: String,
    description: String,
    address: String,
    city: String,
    state: String,
    country: { type: String, default: "India" },
    website: String,
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isVerified: { type: Boolean, default: false },
    totalStudents: { type: Number, default: 0 },
    totalHackathons: { type: Number, default: 0 },
    totalRegistrations: { type: Number, default: 0 },
    totalTeams: { type: Number, default: 0 },
    totalSubmissions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

CollegeSchema.index({ adminId: 1 });
CollegeSchema.index({ slug: 1 });
CollegeSchema.index({ city: 1, state: 1 });

export const College = mongoose.model<ICollege>("College", CollegeSchema);