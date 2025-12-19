
import React, { useState, useRef, useEffect } from 'https://esm.sh/react@19.0.0';
import { 
  AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, 
  PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, 
  AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, 
  X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, 
  Hourglass, StopCircle, CheckSquare 
} from 'https://esm.sh/lucide-react@0.463.0';
import { VOICES_ES, VOICES_EN, MAX_CHARS_PER_CHUNK, UI_TEXT, SAMPLE_RATE } from '../constants';
import { VoiceOption, GenerationSettings, Language, ProjectSection } from '../types';
import VoiceCard from './VoiceCard';
import { generateSpeechFromText, optimizeTextForSpeech } from '../services/geminiService';
import { mergeWavBlobs } from '../utils/audioUtils';

const LONG_AUDIO_THRESHOLD_CHARS = 12000;

interface TTSModuleProps {
  apiKey: string;
  language: Language;
  themeColor: string;
  themeText: string;
  themeBg: string;
  themeBorder: string;
  setShowKeyModal: (v: boolean) => void;
  onSendToPlayer: (url: string, title: string, blob?: Blob) => void;
}

const TextToSpeechModule: React.FC<TTSModuleProps> = ({ 
    apiKey, language, themeColor, themeText, themeBg, themeBorder, setShowKeyModal, onSendToPlayer 
}) => {
    
  const t = UI_TEXT[language];
  const VOICES = language === 'es' ? VOICES_ES : VOICES_EN;

  const [projectTitle, setProjectTitle] = useState('');
  const [fullText, setFullText] = useState('');
  const [sections, setSections] = useState<ProjectSection[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES[0]);
  const [settings, setSettings] = useState<GenerationSettings>({
    pitch: 0,
    speed: 1.0,
    dialogueMode: false,
    autoOptimize: false,
    isPaid: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlRefs = useRef<Record<string, { paused: boolean; cancelled: boolean }>>({});

  useEffect(() => {
    const currentList = language === 'es' ? VOICES_ES : VOICES_EN;
    if (!currentList.find(v => v.id === selectedVoice.id)) {
        setSelectedVoice(currentList[0]);
    }
  }, [language]);

  const handleFileUpload = async (file: File) => {
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setProjectTitle(fileName);
    setIsReadingFile(true);

    try {
        let text = "";
        if (file.type === "application/pdf") {
            // Importación dinámica para evitar fallos de resolución en build
            const pdfjs = await import('https://esm.sh/pdfjs-dist@4.8.69');
            pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.mjs`;
            
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            let extractedText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                extractedText += textContent.items.map((item: any) => item.str).join(' ') + "\n";
            }
            text = extractedText;
        } else {
            text = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsText(file);
            });
        }
        setFullText(text);
        parseAndSetSections(text, fileName);
    } catch (error) {
        console.error("Error al leer archivo:", error);
        alert(language === 'es' ? "Error al procesar el archivo. ¿Es un PDF válido?" : "Error processing file. Is it a valid PDF?");
    } finally {
        setIsReadingFile(false);
    }
  };

  const parseAndSetSections = (text: string, titleBase: string) => {
      const foundSections: ProjectSection[] = [];
      const pushSection = (title: string, content: string) => {
          if (!content.trim()) return;
          const id = `sec-${Date.now()}-${foundSections.length}-${Math.random().toString(36).substr(2, 5)}`;
          foundSections.push({
              id,
              index: foundSections.length,
              title,
              content: content.trim(),
              status: 'idle',
              progress: 0,
              charCount: content.length,
              estimatedDuration: Math.ceil(content.length / 16)
          });
      };

      const lines = text.split('\n');
      let currentTitle = "Inicio";
      let currentBuffer: string[] = [];
      const chapterRegex = /^(#{1,3}\s+|Cap[íi]tulo\s+|Chapter\s+|Parte\s+)(.+)/i;

      lines.forEach(line => {
          if (chapterRegex.test(line)) {
              if (currentBuffer.length > 0) pushSection(currentTitle, currentBuffer.join('\n'));
              currentTitle = line.trim();
              currentBuffer = [];
          } else {
              currentBuffer.push(line);
          }
      });
      if (currentBuffer.length > 0) pushSection(currentTitle, currentBuffer.join('\n'));
      if (foundSections.length === 0 && text.trim()) pushSection(titleBase, text);

      setSections(foundSections);
      setSelectedSectionIds(new Set());
  };

  const toggleSelection = (id: string) => {
    setSelectedSectionIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
  };

  const startGeneration = async (sectionId: string): Promise<boolean> => {
    if (!apiKey) { setShowKeyModal(true); return false; }
    const section = sections.find(s => s.id === sectionId);
    if (!section) return false;

    controlRefs.current[sectionId] = { paused: false, cancelled: false };
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 0 } : s));

    try {
        const blob = await generateSpeechFromText(section.content, selectedVoice, settings, apiKey, language);
        const url = URL.createObjectURL(blob);
        const duration = Math.max(0, (blob.size - 44) / (SAMPLE_RATE * 2));

        setSections(prev => prev.map(s => s.id === sectionId ? { 
            ...s, status: 'completed', progress: 100, audioUrl: url, blob, actualDuration: duration 
        } : s));
        return true;
    } catch (error: any) {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', currentStep: error.message } : s));
        return false;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
      <div className="lg:col-span-5 flex flex-col space-y-6">
         <div className="flex items-center gap-4">
             <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700 font-semibold text-white outline-none" />
             <button onClick={() => fileInputRef.current?.click()} className={`px-4 py-3 rounded-xl font-medium ${themeBg} text-white shadow-lg`}>
                 {isReadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>
         <textarea value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder={t.placeholderText} className="flex-1 bg-slate-800/20 p-6 rounded-2xl border-2 border-dashed border-slate-800 resize-none outline-none text-slate-300 custom-scrollbar" />
      </div>

      <div className="lg:col-span-7 flex flex-col space-y-6">
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide"><Settings2 size={16} className={themeText} /> Configuración</h3>
                 {isSettingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </button>
             {isSettingsOpen && (
                 <div className="p-5 pt-0 space-y-5">
                     <div className="flex overflow-x-auto gap-3 pb-2">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[200px]"><VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} /></div>
                         ))}
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-400"><span>Velocidad</span><span className={themeText}>{settings.speed}x</span></div>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className="w-full accent-indigo-500" />
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
                            <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`shrink-0 w-10 h-6 rounded-full relative ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-4' : ''}`}></div>
                            </button>
                            <div className="text-xs text-slate-400">Turbo Mode (Pago)</div>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><FolderOpen size={18} /> Fragmentos</h3>
                  <button onClick={() => setSelectedSectionIds(new Set(sections.map(s=>s.id)))} className="text-xs text-slate-500 hover:text-white">Seleccionar Todos</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60"><Layers size={32}/><p className="text-sm">Vacío</p></div>
                  ) : (
                      sections.map((section) => (
                          <div key={section.id} className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${selectedSectionIds.has(section.id) ? 'ring-2 ring-indigo-500 bg-slate-900' : 'bg-slate-800/40 border-slate-700'}`}>
                              <button onClick={() => toggleSelection(section.id)} className={selectedSectionIds.has(section.id) ? 'text-indigo-400' : 'text-slate-600'}>
                                  {selectedSectionIds.has(section.id) ? <CheckSquare size={22} /> : <Square size={22} />}
                              </button>
                              <div className="flex-1">
                                  <h4 className="font-semibold text-slate-200 truncate">{section.title}</h4>
                                  <p className="text-xs text-slate-500">{Math.round(section.charCount / 1000)}k chars</p>
                              </div>
                              {section.status === 'idle' && <button onClick={() => startGeneration(section.id)} className={`p-2 rounded-lg text-white ${themeBg}`}><Zap size={16}/></button>}
                              {section.status === 'generating' && <Loader2 size={20} className="animate-spin text-amber-500"/>}
                              {section.status === 'completed' && <button onClick={() => onSendToPlayer(section.audioUrl!, section.title)} className="p-2 bg-slate-800 text-white rounded-lg"><PlayCircle size={20}/></button>}
                          </div>
                      ))
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};

export default TextToSpeechModule;
