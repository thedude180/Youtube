type QueuedRequest<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
};

const MAX_QUEUE_SIZE = 500;

class AIRequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private running = 0;
  private maxConcurrent: number;
  private dropped = 0;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.dropped++;
      throw new Error(`AI queue full (${MAX_QUEUE_SIZE} pending). Try again later.`);
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.running++;
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.running--;
      this.processNext();
    }
  }

  getStats() {
    return { queued: this.queue.length, running: this.running, maxConcurrent: this.maxConcurrent, dropped: this.dropped };
  }
}

export const aiQueue = new AIRequestQueue(5);
