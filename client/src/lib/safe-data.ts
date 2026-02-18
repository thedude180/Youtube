export function safeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  return [];
}

export function safeObj<T extends Record<string, any>>(data: unknown, fallback: T): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  return fallback;
}

export function safeProp<T>(obj: unknown, key: string, fallback: T): T {
  if (obj && typeof obj === 'object' && key in (obj as any)) {
    return (obj as any)[key] ?? fallback;
  }
  return fallback;
}
