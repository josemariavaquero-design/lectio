
import React, { useState, useRef, useEffect, useMemo } from 'https://esm.sh/react@19.0.0';
import { 
  AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, 
  PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, 
  AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, 
  X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, 
  Hourglass, StopCircle, CheckSquare, Check, XCircle, Info, Activity,
  RotateCcw, PlaySquare, Volume2, MousePointer2, Scissors
} from 'https://esm.sh/lucide-react@0.463.0';
import { VOICES_ES, VOICES_EN, MAX_CHARS_PER_CHUNK, UI_TEXT, SAMPLE_RATE } from '../constants';
import { VoiceOption, GenerationSettings, Language, ProjectSection } from '../types';
import VoiceCard from './VoiceCard';
import { generateSpeechFromText } from '../services/geminiService';
import { mergeWavBlobs } from '../utils/audioUtils';

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
  
  // Estados de control de flujo
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const stopSignalRef = useRef(false);
  const pauseSignalRef = useRef(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState({ title: '', content: '' });

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES[0]);
  const [settings, setSettings] = useState<GenerationSettings>({
    pitch: 0,
    speed: 1.0,
    dialogueMode: false,
    autoOptimize: false,
    isPaid: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const totalChars = sections.reduce((acc, s) => acc + s.charCount, 0);
    const totalActualDuration = sections.reduce((acc, s) => acc + (s.actualDuration || 0), 0);
    const totalEstDuration = sections.reduce((acc, s) => acc + s.estimatedDuration, 0);
    const completedCount = sections.filter(s => s.status === 'completed').length;
    return { totalChars, totalEstDuration, totalActualDuration, completedCount };
  }, [sections]);

  useEffect(() => {
    const currentList = language === 'es' ? VOICES_ES : VOICES_EN;
    if (!currentList.find(v => v.id === selectedVoice.id)) {
        setSelectedVoice(currentList[0]);
    }
  }, [language]);

  const handleReset = () => {
    if (window.confirm(language === 'es' ? "¿Borrar todo el progreso y empezar de nuevo?" : "Clear all progress and start over?")) {
        sections.forEach(s => s.audioUrl && URL.revokeObjectURL(s.audioUrl));
        setProjectTitle('');
        setFullText('');
        setSections([]);
        setSelectedSectionIds(new Set());
        setIsBatchGenerating(false);
        setIsPaused(false);
        stopSignalRef.current = false;
        pauseSignalRef.current = false;
    }
  };

  const processFile = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
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
        return extractedText;
    } else {
        return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
        });
    }
  };

  const handleFilesUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    
    setIsReadingFile(true);
    let combinedText = fullText ? fullText + "\n\n" : "";
    
    if (!projectTitle) {
        setProjectTitle(files[0].name.replace(/\.[^/.]+$/, ""));
    }

    try {
        for (let i = 0; i < files.length; i++) {
            const text = await processFile(files[i]);
            combinedText += (i > 0 || fullText ? `\n\n--- Archivo: ${files[i].name} ---\n` : '') + text;
        }
        setFullText(combinedText);
        parseAndSetSections(combinedText, projectTitle || files[0].name);
    } catch (error) {
        console.error("Error al leer archivos:", error);
        alert("Error al procesar los archivos.");
    } finally {
        setIsReadingFile(false);
    }
  };

  const parseAndSetSections = (text: string, titleBase: string) => {
      const MAX_LENGTH = 10000; 
      const rawSections: { title: string, content: string }[] = [];
      
      const lines = text.split('\n');
      let currentTitle = "Inicio";
      let currentBuffer: string[] = [];
      const chapterRegex = /^(#{1,3}\s+|Cap[íi]tulo\s+|Chapter\s+|Parte\s+|---\sArchivo:\s)(.+)/i;

      lines.forEach(line => {
          if (chapterRegex.test(line)) {
              if (currentBuffer.length > 0) rawSections.push({ title: currentTitle, content: currentBuffer.join('\n') });
              currentTitle = line.trim().replace(/^--- Archivo:\s/i, '');
              currentBuffer = [];
          } else {
              currentBuffer.push(line);
          }
      });
      if (currentBuffer.length > 0) rawSections.push({ title: currentTitle, content: currentBuffer.join('\n') });
      if (rawSections.length === 0 && text.trim()) rawSections.push({ title: titleBase, content: text });

      const finalSections: ProjectSection[] = [];
      
      rawSections.forEach((section) => {
          if (section.content.length <= MAX_LENGTH) {
              finalSections.push(createSectionObject(section.title, section.content, finalSections.length));
          } else {
              let remainingText = section.content;
              let subPartIdx = 1;
              
              while (remainingText.length > 0) {
                  if (remainingText.length <= MAX_LENGTH) {
                      finalSections.push(createSectionObject(`${section.title} (Parte ${subPartIdx})`, remainingText, finalSections.length));
                      break;
                  }
                  
                  let cutIndex = remainingText.lastIndexOf('\n\n', MAX_LENGTH);
                  if (cutIndex < MAX_LENGTH * 0.7) cutIndex = remainingText.lastIndexOf('. ', MAX_LENGTH);
                  if (cutIndex === -1) cutIndex = MAX_LENGTH;
                  else cutIndex += 1;

                  const chunk = remainingText.substring(0, cutIndex).trim();
                  if (chunk) {
                      finalSections.push(createSectionObject(`${section.title} (Parte ${subPartIdx})`, chunk, finalSections.length));
                      subPartIdx++;
                  }
                  remainingText = remainingText.substring(cutIndex).trim();
              }
          }
      });

      setSections(finalSections);
      setSelectedSectionIds(new Set(finalSections.map(s => s.id)));
  };

  const createSectionObject = (title: string, content: string, index: number): ProjectSection => {
      const id = `sec-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
      return {
          id,
          index,
          title: title.length > 50 ? title.substring(0, 47) + "..." : title,
          content: content.trim(),
          status: 'idle',
          progress: 0,
          charCount: content.length,
          estimatedDuration: Math.ceil(content.length / 16)
      };
  };

  const startGeneration = async (sectionId: string): Promise<boolean> => {
    if (!apiKey) { setShowKeyModal(true); return false; }
    
    const startTime = Date.now();
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 30 } : s));

    try {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return false;

        const blob = await generateSpeechFromText(section.content, selectedVoice, settings, apiKey, language);
        const url = URL.createObjectURL(blob);
        const actualDuration = Math.max(0, (blob.size - 44) / (SAMPLE_RATE * 2));
        const generationTime = (Date.now() - startTime) / 1000;

        setSections(prev => prev.map(s => s.id === sectionId ? { 
            ...s, 
            status: 'completed', 
            progress: 100, 
            audioUrl: url, 
            blob, 
            actualDuration, 
            generationTime 
        } : s));
        return true;
    } catch (error: any) {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', progress: 0, currentStep: error.message } : s));
        return false;
    }
  };

  const stopGeneration = () => {
    stopSignalRef.current = true;
    setIsBatchGenerating(false);
    setIsPaused(false);
  };

  const handleBatchGenerate = async () => {
    if (selectedSectionIds.size === 0) return;
    
    setIsBatchGenerating(true);
    setIsPaused(false);
    stopSignalRef.current = false;
    pauseSignalRef.current = false;
    
    const idsToProcess = Array.from(selectedSectionIds) as string[];
    
    for (const sectionId of idsToProcess) {
        if (stopSignalRef.current) break;
        
        while (pauseSignalRef.current) {
            await new Promise(r => setTimeout(r, 500));
            if (stopSignalRef.current) break;
        }
        if (stopSignalRef.current) break;

        const section = sections.find(s => s.id === sectionId);
        if (section && section.status !== 'completed') {
            const success = await startGeneration(sectionId);
            if (!success) break;
            if (!settings.isPaid) await new Promise(r => setTimeout(r, 1500));
        }
    }
    
    setIsBatchGenerating(false);
    setIsPaused(false);
  };

  const handleDownloadSection = (section: ProjectSection) => {
      if (!section.audioUrl) return;
      const link = document.createElement('a');
      link.href = section.audioUrl;
      const cleanTitle = projectTitle.trim() || 'Audio';
      const cleanSection = section.title.replace(/[^\w\s-]/gi, '').trim();
      link.download = `${cleanTitle} - ${cleanSection}.wav`;
      link.click();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
        handleFilesUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex flex-col space-y-6 h-full animate-in fade-in duration-500">
      
      {/* SECCIÓN SUPERIOR: DATOS Y TEXTO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col space-y-4">
              <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex items-center gap-3">
                      <FileText size={20} className="text-slate-500" />
                      <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="bg-transparent font-bold text-white outline-none w-full" />
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold transition-all shadow-xl ${themeBg} text-white hover:opacity-90 active:scale-95 shrink-0`}>
                      {isReadingFile ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                      <span className="hidden sm:inline">Importar Docs</span>
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" multiple onChange={(e) => e.target.files && handleFilesUpload(e.target.files)}/>
              </div>

              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 rounded-2xl border-2 border-dashed relative flex flex-col min-h-[380px] overflow-hidden group transition-all duration-300 ${isDragging ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]' : 'border-slate-800 bg-slate-800/20'}`}
              >
                  {isDragging && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600/20 backdrop-blur-sm animate-pulse">
                        <MousePointer2 size={64} className="text-white mb-4" />
                        <p className="text-xl font-black text-white uppercase tracking-widest">Suelta para importar</p>
                    </div>
                  )}

                  <textarea value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder={t.placeholderText} className="w-full h-full bg-transparent p-6 resize-none outline-none text-slate-300 custom-scrollbar font-light leading-relaxed text-sm" />
                  
                  {isReadingFile && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 size={48} className="animate-spin text-indigo-400" />
                            <p className="text-xs font-bold text-white uppercase tracking-widest">Analizando contenido...</p>
                        </div>
                    </div>
                  )}

                  {fullText.length > 0 && (
                      <div className={`absolute bottom-4 right-4 bg-slate-900/90 px-3 py-1.5 rounded-full border text-[10px] font-mono tracking-widest transition-colors ${fullText.length > 10000 ? 'border-amber-500/50 text-amber-400' : 'border-slate-700 text-slate-400'}`}>
                        {fullText.length.toLocaleString()} CARACTERES {fullText.length > 10000 ? '(REQUIERE DIVISIÓN)' : ''}
                      </div>
                  )}
              </div>
          </div>

          <div className="flex flex-col space-y-4">
              {/* CONFIGURACIÓN DE VOZ */}
              <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden shadow-lg">
                  <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                      <h3 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-[0.2em]"><Settings2 size={16} className={themeText} /> Modulación y Estilo</h3>
                      {isSettingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {isSettingsOpen && (
                      <div className="p-5 pt-0 space-y-6 animate-in slide-in-from-top-2">
                          <div className="flex overflow-x-auto gap-3 pb-4 custom-scrollbar">
                              {VOICES.map((voice) => (
                                  <div key={voice.id} className="min-w-[200px]"><VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} /></div>
                              ))}
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-3">
                                  <div className="flex justify-between text-[10px] text-slate-500 uppercase font-black"><span>Velocidad de Lectura</span><span className={themeText}>{settings.speed}x</span></div>
                                  <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                              </div>
                              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                                  <div className="flex flex-col"><span className="text-[10px] font-black text-slate-500 uppercase">Modo Turbo</span><span className="text-[9px] text-slate-600">Para API de pago</span></div>
                                  <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`w-10 h-5 rounded-full relative transition-colors ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}><div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-5' : ''}`}></div></button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>

              {/* DASHBOARD DE PROGRESO */}
              <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl min-h-[380px]">
                  <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${sections.length > 0 ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                        <h3 className="font-bold text-white text-sm uppercase tracking-widest">Cola de Generación</h3>
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => setSelectedSectionIds(new Set(sections.map(s=>s.id)))} className="text-[10px] text-slate-500 hover:text-white uppercase font-black transition-colors">Todos</button>
                        <button onClick={() => setSelectedSectionIds(new Set())} className="text-[10px] text-slate-500 hover:text-white uppercase font-black transition-colors">Ninguno</button>
                      </div>
                  </div>

                  {/* CONTROLES DE FLUJO MAESTROS */}
                  <div className="p-4 border-b border-slate-800 flex flex-col gap-3 bg-slate-900/80 sticky top-0 z-10">
                      <button 
                        onClick={handleBatchGenerate} 
                        disabled={selectedSectionIds.size === 0 || isBatchGenerating}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-black transition-all shadow-lg ${isBatchGenerating ? 'bg-slate-800 text-slate-600' : 'bg-green-600 text-white shadow-green-900/20 active:scale-95'}`}
                      >
                        <Zap size={14} fill="currentColor" /> GENERAR SELECCIÓN ({selectedSectionIds.size})
                      </button>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button 
                            onClick={() => parseAndSetSections(fullText, projectTitle || "Proyecto")} 
                            disabled={isBatchGenerating || fullText.length === 0}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black border transition-all ${fullText.length > 10000 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                            title="Dividir texto largo en partes manejables"
                          >
                              <Scissors size={12} /> AUTO-DIVIDIR
                          </button>

                          {isBatchGenerating ? (
                            <>
                              <button onClick={() => { setIsPaused(!isPaused); pauseSignalRef.current = !isPaused; }} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black transition-all ${isPaused ? 'bg-indigo-600 animate-pulse text-white' : 'bg-amber-600 text-white'}`}>
                                {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />} {isPaused ? 'RESUMIR' : 'PAUSAR'}
                              </button>
                              <button onClick={stopGeneration} className="flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-xl text-[10px] font-black shadow-lg shadow-red-900/20">
                                <StopCircle size={12} /> STOP
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={handleReset} className="flex items-center justify-center gap-2 py-2.5 bg-slate-800/50 text-red-400 rounded-xl text-[10px] font-black border border-red-500/10 hover:bg-red-900/10">
                                <RotateCcw size={12} /> RESET
                              </button>
                              <button 
                                disabled={stats.completedCount < 2}
                                onClick={() => {
                                    const blobs = sections.filter(s => selectedSectionIds.has(s.id) && s.blob).map(s => s.blob!);
                                    mergeWavBlobs(blobs).then(merged => {
                                        const url = URL.createObjectURL(merged);
                                        onSendToPlayer(url, `${projectTitle} - Completo`, merged);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `${projectTitle} - Completo.wav`;
                                        link.click();
                                    });
                                }}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black transition-all ${stats.completedCount < 2 ? 'bg-slate-800/30 text-slate-600 border-transparent' : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/30'}`}
                              >
                                <Merge size={12} /> UNIR
                              </button>
                            </>
                          )}
                      </div>
                  </div>

                  {/* LISTADO DE FRAGMENTOS */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-950/20">
                      {sections.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-800 text-center px-8 opacity-40">
                            <Layers size={64} className="mb-4"/>
                            <p className="text-sm font-black uppercase tracking-[0.3em] mb-2">Proyecto Vacío</p>
                            <p className="text-[10px] uppercase font-bold">Importa documentos o pega un texto largo y pulsa "Auto-Dividir"</p>
                        </div>
                      ) : (
                        sections.map((section, idx) => (
                          <div key={section.id} className={`group relative rounded-xl border-2 transition-all p-4 ${selectedSectionIds.has(section.id) ? 'bg-slate-800 border-indigo-500/50 shadow-xl' : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700'}`}>
                              <div className="flex items-center gap-4">
                                  <button onClick={() => {
                                      const next = new Set(selectedSectionIds);
                                      if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                                      setSelectedSectionIds(next);
                                  }} className={`shrink-0 transition-colors ${selectedSectionIds.has(section.id) ? 'text-indigo-400' : 'text-slate-700 hover:text-slate-500'}`}>
                                      {selectedSectionIds.has(section.id) ? <CheckSquare size={22} fill="currentColor" /> : <Square size={22} />}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-black text-slate-600 font-mono">#{idx + 1}</span>
                                          <h4 className="font-bold text-slate-100 text-xs truncate">{section.title}</h4>
                                          <button onClick={() => { setEditingId(section.id); setEditBuffer({title: section.title, content: section.content}); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-all"><Edit2 size={12}/></button>
                                      </div>
                                      <div className="flex items-center gap-3 mt-1.5 font-mono text-[9px] font-bold">
                                          <span className="text-slate-500 flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800"><Calculator size={10}/> {section.charCount} car.</span>
                                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded border ${section.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
                                              <Clock size={10}/> {section.status === 'completed' ? formatTime(section.actualDuration || 0) : `Est: ${formatTime(section.estimatedDuration)}`}
                                          </span>
                                      </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                      {section.status === 'idle' && (
                                          <button onClick={() => startGeneration(section.id)} className={`p-2.5 rounded-xl text-white shadow-lg ${themeBg} hover:scale-110 transition-all`}>
                                              <Zap size={16} fill="currentColor" />
                                          </button>
                                      )}
                                      {section.status === 'generating' && (
                                          <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-500 border border-amber-500/30">
                                              <Loader2 size={16} className="animate-spin" />
                                          </div>
                                      )}
                                      {section.status === 'completed' && (
                                          <div className="flex items-center gap-2 animate-in zoom-in-95">
                                              <button 
                                                onClick={() => onSendToPlayer(section.audioUrl!, section.title, section.blob)} 
                                                className="p-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all active:scale-95"
                                                title="Escuchar"
                                              >
                                                <PlayCircle size={20} />
                                              </button>
                                              <button 
                                                onClick={() => handleDownloadSection(section)} 
                                                className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-500 shadow-lg shadow-green-900/20 transition-all active:scale-95"
                                                title="Descargar"
                                              >
                                                <Download size={18} />
                                              </button>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {(section.status === 'generating' || section.progress > 0) && (
                                  <div className="mt-3 h-1 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900 shadow-inner">
                                      <div 
                                          className={`h-full transition-all duration-700 ease-out ${
                                            section.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : isPaused ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500 animate-pulse'
                                          }`}
                                          style={{ width: `${section.progress}%` }}
                                      />
                                  </div>
                              )}
                          </div>
                        ))
                      )}
                  </div>
              </div>
          </div>
      </div>
      
      {/* MODAL DE EDICIÓN RÁPIDA */}
      {editingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in">
           <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl p-8 space-y-6 shadow-2xl">
              <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3"><Edit2 size={24} className={themeText}/> Editar Fragmento</h3>
                  <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
              </div>
              <div className="space-y-4">
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase">Título de Sección</label>
                      <input value={editBuffer.title} onChange={e => setEditBuffer(b => ({...b, title: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase">Contenido del Texto</label>
                      <textarea value={editBuffer.content} onChange={e => setEditBuffer(b => ({...b, content: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 h-60 outline-none resize-none focus:border-indigo-500 custom-scrollbar" />
                  </div>
              </div>
              <div className="flex gap-4">
                  <button onClick={() => setEditingId(null)} className="flex-1 py-4 text-slate-400 font-bold hover:bg-slate-800 rounded-2xl transition-all">Cancelar</button>
                  <button onClick={() => {
                      setSections(prev => prev.map(s => s.id === editingId ? { ...s, title: editBuffer.title, content: editBuffer.content, charCount: editBuffer.content.length, status: 'idle', audioUrl: undefined } : s));
                      setEditingId(null);
                  }} className={`flex-1 py-4 ${themeBg} text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all`}>GUARDAR CAMBIOS</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TextToSpeechModule;
