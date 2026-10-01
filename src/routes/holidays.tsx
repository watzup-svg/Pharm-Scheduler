import { createFileRoute } from "@tanstack/react-router";
import { HolidaysScreen } from "@/components/holidays-screen";
import { ListsScreen } from "@/components/lists-screen";

export const Route = createFileRoute("/holidays")({
  component: () => (
    <ListsScreen setup>
      <HolidaysScreen />
    </ListsScreen>
  ),
});
