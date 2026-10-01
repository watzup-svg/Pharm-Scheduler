/** Harness no-op. The Grok preview shell is omitted from the review zip. */
export function installPreviewHostBridge(_opts: { navigate: (path: string) => void; getRoutePaths: () => string[] }): () => void {
  return () => {};
}
export function collectRoutePathsFromTree(_tree: unknown): string[] {
  return [];
}
