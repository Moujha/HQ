import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/app/BottomNav";
import { PullToRefresh } from "@/components/app/PullToRefresh";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onOnboarding = location.pathname === "/onboarding";

  useEffect(() => {
    if (loading || !profile) return;
    if (!profile.onboarded && !onOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, profile, onOnboarding, navigate]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg pb-[calc(6rem+env(safe-area-inset-bottom))] [padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)]">
      <PullToRefresh>
        <Outlet />
      </PullToRefresh>
      {!onOnboarding && <BottomNav />}
    </div>
  );
}
