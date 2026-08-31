import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/auth";

export async function POST() {
  await encerrarSessao();
  return NextResponse.redirect(new URL("/entrar", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"), 303);
}
