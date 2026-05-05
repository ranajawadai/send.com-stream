"use client";

import React, { useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import LinkInput from "@/components/LinkInput";
import { PlayCircle, Zap, Shield, Cpu } from "lucide-react";

export default function Home() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

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
          <LinkInput onSubmit={(url) => setStreamUrl(url)} />
        </div>

        {/* Video Player Section */}
        {streamUrl ? (
          <section className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl transition-all duration-300 hover:border-indigo-500/50">
            <VideoPlayer url={streamUrl} />
          </section>
        ) : (
          <section className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-3xl text-gray-600">
            <PlayCircle size={64} className="mb-4 opacity-20" />
            <p className="text-lg">Paste a Send.now link above to start streaming</p>
          </section>
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
            <h3 className="text-xl font-bold">Zero Storage Used</h3>
            <p className="text-gray-400">
              Your device storage remains untouched. Video data streams directly from the cloud to your browser.
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
          <p>
            Built with Next.js, Express, and Hugging Face Spaces. Open source and free.
          </p>
        </footer>
      </div>
    </main>
  );
}
