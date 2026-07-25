import mongoose, { Document, Schema } from "mongoose";

export interface ITeam extends Document {
  name: string;
  hackathonId: mongoose.Types.ObjectId;
  leaderId: mongoose.Types.ObjectId;
  members: Array<{ userId: mongoose.Types.ObjectId; role?: string; joinedAt: Date }>;
  maxSize: number;
  isApproved: boolean;
  invitations: Array<{
    _id?: mongoose.Types.ObjectId;
    email: string;
    token: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    leaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        role: String,
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    maxSize: { type: Number, default: 4 },
    isApproved: { type: Boolean, default: false },
    invitations: [
      {
        email: String,
        token: String,
        status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

TeamSchema.index({ hackathonId: 1 });
TeamSchema.index({ leaderId: 1 });
TeamSchema.index({ "members.userId": 1 });

export const Team = mongoose.model<ITeam>("Team", TeamSchema);
