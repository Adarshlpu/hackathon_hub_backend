import { Hackathon } from "../models/Hackathon.js";
import { Registration } from "../models/Registration.js";
import { Team } from "../models/Team.js";
import { Project } from "../models/Project.js";
import { Certificate } from "../models/Certificate.js";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { User } from "../models/User.js";
import { College } from "../models/College.js";
import { getCache, setCache } from "../lib/redis.js";
import mongoose from "mongoose";

// ─── Types ────────────────────────────────────────────────
export interface NeedsAttentionItem {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  hackathonId?: string;
  hackathonTitle?: string;
  cta: string;
  ctaLink: string;
}

export interface HackathonTimeline {
  hackathonId: string;
  title: string;
  milestones: Array<{
    label: string;
    date: Date | null;
    status: "completed" | "upcoming" | "overdue" | "pending";
  }>;
}

export interface PerformanceInsight {
  type: "positive" | "negative" | "neutral";
  message: string;
  metric?: string;
  change?: number;
}

export interface CollegeDashboardData {
  // Section 1: Welcome
  collegeName: string;
  collegeLogo?: string;
  activeHackathons: number;
  upcomingEvents: number;

  // Section 2: KPIs
  kpis: {
    totalHackathons: number;
    activeHackathons: number;
    upcomingHackathons: number;
    completedHackathons: number;
    totalRegistrations: number;
    approvedTeams: number;
    submissionsReceived: number;
    pendingApprovals: number;
    judges: number;
    mentors: number;
    certificatesGenerated: number;
    averageTeamSize: number;
    registrationGrowthPercent: number;
    submissionRatePercent: number;
  };

  // Section 3: Needs Attention
  needsAttention: NeedsAttentionItem[];

  // Section 4: Timeline
  timelines: HackathonTimeline[];

  // Section 5: Live Analytics
  analytics: {
    registrationTrend: Array<{ date: string; count: number }>;
    dailyRegistrations: Array<{ date: string; count: number }>;
    registrationsByDepartment: Array<{ department: string; count: number }>;
    themePopularity: Array<{ theme: string; count: number }>;
    submissionTrend: Array<{ date: string; count: number }>;
    completionRate: number;
    attendanceTrend: Array<{ date: string; rate: number }>;
  };

  // Section 6: Recent Hackathons
  recentHackathons: Array<{
    _id: string;
    title: string;
    bannerUrl?: string;
    status: string;
    registrations: number;
    teams: number;
    judges: number;
    submissionPercent: number;
    progressPercent: number;
    startDate: Date;
    endDate: Date;
  }>;

  // Section 8: Recent Activity
  recentActivity: Array<{
    type: string;
    message: string;
    user?: string;
    time: Date;
    link?: string;
  }>;

  // Section 9: Notifications
  notifications: Array<{
    _id: string;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: Date;
    link?: string;
  }>;

  // Section 10: Performance Insights
  insights: PerformanceInsight[];
}

// ─── Cache Keys ───────────────────────────────────────────
function cacheKey(organizerId: string): string {
  return `college:dashboard:${organizerId}`;
}

// ─── Main Dashboard Service ───────────────────────────────
export async function getCollegeDashboard(
  organizerId: string,
): Promise<CollegeDashboardData> {
  const cached = await getCache<CollegeDashboardData>(cacheKey(organizerId));
  if (cached) return cached;

  const orgId = new mongoose.Types.ObjectId(organizerId);

  // Get college info
  const college = await College.findOne({ adminId: orgId });
  const collegeName = college?.name || "My College";

  // Get all hackathon IDs for this organizer
  const hackathonIds = await Hackathon.find({ organizerId: orgId }).distinct("_id");
  const hackathonObjectIds = hackathonIds.map((id) => new mongoose.Types.ObjectId(id.toString()));

  // ─── Run all parallel queries ───────────────────────────
  const [
    totalHackathons,
    activeHackathons,
    upcomingHackathons,
    completedHackathons,
    totalRegistrations,
    approvedTeams,
    submissionsReceived,
    pendingApprovals,
    judgesCount,
    mentorsCount,
    certificatesGenerated,
    recentHackathonsRaw,
    recentActivity,
    notifications,
    registrationTrend,
    dailyRegistrations,
    themePopularity,
    submissionTrend,
    registrationsByDept,
  ] = await Promise.all([
    // Total hackathons
    Hackathon.countDocuments({ organizerId: orgId }),

    // Active hackathons
    Hackathon.countDocuments({ organizerId: orgId, status: "ongoing" }),

    // Upcoming hackathons
    Hackathon.countDocuments({ organizerId: orgId, status: "upcoming" }),

    // Completed hackathons
    Hackathon.countDocuments({ organizerId: orgId, status: "ended" }),

    // Total registrations
    Registration.countDocuments({ hackathonId: { $in: hackathonObjectIds } }),

    // Approved teams
    Team.countDocuments({ hackathonId: { $in: hackathonObjectIds }, isApproved: true }),

    // Submissions received
    Project.countDocuments({ hackathonId: { $in: hackathonObjectIds }, status: { $ne: "draft" } }),

    // Pending approvals (registrations)
    Registration.countDocuments({ hackathonId: { $in: hackathonObjectIds }, status: "pending" }),

    // Judges
    Hackathon.aggregate([
      { $match: { _id: { $in: hackathonObjectIds } } },
      { $project: { judgeCount: { $size: "$judges" } } },
      { $group: { _id: null, total: { $sum: "$judgeCount" } } },
    ]),

    // Mentors
    Hackathon.aggregate([
      { $match: { _id: { $in: hackathonObjectIds } } },
      { $project: { mentorCount: { $size: "$mentors" } } },
      { $group: { _id: null, total: { $sum: "$mentorCount" } } },
    ]),

    // Certificates generated
    Certificate.countDocuments({ hackathonId: { $in: hackathonObjectIds } }),

    // Recent hackathons
    Hackathon.find({ organizerId: orgId })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),

    // Recent activity (notifications for this admin)
    Notification.find({ userId: orgId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Notifications (unread first)
    Notification.find({ userId: orgId })
      .sort({ isRead: 1, createdAt: -1 })
      .limit(8)
      .lean(),

    // Registration trend (last 30 days)
    Registration.aggregate([
      { $match: { hackathonId: { $in: hackathonObjectIds } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]),

    // Daily registrations (last 7 days)
    Registration.aggregate([
      {
        $match: {
          hackathonId: { $in: hackathonObjectIds },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Theme popularity
    Hackathon.aggregate([
      { $match: { _id: { $in: hackathonObjectIds } } },
      { $unwind: "$themes" },
      {
        $group: {
          _id: "$themes",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    // Submission trend (last 30 days)
    Project.aggregate([
      {
        $match: {
          hackathonId: { $in: hackathonObjectIds },
          status: { $ne: "draft" },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]),

    // Registrations by department (using user profile skills as proxy)
    Registration.aggregate([
      { $match: { hackathonId: { $in: hackathonObjectIds } } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$user.profile.collegeName", "Unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  // ─── Compute derived metrics ────────────────────────────
  const totalJudges = judgesCount[0]?.total || 0;
  const totalMentors = mentorsCount[0]?.total || 0;
  const avgTeamSize = approvedTeams > 0
    ? Math.round((totalRegistrations / approvedTeams) * 10) / 10
    : 0;
  const submissionRate = approvedTeams > 0
    ? Math.round((submissionsReceived / approvedTeams) * 100)
    : 0;

  // Registration growth (compare last 30 days vs previous 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const [recentRegCount, previousRegCount] = await Promise.all([
    Registration.countDocuments({
      hackathonId: { $in: hackathonObjectIds },
      createdAt: { $gte: thirtyDaysAgo },
    }),
    Registration.countDocuments({
      hackathonId: { $in: hackathonObjectIds },
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    }),
  ]);
  const registrationGrowth = previousRegCount > 0
    ? Math.round(((recentRegCount - previousRegCount) / previousRegCount) * 100)
    : 0;

  // ─── Needs Attention ────────────────────────────────────
  const needsAttention: NeedsAttentionItem[] = [];
  const now = new Date();

  for (const hack of recentHackathonsRaw) {
    const h = hack as any;

    // Registration deadline approaching (within 3 days)
    if (h.registrationDeadline) {
      const deadline = new Date(h.registrationDeadline);
      const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 3) {
        needsAttention.push({
          type: "registration_deadline",
          severity: diffDays <= 1 ? "critical" : "warning",
          message: `Registration closes ${diffDays === 0 ? "today" : `in ${diffDays} days`} for "${h.title}"`,
          hackathonId: h._id.toString(),
          hackathonTitle: h.title,
          cta: "View Registrations",
          ctaLink: `/college/hackathons/${h._id}/registrations`,
        });
      }
    }

    // Pending approvals
    const pendingCount = await Registration.countDocuments({
      hackathonId: h._id,
      status: "pending",
    });
    if (pendingCount > 0) {
      needsAttention.push({
        type: "pending_approvals",
        severity: pendingCount > 20 ? "critical" : "warning",
        message: `${pendingCount} student approval${pendingCount > 1 ? "s" : ""} pending for "${h.title}"`,
        hackathonId: h._id.toString(),
        hackathonTitle: h.title,
        cta: "Review Approvals",
        ctaLink: `/college/hackathons/${h._id}/registrations`,
      });
    }

    // Judges not assigned
    if (!h.judges || h.judges.length === 0) {
      needsAttention.push({
        type: "judges_not_assigned",
        severity: "critical",
        message: `No judges assigned to "${h.title}"`,
        hackathonId: h._id.toString(),
        hackathonTitle: h.title,
        cta: "Assign Judges",
        ctaLink: `/college/hackathons/${h._id}/judges`,
      });
    }

    // No problem statement
    if (!h.description || h.description.length < 10) {
      needsAttention.push({
        type: "no_problem_statement",
        severity: "warning",
        message: `No problem statement uploaded for "${h.title}"`,
        hackathonId: h._id.toString(),
        hackathonTitle: h.title,
        cta: "Add Problem Statement",
        ctaLink: `/college/hackathons/${h._id}/problem-statements`,
      });
    }

    // Banner missing
    if (!h.bannerUrl) {
      needsAttention.push({
        type: "banner_missing",
        severity: "info",
        message: `Banner image missing for "${h.title}"`,
        hackathonId: h._id.toString(),
        hackathonTitle: h.title,
        cta: "Upload Banner",
        ctaLink: `/college/hackathons/${h._id}/settings`,
      });
    }

    // Submission deadline approaching
    if (h.status === "ongoing" && h.endDate) {
      const end = new Date(h.endDate);
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 3) {
        needsAttention.push({
          type: "submission_deadline",
          severity: daysLeft <= 1 ? "critical" : "warning",
          message: `Submission deadline ${daysLeft === 0 ? "is today" : `in ${daysLeft} days`} for "${h.title}"`,
          hackathonId: h._id.toString(),
          hackathonTitle: h.title,
          cta: "View Submissions",
          ctaLink: `/college/hackathons/${h._id}/submissions`,
        });
      }
    }

    // Certificates not generated for completed hackathons
    if (h.status === "ended") {
      const certCount = await Certificate.countDocuments({ hackathonId: h._id });
      const teamCount = await Team.countDocuments({ hackathonId: h._id, isApproved: true });
      if (certCount < teamCount) {
        needsAttention.push({
          type: "certificates_not_generated",
          severity: "warning",
          message: `Certificates not generated for ${teamCount - certCount} participants in "${h.title}"`,
          hackathonId: h._id.toString(),
          hackathonTitle: h.title,
          cta: "Generate Certificates",
          ctaLink: `/college/hackathons/${h._id}/certificates`,
        });
      }
    }

    // Venue not assigned for offline/hybrid
    if ((h.mode === "offline" || h.mode === "hybrid") && !h.location) {
      needsAttention.push({
        type: "venue_not_assigned",
        severity: "warning",
        message: `Venue not assigned for "${h.title}"`,
        hackathonId: h._id.toString(),
        hackathonTitle: h.title,
        cta: "Set Venue",
        ctaLink: `/college/hackathons/${h._id}/settings`,
      });
    }
  }

  // Limit to top 8 most critical
  needsAttention.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  needsAttention.splice(8);

  // ─── Timelines ──────────────────────────────────────────
  const timelines: HackathonTimeline[] = recentHackathonsRaw.slice(0, 4).map((h: any) => {
    const milestones = [
      {
        label: "Registration Opens",
        date: h.createdAt,
        status: "completed" as const,
      },
      {
        label: "Registration Closes",
        date: h.registrationDeadline || null,
        status: h.registrationDeadline && new Date(h.registrationDeadline) < now
          ? "completed" as const
          : h.registrationDeadline && new Date(h.registrationDeadline) > now
            ? "upcoming" as const
            : "pending" as const,
      },
      {
        label: "Hackathon Starts",
        date: h.startDate,
        status: new Date(h.startDate) < now ? "completed" as const : "upcoming" as const,
      },
      {
        label: "Submission Deadline",
        date: h.endDate,
        status: new Date(h.endDate) < now
          ? "completed" as const
          : h.status === "ongoing"
            ? "upcoming" as const
            : "pending" as const,
      },
      {
        label: "Judging",
        date: null,
        status: h.status === "ended" ? "completed" as const : "pending" as const,
      },
      {
        label: "Winner Announcement",
        date: null,
        status: "pending" as const,
      },
      {
        label: "Certificates",
        date: null,
        status: "pending" as const,
      },
    ];
    return {
      hackathonId: h._id.toString(),
      title: h.title,
      milestones,
    };
  });

  // ─── Build Recent Hackathons with computed fields ───────
  const recentHackathons = await Promise.all(
    recentHackathonsRaw.map(async (h: any) => {
      const [regCount, teamCount, judgeCount, subCount] = await Promise.all([
        Registration.countDocuments({ hackathonId: h._id }),
        Team.countDocuments({ hackathonId: h._id, isApproved: true }),
        User.countDocuments({ _id: { $in: h.judges || [] } }),
        Project.countDocuments({ hackathonId: h._id, status: { $ne: "draft" } }),
      ]);

      const submissionPercent = teamCount > 0 ? Math.round((subCount / teamCount) * 100) : 0;

      // Progress based on status
      let progressPercent = 0;
      if (h.status === "draft") progressPercent = 10;
      else if (h.status === "upcoming") progressPercent = 25;
      else if (h.status === "ongoing") {
        const total = h.endDate.getTime() - h.startDate.getTime();
        const elapsed = now.getTime() - h.startDate.getTime();
        progressPercent = Math.min(Math.round((elapsed / total) * 100), 99);
      } else if (h.status === "ended") progressPercent = 100;

      return {
        _id: h._id.toString(),
        title: h.title,
        bannerUrl: h.bannerUrl,
        status: h.status,
        registrations: regCount,
        teams: teamCount,
        judges: judgeCount,
        submissionPercent,
        progressPercent,
        startDate: h.startDate,
        endDate: h.endDate,
      };
    }),
  );

  // ─── Build Activity Feed ────────────────────────────────
  const activityFeed = recentActivity.map((n: any) => ({
    type: n.type || "general",
    message: n.message,
    user: n.title,
    time: n.createdAt,
    link: n.link,
  }));

  // ─── Performance Insights ───────────────────────────────
  const insights: PerformanceInsight[] = [];

  if (registrationGrowth > 0) {
    insights.push({
      type: "positive",
      message: `Registrations increased ${registrationGrowth}% this week compared to last month.`,
      metric: "registrations",
      change: registrationGrowth,
    });
  } else if (registrationGrowth < 0) {
    insights.push({
      type: "negative",
      message: `Registrations dropped ${Math.abs(registrationGrowth)}% compared to last month. Consider promoting your hackathons.`,
      metric: "registrations",
      change: registrationGrowth,
    });
  }

  // Most popular theme
  if (themePopularity.length > 0) {
    insights.push({
      type: "neutral",
      message: `${themePopularity[0]._id} is currently the most popular track across your hackathons.`,
      metric: "theme",
    });
  }

  // Fastest growing hackathon
  const regRates = await Promise.all(
    recentHackathonsRaw.slice(0, 3).map(async (h: any) => {
      const count = await Registration.countDocuments({ hackathonId: h._id });
      const daysSinceCreation = Math.max(
        1,
        Math.ceil((now.getTime() - new Date(h.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      );
      return { title: h.title, rate: count / daysSinceCreation };
    }),
  );
  if (regRates.length > 0) {
    const fastest = regRates.reduce((a, b) => (a.rate > b.rate ? a : b));
    insights.push({
      type: "positive",
      message: `"${fastest.title}" is receiving registrations faster than your other events.`,
      metric: "registration_rate",
    });
  }

  // Submission gap
  const approvedTeamCount = approvedTeams;
  if (approvedTeamCount > 0 && submissionsReceived < approvedTeamCount) {
    const gap = approvedTeamCount - submissionsReceived;
    const gapPercent = Math.round((gap / approvedTeamCount) * 100);
    if (gapPercent > 30) {
      insights.push({
        type: "negative",
        message: `${gapPercent}% of approved teams (${gap} teams) have not submitted yet. Send reminders.`,
        metric: "submissions",
        change: -gapPercent,
      });
    }
  }

  // Completion rate insight
  if (completedHackathons > 0) {
    insights.push({
      type: "neutral",
      message: `Overall completion rate is ${submissionRate}%. ${submissionRate > 70 ? "Great engagement!" : "Consider improving participant support."}`,
      metric: "completion_rate",
      change: submissionRate,
    });
  }

  // ─── Assemble final response ────────────────────────────
  const result: CollegeDashboardData = {
    collegeName,
    collegeLogo: college?.logoUrl,
    activeHackathons,
    upcomingEvents: upcomingHackathons,

    kpis: {
      totalHackathons,
      activeHackathons,
      upcomingHackathons,
      completedHackathons,
      totalRegistrations,
      approvedTeams: approvedTeams,
      submissionsReceived,
      pendingApprovals,
      judges: totalJudges,
      mentors: totalMentors,
      certificatesGenerated,
      averageTeamSize: avgTeamSize,
      registrationGrowthPercent: registrationGrowth,
      submissionRatePercent: submissionRate,
    },

    needsAttention,
    timelines,

    analytics: {
      registrationTrend: registrationTrend.map((r: any) => ({ date: r._id, count: r.count })),
      dailyRegistrations: dailyRegistrations.map((r: any) => ({ date: r._id, count: r.count })),
      registrationsByDepartment: registrationsByDept.map((r: any) => ({
        department: r._id,
        count: r.count,
      })),
      themePopularity: themePopularity.map((t: any) => ({ theme: t._id, count: t.count })),
      submissionTrend: submissionTrend.map((s: any) => ({ date: s._id, count: s.count })),
      completionRate: submissionRate,
      attendanceTrend: [],
    },

    recentHackathons,
    recentActivity: activityFeed,
    notifications: notifications.map((n: any) => ({
      _id: n._id.toString(),
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
      link: n.link,
    })),

    insights,
  };

  // Cache for 60 seconds
  await setCache(cacheKey(organizerId), result, 60);

  return result;
}