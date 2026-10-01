import type { ReactNode } from "react";
/** Harness stand-in. Real auth is omitted from the review zip on purpose. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
