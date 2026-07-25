import { Router, type IRouter } from "express";
import { Certificate } from "../models/Certificate.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /certificates
router.get("/certificates", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const filter: Record<string, unknown> = {};
  if (req.query.userId) filter.userId = req.query.userId;
  else if (req.user!.role !== "super_admin" && req.user!.role !== "college_admin") {
    filter.userId = req.user!._id;
  }
  if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;

  const certs = await Certificate.find(filter)
    .populate("hackathonId", "title")
    .populate("userId", "name email")
    .sort({ issuedAt: -1 });
  res.json(certs);
});

// POST /certificates
router.post(
  "/certificates",
  authenticate,
  authorize("college_admin", "super_admin"),
  async (req, res): Promise<void> => {
    const { userId, hackathonId, type } = req.body;
    const existing = await Certificate.findOne({ userId, hackathonId, type });
    if (existing) {
      res.status(400).json({ error: "Certificate already issued" });
      return;
    }
    const cert = await Certificate.create({ userId, hackathonId, type });
    res.status(201).json(cert);
  },
);

// GET /certificates/verify/:code
router.get("/certificates/verify/:code", async (req, res): Promise<void> => {
  const cert = await Certificate.findOne({ verificationCode: req.params.code })
    .populate("userId", "name email avatar")
    .populate("hackathonId", "title startDate endDate");
  if (!cert) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }
  res.json(cert);
});

export default router;
