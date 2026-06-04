export function t(dict: Record<string, string>, key: string, fallback = key) {
  return dict[key] || fallback
}
