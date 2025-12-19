
import React, { useState } from 'https://esm.sh/react@19.0.0';
import { VoiceOption, Language, GenerationSettings } from '../types';
import { Mic, CheckCircle2, Play, Square, Loader2, Zap, AlertCircle } from 'https://esm.sh/lucide-react@0.463.0';
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

  const t = UI_TEXT[language];
  const themeColor = language === 'es' ? 'indigo' : 'emerald';

  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreviewing && audio) {
      audio.pause();
      setIsPreviewing(false);
      return;
    }

    if (!apiKey) return;

    setIsLoadingPreview(true);
    try {
      const demoText = t.previewText.replace('{name}', voice.name);
      const blob = await generateSpeechFromText(demoText, voice, settings, apiKey, language);
      const url = URL.createObjectURL(blob);
      const newAudio = new Audio(url);
      newAudio.onended = () => setIsPreviewing(false);
      setAudio(newAudio);
      newAudio.play();
      setIsPreviewing(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  return (
    <div onClick={() => onSelect(voice)} className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-indigo-900/40 border-indigo-500 shadow-lg' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
      <div className="flex justify-between mb-2">
        <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700/50 text-slate-400'}`}><Mic size={18} /></div>
        <button onClick={handlePreview} className={`p-2 rounded-full ${isPreviewing ? 'bg-white text-slate-900' : 'text-slate-300'}`}>
            {isLoadingPreview ? <Loader2 size={16} className="animate-spin" /> : isPreviewing ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>
      <h3 className="font-semibold text-slate-100 text-sm mb-1">{voice.name}</h3>
      <p className="text-xs text-slate-500 line-clamp-2">{voice.description}</p>
    </div>
  );
};

export default VoiceCard;
