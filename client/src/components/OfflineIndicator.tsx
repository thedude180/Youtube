import { useState, useEffect } from 'react';
import { useOfflineStatus } from '@/hooks/use-offline';
import { offlineEngine } from '@/lib/offline-engine';
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Download, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

export function OfflineStatusBadge() {
  const { status, queueCount, syncing, lastSync, syncNow, preload } = useOfflineStatus();
  const [showDetails, setShowDetails] = useState(false);

  const statusConfig = {
    online: { icon: Wifi, label: 'Online', color: 'text-emerald-500' },
    offline: { icon: WifiOff, label: 'Offline', color: 'text-destructive' },
    unstable: { icon: Wifi, label: 'Unstable', color: 'text-yellow-500' },
  };

  const cfg = statusConfig[status];
  const Icon = cfg.icon;

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowDetails(!showDetails)}
            data-testid="button-offline-status"
          >
            <Icon className={`h-4 w-4 ${cfg.color}`} />
            {queueCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                {queueCount > 9 ? '9+' : queueCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{cfg.label}{queueCount > 0 ? ` - ${queueCount} queued` : ''}</TooltipContent>
      </Tooltip>

      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-border bg-card p-3 shadow-lg z-50" data-testid="panel-offline-details">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${cfg.color}`} />
              <span className="text-sm font-medium" data-testid="text-connection-status">{cfg.label}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setShowDetails(false)} data-testid="button-close-offline-details">
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Queued actions</span>
              <span className="font-medium text-foreground" data-testid="text-queue-count">{queueCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last sync</span>
              <span className="font-medium text-foreground" data-testid="text-last-sync">{formatTime(lastSync)}</span>
            </div>
          </div>

          <div className="flex gap-1 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={syncNow}
              disabled={status === 'offline' || syncing}
              data-testid="button-sync-now"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={preload}
              disabled={status === 'offline'}
              data-testid="button-preload"
            >
              <Download className="h-3 w-3 mr-1" />
              Prep Offline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('creatoros_pwa_dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
      setShowBanner(false);
    }
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('creatoros_pwa_dismissed', new Date().toISOString());
  };

  if (!showBanner || installed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 rounded-lg border border-border bg-card p-4 shadow-lg" data-testid="banner-pwa-install">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" data-testid="text-install-title">Install CreatorOS</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get the full app on your device. Works offline, launches instantly, and stays in sync.
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleInstall} data-testid="button-install-app">
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss} data-testid="button-dismiss-install">
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
