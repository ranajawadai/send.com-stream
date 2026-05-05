"use client";

import React, { useState, useCallback } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import LinkInput from "@/components/LinkInput";
import { PlayCircle, Zap, Shield, Cpu, Loader2, AlertCircle, ExternalLink, CheckCircle } from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "https://ranajawad-sendnow-proxy.hf.space";

interface ResolveResult {
  status: string;
  direct_url?: string;
  file_name?: string;
  message?: string;
  steps?: string[];
  file_id?: string;
}

export default function Home() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSendNowUrl = (url: string): boolean => {
    return url.includes("send.now/") || url.includes("send.cm/");
  };

  const handleUrlSubmit = useCallback(async (url: string) => {
    setError(null);
    setResolveResult(null);

    // If it's a direct video URL (ends with .mp4, .mkv, etc.) or not a send.now URL
    if (!isSendNowUrl(url)) {
      setStreamUrl(url);
      return;
    }

    // It's a send.now URL - try to resolve it
    setIsResolving(true);

    try {
      const response = await fetch(`${PROXY_URL}/resolve?url=${encodeURIComponent(url)}`);
      const data: ResolveResult = await response.json();

      if (data.status === "resolved" && data.direct_url) {
        // Successfully resolved - play the video
        setResolveResult(data);
        setStreamUrl(data.direct_url);
      } else if (data.status === "captcha_required") {
        // Captcha required - show instructions
        setResolveResult(data);
        setIsResolving(false);
        return;
      } else {
        // Could not resolve
        setResolveResult(data);
        setIsResolving(false);
        return;
      }
    } catch (err) {
      setError("Failed to connect to proxy server. Make sure the HF Space is running.");
    } finally {
      setIsResolving(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-dark-900 text-white flex flex-col items-center justify-start p-6 md:p-12">
      <div className="w-full max-w-5xl space-y-12">
        {/* Header */}
        <header className="text-center space-y-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
            SEND.NOW <span className="text-indigo-500">STREAM</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
            Stream massive cloud courses and videos without downloading. Paste a Send.now link and start watching instantly.
          </p>
        </header>

        {/* Input Section */}
        <div className="flex justify-center">
          <LinkInput onSubmit={handleUrlSubmit} />
        </div>

        {/* Loading State */}
        {isResolving && (
          <section className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 size={48} className="text-indigo-500 animate-spin" />
            <p className="text-gray-400 text-lg">Resolving send.now link...</p>
            <p className="text-gray-600 text-sm">Extracting direct download URL</p>
          </section>
        )}

        {/* Error State */}
        {error && (
          <section className="glass rounded-2xl p-6 border border-red-500/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-red-400 font-bold text-lg">Error</h3>
                <p className="text-gray-400 mt-2">{error}</p>
              </div>
            </div>
          </section>
        )}

        {/* Captcha Required State */}
        {resolveResult && resolveResult.status === "captcha_required" && (
          <section className="glass rounded-2xl p-8 border border-yellow-500/30 space-y-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-500 flex-shrink-0 mt-1" size={28} />
              <div>
                <h3 className="text-yellow-400 font-bold text-xl">Captcha Verification Required</h3>
                <p className="text-gray-400 mt-2">{resolveResult.message}</p>
                {resolveResult.file_name && (
                  <p className="text-indigo-400 mt-1 font-mono text-sm">File: {resolveResult.file_name}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-white font-semibold">Follow these steps:</h4>
              {resolveResult.steps?.map((step, index) => (
                <div key={index} className="flex items-start gap-3 pl-4">
                  <span className="text-indigo-500 font-bold text-sm mt-0.5">{index + 1}.</span>
                  {index === 0 ? (
                    <a
                      href={`https://send.now/${resolveResult.file_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 transition-colors"
                    >
                      Open send.now link <ExternalLink size={14} />
                    </a>
                  ) : (
                    <p className="text-gray-300">{step.replace(/^Step \d+: /, "")}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Manual URL input after captcha */}
            <div className="pt-4 border-t border-white/10">
              <p className="text-gray-400 text-sm mb-3">
                After getting the direct download link, paste it below:
              </p>
              <LinkInput
                onSubmit={(directUrl) => {
                  setResolveResult(null);
                  setStreamUrl(directUrl);
                }}
              />
            </div>
          </section>
        )}

        {/* Resolved Success */}
        {resolveResult && resolveResult.status === "resolved" && (
          <section className="glass rounded-2xl p-4 border border-green-500/30">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-green-500" size={20} />
              <p className="text-green-400 text-sm">
                Resolved: {resolveResult.file_name || "Video"} — Now streaming via proxy
              </p>
            </div>
          </section>
        )}

        {/* Video Player Section */}
        {streamUrl ? (
          <section className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl transition-all duration-300 hover:border-indigo-500/50">
            <VideoPlayer url={streamUrl} />
          </section>
        ) : (
          !isResolving &&
          !resolveResult && (
            <section className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-3xl text-gray-600">
              <PlayCircle size={64} className="mb-4 opacity-20" />
              <p className="text-lg">Paste a Send.now link above to start streaming</p>
              <p className="text-sm mt-2 text-gray-700">
                Supports both direct video URLs and send.now share links
              </p>
            </section>
          )
        )}

        {/* Features Section */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="glass rounded-2xl p-6 space-y-4 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Zap className="text-indigo-500" size={32} />
            <h3 className="text-xl font-bold">Instant Streaming</h3>
            <p className="text-gray-400">
              Stream GB-sized videos without waiting for downloads. Uses HTTP Range Requests for instant seeking.
            </p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Shield className="text-indigo-500" size={32} />
            <h3 className="text-xl font-bold">Auto Resolve</h3>
            <p className="text-gray-400">
              Automatically extracts direct download links from send.now share URLs. Just paste and play.
            </p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Cpu className="text-indigo-500" size={32} />
            <h3 className="text-xl font-bold">Advanced Player</h3>
            <p className="text-gray-400">
              Professional video controls: playback speed, quality selection, fullscreen, and picture-in-picture.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-gray-600 text-sm mt-12 pb-6">
          <p>Built with Next.js, Express, and Hugging Face Spaces. Open source and free.</p>
        </footer>
      </div>
    </main>
  );
}
