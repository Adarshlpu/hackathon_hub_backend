import mongoose, { Document, Schema } from "mongoose";

export interface IHackathon extends Document {
  title: string;
  description?: string;
  bannerUrl?: string;
  logoUrl?: string;
  status: "draft" | "upcoming" | "ongoing" | "ended" | "cancelled";
  startDate: Date;
  endDate: Date;
  registrationDeadline?: Date;
  maxTeamSize: number;
  minTeamSize: number;
  maxParticipants?: number;
  themes: string[];
  prizes: Array<{ rank: number; title: string; amount?: number; description?: string }>;
  rules?: string;
  location?: string;
  mode: "online" | "offline" | "hybrid";
  organizerId: mongoose.Types.ObjectId;
  judges: mongoose.Types.ObjectId[];
  mentors: mongoose.Types.ObjectId[];
  sponsors: Array<{ name: string; logoUrl?: string; tier: string }>;
  registrationCount: number;
  faqs: Array<{ question: string; answer: string }>;
  schedule: Array<{ time: string; title: string; description?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const HackathonSchema = new Schema<IHackathon>(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    bannerUrl: String,
    logoUrl: String,
    status: {
      type: String,
      enum: ["draft", "upcoming", "ongoing", "ended", "cancelled"],
      default: "draft",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    registrationDeadline: Date,
    maxTeamSize: { type: Number, default: 4 },
    minTeamSize: { type: Number, default: 1 },
    maxParticipants: Number,
    themes: [String],
    prizes: [
      {
        rank: Number,
        title: String,
        amount: Number,
        description: String,
      },
    ],
    rules: String,
    location: String,
    mode: { type: String, enum: ["online", "offline", "hybrid"], default: "online" },
    organizerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    judges: [{ type: Schema.Types.ObjectId, ref: "User" }],
    mentors: [{ type: Schema.Types.ObjectId, ref: "User" }],
    sponsors: [{ name: String, logoUrl: String, tier: String }],
    registrationCount: { type: Number, default: 0 },
    faqs: [{ question: String, answer: String }],
    schedule: [{ time: String, title: String, description: String }],
  },
  { timestamps: true },
);

HackathonSchema.index({ status: 1 });
HackathonSchema.index({ organizerId: 1 });
HackathonSchema.index({ startDate: 1 });
HackathonSchema.index({ title: "text", description: "text" });

export const Hackathon = mongoose.model<IHackathon>("Hackathon", HackathonSchema);
