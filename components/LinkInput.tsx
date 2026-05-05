"use client";

import React, { useState } from "react";
import { Link as LinkIcon, ArrowRight, Loader2 } from "lucide-react";

interface LinkInputProps {
  onSubmit: (url: string) => void;
}

export default function LinkInput({ onSubmit }: LinkInputProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = () => {
    if (!input.trim()) return;
    setIsLoading(true);
    onSubmit(input.trim());
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <div className="relative group w-full max-w-2xl">
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 animate-tilt"></div>

      {/* Input container */}
      <div className="relative flex items-center glass rounded-2xl p-2 pl-5 shadow-xl">
        <LinkIcon className="text-gray-500 mr-3 flex-shrink-0" size={20} />
        <input
          type="text"
          placeholder="Paste send.now video link here..."
          className="bg-transparent border-none outline-none text-white w-full py-3 text-lg placeholder-gray-600"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAction()}
        />
        <button
          onClick={handleAction}
          disabled={isLoading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all duration-200 active:scale-95 flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <ArrowRight size={20} />
          )}
        </button>
      </div>
    </div>
  );
}
