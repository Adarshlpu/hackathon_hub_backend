import mongoose, { Document, Schema } from "mongoose";

export interface IAnnouncement extends Document {
  hackathonId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  createdAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true },
);

AnnouncementSchema.index({ hackathonId: 1 });

export const Announcement = mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);
