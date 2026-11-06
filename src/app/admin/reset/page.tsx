import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/admin/AuthShell";
import { AuthForms } from "@/components/admin/AuthForms";
import { findResetToken } from "@/lib/admin/passwords";

export const metadata: Metadata = { title: "New password" };

async function Reset({ searchParams }: { searchParams: PageProps<"/admin/reset">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const valid = !!(await findResetToken(token));
  return <AuthShell title="auth.resetTitle" back={`/admin/reset?token=${encodeURIComponent(token)}`}><AuthForms mode="reset" token={token} valid={valid} /></AuthShell>;
}

export default function ResetPage({ searchParams }: PageProps<"/admin/reset">) {
  return <Suspense><Reset searchParams={searchParams} /></Suspense>;
}
