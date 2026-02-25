export type Platform = "youtube" | "twitch" | "kick" | "tiktok" | "x" | "discord" | "rumble";

export interface PlatformContentSpec {
  label: string;
  category: "video" | "streaming" | "social" | "community";
  color: string;
  capabilities: string[];
  contentTypes: string[];
  limits: {
    titleMaxLength: number;
    descriptionMaxLength: number;
    maxTags?: number;
    maxTagsChars?: number;
    maxHashtags?: number;
    postMaxLength?: number;
    videoMaxDuration?: number | null;
    shortsMaxDuration?: number;
    thumbnailMaxSizeMB?: number;
    mediaLimit?: number;
  };
  streaming: {
    supported: boolean;
    maxResolution?: string;
    maxBitrate?: string;
    maxFps?: number;
  };
  posting: {
    supported: boolean;
    videoUpload: boolean;
    textPost: boolean;
    imagePost: boolean;
    aspectRatio?: string;
    bestPractices: string[];
  };
  tone: string;
  dailyLimits: {
    maxPosts: number;
    maxUpdates?: number;
  };
}

export const PLATFORM_CONTENT_SPECS: Record<Platform, PlatformContentSpec> = {
  youtube: {
    label: "YouTube",
    category: "video",
    color: "#ff0000",
    capabilities: ["Long-form video", "Shorts (≤60s)", "Live streaming", "Community posts"],
    contentTypes: ["video", "short", "stream", "post"],
    limits: {
      titleMaxLength: 100,
      descriptionMaxLength: 5000,
      maxTags: 30,
      maxTagsChars: 500,
      videoMaxDuration: null,
      shortsMaxDuration: 60,
      thumbnailMaxSizeMB: 2,
    },
    streaming: {
      supported: true,
      maxResolution: "2160p (4K)",
      maxBitrate: "51 Mbps",
      maxFps: 60,
    },
    posting: {
      supported: true,
      videoUpload: true,
      textPost: true,
      imagePost: true,
      aspectRatio: "16:9 (landscape) or 9:16 (Shorts)",
      bestPractices: [
        "Titles under 60 chars get higher CTR",
        "First 2 lines of description are visible before 'Show more'",
        "Include timestamps in description for chapters",
        "Use 3-5 tags minimum for discoverability",
        "Shorts must be ≤60 seconds, vertical 9:16",
      ],
    },
    tone: "Descriptive, SEO-aware, natural. Ask questions to drive engagement.",
    dailyLimits: { maxPosts: 50, maxUpdates: 180 },
  },

  tiktok: {
    label: "TikTok",
    category: "video",
    color: "#ff2d55",
    capabilities: ["Short videos (≤10 min)", "Text posts", "Image posts"],
    contentTypes: ["short", "post"],
    limits: {
      titleMaxLength: 2200,
      descriptionMaxLength: 2200,
      maxHashtags: 30,
      videoMaxDuration: 600,
      postMaxLength: 2200,
    },
    streaming: {
      supported: true,
      maxResolution: "1080p",
      maxBitrate: "6 Mbps",
      maxFps: 30,
    },
    posting: {
      supported: true,
      videoUpload: true,
      textPost: true,
      imagePost: true,
      aspectRatio: "9:16 (vertical)",
      bestPractices: [
        "Captions under 150 chars get more engagement",
        "Use 2-3 trending hashtags, not more",
        "Hook viewers in first 1-2 seconds",
        "Use trending sounds and formats",
        "Vertical 9:16 is mandatory for best reach",
      ],
    },
    tone: "Ultra-casual, trending energy, punchy. Use hooks like 'POV:', 'This is why...'",
    dailyLimits: { maxPosts: 10 },
  },

  x: {
    label: "X (Twitter)",
    category: "social",
    color: "#1da1f2",
    capabilities: ["Text posts (280 chars)", "Long posts (25K chars)", "Images"],
    contentTypes: ["post"],
    limits: {
      titleMaxLength: 280,
      descriptionMaxLength: 280,
      postMaxLength: 280,
      videoMaxDuration: 140,
      mediaLimit: 4,
    },
    streaming: {
      supported: false,
    },
    posting: {
      supported: true,
      videoUpload: false,
      textPost: true,
      imagePost: true,
      bestPractices: [
        "Keep tweets under 280 chars — every word counts",
        "1-2 hashtags max or none — threads work well",
        "Rhetorical questions and hot takes drive engagement",
        "Link to videos in separate reply for better reach",
        "Use 'LIVE NOW' format for stream announcements",
      ],
    },
    tone: "Conversational, opinion-driven. Use hot takes and rhetorical questions.",
    dailyLimits: { maxPosts: 50 },
  },

  discord: {
    label: "Discord",
    category: "community",
    color: "#5865f2",
    capabilities: ["Text messages (2K chars)", "Rich embeds (6K chars)", "Webhook posts"],
    contentTypes: ["post"],
    limits: {
      titleMaxLength: 256,
      descriptionMaxLength: 4096,
      postMaxLength: 2000,
    },
    streaming: {
      supported: false,
    },
    posting: {
      supported: true,
      videoUpload: false,
      textPost: true,
      imagePost: true,
      bestPractices: [
        "Use rich embeds for announcements — they stand out",
        "No hashtags — Discord doesn't use them",
        "Address community directly: 'y'all', 'the crew'",
        "Share behind-the-scenes to make members feel special",
        "Keep messages 2-4 sentences for readability",
      ],
    },
    tone: "Warm insider vibe, community-first. Reference the server and members.",
    dailyLimits: { maxPosts: 720 },
  },

  twitch: {
    label: "Twitch",
    category: "streaming",
    color: "#9146ff",
    capabilities: ["Live streaming", "Chat integration", "Clips"],
    contentTypes: ["stream"],
    limits: {
      titleMaxLength: 140,
      descriptionMaxLength: 300,
      maxTags: 10,
    },
    streaming: {
      supported: true,
      maxResolution: "1080p",
      maxBitrate: "6 Mbps",
      maxFps: 60,
    },
    posting: {
      supported: false,
      videoUpload: false,
      textPost: false,
      imagePost: false,
      bestPractices: [
        "Stream titles under 140 chars — be descriptive and catchy",
        "Use up to 10 tags for discoverability",
        "Set proper category/game for your stream",
        "Chat announcements should be under 500 chars",
      ],
    },
    tone: "Stream-culture language, hype energy. Reference clips and funny moments.",
    dailyLimits: { maxPosts: 0 },
  },

  kick: {
    label: "Kick",
    category: "streaming",
    color: "#53fc18",
    capabilities: ["Live streaming", "Chat integration"],
    contentTypes: ["stream"],
    limits: {
      titleMaxLength: 200,
      descriptionMaxLength: 500,
      maxTags: 10,
    },
    streaming: {
      supported: true,
      maxResolution: "1080p",
      maxBitrate: "8 Mbps",
      maxFps: 60,
    },
    posting: {
      supported: false,
      videoUpload: false,
      textPost: false,
      imagePost: false,
      bestPractices: [
        "Stream titles under 200 chars",
        "Set the right category for your stream",
        "Keep chat engagement high for visibility",
      ],
    },
    tone: "Casual streamer energy, direct and authentic.",
    dailyLimits: { maxPosts: 0 },
  },

  rumble: {
    label: "Rumble",
    category: "streaming",
    color: "#85c742",
    capabilities: ["Live streaming", "Video uploads"],
    contentTypes: ["video", "stream"],
    limits: {
      titleMaxLength: 100,
      descriptionMaxLength: 5000,
    },
    streaming: {
      supported: true,
      maxResolution: "2160p (4K)",
      maxBitrate: "25 Mbps",
      maxFps: 60,
    },
    posting: {
      supported: true,
      videoUpload: true,
      textPost: false,
      imagePost: false,
      bestPractices: [
        "Similar to YouTube — use SEO-rich titles and descriptions",
        "Rumble favors longer content for monetization",
        "Include relevant tags for search visibility",
      ],
    },
    tone: "Descriptive and professional, SEO-focused.",
    dailyLimits: { maxPosts: 20 },
  },
};

export function getContentTypesForPlatform(platform: Platform): string[] {
  const spec = PLATFORM_CONTENT_SPECS[platform];
  if (!spec) return ["video", "stream", "post"];
  return spec.contentTypes;
}

export function getTitleLimit(platform: Platform): number {
  return PLATFORM_CONTENT_SPECS[platform]?.limits.titleMaxLength || 100;
}

export function getDescriptionLimit(platform: Platform): number {
  return PLATFORM_CONTENT_SPECS[platform]?.limits.descriptionMaxLength || 5000;
}

export function canPost(platform: Platform): boolean {
  return PLATFORM_CONTENT_SPECS[platform]?.posting.supported ?? false;
}

export function canStream(platform: Platform): boolean {
  return PLATFORM_CONTENT_SPECS[platform]?.streaming.supported ?? false;
}

export function canUploadVideo(platform: Platform): boolean {
  return PLATFORM_CONTENT_SPECS[platform]?.posting.videoUpload ?? false;
}
