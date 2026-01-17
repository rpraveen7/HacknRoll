# HackRoll Sleep Detector

## 🚀 The Only Files You Need to Edit

1.  **`app/page.tsx`**
    *   **What it is:** The main website page.
    *   **Edit this to:** Change the text, title, or layout of the page.

2.  **`components/SleepDetector.tsx`**
    *   **What it is:** The "brain" of the app.
    *   **Edit this to:** Change how the camera works, the sleep threshold (currently 2 seconds), or the alarm sound.

---

## 📂 Ignore These (They just make the code run)

*   `node_modules/`: A massive folder of code written by others (React, Next.js, etc.) that our app uses. **Never edit this.**
*   `public/`: Stores images and static files.
*   `.next/`: The built version of the app. Auto-generated.
*   `package.json` & `package-lock.json`: Keeps track of installed libraries.
*   `tsconfig.json`: Settings for TypeScript.
*   `next.config.ts` & `postcss.config.mjs`: Settings for Next.js and styling.

## ▶️ How to Run
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## Extension Quick Start

1. Load the extension:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click "Load unpacked" and select the `extension/` folder
2. Open the extension popup and confirm:
   - Detector app URL: `http://localhost:3000`
   - Enable detection: on
3. Open a video or Zoom tab and allow camera access when prompted.

Notes:
- Summaries use on-page captions by default. Add a Summary API URL in the popup for audio-based summaries.
- Snapshots (taunts/filters) are stored locally and shown in the popup.

## OpenAI Summaries (Works without captions)

1. Install dependencies (once):
   ```bash
   npm install
   ```
2. Set your OpenAI key in `.env.local`:
   ```bash
   OPENAI_API_KEY=your_key_here
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. In the extension popup, set Summary API URL to:
   `http://localhost:3000/api/summarize`

If captions are unavailable, the extension will try to capture audio from the video/meeting for the sleep window and send it to OpenAI for transcription + summary.
