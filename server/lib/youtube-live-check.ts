const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── Live-detection signal rules ───────────────────────────────────────────────
//
// Problem: "isLive":true and "isLiveNow":true both appear in YouTube's page JSON
// for VODs that were originally live streams (the metadata is preserved after the
// stream ends). Using them as standalone signals causes false positives every time
// the detector scrapes a channel whose most-recent content is a past broadcast.
//
// Solution: require at least one STRONG signal that is ONLY present while a stream
// is actively serving live segments:
//
//  • hlsManifestUrl   — YouTube embeds the HLS playlist URL in the page only when
//                       the stream is actively ingesting. It disappears as soon as
//                       the stream ends and YouTube transcodes to a VOD.
//  • isLowLatencyLiveStream — set for active low-latency streams; not retained in VODs.
//
// "isLive":true / "isLiveNow":true alone are NOT sufficient — they are also
// present in archived broadcast metadata.
const STRONG_LIVE_SIGNALS = [
  '"hlsManifestUrl":"https://manifest.googlevideo.com',
  '"hlsManifestUrl":"https://manifest',
  '"isLowLatencyLiveStream":true',
];

const NOT_LIVE_SIGNALS = [
  '"LIVE_STREAM_OFFLINE"',
  '"status":"LIVE_STREAM_OFFLINE"',
];

// Reduced from 10 000 ms — sequential 10-second timeouts were stacking up to
// 20-30 s total latency.  4 s is enough for YouTube's CDN on a healthy connection;
// if a single hop times out we fall through to the next detection method anyway.
const FETCH_TIMEOUT_MS = 4_000;

function containsLiveSignal(html: string): boolean {
  const hasStrong = STRONG_LIVE_SIGNALS.some(s => html.includes(s));
  if (!hasStrong) return false;
  const isOffline = NOT_LIVE_SIGNALS.some(s => html.includes(s));
  return !isOffline;
}

function extractVideoIdAndTitle(html: string, finalUrl: string): { videoId: string | null; title: string | null } {
  let videoId: string | null = null;
  if (finalUrl.includes("/watch?v=")) {
    const m = finalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) videoId = m[1];
  }
  if (!videoId) {
    const m = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    if (m) videoId = m[1];
  }
  let title: string | null = null;
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (titleMatch) title = titleMatch[1].replace(/ - YouTube$/, "").trim() || null;
  if (!title) {
    const og = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (og) title = og[1];
  }
  return { videoId, title };
}

async function fetchLivePage(url: string): Promise<{ isLive: boolean; videoId: string | null; title: string | null }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return { isLive: false, videoId: null, title: null };
    const html = await res.text();
    if (!containsLiveSignal(html)) return { isLive: false, videoId: null, title: null };
    const { videoId, title } = extractVideoIdAndTitle(html, res.url);
    return { isLive: true, videoId, title };
  } catch {
    return { isLive: false, videoId: null, title: null };
  }
}

async function resolveChannelHandle(channelId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    const finalUrl = res.url;
    const handleFromUrl = finalUrl.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/)?.[1];
    if (handleFromUrl) return handleFromUrl;
    const html = await res.text();
    const handleFromHtml = html.match(/"canonicalBaseUrl":"\/@([A-Za-z0-9_.-]+)"/)?.[1]
      || html.match(/href="\/@([A-Za-z0-9_.-]+)"/)?.[1];
    return handleFromHtml || null;
  } catch {
    return null;
  }
}

export async function checkYouTubeLiveViaWatchPage(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return false;
    const html = await res.text();
    return containsLiveSignal(html);
  } catch {
    return false;
  }
}

async function checkChannelLivePage(channelId: string): Promise<{ isLive: boolean; videoId: string | null; title: string | null }> {
  // Run the direct channel/id/live fetch AND handle resolution concurrently —
  // previously these were sequential (fetch → resolve → fetch again), which
  // stacked two 10-second timeouts when the channel wasn't live.
  const [direct, handle] = await Promise.all([
    fetchLivePage(`https://www.youtube.com/channel/${channelId}/live`),
    resolveChannelHandle(channelId),
  ]);
  if (direct.isLive) return direct;

  if (handle) {
    const byHandle = await fetchLivePage(`https://www.youtube.com/@${handle}/live`);
    if (byHandle.isLive) return byHandle;
  }

  return { isLive: false, videoId: null, title: null };
}

async function checkRssFeed(channelId: string): Promise<Array<{ videoId: string; title: string }>> {
  try {
    const feedRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": UA } }
    );
    if (!feedRes.ok) return [];
    const xml = await feedRes.text();

    const entries: Array<{ videoId: string; title: string; publishedAt: Date }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1];
      const vidMatch = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const pubMatch = block.match(/<published>(.*?)<\/published>/);
      if (!vidMatch) continue;
      const publishedAt = pubMatch ? new Date(pubMatch[1]) : new Date(0);
      const daysAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo > 7) continue;
      entries.push({ videoId: vidMatch[1].trim(), title: titleMatch?.[1]?.trim() ?? "", publishedAt });
    }

    entries.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return entries.slice(0, 8);
  } catch {
    return [];
  }
}

export async function detectYouTubeLiveFromChannel(channelId: string): Promise<{
  isLive: boolean;
  videoId: string | null;
  title: string | null;
}> {
  try {
    const livePage = await checkChannelLivePage(channelId);
    if (livePage.isLive) return livePage;

    const rssEntries = await checkRssFeed(channelId);
    if (rssEntries.length === 0) return { isLive: false, videoId: null, title: null };

    // Check all recent RSS entries in parallel instead of sequentially —
    // previously each watch-page fetch was sequential (up to 8 × 10 s = 80 s
    // worst-case).  Parallel execution caps total RSS check time at one timeout.
    const watchResults = await Promise.all(
      rssEntries.map(async (entry) => {
        const live = await checkYouTubeLiveViaWatchPage(entry.videoId);
        return live ? entry : null;
      })
    );
    const found = watchResults.find(r => r !== null);
    if (found) return { isLive: true, videoId: found.videoId, title: found.title };

    return { isLive: false, videoId: null, title: null };
  } catch {
    return { isLive: false, videoId: null, title: null };
  }
}
