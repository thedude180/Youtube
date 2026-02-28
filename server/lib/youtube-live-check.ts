const UA = "Mozilla/5.0 (compatible; CreatorOS/1.0)";

export async function checkYouTubeLiveViaWatchPage(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('"isLive":true');
  } catch {
    return false;
  }
}

export async function detectYouTubeLiveFromChannel(channelId: string): Promise<{
  isLive: boolean;
  videoId: string | null;
  title: string | null;
}> {
  try {
    const feedRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA } }
    );
    if (!feedRes.ok) return { isLive: false, videoId: null, title: null };
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
      const hoursAgo = (Date.now() - publishedAt.getTime()) / 3600000;
      if (hoursAgo > 24) continue;
      entries.push({
        videoId: vidMatch[1].trim(),
        title: titleMatch?.[1]?.trim() ?? "",
        publishedAt,
      });
    }

    entries.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    for (const entry of entries.slice(0, 5)) {
      const live = await checkYouTubeLiveViaWatchPage(entry.videoId);
      if (live) return { isLive: true, videoId: entry.videoId, title: entry.title };
    }

    return { isLive: false, videoId: null, title: null };
  } catch {
    return { isLive: false, videoId: null, title: null };
  }
}
