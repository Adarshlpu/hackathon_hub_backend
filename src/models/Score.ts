import mongoose, { Document, Schema } from "mongoose";

export interface IScore extends Document {
  projectId: mongoose.Types.ObjectId;
  judgeId: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  innovation: number;
  techComplexity: number;
  uiux: number;
  impact: number;
  presentation: number;
  total: number;
  comments?: string;
  createdAt: Date;
}

const ScoreSchema = new Schema<IScore>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    judgeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    innovation: { type: Number, min: 0, max: 10, required: true },
    techComplexity: { type: Number, min: 0, max: 10, required: true },
    uiux: { type: Number, min: 0, max: 10, required: true },
    impact: { type: Number, min: 0, max: 10, required: true },
    presentation: { type: Number, min: 0, max: 10, required: true },
    total: { type: Number, required: true },
    comments: String,
  },
  { timestamps: true },
);

ScoreSchema.index({ projectId: 1, judgeId: 1 }, { unique: true });
ScoreSchema.index({ judgeId: 1 });
ScoreSchema.index({ hackathonId: 1 });

export const Score = mongoose.model<IScore>("Score", ScoreSchema);
