import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const getClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
};

const buildSummaryPrompt = (combinedTranscript: string, sleepStart?: string | null, sleepEnd?: string | null) => {
  const windowText = sleepStart && sleepEnd ? `Time window: ${sleepStart} to ${sleepEnd}.` : "";
  return [
    "Summarize what the user missed while asleep.",
    windowText,
    "Use 3-6 concise bullet points.",
    "If the transcript is empty, respond with: No transcript available.",
    "",
    combinedTranscript
  ]
    .filter(Boolean)
    .join("\n");
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const sleepStart = formData.get("sleepStart")?.toString();
    const sleepEnd = formData.get("sleepEnd")?.toString();
    const captions = formData.get("captions")?.toString() || "";

    let transcript = "";
    if (audio instanceof File && audio.size > 0) {
      const file = await toFile(await audio.arrayBuffer(), audio.name || "sleep-audio.webm", {
        type: audio.type || "audio/webm"
      });
      const client = getClient();
      const transcription = await client.audio.transcriptions.create({
        file,
        model: "whisper-1"
      });
      transcript = transcription.text || "";
    }

    const combinedTranscript = [captions.trim(), transcript.trim()].filter(Boolean).join("\n\n");
    if (!combinedTranscript) {
      return NextResponse.json(
        {
          summary: "No transcript available.",
          transcript: ""
        },
        { headers: corsHeaders }
      );
    }

    const client = getClient();
    const summaryResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You summarize missed video or meeting content clearly and concisely."
        },
        {
          role: "user",
          content: buildSummaryPrompt(combinedTranscript, sleepStart, sleepEnd)
        }
      ]
    });

    const summary = summaryResponse.choices?.[0]?.message?.content?.trim() || "No summary returned.";
    return NextResponse.json(
      {
        summary,
        transcript: transcript || captions || ""
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summary failed.";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
