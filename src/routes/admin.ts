import { Router, type IRouter } from "express";
import { User } from "../models/User.js";
import { Hackathon } from "../models/Hackathon.js";
import { Payment } from "../models/Payment.js";
import { Team } from "../models/Team.js";
import { Project } from "../models/Project.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /admin/stats
router.get(
  "/admin/stats",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalHackathons,
      activeHackathons,
      totalTeams,
      totalProjects,
      totalPayments,
      newUsersThisMonth,
      revenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      Hackathon.countDocuments(),
      Hackathon.countDocuments({ status: { $in: ["upcoming", "ongoing"] } }),
      Team.countDocuments(),
      Project.countDocuments(),
      Payment.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    res.json({
      totalUsers,
      totalHackathons,
      activeHackathons,
      totalTeams,
      totalProjects,
      totalPayments,
      revenueTotal: revenueAgg[0]?.total || 0,
      newUsersThisMonth,
    });
  },
);

// PATCH /admin/users/:id/role
router.patch(
  "/admin/users/:id/role",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  },
);

// PATCH /admin/users/:id/ban
router.patch(
  "/admin/users/:id/ban",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const { isBanned, reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBanned, banReason: reason } },
      { new: true },
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  },
);

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

// GET /admin/support-tickets
router.get(
  "/admin/support-tickets",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const tickets = await SupportTicket.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    res.json(tickets);
  },
);

// POST /admin/support-tickets
router.post("/admin/support-tickets", authenticate, async (req, res): Promise<void> => {
  const { subject, description } = req.body;
  const ticket = await SupportTicket.create({
    userId: (req as import("../middlewares/auth.js").AuthRequest).user?._id,
    subject,
    description,
  });
  res.status(201).json(ticket);
});

export default router;
