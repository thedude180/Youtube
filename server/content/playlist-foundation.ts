import { emitDomainEvent } from "../kernel/index";

export interface PlaylistEntry {
  videoId: number;
  position: number;
  addedAt: Date;
}

export interface PlaylistConfig {
  name: string;
  description: string;
  entries: PlaylistEntry[];
  autoOptimize: boolean;
  gameFilter?: string;
}

const playlistStore = new Map<string, PlaylistConfig[]>();

export function createPlaylist(userId: string, name: string, description: string, gameFilter?: string): PlaylistConfig {
  const playlist: PlaylistConfig = {
    name,
    description,
    entries: [],
    autoOptimize: true,
    gameFilter,
  };

  const userPlaylists = playlistStore.get(userId) || [];
  userPlaylists.push(playlist);
  playlistStore.set(userId, userPlaylists);

  return playlist;
}

export function addToPlaylist(userId: string, playlistName: string, videoId: number): boolean {
  const userPlaylists = playlistStore.get(userId) || [];
  const playlist = userPlaylists.find(p => p.name === playlistName);
  if (!playlist) return false;

  const position = playlist.entries.length;
  playlist.entries.push({ videoId, position, addedAt: new Date() });
  return true;
}

export function optimizePlaylistOrder(
  entries: PlaylistEntry[],
  performanceData: { videoId: number; views: number; retention: number }[],
): PlaylistEntry[] {
  const perfMap = new Map(performanceData.map(p => [p.videoId, p]));

  return [...entries].sort((a, b) => {
    const perfA = perfMap.get(a.videoId);
    const perfB = perfMap.get(b.videoId);
    if (!perfA || !perfB) return 0;
    const scoreA = perfA.views * 0.4 + perfA.retention * 100 * 0.6;
    const scoreB = perfB.views * 0.4 + perfB.retention * 100 * 0.6;
    return scoreB - scoreA;
  }).map((entry, i) => ({ ...entry, position: i }));
}

export function getPlaylists(userId: string): PlaylistConfig[] {
  return playlistStore.get(userId) || [];
}
