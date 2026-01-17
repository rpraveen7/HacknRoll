"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const EAR_THRESHOLD = 0.22;
const SLEEP_DURATION_MS = 1000;

// Add your filter images here
const SLEEP_FILTERS = [
    { name: 'face', url: '/filters/face.webp' },
    { name: 'tung', url: '/filters/tung.webp' },
    { name: 'noFilter', url: '/filters/noFilter.webp' },
    { name: 'face2', url: '/filters/face2.jpg' },
];

const SleepDetector: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const screenshotCanvasRef = useRef<HTMLCanvasElement>(null);
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [isAsleep, setIsAsleep] = useState(false);
    const [currentFilter, setCurrentFilter] = useState(SLEEP_FILTERS[0]);
    const [facePosition, setFacePosition] = useState<{ x: number; y: number; width: number; height: number; rotation: number } | null>(null);
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [showScreenshot, setShowScreenshot] = useState(false);
    const lastClosedTimeRef = useRef<number | null>(null);
    const wasAsleepRef = useRef<boolean>(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const oscillatorRef = useRef<OscillatorNode | null>(null);
    const screenshotTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    const captureScreenshot = () => {
        if (!videoRef.current || !screenshotCanvasRef.current) return;

        const video = videoRef.current;
        const canvas = screenshotCanvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // If there's a filter active, draw it on top
        if (facePosition && isAsleep) {
            const filterImg = new Image();
            filterImg.src = currentFilter.url;

            // Calculate filter position on canvas
            const scaleX = canvas.width / video.offsetWidth;
            const scaleY = canvas.height / video.offsetHeight;

            const filterX = (facePosition.x + facePosition.width / 2) * scaleX;
            const filterY = (facePosition.y + facePosition.height / 2) * scaleY;
            const filterWidth = facePosition.width * 1.3 * scaleX;
            const filterHeight = facePosition.height * 1.3 * scaleY;

            ctx.save();
            ctx.translate(filterX, filterY);
            ctx.rotate((facePosition.rotation * Math.PI) / 180);
            ctx.globalAlpha = 0.85;
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(
                filterImg,
                -filterWidth / 2,
                -filterHeight / 2,
                filterWidth,
                filterHeight
            );
            ctx.restore();
        }

        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        setScreenshot(dataUrl);
    };

    useEffect(() => {
        if (isAsleep) {
            startAlarm();
            setCurrentFilter(SLEEP_FILTERS[Math.floor(Math.random() * SLEEP_FILTERS.length)]);
            wasAsleepRef.current = true;
        } else {
            stopAlarm();

            // If we just woke up, capture screenshot and show it
            if (wasAsleepRef.current) {
                captureScreenshot();
                setShowScreenshot(true);

                // Clear any existing timeout
                if (screenshotTimeoutRef.current) {
                    clearTimeout(screenshotTimeoutRef.current);
                }

                // Hide screenshot after 5 seconds
                screenshotTimeoutRef.current = setTimeout(() => {
                    setShowScreenshot(false);
                }, 5000);

                wasAsleepRef.current = false;
            }
        }

        return () => {
            stopAlarm();
            if (screenshotTimeoutRef.current) {
                clearTimeout(screenshotTimeoutRef.current);
            }
        };
    }, [isAsleep]);

    // Update screenshot continuously while sleeping (so we get the latest one)
    useEffect(() => {
        if (isAsleep && facePosition) {
            const intervalId = setInterval(() => {
                captureScreenshot();
            }, 500); // Capture every 500ms while sleeping

            return () => clearInterval(intervalId);
        }
    }, [isAsleep, facePosition, currentFilter]);

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

        const calculateEAR = (landmarks: { x: number; y: number; z: number }[]) => {
            const getDist = (p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }) => {
                return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
            };

            const p1_r = landmarks[33];
            const p2_r = landmarks[160];
            const p3_r = landmarks[158];
            const p4_r = landmarks[133];
            const p5_r = landmarks[153];
            const p6_r = landmarks[144];

            const ear_r = (getDist(p2_r, p6_r) + getDist(p3_r, p5_r)) / (2 * getDist(p1_r, p4_r));

            const p1_l = landmarks[362];
            const p2_l = landmarks[385];
            const p3_l = landmarks[387];
            const p4_l = landmarks[263];
            const p5_l = landmarks[373];
            const p6_l = landmarks[380];

            const ear_l = (getDist(p2_l, p6_l) + getDist(p3_l, p5_l)) / (2 * getDist(p1_l, p4_l));

            return (ear_r + ear_l) / 2;
        };

        const getFaceBox = (landmarks: { x: number; y: number }[]) => {
            const xs = landmarks.map((l: { x: number }) => l.x);
            const ys = landmarks.map((l: { y: number }) => l.y);

            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const width = maxX - minX;
            const height = maxY - minY;

            // Calculate face rotation using eye positions
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const rotation = Math.atan2(
                rightEye.y - leftEye.y,
                rightEye.x - leftEye.x
            ) * (180 / Math.PI);

            return {
                x: minX * video.offsetWidth,
                y: minY * video.offsetHeight,
                width: width * video.offsetWidth,
                height: height * video.offsetHeight,
                rotation: rotation
            };
        };

        const detect = () => {
            if (video.readyState >= 2) {
                const results = faceLandmarker.detectForVideo(video, performance.now());
                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                    const landmarks = results.faceLandmarks[0];
                    const ear = calculateEAR(landmarks);
                    const faceBox = getFaceBox(landmarks);
                    setFacePosition(faceBox);

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

                {/* Hidden canvas for screenshot capture */}
                <canvas
                    ref={screenshotCanvasRef}
                    className="hidden"
                />

                {/* Filter Overlay */}
                {isAsleep && facePosition && (
                    <div
                        className="absolute pointer-events-none transition-all duration-100 ease-out"
                        style={{
                            left: `${facePosition.x + facePosition.width / 2}px`,
                            top: `${facePosition.y + facePosition.height / 2}px`,
                            width: `${facePosition.width * 1.3}px`,
                            height: `${facePosition.height * 1.3}px`,
                            transform: `translate(-50%, -50%) rotate(${facePosition.rotation}deg)`,
                        }}
                    >
                        <img
                            src={currentFilter.url}
                            alt={currentFilter.name}
                            className="w-full h-full object-contain"
                            style={{
                                mixBlendMode: 'multiply',
                                opacity: 0.85,
                                filter: 'contrast(1.1) brightness(1.1)',
                            }}
                        />
                    </div>
                )}

                {/* Screenshot Display - Top Right */}
                {showScreenshot && screenshot && (
                    <div className="absolute top-4 right-4 border-4 border-yellow-400 rounded-lg shadow-2xl animate-bounce z-20">
                        <img
                            src={screenshot}
                            alt="You while sleeping!"
                            className="w-48 h-36 object-cover rounded"
                        />
                        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                            😴 Caught your goofy ahh! 😴
                        </div>
                    </div>
                )}
            </div>

            {isAsleep && (
                <div className="mt-6 text-center">
                    <h1 className="text-6xl font-bold text-red-600 animate-bounce">WAKE UP!</h1>
                </div>
            )}

            <div className="mt-4 text-xl font-semibold">
                Status: {isAsleep ? <span className="text-red-600 font-bold">SLEEPING!</span> : <span className="text-green-600">Awake</span>}
            </div>
        </div>
    );
};

export default SleepDetector;
