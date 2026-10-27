"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageLoading from "@/components/layout/PageLoading";
import { ThemeSection, SurfaceSection } from "@/components/admin/SettingsManager";
import { useAuthUser, signOutAndRedirect } from "@/lib/useAuthUser";
import { roleHome } from "@/lib/roleHome";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_THEME_COLOR, DEFAULT_SURFACE_COLOR } from "@/lib/themes";

/**
 * The platform owner's own look: accent (theme) color and background color of
 * the owner console. Separate from every school's settings — nothing here
 * changes how any school looks.
 */
export default function OwnerSettingsPage() {
  const router = useRouter();
  const authUser = useAuthUser();
  const supabase = useMemo(() => createClient(), []);
  const [colors, setColors] = useState<{ theme: string; surface: string } | null>(null);

  useEffect(() => {
    if (authUser && authUser.role !== "platform_owner") router.replace(roleHome(authUser.role));
  }, [authUser, router]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("platform_settings").select("theme_color, secondary_color").maybeSingle();
    setColors({ theme: data?.theme_color ?? DEFAULT_THEME_COLOR, surface: data?.secondary_color ?? DEFAULT_SURFACE_COLOR });
  }, [supabase]);

  useEffect(() => {
    if (authUser?.role === "platform_owner") load();
  }, [authUser, load]);

  const save = async (patch: { theme_color?: string; secondary_color?: string }) => {
    const { data, error } = await supabase.from("platform_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Couldn't save. Only the platform owner can change this.");
    await load();
  };

  if (!authUser || authUser.role !== "platform_owner" || !colors) return <PageLoading />;

  return (
    <DashboardLayout role="platform_owner" pageTitle="Settings" userName={authUser.fullName} onLogout={() => signOutAndRedirect(router)}>
      <div className="space-y-5">
        <p className="text-[13px] text-ink/55 dark:text-white/55">How your platform console looks. Schools keep their own colors.</p>
        <ThemeSection currentColor={colors.theme} onSave={(c) => save({ theme_color: c })} />
        <SurfaceSection currentColor={colors.surface} onSave={(c) => save({ secondary_color: c })} />
      </div>
    </DashboardLayout>
  );
}
