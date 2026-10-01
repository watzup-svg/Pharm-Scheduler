import { createFileRoute } from "@tanstack/react-router";
import { ListsScreen } from "@/components/lists-screen";
import { PrintScreen } from "@/components/print-screen";

export const Route = createFileRoute("/print")({
  component: () => (
    <ListsScreen>
      <PrintScreen />
    </ListsScreen>
  ),
});
