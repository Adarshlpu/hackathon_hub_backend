import { Router, type IRouter } from "express";
import { Hackathon } from "../models/Hackathon.js";
import { Team } from "../models/Team.js";
import { Feedback } from "../models/Feedback.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /mentor/teams
router.get(
  "/mentor/teams",
  authenticate,
  authorize("mentor", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathons = await Hackathon.find({ mentors: req.user!._id });
    const hackathonIds = hackathons.map((h) => h._id);
    const teams = await Team.find({ hackathonId: { $in: hackathonIds } }).populate(
      "members.userId",
      "name email avatar",
    );
    res.json(teams);
  },
);

// POST /mentor/feedback
router.post(
  "/mentor/feedback",
  authenticate,
  authorize("mentor", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { teamId, content } = req.body;
    if (!teamId || !content) {
      res.status(400).json({ error: "teamId and content required" });
      return;
    }
    const assigned = await Team.exists({ _id: teamId, hackathonId: { $in: (await Hackathon.find({ mentors: req.user!._id }).distinct("_id")) } });
    if (!assigned) {
      res.status(403).json({ error: "This team is not assigned to you" });
      return;
    }
    const feedback = await Feedback.create({
      mentorId: req.user!._id,
      teamId,
      content,
    });
    res.status(201).json(feedback);
  },
);

// GET /mentor/feedback/:teamId
router.get(
  "/mentor/feedback/:teamId",
  authenticate,
  authorize("mentor", "super_admin", "student", "college_admin"),
  async (req, res): Promise<void> => {
    const feedbacks = await Feedback.find({ teamId: req.params.teamId })
      .populate("mentorId", "name avatar")
      .sort({ createdAt: -1 });
    res.json(feedbacks);
  },
);

export default router;
