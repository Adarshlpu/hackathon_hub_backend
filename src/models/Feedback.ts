import mongoose, { Document, Schema } from "mongoose";

export interface IFeedback extends Document {
  authorId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    content: { type: String, required: true },
  },
  { timestamps: true },
);

FeedbackSchema.index({ teamId: 1 });
FeedbackSchema.index({ authorId: 1 });

export const Feedback = mongoose.model<IFeedback>("Feedback", FeedbackSchema);
