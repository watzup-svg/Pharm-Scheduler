import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotFound } from "@/components/not-found";

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
