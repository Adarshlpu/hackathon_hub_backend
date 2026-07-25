import { Router, type IRouter } from "express";
import { Hackathon } from "../models/Hackathon.js";
import { Registration } from "../models/Registration.js";
import { Team } from "../models/Team.js";
import { Score } from "../models/Score.js";
import { Announcement } from "../models/Announcement.js";
import { Notification } from "../models/Notification.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { delCache, delCacheByPrefix, getCache, setCache } from "../lib/redis.js";

const router: IRouter = Router();

// GET /hackathons
router.get("/hackathons", async (req, res): Promise<void> => {
  const cacheKey = `hackathons:${JSON.stringify(req.query)}`;
  const cached = await getCache<{ hackathons: unknown[]; total: number; page: number; limit: number }>(cacheKey);
  if (cached) { res.json(cached); return; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 12);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.theme) filter.themes = req.query.theme;
  if (req.query.search) {
    filter.$text = { $search: String(req.query.search) };
  }
  if (req.query.organizerId) filter.organizerId = String(req.query.organizerId);

  const [hackathons, total] = await Promise.all([
    Hackathon.find(filter).skip(skip).limit(limit).sort({ startDate: -1 }),
    Hackathon.countDocuments(filter),
  ]);

  const response = { hackathons, total, page, limit };
  await setCache(cacheKey, response, 60);
  res.json(response);
});

// POST /hackathons
router.post(
  "/hackathons",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { title, startDate, endDate, registrationDeadline, maxTeamSize, minTeamSize } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const deadline = registrationDeadline ? new Date(registrationDeadline) : null;
    if (typeof title !== "string" || title.trim().length < 3 || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      res.status(400).json({ error: "Provide a title and valid event start and end dates" });
      return;
    }
    if (deadline && (Number.isNaN(deadline.getTime()) || deadline > start)) {
      res.status(400).json({ error: "Registration must close on or before the event start date" });
      return;
    }
    if ((maxTeamSize !== undefined && (!Number.isInteger(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 10)) ||
        (minTeamSize !== undefined && (!Number.isInteger(minTeamSize) || minTeamSize < 1 || minTeamSize > (maxTeamSize ?? 4)))) {
      res.status(400).json({ error: "Provide a valid team-size range" });
      return;
    }
    const hackathon = await Hackathon.create({
      ...req.body,
      title: title.trim(),
      status: "upcoming",
      organizerId: req.user!._id,
    });
    await delCacheByPrefix("hackathons:");
    res.status(201).json(hackathon);
  },
);

// GET /hackathons/:id
router.get("/hackathons/:id", async (req, res): Promise<void> => {
  const hackathon = await Hackathon.findById(req.params.id);
  if (!hackathon) {
    res.status(404).json({ error: "Hackathon not found" });
    return;
  }
  res.json(hackathon);
});

// PATCH /hackathons/:id
router.patch(
  "/hackathons/:id",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const ownershipFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    const hackathon = await Hackathon.findOneAndUpdate(
      ownershipFilter,
      { $set: req.body },
      { new: true },
    );
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found or unauthorized" });
      return;
    }
    await delCacheByPrefix("hackathons:");
    await delCache(`leaderboard:${req.params.id}`);
    res.json(hackathon);
  },
);

// DELETE /hackathons/:id
router.delete(
  "/hackathons/:id",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const ownershipFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    const hackathon = await Hackathon.findOneAndDelete(ownershipFilter);
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found or unauthorized" });
      return;
    }
    await delCacheByPrefix("hackathons:");
    await delCache(`leaderboard:${req.params.id}`);
    res.sendStatus(204);
  },
);

// POST /hackathons/:id/register
router.post("/hackathons/:id/register", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user!.role !== "student") {
    res.status(403).json({ error: "Only students can register for hackathons" });
    return;
  }
  const hackathon = await Hackathon.findById(req.params.id);
  if (!hackathon) {
    res.status(404).json({ error: "Hackathon not found" });
    return;
  }
  if (hackathon.status !== "upcoming" || (hackathon.registrationDeadline && hackathon.registrationDeadline < new Date())) {
    res.status(400).json({ error: "Registration is closed for this hackathon" });
    return;
  }

  const existing = await Registration.findOne({
    hackathonId: hackathon._id,
    userId: req.user!._id,
  });
  if (existing) {
    res.status(400).json({ error: "Already registered" });
    return;
  }

  const registration = await Registration.create({
    hackathonId: hackathon._id,
    userId: req.user!._id,
    teamId: req.body.teamId,
  });

  await Hackathon.findByIdAndUpdate(hackathon._id, { $inc: { registrationCount: 1 } });

  res.status(201).json(registration);
});

// GET /hackathons/:id/registrations
router.get(
  "/hackathons/:id/registrations",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const organizerFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    if (!await Hackathon.exists(organizerFilter)) { res.status(404).json({ error: "Hackathon not found or unauthorized" }); return; }
    const registrations = await Registration.find({ hackathonId: req.params.id }).populate(
      "userId",
      "name email avatar role profile",
    );
    res.json(registrations);
  },
);

// POST /hackathons/:id/announce
router.post(
  "/hackathons/:id/announce",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const organizerFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    const hackathon = await Hackathon.findOne(organizerFilter);
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found" });
      return;
    }

    const announcement = await Announcement.create({
      hackathonId: hackathon._id,
      title: req.body.title,
      content: req.body.content,
    });

    res.status(201).json(announcement);
  },
);

// GET /hackathons/:id/announcements
router.get("/hackathons/:id/announcements", async (req, res): Promise<void> => {
  const announcements = await Announcement.find({ hackathonId: req.params.id }).sort({
    createdAt: -1,
  });
  res.json(announcements);
});

// POST /hackathons/:id/judges
router.post(
  "/hackathons/:id/judges",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const organizerFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    const hackathon = await Hackathon.findOneAndUpdate(
      organizerFilter,
      { $addToSet: { judges: req.body.userId } },
      { new: true },
    );
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found" });
      return;
    }
    res.json(hackathon);
  },
);

// POST /hackathons/:id/mentors
router.post(
  "/hackathons/:id/mentors",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const organizerFilter = req.user!.role === "super_admin" ? { _id: req.params.id } : { _id: req.params.id, organizerId: req.user!._id };
    const hackathon = await Hackathon.findOneAndUpdate(
      organizerFilter,
      { $addToSet: { mentors: req.body.userId } },
      { new: true },
    );
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found" });
      return;
    }
    res.json(hackathon);
  },
);

// GET /hackathons/:id/leaderboard
router.get("/hackathons/:id/leaderboard", async (req, res): Promise<void> => {
  const cacheKey = `leaderboard:${req.params.id}`;
  const cached = await getCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }
  const scores = await Score.aggregate([
    { $match: { hackathonId: new (await import("mongoose")).default.Types.ObjectId(req.params.id) } },
    { $group: { _id: "$projectId", totalScore: { $avg: "$total" } } },
    { $sort: { totalScore: -1 } },
    { $limit: 20 },
  ]);

  const leaderboard = await Promise.all(
    scores.map(async (s, i) => {
      const { Project } = await import("../models/Project.js");
      const project = await Project.findById(s._id).populate("teamId", "name");
      return {
        rank: i + 1,
        teamId: (project?.teamId as unknown as { _id: string })._id?.toString() ?? "",
        teamName: (project?.teamId as unknown as { name: string })?.name ?? "Unknown",
        totalScore: s.totalScore,
        projectTitle: project?.title,
      };
    }),
  );

  await setCache(cacheKey, leaderboard, 60);
  res.json(leaderboard);
});

export default router;
