import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { Team } from "../models/Team.js";
import { Hackathon } from "../models/Hackathon.js";
import { Registration } from "../models/Registration.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router: IRouter = Router();

// GET /teams
router.get("/teams", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const filter: Record<string, unknown> = {};
  if (req.query.hackathonId) filter.hackathonId = req.query.hackathonId;
  if (req.user!.role === "student") filter["members.userId"] = req.user!._id;
  const teams = await Team.find(filter).populate("leaderId", "name email avatar");
  res.json(teams);
});

// POST /teams
router.post("/teams", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user!.role !== "student") { res.status(403).json({ error: "Only students can create teams" }); return; }
  const { name, hackathonId, maxSize } = req.body;
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Team name must be at least 2 characters" });
    return;
  }
  if (typeof hackathonId !== "string" || !mongoose.isValidObjectId(hackathonId)) {
    res.status(400).json({ error: "Select a valid hackathon" });
    return;
  }

  const hackathon = await Hackathon.findById(hackathonId).select("status maxTeamSize");
  if (!hackathon || !["upcoming", "ongoing"].includes(hackathon.status)) {
    res.status(400).json({ error: "This hackathon is not available for team creation" });
    return;
  }
  if (!await Registration.exists({ hackathonId, userId: req.user!._id })) { res.status(403).json({ error: "Register for this hackathon before creating a team" }); return; }

  const requestedSize = Number(maxSize) || hackathon.maxTeamSize;
  if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > hackathon.maxTeamSize) {
    res.status(400).json({ error: `Team size must be between 1 and ${hackathon.maxTeamSize}` });
    return;
  }

  const team = await Team.create({
    name: name.trim(),
    hackathonId,
    leaderId: req.user!._id,
    maxSize: requestedSize,
    members: [{ userId: req.user!._id, role: "leader", joinedAt: new Date() }],
  });
  res.status(201).json(team);
});

// GET /teams/:id
router.get("/teams/:id", authenticate, async (req, res): Promise<void> => {
  const team = await Team.findById(req.params.id)
    .populate("leaderId", "name email avatar")
    .populate("members.userId", "name email avatar");
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const user = (req as AuthRequest).user!;
  const isMember = team.members.some((member) => member.userId.toString() === user._id.toString());
  if (user.role === "student" && !isMember) { res.status(403).json({ error: "You do not have access to this team" }); return; }
  res.json(team);
});

// PATCH /teams/:id
router.patch("/teams/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOne({ _id: req.params.id, leaderId: req.user!._id });
  if (!team) {
    res.status(404).json({ error: "Team not found or unauthorized" });
    return;
  }
  const { name, maxSize } = req.body;
  if (name) team.name = name;
  if (maxSize) team.maxSize = maxSize;
  await team.save();
  res.json(team);
});

// DELETE /teams/:id
router.delete("/teams/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOneAndDelete({ _id: req.params.id, leaderId: req.user!._id });
  if (!team) {
    res.status(404).json({ error: "Team not found or unauthorized" });
    return;
  }
  res.sendStatus(204);
});

// POST /teams/:id/invite
router.post("/teams/:id/invite", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOne({ _id: req.params.id, leaderId: req.user!._id });
  if (!team) {
    res.status(404).json({ error: "Team not found or unauthorized" });
    return;
  }
  if (team.members.length >= team.maxSize) {
    res.status(400).json({ error: "Team is full" });
    return;
  }

  const { email } = req.body;
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) { res.status(400).json({ error: "A valid email is required" }); return; }
  if (team.invitations.some((invite) => invite.email.toLowerCase() === email.toLowerCase() && invite.status === "pending")) { res.status(409).json({ error: "A pending invitation already exists" }); return; }
  const token = crypto.randomUUID();
  team.invitations.push({ email, token, status: "pending", createdAt: new Date() });
  await team.save();

  res.json({ message: `Invitation sent to ${email}` });
});

// POST /teams/invitations/:invId/accept
router.post("/teams/invitations/:invId/accept", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOne({ "invitations._id": req.params.invId });
  if (!team) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const inv = team.invitations.find((i) => i._id?.toString() === req.params.invId);
  if (!inv || inv.status !== "pending") {
    res.status(400).json({ error: "Invalid invitation" });
    return;
  }
  if (req.user!.role !== "student" || inv.email.toLowerCase() !== req.user!.email.toLowerCase()) { res.status(403).json({ error: "This invitation is not for your account" }); return; }
  if (team.members.length >= team.maxSize) { res.status(400).json({ error: "Team is full" }); return; }
  if (!await Registration.exists({ hackathonId: team.hackathonId, userId: req.user!._id })) { res.status(403).json({ error: "Register for this hackathon before joining a team" }); return; }

  inv.status = "accepted";
  const alreadyMember = team.members.some((m) => m.userId.toString() === req.user!._id.toString());
  if (!alreadyMember) {
    team.members.push({ userId: req.user!._id, role: "member", joinedAt: new Date() });
  }
  await team.save();
  res.json(team);
});

// POST /teams/invitations/:invId/reject
router.post("/teams/invitations/:invId/reject", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOne({ "invitations._id": req.params.invId });
  if (!team) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  const inv = team.invitations.find((i) => i._id?.toString() === req.params.invId);
  if (inv) inv.status = "rejected";
  await team.save();
  res.json({ message: "Invitation rejected" });
});

// POST /teams/:id/leave
router.post("/teams/:id/leave", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId.toString() === req.user!._id.toString()) {
    res.status(400).json({ error: "Leader cannot leave; delete or transfer team first" });
    return;
  }
  team.members = team.members.filter((m) => m.userId.toString() !== req.user!._id.toString());
  await team.save();
  res.json({ message: "Left team successfully" });
});

// DELETE /teams/:id/members/:userId
router.delete("/teams/:id/members/:userId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const team = await Team.findOne({ _id: req.params.id, leaderId: req.user!._id });
  if (!team) {
    res.status(404).json({ error: "Team not found or unauthorized" });
    return;
  }
  team.members = team.members.filter((m) => m.userId.toString() !== req.params.userId);
  await team.save();
  res.json(team);
});

export default router;
