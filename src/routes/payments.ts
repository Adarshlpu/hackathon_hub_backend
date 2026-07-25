import { Router, type IRouter } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { Payment } from "../models/Payment.js";
import { authenticate, AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

function getRazorpay(): Razorpay | null {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  return keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;
}

// POST /payments/order
router.post("/payments/order", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }

  const { amount, planType, description } = req.body;
  if (!amount || !planType) {
    res.status(400).json({ error: "amount and planType required" });
    return;
  }

  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });

  await Payment.create({
    userId: req.user!._id,
    amount,
    currency: "INR",
    status: "pending",
    razorpayOrderId: order.id,
    planType,
    description,
  });

  res.status(201).json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
});

// POST /payments/verify
router.post("/payments/verify", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  const body = razorpayOrderId + "|" + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    res.status(400).json({ error: "Invalid payment signature" });
    return;
  }

  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId },
    {
      $set: {
        razorpayPaymentId,
        razorpaySignature,
        status: "completed",
      },
    },
    { new: true },
  );

  if (!payment) {
    res.status(404).json({ error: "Payment record not found" });
    return;
  }

  res.json(payment);
});

// GET /payments/history
router.get("/payments/history", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const payments = await Payment.find({ userId: req.user!._id }).sort({ createdAt: -1 });
  res.json(payments);
});

export default router;
