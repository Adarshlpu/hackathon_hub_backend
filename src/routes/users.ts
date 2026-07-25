import { Router, type IRouter } from "express";
import { User } from "../models/User.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /users — admin only
router.get("/users", authenticate, authorize("super_admin"), async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    const s = String(req.query.search);
    filter.$or = [{ name: { $regex: s, $options: "i" } }, { email: { $regex: s, $options: "i" } }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  res.json({ users, total, page, limit });
});

// GET /users/:id
router.get("/users/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// PATCH /users/:id
router.patch("/users/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { id } = req.params;
  if (req.user!._id.toString() !== id && req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, avatar } = req.body;
  const user = await User.findByIdAndUpdate(
    id,
    { $set: { ...(name && { name }), ...(avatar && { avatar }) } },
    { new: true },
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// DELETE /users/:id
router.delete(
  "/users/:id",
  authenticate,
  authorize("super_admin"),
  async (req, res): Promise<void> => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.sendStatus(204);
  },
);

// PATCH /users/:id/profile
router.patch("/users/:id/profile", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { id } = req.params;
  if (req.user!._id.toString() !== id && req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { bio, github, linkedin, portfolio, skills, collegeName, resumeUrl } = req.body;
  const user = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        "profile.bio": bio,
        "profile.github": github,
        "profile.linkedin": linkedin,
        "profile.portfolio": portfolio,
        "profile.skills": skills,
        "profile.collegeName": collegeName,
        "profile.resumeUrl": resumeUrl,
      },
    },
    { new: true },
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
