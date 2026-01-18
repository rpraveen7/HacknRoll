import fs from "fs/promises";
import path from "path";

export type SleepInterval = {
  start: number;
  end: number;
};

export type SleepSummary = {
  summary: string;
  transcript: string;
  interval: SleepInterval;
  createdAt: number;
  title?: string;
  url?: string;
};

export type SleepScreenshot = {
  dataUrl: string;
  createdAt: number;
  title?: string;
  url?: string;
};

export type Records = {
  summaries: SleepSummary[];
  screenshots: SleepScreenshot[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "records.json");

const emptyRecords = (): Records => ({
  summaries: [],
  screenshots: []
});

export const readRecords = async (): Promise<Records> => {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      summaries: Array.isArray(parsed?.summaries) ? parsed.summaries : [],
      screenshots: Array.isArray(parsed?.screenshots) ? parsed.screenshots : []
    };
  } catch (error) {
    return emptyRecords();
  }
};

export const writeRecords = async (records: Records) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf8");
};
