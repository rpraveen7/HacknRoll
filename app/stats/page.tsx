import Link from "next/link";
import { Fraunces, Space_Grotesk } from "next/font/google";

import { readRecords } from "@/lib/records";

export const dynamic = "force-dynamic";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"]
});

const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const getRank = (count: number) => {
  if (count >= 12) return "Mythic Snoozer";
  if (count >= 8) return "Dream Raider";
  if (count >= 5) return "Power Napper";
  if (count >= 2) return "Drowsy Initiate";
  return "Wide Awake Rookie";
};

export default async function StatsPage() {
  const records = await readRecords();
  const sessions = records.summaries
    .map((summary) => {
      const start = summary.interval?.start ?? 0;
      const end = summary.interval?.end ?? 0;
      return {
        ...summary,
        durationMs: Math.max(0, end - start)
      };
    })
    .filter((session) => session.durationMs > 0);

  const totalCount = sessions.length;
  const totalMs = sessions.reduce((acc, session) => acc + session.durationMs, 0);
  const avgMs = totalCount ? totalMs / totalCount : 0;
  const longestMs = sessions.reduce((acc, session) => Math.max(acc, session.durationMs), 0);
  const rank = getRank(totalCount);
  const nextLevel = Math.ceil((totalCount + 1) / 3) * 3;
  const levelProgress = totalCount ? Math.min(100, Math.round((totalCount / nextLevel) * 100)) : 0;

  return (
    <div className={`${body.className} min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/70">Sleep Stats</p>
            <h1 className={`${display.className} text-4xl font-semibold sm:text-5xl`}>Your nap XP</h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-emerald-400/30 bg-emerald-300/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/20"
          >
            Back to Vault
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-emerald-900/40 bg-slate-900/60 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Rank</p>
                <h2 className={`${display.className} text-3xl`}>{rank}</h2>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p>{totalCount} sleeps logged</p>
                <p>{formatDuration(totalMs)} total</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                <span>Progress to next tier</span>
                <span>{levelProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${levelProgress}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-400">Next unlock at {nextLevel} sleeps.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {[
              { label: "Longest nap", value: formatDuration(longestMs) },
              { label: "Average nap", value: formatDuration(avgMs) },
              { label: "Total naps", value: `${totalCount}` }
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-200">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className={`${display.className} mb-4 text-2xl`}>Recent sleep sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">No sessions yet. Fall asleep on a video to unlock stats.</p>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 12).map((session, index) => (
                <div key={`${session.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">{session.title || "Untitled session"}</p>
                    <p className="text-xs text-slate-400">{new Date(session.interval.start).toLocaleString()}</p>
                  </div>
                  <div className="text-right text-sm text-slate-200">
                    <p>{formatDuration(session.durationMs)}</p>
                    <p className="text-xs text-slate-400">{session.url ? "Video linked" : "No link"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
