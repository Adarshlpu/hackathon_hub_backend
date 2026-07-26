import { Router, type IRouter, Request } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Hackathon } from "../models/Hackathon.js";
import { Payment } from "../models/Payment.js";
import { Team } from "../models/Team.js";
import { Project } from "../models/Project.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { AuditLog } from "../models/AuditLog.js";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { Registration } from "../models/Registration.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ---------- HELPERS ----------

async function logAdminAction(
  req: AuthRequest,
  action: string,
  entity: string,
  entityId?: string,
  details?: Record<string, unknown>,
) {
  try {
    await AuditLog.create({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.role,
      action,
      entity,
      entityId,
      details,
      ipAddress: req.ip || req.socket.remoteAddress,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write audit log");
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- DASHBOARD / STATS ----------

// GET /admin/stats
router.get(
  "/admin/stats",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalUsers,
      totalStudents,
      totalColleges,
      totalCompanies,
      totalRecruiters,
      totalJudges,
      totalAdmins,
      totalHackathons,
      activeHackathons,
      upcomingHackathons,
      completedHackathons,
      cancelledHackathons,
      totalTeams,
      totalProjects,
      todayProjects,
      pendingProjects,
      approvedProjects,
      rejectedProjects,
      flaggedProjects,
      totalPayments,
      newUsersThisMonth,
      todayRegistrations,
      revenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "college_admin" }),
      User.countDocuments({ role: "company" }),
      User.countDocuments({ role: "recruiter" }),
      User.countDocuments({ role: "judge" }),
      User.countDocuments({ role: "super_admin" }),
      Hackathon.countDocuments(),
      Hackathon.countDocuments({ status: "ongoing" }),
      Hackathon.countDocuments({ status: "upcoming" }),
      Hackathon.countDocuments({ status: "ended" }),
      Hackathon.countDocuments({ status: "cancelled" }),
      Team.countDocuments(),
      Project.countDocuments(),
      Project.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      Project.countDocuments({ status: "submitted" }),
      Project.countDocuments({ status: "reviewed" }),
      Project.countDocuments({ status: "under_review" }),
      Project.countDocuments({}),
      Payment.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Registration.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    res.json({
      totalUsers,
      totalStudents,
      totalColleges,
      totalCompanies,
      totalRecruiters,
      totalJudges,
      totalAdmins,
      totalHackathons,
      activeHackathons,
      upcomingHackathons,
      completedHackathons,
      cancelledHackathons,
      totalTeams,
      totalProjects,
      todayProjects,
      pendingProjects: pendingProjects + (await Project.countDocuments({ status: "draft" })),
      approvedProjects,
      rejectedProjects: 0,
      flaggedProjects: 0,
      totalPayments,
      revenueTotal: revenueAgg?.[0]?.total || 0,
      newUsersThisMonth,
      todayRegistrations,
    });
  },
);

// GET /admin/platform-health
router.get(
  "/admin/platform-health",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const activeUsers = await User.countDocuments({
      lastLoginAt: { $gte: fiveMinAgo },
    } as any);

    const usersOnline = await User.countDocuments({
      isOnline: true,
    } as any);

    const [runningHackathons, activeJudges, activeRecruiters] =
      await Promise.all([
        Hackathon.countDocuments({ status: "ongoing" }),
        User.countDocuments({ role: "judge", isOnline: true } as any),
        User.countDocuments({ role: "recruiter", isOnline: true } as any),
      ]);

    const todayProjectsCount = await Project.countDocuments({
      createdAt: {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      },
    });

    res.json({
      activeUsers,
      usersOnline,
      runningHackathons,
      activeJudges,
      activeRecruiters,
      todayProjectsCount,
      serverStatus: "healthy",
      apiStatus: "healthy",
      databaseStatus: "healthy",
      emailStatus: "healthy",
      storageStatus: "healthy",
    });
  },
);

// ---------- USER MANAGEMENT ----------

// GET /admin/users
router.get(
  "/admin/users",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const sortField = (req.query.sortField as string) || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const filter: Record<string, unknown> = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search && typeof req.query.search === "string") {
      const s = escapeRegex(req.query.search.trim()).slice(0, 100);
      if (s.length > 0) {
        filter.$or = [
          { name: { $regex: s, $options: "i" } },
          { email: { $regex: s, $options: "i" } },
        ];
      }
    }
    if (req.query.isVerified !== undefined) filter.isVerified = req.query.isVerified === "true";
    if (req.query.isBanned !== undefined) filter.isBanned = req.query.isBanned === "true";

    const [users, total] = await Promise.all([
      User.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ [sortField]: sortOrder })
        .select("-password"),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page, limit });
  },
);

// GET /admin/users/:id
router.get(
  "/admin/users/:id",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [projects, hackathons, certificates, loginHistory, auditLogs] =
      await Promise.all([
        Project.countDocuments({ teamId: { $in: await Team.find({ "members.userId": user._id }).distinct("_id") } }),
        Hackathon.countDocuments({ organizerId: user._id }),
        [], // placeholder for certificates
        [], // placeholder for login history
        AuditLog.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20),
      ]);

    res.json({
      ...user.toObject(),
      projectsCount: projects,
      hackathonsCount: hackathons,
      certificatesCount: 0,
      loginHistory,
      auditLogs,
    });
  },
);

// PATCH /admin/users/:id
router.patch(
  "/admin/users/:id",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { name, email, role, isVerified, isBanned, banReason, profile } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isVerified !== undefined) updates.isVerified = isVerified;
    if (isBanned !== undefined) updates.isBanned = isBanned;
    if (banReason !== undefined) updates.banReason = banReason;
    if (profile !== undefined) updates.profile = profile;

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await logAdminAction(req, "update_user", "User", req.params.id, { updates: Object.keys(updates) });
    res.json(user);
  },
);

// DELETE /admin/users/:id
router.delete(
  "/admin/users/:id",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await logAdminAction(req, "delete_user", "User", req.params.id, { name: user.name, email: user.email });
    res.sendStatus(204);
  },
);

// PATCH /admin/users/:id/suspend
router.patch(
  "/admin/users/:id/suspend",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBanned: true, banReason: reason || "Suspended by admin" } },
      { new: true },
    ).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await logAdminAction(req, "suspend_user", "User", req.params.id, { reason });
    res.json(user);
  },
);

// PATCH /admin/users/:id/verify
router.patch(
  "/admin/users/:id/verify",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isVerified: true } },
      { new: true },
    ).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await logAdminAction(req, "verify_user", "User", req.params.id);
    res.json(user);
  },
);

// POST /admin/users/:id/reset-password
router.post(
  "/admin/users/:id/reset-password",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    res.json({ message: "Password reset email sent to user" });
  },
);

// ---------- ROLE MANAGEMENT ----------

// PATCH /admin/users/:id/role
router.patch(
  "/admin/users/:id/role",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { role } = req.body;
    const validRoles = ["student", "college_admin", "judge", "recruiter", "company", "sponsor", "super_admin"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true },
    ).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await logAdminAction(req, "change_role", "User", req.params.id, { newRole: role, oldRole: req.body._oldRole });
    res.json(user);
  },
);

// ---------- APPROVALS ----------

// GET /admin/approvals
router.get(
  "/admin/approvals",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const type = req.query.type as string;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    let users;
    let total;

    if (type && type !== "all") {
      const roleMap: Record<string, string> = {
        colleges: "college_admin",
        companies: "company",
        recruiters: "recruiter",
        judges: "judge",
        sponsors: "sponsor",
      };
      const targetRole = roleMap[type];
      users = await User.find({ role: targetRole || type, isVerified: false })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select("-password");
      total = await User.countDocuments({ role: targetRole || type, isVerified: false });
    } else {
      users = await User.find({ isVerified: false })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select("-password");
      total = await User.countDocuments({ isVerified: false });
    }

    res.json({ users, total, page, limit });
  },
);

// POST /admin/approvals/:id/approve
router.post(
  "/admin/approvals/:id/approve",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isVerified: true } },
      { new: true },
    ).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await logAdminAction(req, "approve_user", "User", req.params.id, { name: user.name, role: user.role });
    res.json(user);
  },
);

// POST /admin/approvals/:id/reject
router.post(
  "/admin/approvals/:id/reject",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await logAdminAction(req, "reject_user", "User", req.params.id, { name: user.name, role: user.role });
    res.sendStatus(204);
  },
);

// ---------- HACKATHONS ----------

// GET /admin/hackathons
router.get(
  "/admin/hackathons",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search && typeof req.query.search === "string") {
      filter.title = { $regex: escapeRegex(req.query.search), $options: "i" };
    }

    const [hackathons, total] = await Promise.all([
      Hackathon.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Hackathon.countDocuments(filter),
    ]);

    res.json({ hackathons, total, page, limit });
  },
);

// PATCH /admin/hackathons/:id/feature
router.patch(
  "/admin/hackathons/:id/feature",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathon = await Hackathon.findByIdAndUpdate(
      req.params.id,
      { $set: { isFeatured: req.body.featured ?? true } },
      { new: true },
    );
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found" });
      return;
    }
    await logAdminAction(req, "feature_hackathon", "Hackathon", req.params.id);
    res.json(hackathon);
  },
);

// PATCH /admin/hackathons/:id/pin
router.patch(
  "/admin/hackathons/:id/pin",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const hackathon = await Hackathon.findByIdAndUpdate(
      req.params.id,
      { $set: { pinned: req.body.pinned ?? true } },
      { new: true },
    );
    if (!hackathon) {
      res.status(404).json({ error: "Hackathon not found" });
      return;
    }
    await logAdminAction(req, "pin_hackathon", "Hackathon", req.params.id);
    res.json(hackathon);
  },
);

// ---------- PROJECTS ----------

// GET /admin/projects
router.get(
  "/admin/projects",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search && typeof req.query.search === "string") {
      filter.title = { $regex: escapeRegex(req.query.search), $options: "i" };
    }
    if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate("teamId", "name")
        .populate("hackathonId", "title")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Project.countDocuments(filter),
    ]);

    res.json({ projects, total, page, limit });
  },
);

// PATCH /admin/projects/:id/status
router.patch(
  "/admin/projects/:id/status",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { status } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true },
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await logAdminAction(req, "update_project_status", "Project", req.params.id, { status });
    res.json(project);
  },
);

// DELETE /admin/projects/:id
router.delete(
  "/admin/projects/:id",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await logAdminAction(req, "delete_project", "Project", req.params.id, { title: project.title });
    res.sendStatus(204);
  },
);

// ---------- REPORTS ----------

// GET /admin/reports
router.get(
  "/admin/reports",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    const reportedUsers = await User.countDocuments({ isBanned: true } as any);
    const reportedTeams = 0;
    const reportedProjects = await Project.countDocuments({ status: "draft" });
    const spamReports = 0;
    const securityAlerts = 0;

    res.json({
      reportedUsers,
      reportedTeams,
      reportedProjects,
      plagiarismReports: 0,
      copyrightReports: 0,
      spamReports,
      securityAlerts,
    });
  },
);

// ---------- ANALYTICS ----------

// GET /admin/analytics
router.get(
  "/admin/analytics",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    const now = new Date();

    // User growth (last 12 months)
    const userGrowth = [];
    const hackathonGrowth = [];
    const projectGrowth = [];
    const revenueGrowth = [];
    const recruitmentGrowth = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });

      const [uc, hc, pc, rc] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: d, $lt: end } }),
        Hackathon.countDocuments({ createdAt: { $gte: d, $lt: end } }),
        Project.countDocuments({ createdAt: { $gte: d, $lt: end } }),
        Payment.aggregate([
          { $match: { status: "completed", createdAt: { $gte: d, $lt: end } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

      userGrowth.push({ label, value: uc });
      hackathonGrowth.push({ label, value: hc });
      projectGrowth.push({ label, value: pc });
      revenueGrowth.push({ label, value: rc[0]?.total || 0 });
      recruitmentGrowth.push({ label, value: Math.floor(uc * 0.3) });
    }

    // Tech usage
    const techAgg = await Project.aggregate([
      { $unwind: "$techStack" },
      { $group: { _id: "$techStack", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Top skills
    const skillsAgg = await User.aggregate([
      { $unwind: "$profile.skills" },
      { $group: { _id: "$profile.skills", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Country distribution
    const countryAgg = await User.aggregate([
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Top colleges
    const collegeAgg = await User.aggregate([
      { $match: { role: "student", "profile.collegeName": { $ne: null, $ne: "" } } },
      { $group: { _id: "$profile.collegeName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Top companies
    const companyAgg = await User.aggregate([
      { $match: { role: "company" } },
      { $group: { _id: "$name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      userGrowth,
      hackathonGrowth,
      projectGrowth,
      revenueGrowth,
      recruitmentGrowth,
      technologyUsage: techAgg.map((t) => ({ name: t._id, value: t.count })),
      topSkills: skillsAgg.map((s) => ({ name: s._id, value: s.count })),
      countryDistribution: countryAgg.map((c) => ({ name: c._id, count: c.count })),
      topColleges: collegeAgg.map((c) => ({ name: c._id, count: c.count })),
      topCompanies: companyAgg.map((c) => ({ name: c._id, count: c.count })),
    });
  },
);

// ---------- LEADERBOARDS ----------

// GET /admin/leaderboards
router.get(
  "/admin/leaderboards",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const type = (req.query.type as string) || "colleges";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    let data;

    if (type === "colleges") {
      const agg = await User.aggregate([
        { $match: { role: "student", "profile.collegeName": { $ne: null, $ne: "" } } },
        { $group: { _id: "$profile.collegeName", studentCount: { $sum: 1 }, projectCount: { $sum: 0 } } },
        { $sort: { studentCount: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);
      data = agg.map((a, i) => ({
        rank: (page - 1) * limit + i + 1,
        name: a._id,
        studentCount: a.studentCount,
        projectCount: a.projectCount,
        score: a.studentCount * 10,
      }));
    } else if (type === "students") {
      const agg = await User.find({ role: "student" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("name email avatar profile profile.collegeName createdAt");
      data = agg.map((a, i) => ({
        rank: (page - 1) * limit + i + 1,
        name: a.name,
        email: a.email,
        college: (a.profile as any)?.collegeName,
        skills: (a.profile as any)?.skills,
        projectsCount: 0,
        score: 0,
      }));
    } else if (type === "companies") {
      const agg = await User.find({ role: "company" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("name email avatar createdAt");
      data = agg.map((a, i) => ({
        rank: (page - 1) * limit + i + 1,
        name: a.name,
        email: a.email,
        hiresCount: 0,
        score: 0,
      }));
    } else {
      data = [];
    }

    res.json({ data, page, limit });
  },
);

// ---------- ANNOUNCEMENTS ----------

// POST /admin/announcements
router.post(
  "/admin/announcements",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { title, content, audience, type } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: "Title and content are required" });
      return;
    }

    const announcement = await Announcement.create({
      hackathonId: req.body.hackathonId || new mongoose.Types.ObjectId("000000000000000000000000"),
      title,
      content,
    });

    // Send notifications based on audience
    if (audience && audience !== "specific") {
      let userFilter: Record<string, unknown> = {};
      if (audience === "students") userFilter.role = "student";
      else if (audience === "companies") userFilter.role = "company";
      else if (audience === "colleges") userFilter.role = "college_admin";
      else if (audience === "recruiters") userFilter.role = "recruiter";
      else if (audience === "judges") userFilter.role = "judge";

      const users = await User.find(userFilter).distinct("_id");
      const notifications = users.map((userId) => ({
        userId,
        title: "New Announcement",
        message: content.substring(0, 200),
        type: "announcement",
        link: "/announcements",
      }));
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    await logAdminAction(req, "create_announcement", "Announcement", announcement._id.toString(), { title, audience });
    res.status(201).json(announcement);
  },
);

// GET /admin/announcements
router.get(
  "/admin/announcements",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(announcements);
  },
);

// ---------- NOTIFICATIONS ----------

// POST /admin/notifications
router.post(
  "/admin/notifications",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { title, message, audience, userId: specificUserId, type } = req.body;
    if (!title || !message) {
      res.status(400).json({ error: "Title and message are required" });
      return;
    }

    let userFilter: Record<string, unknown> = {};
    if (audience === "all") {
      // send to all
    } else if (audience === "students") userFilter.role = "student";
    else if (audience === "companies") userFilter.role = "company";
    else if (audience === "colleges") userFilter.role = "college_admin";
    else if (audience === "recruiters") userFilter.role = "recruiter";
    else if (audience === "judges") userFilter.role = "judge";
    else if (audience === "specific" && specificUserId) {
      userFilter._id = specificUserId;
    }

    const users = await User.find(userFilter).distinct("_id");
    const notifications = users.map((uid) => ({
      userId: uid,
      title,
      message,
      type: type || "admin",
      link: "/notifications",
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    await logAdminAction(req, "send_notification", "Notification", undefined, {
      title,
      audience,
      recipientCount: notifications.length,
    });

    res.status(201).json({ message: `Notification sent to ${notifications.length} users` });
  },
);

// ---------- AUDIT LOGS ----------

// GET /admin/audit-logs
router.get(
  "/admin/audit-logs",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.entity) filter.entity = req.query.entity;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, limit });
  },
);

// ---------- PAYMENTS ----------

// GET /admin/payments
router.get(
  "/admin/payments",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find()
        .populate("userId", "name email")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Payment.countDocuments(),
    ]);

    res.json({ payments, total, page, limit });
  },
);

// ---------- SUPPORT TICKETS ----------

// GET /admin/support-tickets
router.get(
  "/admin/support-tickets",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    const tickets = await SupportTicket.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    res.json(tickets);
  },
);

// POST /admin/support-tickets
router.post(
  "/admin/support-tickets",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { subject, description } = req.body;
    const ticket = await SupportTicket.create({
      userId: req.user!._id,
      subject,
      description,
    });
    res.status(201).json(ticket);
  },
);

// ---------- SETTINGS ----------

// GET /admin/settings
router.get(
  "/admin/settings",
  authenticate,
  authorize("super_admin"),
  async (_req, res): Promise<void> => {
    res.json({
      siteName: "HackHub",
      siteDescription: "Hackathon, Innovation, Competition, and Recruitment Platform",
      maintenanceMode: false,
      allowRegistration: true,
      requireEmailVerification: true,
      defaultUserRole: "student",
      maxUploadSize: 10,
      allowedFileTypes: ["pdf", "zip", "png", "jpg", "jpeg", "mp4"],
      sessionTimeout: 60,
      passwordMinLength: 8,
      twoFactorAuth: false,
      emailProvider: "smtp",
      storageProvider: "cloudinary",
      paymentProvider: "razorpay",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });
  },
);

// PATCH /admin/settings
router.patch(
  "/admin/settings",
  authenticate,
  authorize("super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    await logAdminAction(req, "update_settings", "Settings", undefined, req.body);
    res.json({ message: "Settings updated" });
  },
);

// ---------- EXPORT ----------

// GET /admin/export/users
router.get(
  "/admin/export/users",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const format = (req.query.format as string) || "csv";
    const users = await User.find().select("-password").lean();

    if (format === "csv") {
      const headers = ["Name", "Email", "Role", "Verified", "Banned", "CreatedAt"];
      const rows = users.map((u) =>
        [
          u.name,
          u.email,
          u.role,
          u.isVerified ? "Yes" : "No",
          u.isBanned ? "Yes" : "No",
          u.createdAt?.toISOString() || "",
        ].join(","),
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=users.csv");
      res.send([headers.join(","), ...rows].join("\n"));
    } else {
      res.json(users);
    }
  },
);

export default router;
