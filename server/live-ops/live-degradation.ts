export interface LiveDegradationPlaybook {
  id: string;
  platform: string;
  failureType: string;
  steps: string[];
  autoExecute: boolean;
  severity: string;
}

const livePlaybooks: LiveDegradationPlaybook[] = [
  {
    id: "youtube-api-quota",
    platform: "youtube",
    failureType: "api_quota_exceeded",
    steps: [
      "Switch to cached data for viewer counts",
      "Reduce title update frequency from 15min to 30min",
      "Pause non-critical API calls (comments, analytics)",
      "Queue social blasts for post-stream delivery",
      "Alert creator about reduced functionality",
    ],
    autoExecute: true,
    severity: "medium",
  },
  {
    id: "youtube-stream-drop",
    platform: "youtube",
    failureType: "stream_connection_lost",
    steps: [
      "Detect connection loss within 30 seconds",
      "Pause all automated title/chat actions",
      "Monitor for automatic reconnection",
      "If >5 min, update social channels about brief interruption",
      "Resume automations on reconnect",
    ],
    autoExecute: true,
    severity: "high",
  },
  {
    id: "twitch-relay-failure",
    platform: "twitch",
    failureType: "rtmp_relay_failure",
    steps: [
      "Log FFmpeg error details",
      "Attempt relay restart with fresh RTMP key",
      "If 3 retries fail, mark Twitch relay as down",
      "Continue YouTube-only streaming",
      "Notify creator of Twitch outage",
    ],
    autoExecute: true,
    severity: "medium",
  },
  {
    id: "chat-api-failure",
    platform: "youtube",
    failureType: "chat_api_unavailable",
    steps: [
      "Switch to read-only chat monitoring mode",
      "Disable auto-responses temporarily",
      "Queue welcome/acknowledgment messages for later",
      "Retry chat API every 2 minutes",
      "Resume chat actions on recovery",
    ],
    autoExecute: true,
    severity: "medium",
  },
  {
    id: "kick-api-failure",
    platform: "kick",
    failureType: "api_unavailable",
    steps: [
      "Mark Kick relay as degraded",
      "Continue primary YouTube stream",
      "Retry Kick connection every 5 minutes",
      "Log degradation for post-stream review",
    ],
    autoExecute: true,
    severity: "low",
  },
];

export function getLiveDegradationPlaybook(platform: string, failureType: string): LiveDegradationPlaybook | null {
  return livePlaybooks.find(p => p.platform === platform && p.failureType === failureType) || null;
}

export function triggerLivePlaybook(playbookId: string): {
  triggered: boolean;
  playbook: LiveDegradationPlaybook | null;
  currentStep: number;
} {
  const playbook = livePlaybooks.find(p => p.id === playbookId);
  if (!playbook) return { triggered: false, playbook: null, currentStep: 0 };
  return { triggered: true, playbook, currentStep: 0 };
}

export function getAllLivePlaybooks(): LiveDegradationPlaybook[] {
  return [...livePlaybooks];
}
