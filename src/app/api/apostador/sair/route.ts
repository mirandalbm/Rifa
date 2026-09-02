import { NextResponse } from "next/server";
import { encerrarSessaoApostador } from "@/lib/auth";

export async function POST() {
  await encerrarSessaoApostador();
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"),
    303,
  );
}
