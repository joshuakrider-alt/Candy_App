import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/shop")({ component: ShopLayout });

function ShopLayout() {
  return <Outlet />;
}
