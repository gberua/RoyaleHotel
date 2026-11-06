import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/admin/AuthShell";
import { AuthForms } from "@/components/admin/AuthForms";

export const metadata: Metadata = { title: "Forgot password" };

async function Forgot() {
  await connection();
  return <AuthShell title="auth.forgotTitle" back="/admin/forgot"><AuthForms mode="forgot" /></AuthShell>;
}

export default function ForgotPage() {
  return <Suspense><Forgot /></Suspense>;
}
