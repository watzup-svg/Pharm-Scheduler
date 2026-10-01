export function AppErrorComponent({ error }: { error: unknown }) {
  return <pre className="p-4 text-sm text-red-800">{String((error as Error)?.stack ?? error)}</pre>;
}
