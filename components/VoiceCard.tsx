import React, { useState } from 'react';
import { VoiceOption, Language, GenerationSettings } from '../types';
import { Mic, CheckCircle2, Play, Square, Loader2, Zap, AlertCircle } from 'lucide-react';
import { generateSpeechFromText } from '../services/geminiService';
import { UI_TEXT } from '../constants';

interface VoiceCardProps {
  voice: VoiceOption;
  isSelected: boolean;
  onSelect: (voice: VoiceOption) => void;
  apiKey: string | null;
  language: Language;
  settings: GenerationSettings;
}

const VoiceCard: React.FC<VoiceCardProps> = ({ voice, isSelected, onSelect, apiKey, language, settings }) => {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Theme colors based on language
  const themeColor = language === 'es' ? 'indigo' : 'emerald';
  const t = UI_TEXT[language];

  // Helper to get cache key - Now includes pitch and speed to differentiate previews
  const getCacheKey = () => `lectio_prev_${language}_${voice.id}_p${settings.pitch}_s${settings.speed}`;

  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setErrorMsg(null);

    if (isPreviewing && audio) {
      audio.pause();
      setIsPreviewing(false);
      return;
    }

    // 1. Check LocalStorage Cache
    const cacheKey = getCacheKey();
    const cachedAudioData = localStorage.getItem(cacheKey);

    if (cachedAudioData) {
        playAudio(cachedAudioData);
        return;
    }

    // 2. If not cached, requires API Key
    if (!apiKey) {
      setErrorMsg(language === 'es' ? "Falta API Key" : "No API Key");
      return;
    }

    setIsLoadingPreview(true);
    try {
      const demoText = t.previewText.replace('{name}', voice.name);
      
      const blob = await generateSpeechFromText(
        demoText, 
        voice, 
        settings, // Use the actual current settings (pitch/speed)
        apiKey,
        language
      );
      
      // Convert Blob to DataURI for Storage
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64data = reader.result as string;
          try {
              localStorage.setItem(cacheKey, base64data);
          } catch (e) {
              console.warn("LocalStorage full, clearing old previews...");
              Object.keys(localStorage).forEach(key => {
                  if(key.startsWith('lectio_prev_')) localStorage.removeItem(key);
              });
              try {
                  localStorage.setItem(cacheKey, base64data);
              } catch(e2) {
                  // ignore
              }
          }
          playAudio(base64data);
      };
      reader.readAsDataURL(blob);

    } catch (err) {
      console.error("Error playing preview", err);
      setErrorMsg("Error");
      setIsLoadingPreview(false);
    }
  };

  const playAudio = (src: string) => {
      const newAudio = new Audio(src);
      
      newAudio.onended = () => {
        setIsPreviewing(false);
        setAudio(null);
      };

      setAudio(newAudio);
      newAudio.play();
      setIsPreviewing(true);
      setIsLoadingPreview(false);
  };

  const selectedClass = language === 'es' 
    ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
    : 'bg-emerald-900/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]';

  const iconBgClass = isSelected 
    ? (language === 'es' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300')
    : 'bg-slate-700/50 text-slate-400';

  const checkColor = language === 'es' ? 'text-indigo-400' : 'text-emerald-400';

  // Check if cached to show indicator
  const isCached = !!localStorage.getItem(getCacheKey());

  return (
    <div
      onClick={() => onSelect(voice)}
      className={`
        relative flex flex-col items-start p-4 rounded-xl border transition-all duration-200 w-full text-left cursor-pointer group
        ${isSelected 
          ? selectedClass
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
        }
      `}
    >
      <div className="flex justify-between w-full mb-2">
        <div className={`p-2 rounded-lg ${iconBgClass}`}>
          <Mic size={18} />
        </div>
        <div className="flex items-center gap-2">
          {errorMsg ? (
            <span className="text-xs text-red-400 flex items-center gap-1 font-bold">
                <AlertCircle size={12}/> {errorMsg}
            </span>
          ) : (
            <>
                {isCached && !isLoadingPreview && !isPreviewing && (
                    <Zap size={12} className="text-amber-400 opacity-60" title={language === 'es' ? "En caché (rápido)" : "Cached (Fast)"} />
                )}
                <button
                    onClick={handlePreview}
                    disabled={isLoadingPreview}
                    className={`p-2 rounded-full transition-colors z-10 ${isPreviewing ? 'bg-white text-slate-900' : 'hover:bg-white/10 text-slate-300'}`}
                    title="Preview"
                >
                    {isLoadingPreview ? (
                    <Loader2 size={16} className="animate-spin" />
                    ) : isPreviewing ? (
                    <Square size={16} fill="currentColor" />
                    ) : (
                    <Play size={16} fill="currentColor" />
                    )}
                </button>
            </>
          )}
          {isSelected && (
            <CheckCircle2 size={20} className={checkColor} />
          )}
        </div>
      </div>
      
      <h3 className="font-semibold text-slate-100 mb-1">{voice.name}</h3>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
          {voice.gender === 'male' ? t.voiceH : t.voiceM}
        </span>
        {voice.accent && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
              {voice.accent}
            </span>
        )}
      </div>
      <p className="text-sm text-slate-400 line-clamp-2">{voice.description}</p>
    </div>
  );
};

export default VoiceCard;