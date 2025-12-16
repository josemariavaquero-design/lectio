import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Download, Volume2, Settings2, CheckCircle2, Clock } from 'lucide-react';
import { TextChunk, Language } from '../types';

interface AudioPlayerProps {
  chunk: TextChunk;
  onDownload: (id: string) => void;
  language: Language;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ chunk, onDownload, language }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Theme Constants based on Language
  const isEs = language === 'es';
  const themeColor = isEs ? 'indigo' : 'emerald';
  
  // Dynamic Classes
  const downloadedBg = isEs ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400';
  const downloadedBorder = isEs ? 'border-indigo-500/30' : 'border-emerald-500/30';
  const buttonMain = isEs ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500';
  const buttonShadow = isEs ? 'shadow-indigo-500/20' : 'shadow-emerald-500/20';
  const buttonBorder = isEs ? 'border-indigo-500' : 'border-emerald-500';
  const sliderAccent = isEs ? 'accent-indigo-400' : 'accent-emerald-400';

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setPlaybackRate(1);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [chunk.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      if (total) {
        setProgress((current / total) * 100);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const seekTime = (parseFloat(e.target.value) / 100) * duration;
      audioRef.current.currentTime = seekTime;
      setProgress(parseFloat(e.target.value));
    }
  };

  const handleDownloadClick = () => {
    onDownload(chunk.id);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!chunk.audioUrl) return null;

  return (
    <div className={`w-full rounded-xl border p-4 shadow-lg mb-4 last:mb-0 transition-all ${chunk.downloaded ? `bg-slate-900/80 ${downloadedBorder}` : 'bg-slate-800 border-slate-700'}`}>
      <audio
        ref={audioRef}
        src={chunk.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
      />

      {/* Header Info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`p-2 rounded-lg shrink-0 ${chunk.downloaded ? 'bg-green-500/20 text-green-400' : downloadedBg}`}>
            {chunk.downloaded ? <CheckCircle2 size={20} /> : <Volume2 size={20} />}
          </div>
          <div className="min-w-0">
            <h3 className="text-md font-semibold text-white truncate">{chunk.title}</h3>
            <p className="text-xs text-slate-400 truncate italic flex items-center gap-1">
               {formatTime(duration)}
            </p>
          </div>
        </div>
        
        <a 
          href={chunk.audioUrl} 
          download={`${chunk.title.replace(/\s+/g, '_')}.wav`}
          onClick={handleDownloadClick}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors text-xs border ${
            chunk.downloaded 
            ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white' 
            : `${buttonMain} text-white ${buttonBorder} shadow-lg ${buttonShadow}`
          }`}
        >
          <Download size={14} />
          {chunk.downloaded ? 'DL Again' : 'Download'}
        </a>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors shrink-0 ${chunk.downloaded ? 'bg-slate-700 hover:bg-slate-600' : buttonMain}`}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          
          <div className="flex-1 flex flex-col justify-center">
             <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={handleSeek}
              className={`w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer ${sliderAccent}`}
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
              <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
              <span>{formatTime(duration || 0)}</span>
            </div>
          </div>
        </div>

        {/* Speed Control */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-700/50 pt-2 mt-1">
          <Settings2 size={12} className="text-slate-500" />
          <span className="text-xs text-slate-400">Speed:</span>
          <select 
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded px-1 py-0.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;