"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { routeForRole } from "@/features/auth/routing";

export default function Home() {
  const { accessToken, role, hydrating } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (hydrating) return;
    // Not signed in, or an unknown role → routeForRole returns "/login".
    router.replace(accessToken ? routeForRole(role) : "/login");
  }, [accessToken, role, hydrating, router]);

  return null;
}
