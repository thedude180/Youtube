export function safeArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'rows', 'records', 'list', 'entries']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

export function safeObj<T extends Record<string, unknown>>(data: unknown, fallback: T): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  return fallback;
}

export function safeProp<T>(obj: unknown, key: string, fallback: T): T {
  if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key] as T ?? fallback;
  }
  return fallback;
}
