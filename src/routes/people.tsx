import { createFileRoute } from "@tanstack/react-router";
import { ListsScreen } from "@/components/lists-screen";
import { PeopleScreen } from "@/components/people-screen";

export const Route = createFileRoute("/people")({
  component: () => (
    <ListsScreen setup>
      <PeopleScreen />
    </ListsScreen>
  ),
});
