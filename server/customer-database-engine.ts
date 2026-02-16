import { db } from "./db";
import { eq, and, desc, sql, count, ilike, or } from "drizzle-orm";
import { customerProfiles, users, channels, videos, streams, revenueRecords, aiAgentActivities } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

export async function createOrUpdateCustomerProfile(
  userId: string,
  data: {
    signupMethod?: string;
    signupSource?: string;
    signupReferrer?: string;
    signupIp?: string;
    signupUserAgent?: string;
  } = {}
) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const currentTier = user?.tier || "free";

    const [profile] = await db
      .insert(customerProfiles)
      .values({
        userId,
        signupMethod: data.signupMethod || "replit_auth",
        signupSource: data.signupSource || null,
        signupReferrer: data.signupReferrer || null,
        signupIp: data.signupIp || null,
        signupUserAgent: data.signupUserAgent || null,
        currentTier,
        tierHistory: [{ tier: currentTier, changedAt: new Date().toISOString(), reason: "initial_signup" }],
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: {
          signupMethod: data.signupMethod || sql`${customerProfiles.signupMethod}`,
          signupSource: data.signupSource || sql`${customerProfiles.signupSource}`,
          signupReferrer: data.signupReferrer || sql`${customerProfiles.signupReferrer}`,
          signupIp: data.signupIp || sql`${customerProfiles.signupIp}`,
          signupUserAgent: data.signupUserAgent || sql`${customerProfiles.signupUserAgent}`,
          currentTier,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log(`[CustomerDB] Profile created/updated for user ${userId}`);
    sendSSEEvent(userId, "customer_profile_updated", { userId, profile });
    return profile;
  } catch (error) {
    console.error(`[CustomerDB] Error creating/updating profile for ${userId}:`, error);
    throw error;
  }
}

export async function getCustomerProfile(userId: string) {
  try {
    const [profile] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1);

    if (!profile) return null;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const [channelCount] = await db
      .select({ count: count() })
      .from(channels)
      .where(eq(channels.userId, userId));

    const userChannels = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId));
    const channelIds = userChannels.map((c) => c.id);

    let videoCount = 0;
    if (channelIds.length > 0) {
      const [vc] = await db
        .select({ count: count() })
        .from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`);
      videoCount = vc?.count || 0;
    }

    const [streamCount] = await db
      .select({ count: count() })
      .from(streams)
      .where(eq(streams.userId, userId));

    return {
      ...profile,
      user: user
        ? {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tier: user.tier,
            stripeCustomerId: user.stripeCustomerId,
            contentNiche: user.contentNiche,
            onboardingCompleted: user.onboardingCompleted,
            createdAt: user.createdAt,
          }
        : null,
      stats: {
        channelCount: channelCount?.count || 0,
        videoCount,
        streamCount: streamCount?.count || 0,
      },
    };
  } catch (error) {
    console.error(`[CustomerDB] Error getting profile for ${userId}:`, error);
    return null;
  }
}

export async function getAllCustomers(options?: {
  tier?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const conditions = [];
    if (options?.tier) {
      conditions.push(eq(customerProfiles.currentTier, options.tier));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderBy;
    switch (options?.sortBy) {
      case "engagement":
        orderBy = desc(customerProfiles.engagementScore);
        break;
      case "revenue":
        orderBy = desc(customerProfiles.lifetimeRevenue);
        break;
      case "churn_risk":
        orderBy = desc(customerProfiles.churnRisk);
        break;
      case "last_active":
        orderBy = desc(customerProfiles.lastActiveAt);
        break;
      default:
        orderBy = desc(customerProfiles.createdAt);
        break;
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(customerProfiles)
      .where(whereClause);

    const profiles = await db
      .select({
        profile: customerProfiles,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        tier: users.tier,
      })
      .from(customerProfiles)
      .leftJoin(users, eq(customerProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return {
      customers: profiles.map((p) => ({
        ...p.profile,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        userTier: p.tier,
      })),
      total: totalResult?.count || 0,
      limit,
      offset,
    };
  } catch (error) {
    console.error("[CustomerDB] Error getting all customers:", error);
    return { customers: [], total: 0, limit: 50, offset: 0 };
  }
}

export async function updateCustomerActivity(userId: string) {
  try {
    await db
      .update(customerProfiles)
      .set({
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerProfiles.userId, userId));
  } catch (error) {
    console.error(`[CustomerDB] Error updating activity for ${userId}:`, error);
  }
}

export async function recordTierChange(userId: string, newTier: string, reason?: string) {
  try {
    const [existing] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1);

    if (!existing) {
      await createOrUpdateCustomerProfile(userId);
      return recordTierChange(userId, newTier, reason);
    }

    const tierHistory = Array.isArray(existing.tierHistory) ? [...existing.tierHistory] : [];
    tierHistory.push({
      tier: newTier,
      changedAt: new Date().toISOString(),
      reason: reason || "tier_change",
    });

    const [updated] = await db
      .update(customerProfiles)
      .set({
        currentTier: newTier,
        tierHistory,
        updatedAt: new Date(),
      })
      .where(eq(customerProfiles.userId, userId))
      .returning();

    console.log(`[CustomerDB] Tier changed for ${userId}: ${existing.currentTier} -> ${newTier}`);
    sendSSEEvent(userId, "customer_tier_changed", {
      userId,
      oldTier: existing.currentTier,
      newTier,
      reason,
    });

    return updated;
  } catch (error) {
    console.error(`[CustomerDB] Error recording tier change for ${userId}:`, error);
    throw error;
  }
}

export async function getCustomerStats() {
  try {
    const [totalResult] = await db.select({ count: count() }).from(customerProfiles);

    const tierBreakdown = await db
      .select({
        tier: customerProfiles.currentTier,
        count: count(),
      })
      .from(customerProfiles)
      .groupBy(customerProfiles.currentTier);

    const [avgEngagement] = await db
      .select({
        avg: sql<number>`COALESCE(AVG(${customerProfiles.engagementScore}), 0)`,
      })
      .from(customerProfiles);

    const churnDistribution = await db
      .select({
        risk: sql<string>`CASE
          WHEN ${customerProfiles.churnRisk} >= 0.7 THEN 'high'
          WHEN ${customerProfiles.churnRisk} >= 0.3 THEN 'medium'
          ELSE 'low'
        END`,
        count: count(),
      })
      .from(customerProfiles)
      .groupBy(sql`CASE
        WHEN ${customerProfiles.churnRisk} >= 0.7 THEN 'high'
        WHEN ${customerProfiles.churnRisk} >= 0.3 THEN 'medium'
        ELSE 'low'
      END`);

    const newestCustomers = await db
      .select({
        userId: customerProfiles.userId,
        currentTier: customerProfiles.currentTier,
        createdAt: customerProfiles.createdAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(customerProfiles)
      .leftJoin(users, eq(customerProfiles.userId, users.id))
      .orderBy(desc(customerProfiles.createdAt))
      .limit(10);

    const mostActive = await db
      .select({
        userId: customerProfiles.userId,
        engagementScore: customerProfiles.engagementScore,
        lastActiveAt: customerProfiles.lastActiveAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(customerProfiles)
      .leftJoin(users, eq(customerProfiles.userId, users.id))
      .orderBy(desc(customerProfiles.engagementScore))
      .limit(10);

    const revenueByTier = await db
      .select({
        tier: customerProfiles.currentTier,
        totalRevenue: sql<number>`COALESCE(SUM(${customerProfiles.lifetimeRevenue}), 0)`,
      })
      .from(customerProfiles)
      .groupBy(customerProfiles.currentTier);

    return {
      totalCustomers: totalResult?.count || 0,
      customersByTier: Object.fromEntries(tierBreakdown.map((t) => [t.tier, t.count])),
      averageEngagement: Number(avgEngagement?.avg) || 0,
      churnRiskDistribution: Object.fromEntries(churnDistribution.map((c) => [c.risk, c.count])),
      newestCustomers,
      mostActiveCustomers: mostActive,
      revenueByTier: Object.fromEntries(revenueByTier.map((r) => [r.tier, Number(r.totalRevenue)])),
    };
  } catch (error) {
    console.error("[CustomerDB] Error getting customer stats:", error);
    return {
      totalCustomers: 0,
      customersByTier: {},
      averageEngagement: 0,
      churnRiskDistribution: {},
      newestCustomers: [],
      mostActiveCustomers: [],
      revenueByTier: {},
    };
  }
}

export async function enrichCustomerProfile(userId: string) {
  try {
    const [profile] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1);

    if (!profile) return null;

    const userChannels = await db.select({ id: channels.id, platform: channels.platform }).from(channels).where(eq(channels.userId, userId));
    const channelIds = userChannels.map((c) => c.id);
    const platformsConnected = Array.from(new Set(userChannels.map((c) => c.platform)));

    let totalContentCreated = 0;
    if (channelIds.length > 0) {
      const [vc] = await db
        .select({ count: count() })
        .from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`);
      totalContentCreated = vc?.count || 0;
    }

    const [streamResult] = await db
      .select({ count: count() })
      .from(streams)
      .where(eq(streams.userId, userId));
    const totalStreams = streamResult?.count || 0;

    const [aiResult] = await db
      .select({ count: count() })
      .from(aiAgentActivities)
      .where(eq(aiAgentActivities.userId, userId));
    const totalAiRequests = aiResult?.count || 0;

    const [revenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${revenueRecords.amount}), 0)` })
      .from(revenueRecords)
      .where(eq(revenueRecords.userId, userId));
    const lifetimeRevenue = Number(revenueResult?.total) || 0;

    const now = new Date();
    const lastActive = profile.lastActiveAt || profile.createdAt || now;
    const daysSinceActive = Math.max(0, (now.getTime() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24));

    let recencyScore = Math.max(0, 100 - daysSinceActive * 3);
    let contentScore = Math.min(30, totalContentCreated * 3);
    let streamScore = Math.min(20, totalStreams * 4);
    let aiScore = Math.min(20, totalAiRequests * 0.5);
    let platformScore = Math.min(10, platformsConnected.length * 3);
    const engagementScore = Math.min(100, Math.round(recencyScore * 0.3 + contentScore + streamScore + aiScore + platformScore));

    let churnRisk = 0;
    if (daysSinceActive > 30) {
      churnRisk = Math.min(1, 0.7 + (daysSinceActive - 30) * 0.01);
    } else if (daysSinceActive > 14) {
      churnRisk = 0.3 + (daysSinceActive - 14) * 0.025;
    } else if (daysSinceActive > 7) {
      churnRisk = 0.1 + (daysSinceActive - 7) * 0.03;
    } else {
      churnRisk = daysSinceActive * 0.015;
    }

    if (totalContentCreated === 0 && totalStreams === 0) {
      churnRisk = Math.min(1, churnRisk + 0.2);
    }

    churnRisk = Math.round(churnRisk * 100) / 100;

    const [updated] = await db
      .update(customerProfiles)
      .set({
        platformsConnected,
        totalContentCreated,
        totalStreams,
        totalAiRequests,
        engagementScore,
        lifetimeRevenue,
        churnRisk,
        updatedAt: new Date(),
      })
      .where(eq(customerProfiles.userId, userId))
      .returning();

    console.log(`[CustomerDB] Enriched profile for ${userId}: engagement=${engagementScore}, churn=${churnRisk}`);
    return updated;
  } catch (error) {
    console.error(`[CustomerDB] Error enriching profile for ${userId}:`, error);
    return null;
  }
}

export async function searchCustomers(query: string) {
  try {
    const searchPattern = `%${query}%`;

    const results = await db
      .select({
        profile: customerProfiles,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(customerProfiles)
      .leftJoin(users, eq(customerProfiles.userId, users.id))
      .where(
        or(
          ilike(users.email, searchPattern),
          ilike(users.firstName, searchPattern),
          ilike(users.lastName, searchPattern),
          sql`${searchPattern} = ANY(${customerProfiles.tags})`
        )
      )
      .orderBy(desc(customerProfiles.engagementScore))
      .limit(50);

    return results.map((r) => ({
      ...r.profile,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
    }));
  } catch (error) {
    console.error(`[CustomerDB] Error searching customers for "${query}":`, error);
    return [];
  }
}

export async function exportCustomerData(format?: string) {
  try {
    const allProfiles = await db
      .select({
        profile: customerProfiles,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        tier: users.tier,
        stripeCustomerId: users.stripeCustomerId,
        contentNiche: users.contentNiche,
        userCreatedAt: users.createdAt,
      })
      .from(customerProfiles)
      .leftJoin(users, eq(customerProfiles.userId, users.id))
      .orderBy(desc(customerProfiles.createdAt));

    return allProfiles.map((r) => ({
      id: r.profile.id,
      userId: r.profile.userId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      signupMethod: r.profile.signupMethod,
      signupSource: r.profile.signupSource,
      signupReferrer: r.profile.signupReferrer,
      currentTier: r.profile.currentTier,
      userTier: r.tier,
      stripeCustomerId: r.stripeCustomerId,
      contentNiche: r.contentNiche,
      platformsConnected: r.profile.platformsConnected,
      totalContentCreated: r.profile.totalContentCreated,
      totalStreams: r.profile.totalStreams,
      totalAiRequests: r.profile.totalAiRequests,
      engagementScore: r.profile.engagementScore,
      lifetimeRevenue: r.profile.lifetimeRevenue,
      churnRisk: r.profile.churnRisk,
      tags: r.profile.tags,
      notes: r.profile.notes,
      tierHistory: r.profile.tierHistory,
      lastActiveAt: r.profile.lastActiveAt,
      profileCreatedAt: r.profile.createdAt,
      userCreatedAt: r.userCreatedAt,
      metadata: r.profile.metadata,
    }));
  } catch (error) {
    console.error("[CustomerDB] Error exporting customer data:", error);
    return [];
  }
}

export async function getCustomerTimeline(userId: string) {
  try {
    const timeline: Array<{ type: string; timestamp: string; details: Record<string, any> }> = [];

    const [profile] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1);

    if (!profile) return [];

    if (profile.createdAt) {
      timeline.push({
        type: "signup",
        timestamp: profile.createdAt.toISOString(),
        details: {
          method: profile.signupMethod,
          source: profile.signupSource,
          referrer: profile.signupReferrer,
        },
      });
    }

    if (Array.isArray(profile.tierHistory)) {
      for (const change of profile.tierHistory) {
        if (change.changedAt && change.tier) {
          timeline.push({
            type: "tier_change",
            timestamp: change.changedAt,
            details: { tier: change.tier, reason: change.reason },
          });
        }
      }
    }

    const userChannels = await db
      .select()
      .from(channels)
      .where(eq(channels.userId, userId))
      .orderBy(desc(channels.createdAt));

    for (const channel of userChannels) {
      if (channel.createdAt) {
        timeline.push({
          type: "channel_connected",
          timestamp: channel.createdAt.toISOString(),
          details: {
            platform: channel.platform,
            channelName: channel.channelName,
          },
        });
      }
    }

    const channelIds = userChannels.map((c) => c.id);
    if (channelIds.length > 0) {
      const recentVideos = await db
        .select()
        .from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(videos.createdAt))
        .limit(20);

      for (const video of recentVideos) {
        if (video.createdAt) {
          timeline.push({
            type: "content_created",
            timestamp: video.createdAt.toISOString(),
            details: {
              title: video.title,
              type: video.type,
              platform: video.platform,
              status: video.status,
            },
          });
        }
      }
    }

    const recentStreams = await db
      .select()
      .from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(20);

    for (const stream of recentStreams) {
      if (stream.createdAt) {
        timeline.push({
          type: "stream",
          timestamp: stream.createdAt.toISOString(),
          details: {
            title: stream.title,
            status: stream.status,
            platforms: stream.platforms,
          },
        });
      }
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return timeline;
  } catch (error) {
    console.error(`[CustomerDB] Error getting timeline for ${userId}:`, error);
    return [];
  }
}
