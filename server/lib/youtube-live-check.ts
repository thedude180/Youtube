const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const LIVE_SIGNALS = [
  '"isLive":true',
  '"isLiveNow":true',
  '"hlsManifestUrl":"https://manifest.googlevideo.com',
  '"hlsManifestUrl":"https://manifest',
  '"status":"LIVE_STREAM_OFFLINE"',
  '"isLiveDvrEnabled":true',
  '"latencyClass":"NORMAL"',
  '"isLowLatencyLiveStream":true',
];

const NOT_LIVE_SIGNALS = [
  '"LIVE_STREAM_OFFLINE"',
  '"status":"LIVE_STREAM_OFFLINE"',
];

function containsLiveSignal(html: string): boolean {
  const hasLive = LIVE_SIGNALS.some(s => html.includes(s));
  if (!hasLive) return false;
  const isOffline = NOT_LIVE_SIGNALS.some(s => html.includes(s));
  return !isOffline;
}

export async function checkYouTubeLiveViaWatchPage(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(10000),
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
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return { isLive: false, videoId: null, title: null };

    const finalUrl = res.url;
    const html = await res.text();

    let videoId: string | null = null;

    if (finalUrl.includes("/watch?v=")) {
      const m = finalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (m) videoId = m[1];
    }

    if (!videoId) {
      const m = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
      if (m) videoId = m[1];
    }

    if (!containsLiveSignal(html)) {
      return { isLive: false, videoId: null, title: null };
    }

    let title: string | null = null;
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    if (titleMatch) {
      title = titleMatch[1].replace(/ - YouTube$/, "").trim() || null;
    }
    if (!title) {
      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogTitle) title = ogTitle[1];
    }

    return { isLive: true, videoId, title };
  } catch {
    return { isLive: false, videoId: null, title: null };
  }
}

async function checkRssFeed(channelId: string): Promise<Array<{ videoId: string; title: string }>> {
  try {
    const feedRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA } }
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
    if (livePage.isLive) {
      return livePage;
    }

    const rssEntries = await checkRssFeed(channelId);

    for (const entry of rssEntries) {
      const live = await checkYouTubeLiveViaWatchPage(entry.videoId);
      if (live) return { isLive: true, videoId: entry.videoId, title: entry.title };
    }

    return { isLive: false, videoId: null, title: null };
  } catch {
    return { isLive: false, videoId: null, title: null };
  }
}
