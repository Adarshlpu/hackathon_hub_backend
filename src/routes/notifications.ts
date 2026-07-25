import { Router, type IRouter } from "express";
import { Notification } from "../models/Notification.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

// GET /notifications
router.get("/notifications", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const filter: Record<string, unknown> = { userId: req.user!._id };
  if (req.query.unread === "true") filter.isRead = false;

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json(notifications);
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!._id },
    { $set: { isRead: true } },
    { new: true },
  );
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(notification);
});

// PATCH /notifications/read-all
router.patch("/notifications/read-all", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await Notification.updateMany({ userId: req.user!._id, isRead: false }, { $set: { isRead: true } });
  res.json({ message: "All notifications marked as read" });
});

export default router;
