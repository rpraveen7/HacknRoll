"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const EAR_THRESHOLD = 0.22;
const SLEEP_DURATION_MS = 1000;

const SleepDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);
  const lastClosedTimeRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);

  const startAlarm = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!oscillatorRef.current) {
      const osc = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioContextRef.current.currentTime);
      
      gain.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
      
      osc.connect(gain);
      gain.connect(audioContextRef.current.destination);
      
      osc.start();
      oscillatorRef.current = osc;
    }
  };

  const stopAlarm = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
  };

  useEffect(() => {
    if (isAsleep) {
      startAlarm();
    } else {
      stopAlarm();
    }
    return () => stopAlarm();
  }, [isAsleep]);

  useEffect(() => {
    const initFaceLandmarker = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      setFaceLandmarker(landmarker);
    };

    initFaceLandmarker();
  }, []);

  useEffect(() => {
    if (!faceLandmarker || !videoRef.current) return;

    const video = videoRef.current;
    let animationFrameId: number;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.play();
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    const calculateEAR = (landmarks: any[]) => {
      // Left eye indices (approximate for EAR)
      // 160, 158 are top, 153, 144 are bottom, 33 is left, 133 is right
      const getDist = (p1: any, p2: any) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
      };

      // Right Eye EAR
      const p1_r = landmarks[33];
      const p2_r = landmarks[160];
      const p3_r = landmarks[158];
      const p4_r = landmarks[133];
      const p5_r = landmarks[153];
      const p6_r = landmarks[144];

      const ear_r = (getDist(p2_r, p6_r) + getDist(p3_r, p5_r)) / (2 * getDist(p1_r, p4_r));

      // Left Eye EAR
      const p1_l = landmarks[362];
      const p2_l = landmarks[385];
      const p3_l = landmarks[387];
      const p4_l = landmarks[263];
      const p5_l = landmarks[373];
      const p6_l = landmarks[380];

      const ear_l = (getDist(p2_l, p6_l) + getDist(p3_l, p5_l)) / (2 * getDist(p1_l, p4_l));

      return (ear_r + ear_l) / 2;
    };

    const detect = () => {
      if (video.readyState >= 2) {
        const results = faceLandmarker.detectForVideo(video, performance.now());
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const ear = calculateEAR(landmarks);

          if (ear < EAR_THRESHOLD) {
            if (lastClosedTimeRef.current === null) {
              lastClosedTimeRef.current = Date.now();
            } else if (Date.now() - lastClosedTimeRef.current > SLEEP_DURATION_MS) {
              setIsAsleep(true);
            }
          } else {
            lastClosedTimeRef.current = null;
            setIsAsleep(false);
          }
        }
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    startCamera();
    detect();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [faceLandmarker]);

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative border-4 border-gray-800 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-[640px] h-[480px] object-cover"
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
        {isAsleep && (
          <div className="absolute inset-0 bg-red-600/50 flex items-center justify-center">
            <h1 className="text-white text-6xl font-bold animate-bounce">WAKE UP!</h1>
          </div>
        )}
      </div>
      <div className="mt-4 text-xl font-semibold">
        Status: {isAsleep ? <span className="text-red-600 font-bold">SLEEPING!</span> : <span className="text-green-600">Awake</span>}
      </div>
    </div>
  );
};

export default SleepDetector;
