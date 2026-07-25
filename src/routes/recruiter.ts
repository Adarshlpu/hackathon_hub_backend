import { Router, type IRouter } from "express";
import { User } from "../models/User.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /recruiter/students
router.get(
  "/recruiter/students",
  authenticate,
  authorize("recruiter", "super_admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { role: "student" };
    if (req.query.skills) {
      const skills = String(req.query.skills).split(",").map((s) => s.trim());
      filter["profile.skills"] = { $in: skills };
    }
    if (req.query.search && typeof req.query.search === "string") {
      const s = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim().slice(0, 100);
      if (s.length > 0) {
        filter.$or = [{ name: { $regex: s, $options: "i" } }, { email: { $regex: s, $options: "i" } }];
      }
    }

    const [students, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    res.json({ students, total, page, limit });
  },
);

// GET /recruiter/shortlist
router.get(
  "/recruiter/shortlist",
  authenticate,
  authorize("recruiter", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const users = await User.find({ shortlistedBy: req.user!._id });
    res.json(users);
  },
);

// POST /recruiter/shortlist/:userId
router.post(
  "/recruiter/shortlist/:userId",
  authenticate,
  authorize("recruiter", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const candidate = await User.findOneAndUpdate({ _id: req.params.userId, role: "student" }, {
      $addToSet: { shortlistedBy: req.user!._id },
    }, { new: true });
    if (!candidate) { res.status(404).json({ error: "Student not found" }); return; }
    res.json({ message: "Candidate shortlisted" });
  },
);

// DELETE /recruiter/shortlist/:userId
router.delete(
  "/recruiter/shortlist/:userId",
  authenticate,
  authorize("recruiter", "super_admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const candidate = await User.findOneAndUpdate({ _id: req.params.userId, role: "student" }, {
      $pull: { shortlistedBy: req.user!._id },
    }, { new: true });
    if (!candidate) { res.status(404).json({ error: "Student not found" }); return; }
    res.json({ message: "Candidate removed from shortlist" });
  },
);

export default router;
