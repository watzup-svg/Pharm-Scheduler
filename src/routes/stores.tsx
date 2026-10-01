import { createFileRoute } from "@tanstack/react-router";
import { ListsScreen } from "@/components/lists-screen";
import { StoresScreen } from "@/components/stores-screen";

export const Route = createFileRoute("/stores")({
  component: () => (
    <ListsScreen setup>
      <StoresScreen />
    </ListsScreen>
  ),
});
