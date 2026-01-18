import { NextResponse } from "next/server";

import { readRecords, writeRecords } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const MAX_SUMMARIES = 200;
const MAX_SCREENSHOTS = 200;

export async function GET() {
  const records = await readRecords();
  return NextResponse.json(records, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body?.type;
    const payload = body?.payload;
    if (!type || !payload) {
      return NextResponse.json({ error: "Missing type or payload." }, { status: 400, headers: corsHeaders });
    }

    const records = await readRecords();
    if (type === "summary") {
      records.summaries.unshift(payload);
      records.summaries = records.summaries.slice(0, MAX_SUMMARIES);
    } else if (type === "screenshot") {
      records.screenshots.unshift(payload);
      records.screenshots = records.screenshots.slice(0, MAX_SCREENSHOTS);
    } else {
      return NextResponse.json({ error: "Invalid record type." }, { status: 400, headers: corsHeaders });
    }

    await writeRecords(records);
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store record.";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
