
import React, { useState, useRef, useEffect, useMemo } from 'https://esm.sh/react@19.0.0';
import { 
  AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, 
  PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, 
  AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, 
  X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, 
  Hourglass, StopCircle, CheckSquare, Check, XCircle, Info
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
  const batchCancelRef = useRef(false);

  // Estadísticas globales calculadas dinámicamente
  const stats = useMemo(() => {
    const totalChars = sections.reduce((acc, s) => acc + s.charCount, 0);
    const totalEstDuration = sections.reduce((acc, s) => acc + s.estimatedDuration, 0);
    const totalActualDuration = sections.reduce((acc, s) => acc + (s.actualDuration || 0), 0);
    const totalGenTime = sections.reduce((acc, s) => acc + (s.generationTime || 0), 0);
    const completedCount = sections.filter(s => s.status === 'completed').length;
    
    return { totalChars, totalEstDuration, totalActualDuration, totalGenTime, completedCount };
  }, [sections]);

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
        alert(language === 'es' ? "Error al procesar el archivo." : "Error processing file.");
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
              estimatedDuration: Math.ceil(content.length / 16) // Aprox 16 chars per second
          });
      };

      const lines = text.split('\n');
      let currentTitle = "Inicio";
      let currentBuffer: string[] = [];
      const chapterRegex = /^(#{1,3}\s+|Cap[íi]tulo\s+|Chapter\s+|Parte\s+|Documento\s+)(.+)/i;

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

  const startGeneration = async (sectionId: string): Promise<boolean> => {
    if (!apiKey) { setShowKeyModal(true); return false; }
    const section = sections.find(s => s.id === sectionId);
    if (!section) return false;

    const startTime = Date.now();
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 0 } : s));

    try {
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
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', currentStep: error.message } : s));
        return false;
    }
  };

  const handleBatchGenerate = async () => {
    if (selectedSectionIds.size === 0) return;
    setIsBatchGenerating(true);
    batchCancelRef.current = false;
    
    for (const section of sections) {
        if (batchCancelRef.current) break;
        if (selectedSectionIds.has(section.id) && section.status !== 'completed') {
            await startGeneration(section.id);
            if (!settings.isPaid) await new Promise(r => setTimeout(r, 1000));
        }
    }
    setIsBatchGenerating(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full animate-in fade-in duration-500">
      
      {/* SECCIÓN IZQUIERDA: INPUT */}
      <div className="lg:col-span-5 flex flex-col space-y-6">
         <div className="flex items-center gap-4">
             <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                 <FileText size={18} className="text-slate-500" />
                 <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="bg-transparent font-semibold text-white outline-none w-full" />
             </div>
             
             {/* BOTÓN SUBIDA CON ETIQUETA CLARA */}
             <div className="relative group">
                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold transition-all shadow-lg ${themeBg} text-white hover:opacity-90 active:scale-95`}
                >
                    {isReadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    <span className="text-xs">Subir Documento</span>
                </button>
                {/* Cartel flotante / Tooltip explícito */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700 shadow-xl">
                   Sube PDF o archivos TXT para fragmentar
                </div>
             </div>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>

         <div className="flex-1 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-800 relative flex flex-col overflow-hidden">
             <textarea value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder={t.placeholderText} className="w-full h-full bg-transparent p-6 resize-none outline-none text-slate-300 custom-scrollbar font-light leading-relaxed text-sm" />
             {fullText.length > 0 && (
                <div className="absolute bottom-4 right-4 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700 text-[10px] text-slate-400">
                   {fullText.length.toLocaleString()} caracteres
                </div>
             )}
         </div>
      </div>

      {/* SECCIÓN DERECHA: DASHBOARD */}
      <div className="lg:col-span-7 flex flex-col space-y-6">
          
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50">
                 <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-widest"><Settings2 size={14} className={themeText} /> Voz y Velocidad</h3>
                 {isSettingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
             </button>
             {isSettingsOpen && (
                 <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2">
                     <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[180px]"><VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} /></div>
                         ))}
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] text-slate-400 uppercase font-bold"><span>Velocidad</span><span className={themeText}>{settings.speed}x</span></div>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">Modo Turbo</div>
                            <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`w-8 h-4 rounded-full relative transition-colors ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-4' : ''}`}></div>
                            </button>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              
              {/* HEADER DE LA LISTA CON ESTADÍSTICAS GLOBALES */}
              <div className="p-4 bg-slate-950/50 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2 text-sm"><FolderOpen size={16} className="text-amber-400" /> Fragmentos del Proyecto</h3>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedSectionIds(new Set(sections.map(s=>s.id)))} className="text-[10px] text-slate-500 hover:text-white uppercase font-bold tracking-tighter">Sel. Todos</button>
                        <button onClick={() => setSelectedSectionIds(new Set())} className="text-[10px] text-slate-500 hover:text-white uppercase font-bold tracking-tighter">Limpiar</button>
                      </div>
                  </div>

                  {sections.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-bold">Total Chars</span>
                            <span className="text-sm font-mono text-white">{stats.totalChars.toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-bold">Tiempo Est.</span>
                            <span className="text-sm font-mono text-indigo-400">{formatTime(stats.totalActualDuration || stats.totalEstDuration)}</span>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-bold">Generados</span>
                            <span className="text-sm font-mono text-green-400">{stats.completedCount}/{sections.length}</span>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-bold">Latencia IA</span>
                            <span className="text-sm font-mono text-amber-400">{stats.totalGenTime.toFixed(1)}s</span>
                        </div>
                    </div>
                  )}

                  {selectedSectionIds.size > 0 && (
                      <div className="flex gap-2 animate-in slide-in-from-top-2 pt-2">
                          <button onClick={handleBatchGenerate} disabled={isBatchGenerating} className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-xs font-bold shadow-lg active:scale-95 transition-all">
                              {isBatchGenerating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                              Generar Seleccionados ({selectedSectionIds.size})
                          </button>
                          {selectedSectionIds.size > 1 && (
                              <button onClick={() => {
                                  const blobs = sections.filter(s => selectedSectionIds.has(s.id) && s.blob).map(s => s.blob!);
                                  if (blobs.length < 2) return alert("Genera los audios primero");
                                  mergeWavBlobs(blobs).then(merged => onSendToPlayer(URL.createObjectURL(merged), `Master: ${projectTitle}`, merged));
                              }} className={`px-4 py-2 ${themeBg} text-white rounded-lg text-xs font-bold flex items-center gap-2`}>
                                  <Merge size={14} /> Unir
                              </button>
                          )}
                      </div>
                  )}
              </div>

              {/* LISTA DE FRAGMENTOS CON CRONOMETRÍA DETALLADA */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-20"><Layers size={64} className="mb-4"/><p className="text-lg font-bold">Sin Documentos</p></div>
                  ) : (
                      sections.map((section) => (
                          <div key={section.id} className={`group relative rounded-xl border transition-all ${selectedSectionIds.has(section.id) ? 'bg-slate-800 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'}`}>
                              
                              <div className="p-3 flex items-center gap-3">
                                  <button onClick={() => {
                                      const next = new Set(selectedSectionIds);
                                      if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                                      setSelectedSectionIds(next);
                                  }} className={`shrink-0 ${selectedSectionIds.has(section.id) ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}>
                                      {selectedSectionIds.has(section.id) ? <CheckSquare size={20} fill="currentColor" /> : <Square size={20} />}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                      {editingId === section.id ? (
                                          <div className="space-y-2 py-2">
                                              <input value={editBuffer.title} onChange={e => setEditBuffer(b => ({...b, title: e.target.value}))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white font-bold" />
                                              <textarea value={editBuffer.content} onChange={e => setEditBuffer(b => ({...b, content: e.target.value}))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-[11px] text-slate-400 h-20" />
                                              <div className="flex justify-end gap-2">
                                                  <button onClick={() => setEditingId(null)} className="px-2 py-1 text-[10px] text-slate-500">Descartar</button>
                                                  <button onClick={() => {
                                                      setSections(prev => prev.map(s => s.id === editingId ? { ...s, title: editBuffer.title, content: editBuffer.content, charCount: editBuffer.content.length, status: 'idle', audioUrl: undefined } : s));
                                                      setEditingId(null);
                                                  }} className={`px-3 py-1 text-[10px] rounded font-bold text-white ${themeBg}`}>Guardar</button>
                                              </div>
                                          </div>
                                      ) : (
                                          <>
                                              <div className="flex items-center gap-2">
                                                  <h4 className="font-semibold text-slate-200 text-xs truncate">{section.title}</h4>
                                                  <button onClick={() => {
                                                      setEditingId(section.id);
                                                      setEditBuffer({ title: section.title, content: section.content });
                                                  }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity"><Edit2 size={10}/></button>
                                              </div>
                                              
                                              {/* CRONOMETRÍA DEL FRAGMENTO */}
                                              <div className="flex items-center gap-2 mt-1">
                                                  <div className="flex items-center gap-1 text-[9px] text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-800">
                                                      <Calculator size={10} /> {section.charCount} chars
                                                  </div>
                                                  <div className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-slate-800 ${section.status === 'completed' ? 'text-green-400 bg-green-900/10' : 'text-slate-500 bg-slate-900/50'}`}>
                                                      <Clock size={10} /> 
                                                      {section.status === 'completed' ? formatTime(section.actualDuration || 0) : `Est: ${formatTime(section.estimatedDuration)}`}
                                                  </div>
                                                  {section.status === 'completed' && section.generationTime && (
                                                      <div className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-900/10 px-1.5 py-0.5 rounded border border-amber-900/20">
                                                          <Rocket size={10} /> {section.generationTime.toFixed(1)}s
                                                      </div>
                                                  )}
                                              </div>
                                          </>
                                      )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                      {section.status === 'idle' && (
                                          <button onClick={() => startGeneration(section.id)} className={`p-2 rounded-lg text-white shadow-lg ${themeBg} hover:scale-105 active:scale-95 transition-transform`}>
                                              <Zap size={14} fill="currentColor" />
                                          </button>
                                      )}
                                      {section.status === 'generating' && (
                                          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 border border-amber-500/20">
                                              <Loader2 size={14} className="animate-spin" />
                                          </div>
                                      )}
                                      {section.status === 'completed' && (
                                          <button onClick={() => onSendToPlayer(section.audioUrl!, section.title, section.blob)} className="p-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                                              <PlayCircle size={18} />
                                          </button>
                                      )}
                                  </div>
                              </div>
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
