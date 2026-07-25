import mongoose, { Document, Schema } from "mongoose";

export interface IRegistration extends Document {
  hackathonId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
}

const RegistrationSchema = new Schema<IRegistration>(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true },
);

RegistrationSchema.index({ hackathonId: 1, userId: 1 }, { unique: true });
RegistrationSchema.index({ userId: 1 });

export const Registration = mongoose.model<IRegistration>("Registration", RegistrationSchema);
