"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import LinkInput from "@/components/LinkInput";
import {
  PlayCircle, Zap, Shield, Cpu, Loader2, AlertCircle,
  ExternalLink, CheckCircle, Download, Archive, Film,
  Trash2, RefreshCw, HardDrive
} from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "https://ranajawad-sendnow-proxy.hf.space";

interface DownloadStatus {
  id: string;
  status: string;
  fileName: string;
  progress: number;
  downloadedFormatted: string;
  totalFormatted: string;
  speedFormatted: string;
  eta: number | null;
  files: VideoFile[];
  error: string | null;
  elapsed: number;
}

interface VideoFile {
  name: string;
  streamUrl: string;
  size: number;
  sizeFormatted: string;
}

export default function Home() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null);
  const [extractedFiles, setExtractedFiles] = useState<VideoFile[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isRarUrl = (url: string): boolean => {
    return url.includes(".rar") || url.includes(".zip") || url.includes(".7z");
  };

  const isSendNowUrl = (url: string): boolean => {
    return url.includes("send.now/") || url.includes("send.cm/");
  };

  const isVideoUrl = (url: string): boolean => {
    return /\.(mp4|mkv|webm|avi|mov|m4v)(\?|$)/i.test(url);
  };

  // Poll download status
  useEffect(() => {
    if (downloadId && isDownloading) {
      pollRef.current = setInterval(async () => {
        try {
          const resp = await fetch(`${PROXY_URL}/download-status/${downloadId}`);
          const data: DownloadStatus = await resp.json();
          setDownloadStatus(data);

          if (data.status === "completed") {
            setIsDownloading(false);
            setExtractedFiles(data.files);
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (data.status === "error") {
            setIsDownloading(false);
            setError(`Download failed: ${data.error}`);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (err) {
          // Poll failed, keep trying
        }
      }, 2000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [downloadId, isDownloading]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    setError(null);
    setDownloadStatus(null);
    setExtractedFiles([]);
    setSelectedFile(null);

    // Direct video URL - play it
    if (isVideoUrl(url) && !isSendNowUrl(url)) {
      setStreamUrl(url);
      return;
    }

    // Direct download URL (like datatransfer.to) that is a RAR
    if (isRarUrl(url) && !isSendNowUrl(url)) {
      // Download and extract on HF Space
      startDownload(url);
      return;
    }

    // Send.now URL - try to resolve
    if (isSendNowUrl(url)) {
      setIsResolving(true);
      try {
        const response = await fetch(`${PROXY_URL}/resolve?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.status === "resolved" && data.direct_url) {
          const directUrl = data.direct_url;
          if (isRarUrl(directUrl)) {
            startDownload(directUrl);
          } else {
            setStreamUrl(directUrl);
          }
        } else {
          // Show captcha instructions
          setDownloadStatus({
            id: "captcha",
            status: "captcha_required",
            fileName: data.file_id || url.split("/").pop() || "",
            progress: 0,
            downloadedFormatted: "0",
            totalFormatted: "0",
            speedFormatted: "0",
            eta: null,
            files: [],
            error: null,
            elapsed: 0
          });
        }
      } catch (err) {
        setError("Failed to connect to proxy server.");
      } finally {
        setIsResolving(false);
      }
      return;
    }

    // Unknown URL - try to stream directly
    setStreamUrl(url);
  }, []);

  const startDownload = async (url: string) => {
    setIsDownloading(true);
    setError(null);

    try {
      const resp = await fetch(`${PROXY_URL}/download-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await resp.json();

      if (data.downloadId) {
        setDownloadId(data.downloadId);
      } else {
        setError("Failed to start download.");
        setIsDownloading(false);
      }
    } catch (err) {
      setError("Failed to connect to proxy server.");
      setIsDownloading(false);
    }
  };

  const cleanupServer = async () => {
    try {
      await fetch(`${PROXY_URL}/cleanup`, { method: "DELETE" });
      setExtractedFiles([]);
      setDownloadStatus(null);
      setDownloadId(null);
      setStreamUrl(null);
      setSelectedFile(null);
    } catch (err) { }
  };

  const playFile = (file: VideoFile) => {
    setSelectedFile(file.name);
    setStreamUrl(`${PROXY_URL}${file.streamUrl}`);
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
            Stream cloud courses without downloading. Supports RAR files — downloads and extracts on the server.
          </p>
        </header>

        {/* Input Section */}
        <div className="flex justify-center">
          <LinkInput onSubmit={handleUrlSubmit} />
        </div>

        {/* Helper text */}
        <p className="text-center text-gray-600 text-sm">
          Paste any link: send.now share URL, direct .mp4 link, or direct .rar download link
        </p>

        {/* Loading State */}
        {isResolving && (
          <section className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 size={48} className="text-indigo-500 animate-spin" />
            <p className="text-gray-400">Resolving send.now link...</p>
          </section>
        )}

        {/* Error State */}
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

        {/* Captcha Required */}
        {downloadStatus && downloadStatus.status === "captcha_required" && (
          <section className="glass rounded-2xl p-8 border border-yellow-500/30 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-500 flex-shrink-0 mt-1" size={28} />
              <div>
                <h3 className="text-yellow-400 font-bold text-xl">Get Direct Download Link</h3>
                <p className="text-gray-400 mt-2">send.now requires captcha. Get the direct link and paste it above.</p>
              </div>
            </div>
            <ol className="space-y-2 text-gray-300 pl-4">
              <li>1. Open send.now link in browser</li>
              <li>2. Complete captcha → Click CONTINUE</li>
              <li>3. Click Download button</li>
              <li>4. Open Downloads (Ctrl+J) → Right-click file → Copy link</li>
              <li>5. Paste the direct link above</li>
            </ol>
          </section>
        )}

        {/* Download Progress */}
        {isDownloading && downloadStatus && (
          <section className="glass rounded-2xl p-6 border border-indigo-500/30 space-y-4">
            <div className="flex items-center gap-3">
              {downloadStatus.status === "downloading" ? (
                <Download className="text-indigo-500 animate-pulse" size={24} />
              ) : downloadStatus.status === "extracting" ? (
                <Archive className="text-yellow-500 animate-pulse" size={24} />
              ) : (
                <Loader2 className="text-indigo-500 animate-spin" size={24} />
              )}
              <div>
                <h3 className="text-white font-bold">
                  {downloadStatus.status === "downloading" ? "Downloading..." :
                    downloadStatus.status === "extracting" ? "Extracting RAR..." :
                      "Processing..."}
                </h3>
                <p className="text-gray-400 text-sm font-mono">{downloadStatus.fileName}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-dark-600 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${downloadStatus.progress}%` }}
              />
            </div>

            <div className="flex justify-between text-sm text-gray-400">
              <span>{downloadStatus.progress}%</span>
              <span>{downloadStatus.downloadedFormatted} / {downloadStatus.totalFormatted}</span>
              <span>{downloadStatus.speedFormatted}</span>
              {downloadStatus.eta && <span>ETA: {downloadStatus.eta}s</span>}
            </div>
          </section>
        )}

        {/* Extracted Files List */}
        {extractedFiles.length > 0 && (
          <section className="glass rounded-2xl p-6 border border-green-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Film className="text-green-500" size={24} />
                <h3 className="text-green-400 font-bold text-lg">
                  {extractedFiles.length} Video{extractedFiles.length > 1 ? "s" : ""} Found
                </h3>
              </div>
              <button
                onClick={cleanupServer}
                className="text-gray-500 hover:text-red-400 transition-colors p-2"
                title="Delete all files from server"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {extractedFiles.map((file, index) => (
                <button
                  key={index}
                  onClick={() => playFile(file)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${selectedFile === file.name
                      ? "bg-indigo-600/20 border border-indigo-500/50"
                      : "bg-dark-700 border border-white/5 hover:border-indigo-500/30"
                    }`}
                >
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
        {!streamUrl && !isResolving && !isDownloading && !downloadStatus && extractedFiles.length === 0 && (
          <section className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-white/5 rounded-3xl text-gray-600">
            <PlayCircle size={64} className="mb-4 opacity-20" />
            <p className="text-lg">Paste a link above to start</p>
            <p className="text-sm mt-2 text-gray-700">
              Supports: send.now URLs, direct .mp4, direct .rar files
            </p>
          </section>
        )}

        {/* Features */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Zap className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">Stream Videos</h3>
            <p className="text-gray-400 text-sm">Direct .mp4 links stream instantly with Range Requests.</p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <Archive className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">RAR Extraction</h3>
            <p className="text-gray-400 text-sm">RAR files download and extract on the server. Zero load on your device.</p>
          </div>
          <div className="glass rounded-2xl p-6 space-y-3 hover:border-indigo-500/30 border border-transparent transition-all duration-300">
            <HardDrive className="text-indigo-500" size={28} />
            <h3 className="text-lg font-bold">Zero Local Storage</h3>
            <p className="text-gray-400 text-sm">Everything runs on Hugging Face Spaces. Your laptop stays clean.</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-gray-600 text-sm mt-8 pb-6">
          <p>Built with Next.js, Express, and Hugging Face Spaces</p>
        </footer>
      </div>
    </main>
  );
}
