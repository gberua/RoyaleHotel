import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/admin/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

async function Login() {
  await connection();
  return <AuthShell title="auth.signInTitle" back="/admin/login"><LoginForm /></AuthShell>;
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
