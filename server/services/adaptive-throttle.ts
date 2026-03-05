import { getQuotaForAllUsers } from "./youtube-quota-tracker";
import { createLogger } from "../lib/logger";

const logger = createLogger("adaptive-throttle");

type ServiceType = 'youtube' | 'openai' | 'stripe';

interface QuotaBudget {
  service: ServiceType;
  dailyLimit: number;
  used: number;
  resetAt: number; // Unix ms, midnight UTC
  strategy: 'burst' | 'steady' | 'conservative';
}

class AdaptiveThrottle {
  private budgets = new Map<ServiceType, QuotaBudget>();

  initialize(): void {
    const services: ServiceType[] = ['youtube', 'openai', 'stripe'];
    const limits: Record<ServiceType, number> = {
      youtube: 10000,
      openai: 500,
      stripe: 1000
    };

    const resetAt = this.getMidnightUTC();

    services.forEach(service => {
      this.budgets.set(service, {
        service,
        dailyLimit: limits[service],
        used: 0,
        resetAt,
        strategy: 'steady'
      });
    });
    logger.info("AdaptiveThrottle initialized", { services });
  }

  private getMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return midnight.getTime();
  }

  private checkReset(budget: QuotaBudget): void {
    if (Date.now() >= budget.resetAt) {
      budget.used = 0;
      budget.resetAt = this.getMidnightUTC();
      logger.info(`Quota reset for service: ${budget.service}`);
    }
  }

  recordUsage(service: ServiceType, count = 1): void {
    const budget = this.budgets.get(service);
    if (!budget) return;

    this.checkReset(budget);
    budget.used += count;
  }

  async shouldProceed(service: ServiceType, userId?: string, isPriority = false): Promise<{ proceed: boolean; delayMs?: number; reason?: string }> {
    const budget = this.budgets.get(service);
    if (!budget) return { proceed: true };

    this.checkReset(budget);

    let used = budget.used;
    let limit = budget.dailyLimit;

    // Special handling for YouTube if we have userId context
    if (service === 'youtube') {
      try {
        const allQuotas = await getQuotaForAllUsers();
        if (userId) {
          const userQuota = allQuotas.find(q => q.userId === userId);
          if (userQuota) {
            // Use the more conservative value
            const inMemoryPercent = budget.used / budget.dailyLimit;
            // userQuota.remaining is real units left
            // We don't have user-specific limit here easily without more calls, 
            // but we can at least check if user is exceeded
            if (userQuota.isExceeded) {
                return { proceed: false, reason: 'quota_exhausted', delayMs: budget.resetAt - Date.now() };
            }
          }
        }
      } catch (err) {
        // Fallback to in-memory
      }
    }

    const percentUsed = used / limit;

    if (percentUsed < 0.5) {
      return { proceed: true };
    }

    if (percentUsed >= 0.5 && percentUsed < 0.8) {
      const delayMs = Math.floor((budget.resetAt - Date.now()) / Math.max(1, limit - used));
      return { proceed: true, delayMs };
    }

    if (percentUsed >= 0.8 && percentUsed < 0.95) {
      if (isPriority) {
        return { proceed: true };
      }
      return { 
        proceed: false, 
        reason: 'quota_conservation', 
        delayMs: budget.resetAt - Date.now() 
      };
    }

    // >= 0.95
    return { 
      proceed: false, 
      reason: 'quota_exhausted', 
      delayMs: budget.resetAt - Date.now() 
    };
  }

  getStatus() {
    const status: Record<string, any> = {};
    this.budgets.forEach((budget, service) => {
      status[service] = {
        percentUsed: (budget.used / budget.dailyLimit) * 100,
        used: budget.used,
        limit: budget.dailyLimit,
        resetAt: new Date(budget.resetAt).toISOString(),
        strategy: budget.strategy
      };
    });
    return status;
  }
}

export const adaptiveThrottle = new AdaptiveThrottle();
adaptiveThrottle.initialize();
