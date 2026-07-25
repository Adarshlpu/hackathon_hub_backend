import { Router, type IRouter } from "express";
import { Hackathon } from "../models/Hackathon.js";
import { Registration } from "../models/Registration.js";
import { Team } from "../models/Team.js";
import { Project } from "../models/Project.js";
import { Certificate } from "../models/Certificate.js";
import { Notification } from "../models/Notification.js";
import { Score } from "../models/Score.js";
import { Feedback } from "../models/Feedback.js";
import { User } from "../models/User.js";
import { Payment } from "../models/Payment.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { getCache, setCache, delCacheByPrefix } from "../lib/redis.js";

const router: IRouter = Router();

// GET /dashboard/student
router.get(
  "/dashboard/student",
  authenticate,
  authorize("student", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const userId = req.user!._id;
    const cacheKey = `dashboard:student:${userId}`;
    const cached = await getCache<Record<string, unknown>>(cacheKey);
    if (cached) { res.json(cached); return; }

    const [registrations, teams, submissions, certificates, notifications, upcoming] =
      await Promise.all([
        Registration.countDocuments({ userId }),
        Team.countDocuments({ "members.userId": userId }),
        Project.countDocuments({ "teamId": { $in: await Team.find({ "members.userId": userId }).distinct("_id") } }),
        Certificate.countDocuments({ userId }),
        Notification.countDocuments({ userId, isRead: false }),
        Hackathon.find({ status: { $in: ["upcoming", "ongoing"] } })
          .limit(5)
          .sort({ startDate: 1 }),
      ]);

    const recentActivity = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(5);

    const result = {
      registeredHackathons: registrations,
      myTeams: teams,
      submissions,
      certificates,
      notifications,
      upcomingHackathons: upcoming,
      recentActivity: recentActivity.map((n) => ({
        type: n.type,
        message: n.message,
        link: n.link,
        createdAt: n.createdAt,
      })),
    };

    await setCache(cacheKey, result, 30);
    res.json(result);
  },
);

// GET /dashboard/college-admin
router.get(
  "/dashboard/college-admin",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const organizerId = req.user!._id;
    const hackathonIds = await Hackathon.find({ organizerId }).distinct("_id");

    const [total, active, registrations, teams, recentHackathons] = await Promise.all([
      Hackathon.countDocuments({ organizerId }),
      Hackathon.countDocuments({ organizerId, status: { $in: ["upcoming", "ongoing"] } }),
      Registration.countDocuments({ hackathonId: { $in: hackathonIds } }),
      Team.countDocuments({ hackathonId: { $in: hackathonIds } }),
      Hackathon.find({ organizerId }).sort({ createdAt: -1 }).limit(5),
    ]);

    // Build registration trend (last 6 months)
    const now = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = await Registration.countDocuments({
        hackathonId: { $in: hackathonIds },
        createdAt: { $gte: d, $lt: end },
      });
      trend.push({
        label: d.toLocaleString("default", { month: "short", year: "2-digit" }),
        value: count,
      });
    }

    res.json({
      totalHackathons: total,
      activeHackathons: active,
      totalRegistrations: registrations,
      totalTeams: teams,
      recentHackathons,
      registrationTrend: trend,
    });
  },
);

// GET /dashboard/judge
router.get(
  "/dashboard/judge",
  authenticate,
  authorize("judge", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathons = await Hackathon.find({ judges: req.user!._id });
    const hackathonIds = hackathons.map((h) => h._id);
    const allProjects = await Project.find({ hackathonId: { $in: hackathonIds } });
    const scored = await Score.find({ judgeId: req.user!._id });
    const scoredIds = new Set(scored.map((s) => s.projectId.toString()));

    res.json({
      assignedProjects: allProjects.length,
      scoredProjects: scoredIds.size,
      pendingProjects: allProjects.filter((p) => !scoredIds.has(p._id.toString())).length,
      recentProjects: allProjects.slice(0, 5),
    });
  },
);

// GET /dashboard/mentor
router.get(
  "/dashboard/mentor",
  authenticate,
  authorize("mentor", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathons = await Hackathon.find({ mentors: req.user!._id });
    const hackathonIds = hackathons.map((h) => h._id);
    const [teams, feedbackCount] = await Promise.all([
      Team.find({ hackathonId: { $in: hackathonIds } }).populate("members.userId", "name avatar"),
      Feedback.countDocuments({ mentorId: req.user!._id }),
    ]);

    res.json({
      assignedTeams: teams.length,
      feedbackGiven: feedbackCount,
      teams,
    });
  },
);

// GET /dashboard/recruiter
router.get(
  "/dashboard/recruiter",
  authenticate,
  authorize("recruiter", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const [shortlisted, totalStudents, topStudents] = await Promise.all([
      User.countDocuments({ shortlistedBy: req.user!._id }),
      User.countDocuments({ role: "student" }),
      User.find({ shortlistedBy: req.user!._id }).limit(5),
    ]);

    res.json({
      shortlisted,
      totalStudents,
      contactedCount: shortlisted,
      topStudents,
    });
  },
);

// GET /dashboard/admin
router.get(
  "/dashboard/admin",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const now = new Date();

    const [totalUsers, totalHackathons, activeHackathons, revenueAgg, recentUsers] =
      await Promise.all([
        User.countDocuments(),
        Hackathon.countDocuments(),
        Hackathon.countDocuments({ status: { $in: ["upcoming", "ongoing"] } }),
        Payment.aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        User.find().sort({ createdAt: -1 }).limit(5),
      ]);

    // User growth — last 6 months
    const userGrowth = [];
    const revenueBreakdown = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });

      const [uc, rev] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: d, $lt: end } }),
        Payment.aggregate([
          { $match: { status: "completed", createdAt: { $gte: d, $lt: end } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);
      userGrowth.push({ label, value: uc });
      revenueBreakdown.push({ label, value: rev[0]?.total || 0 });
    }

    res.json({
      totalUsers,
      totalHackathons,
      totalRevenue: revenueAgg[0]?.total || 0,
      activeHackathons,
      userGrowth,
      revenueBreakdown,
      recentUsers,
    });
  },
);

export default router;
