import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import hackathonsRouter from "./hackathons.js";
import teamsRouter from "./teams.js";
import projectsRouter from "./projects.js";
import judgeRouter from "./judge.js";
import mentorRouter from "./mentor.js";
import recruiterRouter from "./recruiter.js";
import adminRouter from "./admin.js";
import certificatesRouter from "./certificates.js";
import paymentsRouter from "./payments.js";
import notificationsRouter from "./notifications.js";
import dashboardRouter from "./dashboard.js";
import companySponsorRouter from "./company-sponsor.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(hackathonsRouter);
router.use(teamsRouter);
router.use(projectsRouter);
router.use(judgeRouter);
router.use(mentorRouter);
router.use(recruiterRouter);
router.use(adminRouter);
router.use(certificatesRouter);
router.use(paymentsRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(companySponsorRouter);

export default router;
