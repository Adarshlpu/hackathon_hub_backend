import { Router, type IRouter } from "express";
import { CompanySponsorProfile } from "../models/CompanySponsorProfile.js";
import { Payment } from "../models/Payment.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

async function getProfile(req: AuthRequest) {
  return CompanySponsorProfile.findOneAndUpdate(
    { userId: req.user!._id },
    { $setOnInsert: { userId: req.user!._id, companyName: req.user!.name, tier: "silver" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

router.get("/company/dashboard", authenticate, authorize("company"), async (req: AuthRequest, res): Promise<void> => {
  const profile = await getProfile(req);
  res.json({ profile, sponsoredHackathons: profile.sponsoredEvents.length, challenges: profile.challenges });
});

router.post("/company/challenges", authenticate, authorize("company"), async (req: AuthRequest, res): Promise<void> => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const prizePool = typeof req.body.prizePool === "string" ? req.body.prizePool.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  if (title.length < 3 || prizePool.length === 0) {
    res.status(400).json({ error: "A challenge title and prize details are required" });
    return;
  }
  const profile = await getProfile(req);
  profile.challenges.push({ title, prizePool, description: description || "Details to be shared by the company", tags: [], createdAt: new Date() });
  await profile.save();
  res.status(201).json(profile.challenges[profile.challenges.length - 1]);
});

router.get("/sponsor/dashboard", authenticate, authorize("sponsor"), async (req: AuthRequest, res): Promise<void> => {
  const [profile, payments] = await Promise.all([
    getProfile(req),
    Payment.find({ userId: req.user!._id }).sort({ createdAt: -1 }),
  ]);
  const totalPaid = payments.filter((payment) => payment.status === "completed").reduce((total, payment) => total + payment.amount, 0);
  res.json({ profile, payments, totalPaid, sponsoredHackathons: profile.sponsoredEvents.length });
});

router.patch("/sponsor/profile", authenticate, authorize("sponsor"), async (req: AuthRequest, res): Promise<void> => {
  const logoUrl = typeof req.body.logoUrl === "string" ? req.body.logoUrl : undefined;
  if (!logoUrl) {
    res.status(400).json({ error: "A logo is required" });
    return;
  }
  const profile = await getProfile(req);
  profile.logoUrl = logoUrl;
  await profile.save();
  res.json(profile);
});

export default router;
