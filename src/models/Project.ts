import mongoose, { Document, Schema } from "mongoose";

export interface IProject extends Document {
  title: string;
  description?: string;
  hackathonId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  githubUrl?: string;
  demoUrl?: string;
  videoUrl?: string;
  presentationUrl?: string;
  documentationUrl?: string;
  images: string[];
  techStack: string[];
  status: "draft" | "submitted" | "under_review" | "reviewed";
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    title: { type: String, required: true },
    description: String,
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    githubUrl: String,
    demoUrl: String,
    videoUrl: String,
    presentationUrl: String,
    documentationUrl: String,
    images: [String],
    techStack: [String],
    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "reviewed"],
      default: "draft",
    },
  },
  { timestamps: true },
);

ProjectSchema.index({ hackathonId: 1 });
ProjectSchema.index({ teamId: 1 });
ProjectSchema.index({ status: 1 });

export const Project = mongoose.model<IProject>("Project", ProjectSchema);
