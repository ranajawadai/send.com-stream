"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import LinkInput from "@/components/LinkInput";
import {
  PlayCircle, Zap, Shield, Cpu, Loader2, AlertCircle,
  ExternalLink, CheckCircle, Download, Archive, Film,
  Trash2, RefreshCw, HardDrive, Upload
} from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "https://ranajawad-sendnow-proxy.hf.space";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

interface VideoFile {
  name: string;
  streamUrl: string;
  size: number;
  sizeFormatted: string;
}

interface RelayStatus {
  phase: "idle" | "relaying" | "extracting" | "completed" | "error";
  progress: number;
  sentBytes: number;
  totalBytes: number;
  speed: number;
  eta: number | null;
  files: VideoFile[];
  error: string | null;
  relayId: string | null;
}

export default function Home() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({
    phase: "idle", progress: 0, sentBytes: 0, totalBytes: 0,
    speed: 0, eta: null, files: [], error: null, relayId: null
  });
  const [captchaInfo, setCaptchaInfo] = useState<{ fileId: string; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isRarUrl = (url: string): boolean => /\.(rar|zip|7z)(\?|$)/i.test(url);
  const isSendNowUrl = (url: string): boolean => url.includes("send.now/") || url.includes("send.cm/");
  const isVideoUrl = (url: string): boolean => /\.(mp4|mkv|webm|avi|mov|m4v)(\?|$)/i.test(url);

  // Poll relay status for extraction
  useEffect(() => {
    if (relayStatus.phase === "extracting" && relayStatus.relayId) {
      pollRef.current = setInterval(async () => {
        try {
          const resp = await fetch(`${PROXY_URL}/download-status/${relayStatus.relayId}`);
          const data = await resp.json();
          if (data.status === "completed") {
            setRelayStatus(prev => ({ ...prev, phase: "completed", files: data.files }));
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (data.status === "error") {
            setRelayStatus(prev => ({ ...prev, phase: "error", error: data.error }));
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (e) { }
      }, 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [relayStatus.phase, relayStatus.relayId]);

  // Browser Relay: fetch file in browser, stream chunks to HF Space
  const startBrowserRelay = useCallback(async (url: string) => {
    setError(null);
    setCaptchaInfo(null);
    setRelayStatus({
      phase: "relaying", progress: 0, sentBytes: 0, totalBytes: 0,
      speed: 0, eta: null, files: [], error: null, relayId: null
    });

    try {
      // Step 1: Start relay session on server
      const fileName = decodeURIComponent(url.split("/").pop() || "archive.rar");
      const startResp = await fetch(`${PROXY_URL}/relay-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, totalSize: 0 })
      });
      const startData = await startResp.json();
      const relayId = startData.relayId;

      setRelayStatus(prev => ({ ...prev, relayId }));

      // Step 2: Fetch file from URL using browser (residential IP)
      abortRef.current = new AbortController();
      const response = await fetch(url, { signal: abortRef.current.signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("ReadableStream not supported");

      const totalBytes = parseInt(response.headers.get("content-length") || "0", 10);
      let sentBytes = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let buffer = new Uint8Array(0);

      setRelayStatus(prev => ({ ...prev, totalBytes }));

      // Step 3: Read chunks and upload to HF Space
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Send chunks when buffer is large enough
        while (buffer.length >= CHUNK_SIZE) {
          const chunk = buffer.slice(0, CHUNK_SIZE);
          buffer = buffer.slice(CHUNK_SIZE);

          await fetch(`${PROXY_URL}/relay-chunk/${relayId}`, {
            method: "POST",
            body: chunk,
            headers: { "Content-Type": "application/octet-stream" }
          });

          sentBytes += chunk.length;

          // Update progress
          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed >= 1) {
            const speed = (sentBytes - lastBytes) / elapsed;
            const eta = totalBytes > 0 && speed > 0 ? Math.round((totalBytes - sentBytes) / speed) : null;
            setRelayStatus(prev => ({
              ...prev,
              sentBytes,
              progress: totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0,
              speed,
              eta
            }));
            lastTime = now;
            lastBytes = sentBytes;
          }
        }
      }

      // Send remaining buffer
      if (buffer.length > 0) {
        await fetch(`${PROXY_URL}/relay-chunk/${relayId}`, {
          method: "POST",
          body: buffer,
          headers: { "Content-Type": "application/octet-stream" }
        });
        sentBytes += buffer.length;
      }

      // Step 4: Complete relay — trigger extraction
      setRelayStatus(prev => ({
        ...prev,
        phase: "extracting",
        sentBytes,
        progress: 100
      }));

      await fetch(`${PROXY_URL}/relay-complete/${relayId}`, { method: "POST" });

    } catch (err: any) {
      if (err.name === "AbortError") {
        setRelayStatus(prev => ({ ...prev, phase: "idle" }));
      } else {
        setRelayStatus(prev => ({ ...prev, phase: "error", error: err.message }));
      }
    }
  }, []);

  const handleUrlSubmit = useCallback(async (url: string) => {
    setError(null);
    setCaptchaInfo(null);
    setRelayStatus({
      phase: "idle", progress: 0, sentBytes: 0, totalBytes: 0,
      speed: 0, eta: null, files: [], error: null, relayId: null
    });

    // Direct video URL — play it
    if (isVideoUrl(url) && !isSendNowUrl(url)) {
      setStreamUrl(url);
      return;
    }

    // Direct RAR URL — use browser relay
    if (isRarUrl(url) && !isSendNowUrl(url)) {
      startBrowserRelay(url);
      return;
    }

    // Send.now URL — try to resolve
    if (isSendNowUrl(url)) {
      try {
        const resp = await fetch(`${PROXY_URL}/resolve?url=${encodeURIComponent(url)}`);
        const data = await resp.json();

        if (data.status === "resolved" && data.direct_url) {
          if (isRarUrl(data.direct_url)) {
            startBrowserRelay(data.direct_url);
          } else {
            setStreamUrl(data.direct_url);
          }
        } else {
          setCaptchaInfo({
            fileId: data.file_id || url.split("/").pop() || "",
            message: data.message || "Captcha required"
          });
        }
      } catch (err) {
        setError("Failed to connect to proxy server.");
      }
      return;
    }

    // Unknown URL — try to stream
    setStreamUrl(url);
  }, [startBrowserRelay]);

  const cancelRelay = () => {
    if (abortRef.current) abortRef.current.abort();
    if (pollRef.current) clearInterval(pollRef.current);
    setRelayStatus({
      phase: "idle", progress: 0, sentBytes: 0, totalBytes: 0,
      speed: 0, eta: null, files: [], error: null, relayId: null
    });
  };

  const cleanupServer = async () => {
    try {
      await fetch(`${PROXY_URL}/cleanup`, { method: "DELETE" });
      setRelayStatus({
        phase: "idle", progress: 0, sentBytes: 0, totalBytes: 0,
        speed: 0, eta: null, files: [], error: null, relayId: null
      });
      setStreamUrl(null);
      setSelectedFile(null);
    } catch (e) { }
  };

  const playFile = (file: VideoFile) => {
    setSelectedFile(file.name);
    setStreamUrl(`${PROXY_URL}${file.streamUrl}`);
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <main className="min-h-screen bg-dark-900 text-white flex flex-col items-center justify-start p-6 md:p-12">
      <div className="w-full max-w-5xl space-y-8">

        {/* Header */}
        <header className="text-center space-y-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
            SEND.NOW <span className="text-indigo-500">STREAM</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
            Stream cloud courses without downloading to your device. RAR files are relayed through your browser and extracted on the server.
          </p>
        </header>

        {/* Input */}
        <div className="flex justify-center">
          <LinkInput onSubmit={handleUrlSubmit} />
        </div>
        <p className="text-center text-gray-600 text-sm">
          Paste: send.now URL • direct .mp4 link • direct .rar link
        </p>

        {/* Error */}
        {error && (
          <section className="glass rounded-2xl p-6 border border-red-500/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-red-400 font-bold">Error</h3>
                <p className="text-gray-400 mt-2">{error}</p>
              </div>
            </div>
          </section>
        )}

        {/* Captcha Instructions */}
        {captchaInfo && (
          <section className="glass rounded-2xl p-8 border border-yellow-500/30 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-500 flex-shrink-0 mt-1" size={28} />
              <div>
                <h3 className="text-yellow-400 font-bold text-xl">Get Direct Download Link</h3>
                <p className="text-gray-400 mt-2">{captchaInfo.message}</p>
              </div>
            </div>
            <ol className="space-y-2 text-gray-300 pl-4">
              <li>1. Open <a href={`https://send.now/${captchaInfo.fileId}`} target="_blank" className="text-indigo-400 underline">send.now link</a> in browser</li>
              <li>2. Complete captcha → Click CONTINUE</li>
              <li>3. Click Download button</li>
              <li>4. Open Downloads (Ctrl+J) → Right-click file → Copy link</li>
              <li>5. Paste the direct link above</li>
            </ol>
          </section>
        )}

        {/* Browser Relay Progress */}
        {relayStatus.phase === "relaying" && (
          <section className="glass rounded-2xl p-6 border border-indigo-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Upload className="text-indigo-500 animate-pulse" size={24} />
                <div>
                  <h3 className="text-white font-bold">Browser Relay Active</h3>
                  <p className="text-gray-400 text-sm">Your browser is downloading and forwarding to server</p>
                </div>
              </div>
              <button onClick={cancelRelay} className="text-gray-500 hover:text-red-400 text-sm px-3 py-1 rounded border border-white/10">
                Cancel
              </button>
            </div>
            <div className="w-full bg-dark-600 rounded-full h-3">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${relayStatus.progress}%` }} />
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>{relayStatus.progress}%</span>
              <span>{formatBytes(relayStatus.sentBytes)} {relayStatus.totalBytes > 0 ? `/ ${formatBytes(relayStatus.totalBytes)}` : ""}</span>
              <span>{formatBytes(relayStatus.speed)}/s</span>
              {relayStatus.eta !== null && <span>ETA: {relayStatus.eta}s</span>}
            </div>
          </section>
        )}

        {/* Extracting */}
        {relayStatus.phase === "extracting" && (
          <section className="glass rounded-2xl p-6 border border-yellow-500/30 space-y-4">
            <div className="flex items-center gap-3">
              <Archive className="text-yellow-500 animate-pulse" size={24} />
              <div>
                <h3 className="text-white font-bold">Extracting RAR on Server...</h3>
                <p className="text-gray-400 text-sm">Upload complete! Extracting video files...</p>
              </div>
            </div>
            <div className="w-full bg-dark-600 rounded-full h-3">
              <div className="bg-yellow-500 h-3 rounded-full animate-pulse" style={{ width: "100%" }} />
            </div>
          </section>
        )}

        {/* Relay Error */}
        {relayStatus.phase === "error" && (
          <section className="glass rounded-2xl p-6 border border-red-500/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-500" size={24} />
              <div>
                <h3 className="text-red-400 font-bold">Relay Failed</h3>
                <p className="text-gray-400 mt-2">{relayStatus.error}</p>
                <button onClick={cancelRelay} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Try again</button>
              </div>
            </div>
          </section>
        )}

        {/* Extracted Files */}
        {relayStatus.phase === "completed" && relayStatus.files.length > 0 && (
          <section className="glass rounded-2xl p-6 border border-green-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Film className="text-green-500" size={24} />
                <h3 className="text-green-400 font-bold text-lg">
                  {relayStatus.files.length} Video{relayStatus.files.length > 1 ? "s" : ""} Found!
                </h3>
              </div>
              <button onClick={cleanupServer} className="text-gray-500 hover:text-red-400 transition-colors p-2" title="Delete all files">
                <Trash2 size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {relayStatus.files.map((file, i) => (
                <button key={i} onClick={() => playFile(file)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${selectedFile === file.name
                    ? "bg-indigo-600/20 border border-indigo-500/50"
                    : "bg-dark-700 border border-white/5 hover:border-indigo-500/30"
                    }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PlayCircle size={20} className="text-indigo-400" />
                      <div>
                        <p className="text-white font-medium text-sm">{file.name}</p>
                        <p className="text-gray-500 text-xs">{file.sizeFormatted}</p>
                      </div>
                    </div>
                    <span className="text-indigo-400 text-xs">PLAY</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Video Player */}
        {streamUrl && (
          <section className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl transition-all duration-300 hover:border-indigo-500/50">
            <VideoPlayer url={streamUrl} />
          </section>
        )}

        {/* Empty State */}
        {!streamUrl && relayStatus.phase === "idle" && !captchaInfo && !error && (
          <section className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-white/5 rounded-3xl text-gray-600">
            <PlayCircle size={64} className="mb-4 opacity-20" />
            <p className="text-lg">Paste a link above to start</p>
            <p className="text-sm mt-2 text-gray-700">Supports: send.now URLs, direct .mp4, direct .rar files</p>
          </section>
        )}

        {/* How it works */}
        <section className="glass rounded-2xl p-6 border border-white/5 space-y-4">
          <h3 className="text-white font-bold text-lg">How Browser Relay Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold text-lg">1</span>
              <div>
                <p className="text-white font-medium">Your Browser Downloads</p>
                <p className="text-gray-500">Uses your residential IP to bypass cloud blocks</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold text-lg">2</span>
              <div>
                <p className="text-white font-medium">Server Receives & Extracts</p>
                <p className="text-gray-500">RAR is extracted on HF Space, not your device</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold text-lg">3</span>
              <div>
                <p className="text-white font-medium">Stream Videos</p>
                <p className="text-gray-500">Play extracted .mp4 files directly in browser</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Zap className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">Stream Videos</h3>
            <p className="text-gray-400 text-sm">Direct .mp4 links stream instantly with Range Requests.</p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Archive className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">RAR Browser Relay</h3>
            <p className="text-gray-400 text-sm">RAR files are relayed through your browser and extracted on the server.</p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <HardDrive className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">Zero Local Storage</h3>
            <p className="text-gray-400 text-sm">Nothing saved to your device. Everything streams from the cloud.</p>
          </div>
        </section>

        <footer className="text-center text-gray-600 text-sm mt-8 pb-6">
          <p>Built with Next.js, Express, and Hugging Face Spaces</p>
        </footer>
      </div>
    </main>
  );
}
