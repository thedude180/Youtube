import { createLogger } from "../lib/logger";

const logger = createLogger("reddit-listener");

export interface RedditPost {
  id: string;
  title: string;
  score: number;
  url: string;
  subreddit: string;
  commentCount: number;
  created: number;
  author: string;
  selftext?: string;
  permalink: string;
}

export interface SubredditFeed {
  subreddit: string;
  posts: RedditPost[];
  fetchedAt: Date;
}

const REDDIT_BASE = "https://www.reddit.com";
const USER_AGENT = "CreatorOS/1.0 (platform intelligence; +https://etgaming247.com)";

async function fetchRedditJSON(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Reddit API ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSubredditTopPosts(subreddit: string, timeframe: "hour" | "day" | "week" | "month" = "week", limit = 25): Promise<RedditPost[]> {
  try {
    const url = `${REDDIT_BASE}/r/${encodeURIComponent(subreddit)}/top.json?t=${timeframe}&limit=${limit}`;
    const data = await fetchRedditJSON(url);
    const children = data?.data?.children || [];
    return children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      score: c.data.score,
      url: c.data.url,
      subreddit: c.data.subreddit,
      commentCount: c.data.num_comments,
      created: c.data.created_utc,
      author: c.data.author,
      selftext: c.data.selftext?.slice(0, 500),
      permalink: `https://www.reddit.com${c.data.permalink}`,
    }));
  } catch (err: any) {
    logger.warn(`[Reddit] Failed to fetch r/${subreddit} top posts:`, err?.message);
    return [];
  }
}

export async function fetchSubredditHotPosts(subreddit: string, limit = 25): Promise<RedditPost[]> {
  try {
    const url = `${REDDIT_BASE}/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}`;
    const data = await fetchRedditJSON(url);
    const children = data?.data?.children || [];
    return children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      score: c.data.score,
      url: c.data.url,
      subreddit: c.data.subreddit,
      commentCount: c.data.num_comments,
      created: c.data.created_utc,
      author: c.data.author,
      selftext: c.data.selftext?.slice(0, 500),
      permalink: `https://www.reddit.com${c.data.permalink}`,
    }));
  } catch (err: any) {
    logger.warn(`[Reddit] Failed to fetch r/${subreddit} hot posts:`, err?.message);
    return [];
  }
}

export async function searchSubredditForKeywords(subreddit: string, keywords: string[], limit = 10): Promise<RedditPost[]> {
  const query = keywords.slice(0, 3).join(" OR ");
  try {
    const url = `${REDDIT_BASE}/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&sort=top&t=week&limit=${limit}&restrict_sr=true`;
    const data = await fetchRedditJSON(url);
    const children = data?.data?.children || [];
    return children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      score: c.data.score,
      url: c.data.url,
      subreddit: c.data.subreddit,
      commentCount: c.data.num_comments,
      created: c.data.created_utc,
      author: c.data.author,
      selftext: c.data.selftext?.slice(0, 500),
      permalink: `https://www.reddit.com${c.data.permalink}`,
    }));
  } catch (err: any) {
    logger.warn(`[Reddit] Failed to search r/${subreddit} for keywords:`, err?.message);
    return [];
  }
}

export async function monitorSubreddits(subreddits: string[], keywords?: string[]): Promise<SubredditFeed[]> {
  const feeds: SubredditFeed[] = [];
  for (const sub of subreddits) {
    const [topPosts, hotPosts] = await Promise.allSettled([
      fetchSubredditTopPosts(sub, "week", 15),
      fetchSubredditHotPosts(sub, 10),
    ]);
    const allPosts = [
      ...(topPosts.status === "fulfilled" ? topPosts.value : []),
      ...(hotPosts.status === "fulfilled" ? hotPosts.value : []),
    ];
    const seen = new Set<string>();
    const unique = allPosts.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    feeds.push({ subreddit: sub, posts: unique, fetchedAt: new Date() });
  }
  return feeds;
}

export function extractTopContentIdeas(feeds: SubredditFeed[]): { title: string; score: number; subreddit: string; permalink: string; contentAngle: string }[] {
  const allPosts = feeds.flatMap(f => f.posts);
  const sorted = allPosts.sort((a, b) => b.score - a.score).slice(0, 20);
  return sorted.map(p => ({
    title: p.title,
    score: p.score,
    subreddit: p.subreddit,
    permalink: p.permalink,
    contentAngle: deriveContentAngle(p),
  }));
}

function deriveContentAngle(post: RedditPost): string {
  const t = post.title.toLowerCase();
  if (t.includes("how") || t.includes("why") || t.includes("what")) return "Tutorial / Explainer";
  if (t.includes("update") || t.includes("patch") || t.includes("change")) return "Patch Analysis";
  if (t.includes("best") || t.includes("top") || t.includes("rank")) return "Rankings / Tier List";
  if (t.includes("bug") || t.includes("glitch") || t.includes("broken")) return "Bug Showcase";
  if (t.includes("nerf") || t.includes("buff") || t.includes("meta")) return "Meta Commentary";
  if (post.score > 1000) return "High Engagement — Mirror Topic";
  return "Community Discussion";
}

const DEFAULT_GAMING_SUBREDDITS = [
  "battlefield",
  "gaming",
  "YouTube",
  "NewTubers",
  "gamedev",
];

export async function getGamingDemandSignals(additionalSubreddits: string[] = []): Promise<SubredditFeed[]> {
  const targets = [...new Set([...DEFAULT_GAMING_SUBREDDITS, ...additionalSubreddits])];
  return monitorSubreddits(targets);
}
