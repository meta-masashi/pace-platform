"use client";

/**
 * Smart Scanner — "The Pocket Node 6"
 * カメラ解析UI（CV Engine連携）
 * Phase 2: CV Addon 機能。MVP では UI シェルのみ。
 */

import { useCallback, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Video, X } from "lucide-react";

type ScanState = "ready" | "recording" | "analyzing" | "result";

interface ScanResult {
  neuromuscular_noise: "normal" | "elevated" | "high";
  sample_entropy: number;
  summary: string;
}

export function SmartScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("ready");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setState("ready");
    } catch {
      alert("カメラへのアクセスが拒否されました");
    }
  }, []);

  const startRecording = useCallback(() => {
    setState("recording");
    // Simulated 5-second recording
    setTimeout(() => {
      setState("analyzing");
      // Simulated analysis (MVP: stub, Phase 2: actual CV pipeline)
      setTimeout(() => {
        setResult({
          neuromuscular_noise: "normal",
          sample_entropy: 0.42,
          summary: "神経筋ノイズ：正常（クリア）",
        });
        setState("result");
      }, 2500);
    }, 5000);
  }, []);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setState("ready");
    setResult(null);
  }, [stream]);

  const noiseConfig = {
    normal: { bg: "bg-brand-500", text: "クリア" },
    elevated: { bg: "bg-amber-500", text: "やや上昇" },
    high: { bg: "bg-red-500", text: "要注意" },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white relative">
      {/* Camera viewfinder */}
      <div className="relative w-full h-screen">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
            <Camera className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400 text-sm mb-6">
              カメラを起動してスキャンを開始
            </p>
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors"
            >
              カメラを起動
            </button>
          </div>
        )}

        {/* Ghost silhouette overlay */}
        {stream && state === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Simple stick figure silhouette */}
            <div className="w-40 h-64 border-2 border-dashed border-brand-400/50 rounded-2xl flex items-center justify-center">
              <span className="text-6xl opacity-30">🧍</span>
            </div>
            <p className="text-brand-400/80 text-sm mt-4 text-center px-8">
              この枠に合わせて立ち、
              <br />
              スクワットを3回してください
            </p>
          </div>
        )}

        {/* Recording indicator */}
        {state === "recording" && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600/90 px-4 py-2 rounded-full">
            <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-medium">録画中...</span>
          </div>
        )}

        {/* Analyzing overlay */}
        {state === "analyzing" && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" />
            <p className="text-lg font-medium">解析中...</p>
            <p className="text-sm text-slate-400 mt-1">
              動作パターンを分析しています
            </p>
          </div>
        )}

        {/* Result overlay */}
        {state === "result" && result && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center px-8">
            <div
              className={`w-20 h-20 rounded-full ${noiseConfig[result.neuromuscular_noise].bg} flex items-center justify-center mb-4`}
            >
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">{result.summary}</h2>
            <p className="text-sm text-slate-400 mb-6">
              SampEn: {result.sample_entropy.toFixed(2)}
            </p>
            <button
              onClick={stopCamera}
              className="px-6 py-3 bg-slate-800 text-white rounded-xl font-medium"
            >
              閉じる
            </button>
          </div>
        )}

        {/* Controls */}
        {stream && state !== "analyzing" && state !== "result" && (
          <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-6">
            <button
              onClick={stopCamera}
              className="w-14 h-14 rounded-full bg-slate-800/80 flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={startRecording}
              disabled={state === "recording"}
              className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center ${
                state === "recording"
                  ? "bg-red-600"
                  : "bg-transparent hover:bg-white/10"
              }`}
            >
              <Video className="w-8 h-8" />
            </button>
          </div>
        )}
      </div>

      {/* Legal */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <p className="text-2xs text-slate-700">
          ※ 参考情報です。医療診断ではありません。
        </p>
      </div>
    </div>
  );
}
