import mongoose, { Document, Schema } from "mongoose";

export interface ICompanySponsorProfile extends Document {
  userId: mongoose.Types.ObjectId;
  companyName: string;
  website?: string;
  logoUrl?: string;
  description?: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  sponsoredEvents: mongoose.Types.ObjectId[];
  challenges: Array<{
    title: string;
    description: string;
    prizePool: string;
    tags: string[];
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySponsorProfileSchema = new Schema<ICompanySponsorProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    companyName: { type: String, required: true },
    website: String,
    logoUrl: String,
    description: String,
    tier: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum"],
      default: "silver",
    },
    sponsoredEvents: [{ type: Schema.Types.ObjectId, ref: "Hackathon" }],
    challenges: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        prizePool: String,
        tags: [String],
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const CompanySponsorProfile = mongoose.model<ICompanySponsorProfile>(
  "CompanySponsorProfile",
  CompanySponsorProfileSchema
);
