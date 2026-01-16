import SleepDetector from '@/components/SleepDetector';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex flex-col">
        <h1 className="text-4xl font-bold mb-8">HackRoll Sleep Detector</h1>
        <p className="mb-12 text-center text-gray-600 max-w-2xl">
          Using MediaPipe Face Landmarker to detect eye fatigue. 
          If your eyes are closed for more than 2 seconds, we'll wake you up!
        </p>
        <SleepDetector />
      </div>
    </main>
  );
}