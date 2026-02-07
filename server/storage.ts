
import { db } from "./db";
import {
  users, channels, videos, jobs,
  type User, type InsertUser,
  type Channel, type InsertChannel, type UpdateChannelRequest,
  type Video, type InsertVideo, type UpdateVideoRequest,
  type Job, type InsertJob,
  type StatsResponse
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Channels
  getChannels(): Promise<Channel[]>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel>;

  // Videos
  getVideos(): Promise<Video[]>;
  getVideo(id: number): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video>;

  // Jobs
  getJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJobStatus(id: number, status: string, result?: any): Promise<Job>;

  // Dashboard
  getStats(): Promise<StatsResponse>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [newChannel] = await db.insert(channels).values(channel).returning();
    return newChannel;
  }

  async updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel> {
    const [updated] = await db.update(channels).set(updates).where(eq(channels.id, id)).returning();
    return updated;
  }

  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const [newVideo] = await db.insert(videos).values(video).returning();
    return newVideo;
  }

  async updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video> {
    const [updated] = await db.update(videos).set(updates).where(eq(videos.id, id)).returning();
    return updated;
  }

  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values(job).returning();
    return newJob;
  }

  async updateJobStatus(id: number, status: string, result?: any): Promise<Job> {
    const [updated] = await db.update(jobs)
        .set({ status, result, completedAt: status === 'completed' ? new Date() : null })
        .where(eq(jobs.id, id))
        .returning();
    return updated;
  }

  async getStats(): Promise<StatsResponse> {
    // Mock stats for MVP, or could be real aggregates
    const totalVideos = (await db.select({ count: sql<number>`count(*)` }).from(videos))[0].count;
    const activeJobs = (await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'processing')))[0].count;
    
    // Simple logic for uploaded today
    const uploadedToday = 0; // In a real app, date comparison
    
    return {
        totalVideos: Number(totalVideos),
        activeJobs: Number(activeJobs),
        uploadedToday: 0,
        nextScheduled: new Date().toISOString(),
        riskScore: 12, // Low risk default
    };
  }
}

export const storage = new DatabaseStorage();
