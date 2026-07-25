import { Router, type IRouter } from "express";
import { Project } from "../models/Project.js";
import { Score } from "../models/Score.js";
import { Hackathon } from "../models/Hackathon.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { delCache } from "../lib/redis.js";

const router: IRouter = Router();

// GET /judge/projects
router.get(
  "/judge/projects",
  authenticate,
  authorize("judge", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathons = await Hackathon.find({ judges: req.user!._id });
    const hackathonIds = hackathons.map((h) => h._id);

    const filter: Record<string, unknown> = { hackathonId: { $in: hackathonIds } };
    if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;

    const projects = await Project.find(filter).populate("teamId", "name");
    const withScores = await Promise.all(
      projects.map(async (p) => {
        const myScore = await Score.findOne({ projectId: p._id, judgeId: req.user!._id });
        const scores = await Score.find({ projectId: p._id });
        const avg = scores.length ? scores.reduce((a, s) => a + s.total, 0) / scores.length : null;
        return { ...p.toObject(), scores, averageScore: avg, myScore };
      }),
    );
    res.json(withScores);
  },
);

// POST /judge/projects/:id/score
router.post(
  "/judge/projects/:id/score",
  authenticate,
  authorize("judge", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const isAssigned = await Hackathon.exists({ _id: project.hackathonId, judges: req.user!._id });
    if (!isAssigned) {
      res.status(403).json({ error: "This project is not assigned to you" });
      return;
    }

    const { innovation, techComplexity, uiux, impact, presentation, comments } = req.body;
    const values = [innovation, techComplexity, uiux, impact, presentation];
    if (!values.every((value) => Number.isFinite(value) && value >= 1 && value <= 10)) {
      res.status(400).json({ error: "Each score must be a number from 1 to 10" });
      return;
    }
    const total = (innovation + techComplexity + uiux + impact + presentation) / 5;

    const score = await Score.findOneAndUpdate(
      { projectId: project._id, judgeId: req.user!._id },
      {
        $set: {
          hackathonId: project.hackathonId,
          innovation,
          techComplexity,
          uiux,
          impact,
          presentation,
          total,
          comments,
        },
      },
      { upsert: true, new: true },
    );

    await Project.findByIdAndUpdate(project._id, { status: "reviewed" });
    await delCache(`leaderboard:${project.hackathonId.toString()}`);
    res.json(score);
  },
);

// GET /judge/results
router.get(
  "/judge/results",
  authenticate,
  authorize("judge", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const filter: Record<string, unknown> = { judgeId: req.user!._id };
    if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;
    const scores = await Score.find(filter).populate("projectId", "title");
    res.json(scores);
  },
);

export default router;
