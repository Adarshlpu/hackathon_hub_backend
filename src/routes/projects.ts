import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { Score } from "../models/Score.js";
import { Team } from "../models/Team.js";
import { Hackathon } from "../models/Hackathon.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /projects
router.get("/projects", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const filter: Record<string, unknown> = {};
  if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;
  if (req.query.teamId) filter.teamId = req.query.teamId;
  if (req.query.status) filter.status = req.query.status;
  if (req.user!.role === "student") {
    const teamIds = await Team.find({ "members.userId": req.user!._id }).distinct("_id");
    filter.teamId = req.query.teamId && teamIds.some((id) => id.toString() === req.query.teamId)
      ? req.query.teamId
      : { $in: teamIds };
  }

  const projects = await Project.find(filter).populate("teamId", "name");
  const withScores = await Promise.all(
    projects.map(async (p) => {
      const scores = await Score.find({ projectId: p._id });
      const avg = scores.length
        ? scores.reduce((a, s) => a + s.total, 0) / scores.length
        : null;
      return { ...p.toObject(), scores, averageScore: avg };
    }),
  );
  res.json(withScores);
});

// POST /projects
router.post("/projects", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { title, description, hackathonId, teamId, techStack } = req.body;
  if (typeof title !== "string" || title.trim().length < 3 || typeof hackathonId !== "string" || typeof teamId !== "string" ||
      !mongoose.isValidObjectId(hackathonId) || !mongoose.isValidObjectId(teamId)) {
    res.status(400).json({ error: "Provide a title, hackathon, and team" });
    return;
  }
  const [team, hackathon] = await Promise.all([
    Team.findOne({ _id: teamId, hackathonId, "members.userId": req.user!._id }),
    Hackathon.findById(hackathonId).select("status"),
  ]);
  if (!team || !hackathon || hackathon.status !== "ongoing") {
    res.status(400).json({ error: "Choose one of your teams in an ongoing hackathon" });
    return;
  }
  const existing = await Project.findOne({ teamId, hackathonId });
  if (existing) {
    res.status(409).json({ error: "This team has already submitted a project for this hackathon" });
    return;
  }
  const project = await Project.create({
    title: title.trim(),
    description,
    hackathonId,
    teamId,
    githubUrl: req.body.githubUrl,
    demoUrl: req.body.demoUrl,
    videoUrl: req.body.videoUrl,
    presentationUrl: req.body.presentationUrl,
    documentationUrl: req.body.documentationUrl,
    images: req.body.images,
    techStack,
    status: "submitted",
  });
  res.status(201).json(project);
});

// GET /projects/:id
router.get("/projects/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const project = await Project.findById(req.params.id).populate("teamId", "name members");
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (req.user!.role === "student") {
    const team = project.teamId as unknown as { members?: Array<{ userId: mongoose.Types.ObjectId }> };
    if (!team.members?.some((member) => member.userId.toString() === req.user!._id.toString())) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
  }
  const scores = await Score.find({ projectId: project._id });
  const avg = scores.length ? scores.reduce((a, s) => a + s.total, 0) / scores.length : null;
  res.json({ ...project.toObject(), scores, averageScore: avg });
});

const ALLOWED_PROJECT_UPDATES = [
  "title", "description", "githubUrl", "demoUrl", "videoUrl",
  "presentationUrl", "documentationUrl", "images", "techStack", "status",
] as const;

// PATCH /projects/:id
router.patch("/projects/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const ownedTeamIds = await Team.find({ "members.userId": req.user!._id }).distinct("_id");
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_PROJECT_UPDATES) {
    if (key in req.body) {
      updates[key] = req.body[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const project = await Project.findOneAndUpdate(
    req.user!.role === "student" ? { _id: req.params.id, teamId: { $in: ownedTeamIds } } : { _id: req.params.id },
    { $set: updates }, { new: true },
  );
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// DELETE /projects/:id
router.delete("/projects/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const ownedTeamIds = await Team.find({ "members.userId": req.user!._id }).distinct("_id");
  const project = await Project.findOneAndDelete(
    req.user!.role === "student" ? { _id: req.params.id, teamId: { $in: ownedTeamIds } } : { _id: req.params.id },
  );
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
