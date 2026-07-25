import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

export interface ICertificate extends Document {
  userId: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  type: "participation" | "winner" | "runner_up" | "judge" | "mentor";
  verificationCode: string;
  pdfUrl?: string;
  issuedAt: Date;
  createdAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    type: {
      type: String,
      enum: ["participation", "winner", "runner_up", "judge", "mentor"],
      required: true,
    },
    verificationCode: { type: String, unique: true, default: () => uuidv4() },
    pdfUrl: String,
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CertificateSchema.index({ userId: 1, hackathonId: 1 });
CertificateSchema.index({ verificationCode: 1 });

export const Certificate = mongoose.model<ICertificate>("Certificate", CertificateSchema);
