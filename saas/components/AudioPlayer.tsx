// components/AudioPlayer.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
  voiceModel: string;
}

export default function AudioPlayer({ audioUrl, title, voiceModel }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => setDuration(audio.duration);
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleAudioEnd = () => setIsPlaying(false);

    // Track audio loading and playing states natively
    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleAudioEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleAudioEnd);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.log('Audio playback error:', err));
      setIsPlaying(true);
    }
  };

  const handleScrub = (value: string) => {
    if (!audioRef.current) return;
    const time = parseFloat(value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-md flex flex-col md:flex-row items-center gap-4 w-full max-w-2xl">
      {/* Native Hidden Audio Node */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play/Pause Primary Control Button */}
      <button
        onClick={togglePlay}
        className="w-12 h-12 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full flex items-center justify-center font-bold text-lg shadow transition-all shrink-0"
        aria-label={isPlaying ? 'Pause Track' : 'Play Track'}
      >
        {isPlaying ? (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Metadata Labels */}
      <div className="flex-1 min-w-0 w-full">
        <h4 className="text-sm font-semibold truncate text-slate-100">{title}</h4>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
            OpenAI {voiceModel}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Dynamic Custom Progress Timeline Bar */}
        <div className="mt-2 flex items-center w-full">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => handleScrub(e.target.value)}
            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-0"
            style={{
              background: `linear-gradient(to right, #2563eb 0%, #2563eb ${
                duration ? (currentTime / duration) * 100 : 0
              }%, #334155 ${duration ? (currentTime / duration) * 100 : 0}%, #334155 100%)`,
            }}
          />
        </div>
      </div>

      {/* Action Utilities Option Group */}
      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end border-t border-slate-800 md:border-t-0 pt-3 md:pt-0">
        <a
          href={audioUrl}
          download={`${title.toLowerCase().replace(/\s+/g, '-')}.mp3`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
        >
          <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download MP3
        </a>
      </div>
    </div>
  );
}
