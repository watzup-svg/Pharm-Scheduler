import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotFound } from "@/components/not-found";

// Static-page stand-in for src/routes/__root.tsx (which renders <html> for the server build).
export const Route = createRootRoute({
  notFoundComponent: NotFound,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
