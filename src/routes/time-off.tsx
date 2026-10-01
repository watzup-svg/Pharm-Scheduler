import { createFileRoute } from "@tanstack/react-router";
import { ListsScreen } from "@/components/lists-screen";
import { TimeOffScreen } from "@/components/time-off-screen";

export const Route = createFileRoute("/time-off")({
  component: () => (
    <ListsScreen>
      <TimeOffScreen />
    </ListsScreen>
  ),
});
