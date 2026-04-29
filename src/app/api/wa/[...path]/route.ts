import { NextRequest, NextResponse } from "next/server";

const WA_SERVER = process.env.NEXT_PUBLIC_WA_SERVER_URL || "http://136.117.247.136:3001";
const WA_KEY = process.env.NEXT_PUBLIC_WA_API_KEY || "buildfactory-secret-key";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathArr } = await params;
  const url = `${WA_SERVER}/${pathArr.join("/")}?key=${WA_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Cannot reach WA server" }, { status: 503 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathArr } = await params;
  const url = `${WA_SERVER}/${pathArr.join("/")}?key=${WA_KEY}`;
  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Cannot reach WA server" }, { status: 503 });
  }
}
