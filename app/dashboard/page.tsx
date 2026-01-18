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

const formatTimestamp = (value?: number) => {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
};

const formatInterval = (interval?: { start: number; end: number }) => {
  if (!interval?.start || !interval?.end) return "Unknown window";
  const start = new Date(interval.start).toLocaleTimeString();
  const end = new Date(interval.end).toLocaleTimeString();
  return `${start} - ${end}`;
};

export default async function Dashboard() {
  const records = await readRecords();
  const summaries = records.summaries.slice(0, 24);
  const screenshots = records.screenshots.slice(0, 24);

  return (
    <div className={`${body.className} min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-slate-100`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300/70">Sleep Vault</p>
            <h1 className={`${display.className} text-4xl font-semibold sm:text-5xl`}>Your night watch archive</h1>
          </div>
          <Link
            href="/stats"
            className="rounded-full border border-amber-400/30 bg-amber-300/10 px-5 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300 hover:bg-amber-300/20"
          >
            View Game Stats
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-700/50 bg-slate-900/60 p-6 shadow-2xl shadow-black/40">
            <h2 className={`${display.className} mb-4 text-2xl`}>Latest summaries</h2>
            {summaries.length === 0 ? (
              <p className="text-sm text-slate-400">No summaries yet. Take a nap and let the extension record one.</p>
            ) : (
              <div className="space-y-4">
                {summaries.map((item, index) => (
                  <article key={`${item.createdAt}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                      <span>{formatTimestamp(item.interval?.start)}</span>
                      <span>{formatInterval(item.interval)}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-amber-200">{item.title || "Untitled session"}</h3>
                    <p className="mt-2 text-sm text-slate-200">{item.summary}</p>
                    {item.url && (
                      <a className="mt-3 inline-flex text-xs text-amber-300 hover:text-amber-200" href={item.url}>
                        Open source video
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-700/50 bg-slate-900/60 p-6 shadow-2xl shadow-black/40">
            <h2 className={`${display.className} mb-4 text-2xl`}>Snapshots</h2>
            {screenshots.length === 0 ? (
              <p className="text-sm text-slate-400">No snapshots yet. Wake up to see your highlight reel here.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshots.map((shot, index) => (
                  <div key={`${shot.createdAt}-${index}`} className="group relative overflow-hidden rounded-2xl border border-slate-800">
                    <img src={shot.dataUrl} alt="Sleep snapshot" className="h-28 w-full object-cover transition duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                    <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.2em] text-slate-200 opacity-0 transition group-hover:opacity-100">
                      {formatTimestamp(shot.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
