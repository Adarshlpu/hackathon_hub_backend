import mongoose, { Document, Schema } from "mongoose";

export interface ISupportTicket extends Document {
  userId?: mongoose.Types.ObjectId;
  subject: string;
  description?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    subject: { type: String, required: true },
    description: String,
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
  },
  { timestamps: true },
);

SupportTicketSchema.index({ status: 1 });

export const SupportTicket = mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);
