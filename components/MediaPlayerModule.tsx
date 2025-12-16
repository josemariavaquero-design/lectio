import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, Play, Pause, AlertCircle, X } from 'lucide-react';
import { Language } from '../types';
import { UI_TEXT } from '../constants';

interface PlayerProps {
  language: Language;
  themeColor: string;
  themeBg: string;
  externalAudio?: { url: string; title: string; blob?: Blob } | null;
}

const MediaPlayerModule: React.FC<PlayerProps> = ({ language, themeColor, themeBg, externalAudio }) => {
  const t = UI_TEXT[language];
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visualization state
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Sync with external audio (from other modules)
  useEffect(() => {
    if (externalAudio) {
        setAudioUrl(externalAudio.url);
        setFileName(externalAudio.title);
        setIsPlaying(true);
        // We delay play slightly to ensure DOM update
        setTimeout(() => {
            audioRef.current?.play().catch(e => console.log("Auto-play prevented", e));
        }, 100);
    }
  }, [externalAudio]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        setFileName(file.name);
        setIsPlaying(false);
    }
  };

  const clearTrack = () => {
    setAudioUrl(null);
    setFileName('');
    setIsPlaying(false);
    // Reset file input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const initAudioContext = () => {
    if (!audioRef.current || audioContext) return;

    // Fix for AudioContext not starting without user gesture
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    
    const ana = ctx.createAnalyser();
    ana.fftSize = 256;
    const bufferLength = ana.frequencyBinCount;
    const data = new Uint8Array(bufferLength);

    try {
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(ana);
        ana.connect(ctx.destination);
        sourceRef.current = source;
    } catch (e) {
        console.warn("MediaElementSource already connected or error", e);
    }

    setAudioContext(ctx);
    setAnalyser(ana);
    setDataArray(data);
  };

  useEffect(() => {
    if (isPlaying && analyser && dataArray && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const renderFrame = () => {
            if (!isPlaying) return;
            requestAnimationFrame(renderFrame);
            analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgb(15, 23, 42)'; // slate-900
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / dataArray.length) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < dataArray.length; i++) {
                barHeight = dataArray[i];
                // Color based on theme
                const r = themeColor === 'indigo' ? 99 : 16;
                const g = themeColor === 'indigo' ? 102 : 185;
                const b = themeColor === 'indigo' ? 241 : 129;
                
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, canvas.height - barHeight / 1.5, barWidth, barHeight / 1.5);

                x += barWidth + 1;
            }
        };
        renderFrame();
    }
  }, [isPlaying, analyser, dataArray, themeColor]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    // Resume context if suspended (browser policy)
    if (audioContext?.state === 'suspended') {
        audioContext.resume();
    }
    // Init context if missing
    if (!audioContext) {
        initAudioContext();
    }

    if (isPlaying) {
        audioRef.current.pause();
    } else {
        audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
       <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">{t.playerTitle}</h2>
        <p className="text-slate-400">{t.playerDesc}</p>
      </div>

      <div 
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-700 hover:border-slate-500 bg-slate-800/30 rounded-2xl p-8 text-center cursor-pointer transition-all relative group"
      >
        <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFile} />
        <div className="flex flex-col items-center gap-3">
             <Music size={32} className="text-slate-400 group-hover:text-slate-200 transition-colors"/>
             <p className="text-slate-300 group-hover:text-white transition-colors">{fileName || t.playerDrop}</p>
        </div>
      </div>

      <div className="relative bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-2xl">
          {audioUrl && (
            <button 
                onClick={clearTrack} 
                className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors z-10"
                title="Clear track"
            >
                <X size={20} />
            </button>
          )}

          <canvas ref={canvasRef} width="600" height="150" className="w-full h-[150px] bg-slate-900 rounded-lg mb-4" />
          
          <audio 
            ref={audioRef} 
            src={audioUrl || ''} 
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onContextMenu={(e) => e.preventDefault()}
            controls
            className="w-full"
          />
          
          {!audioUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl backdrop-blur-sm">
                  <span className="text-slate-500 flex items-center gap-2"><AlertCircle size={16}/> {t.playerNoTrack}</span>
              </div>
          )}
      </div>
    </div>
  );
};

export default MediaPlayerModule;