
import React, { useState, useRef, useEffect } from 'https://esm.sh/react@19.0.0';
import { 
  AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, 
  PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, 
  AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, 
  X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, 
  Hourglass, StopCircle, CheckSquare, Check, XCircle
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
  
  // Estado para edición de fragmentos
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

  const handleMerge = async () => {
    const blobs = sections.filter(s => selectedSectionIds.has(s.id) && s.blob).map(s => s.blob!);
    if (blobs.length < 2) return;
    
    try {
        const merged = await mergeWavBlobs(blobs);
        onSendToPlayer(URL.createObjectURL(merged), `Unión: ${projectTitle}`, merged);
    } catch (e) {
        alert("Error al unir audios");
    }
  };

  const openEdit = (section: ProjectSection) => {
      setEditingId(section.id);
      setEditBuffer({ title: section.title, content: section.content });
  };

  const saveEdit = () => {
      setSections(prev => prev.map(s => s.id === editingId ? { 
          ...s, 
          title: editBuffer.title, 
          content: editBuffer.content,
          charCount: editBuffer.content.length,
          status: 'idle',
          audioUrl: undefined,
          blob: undefined
      } : s));
      setEditingId(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full animate-in fade-in duration-500">
      
      {/* SECCIÓN IZQUIERDA: EDITOR DE TEXTO */}
      <div className="lg:col-span-5 flex flex-col space-y-6">
         <div className="flex items-center gap-4">
             <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                 <FileText size={18} className="text-slate-500" />
                 <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="bg-transparent font-semibold text-white outline-none w-full" />
             </div>
             
             {/* BOTÓN DE SUBIDA CON ETIQUETA Y TOOLTIP */}
             <button 
                onClick={() => fileInputRef.current?.click()} 
                title="Subir archivo .txt o .pdf"
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all shadow-lg ${themeBg} text-white hover:opacity-90 active:scale-95`}
             >
                 {isReadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                 <span className="text-xs hidden sm:block">Subir documento</span>
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>

         <div className="flex-1 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-800 relative flex flex-col overflow-hidden">
             <textarea value={fullText} onChange={(e) => setFullText(e.target.value)} placeholder={t.placeholderText} className="w-full h-full bg-transparent p-6 resize-none outline-none text-slate-300 custom-scrollbar font-light leading-relaxed" />
             {fullText.length === 0 && !isReadingFile && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                    <div className="text-center"><FileText size={48} className="mx-auto mb-2" /><p>Escribe aquí o sube un documento</p></div>
                 </div>
             )}
         </div>
      </div>

      {/* SECCIÓN DERECHA: DASHBOARD Y FRAGMENTOS */}
      <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* CONFIGURACIÓN */}
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide"><Settings2 size={16} className={themeText} /> Configuración de Voz</h3>
                 {isSettingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </button>
             {isSettingsOpen && (
                 <div className="p-5 pt-0 space-y-5 animate-in slide-in-from-top-2">
                     <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[200px]"><VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} /></div>
                         ))}
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-400"><span>Velocidad de lectura</span><span className={themeText}>{settings.speed}x</span></div>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
                            <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-4' : ''}`}></div>
                            </button>
                            <div className="text-xs">
                                <span className="font-bold text-slate-200 block">Modo Turbo</span>
                                <span className="text-slate-500">Sin esperas (requiere cuenta de pago)</span>
                            </div>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          {/* LISTA DE FRAGMENTOS */}
          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><FolderOpen size={18} className="text-amber-400" /> Fragmentos Detectados</h3>
                  <div className="flex items-center gap-4">
                      {selectedSectionIds.size > 0 && (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                              <button onClick={handleBatchGenerate} disabled={isBatchGenerating} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-green-900/20">
                                  {isBatchGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} fill="currentColor" />}
                                  Generar Seleccionados
                              </button>
                              {selectedSectionIds.size > 1 && (
                                  <button onClick={handleMerge} className={`flex items-center gap-2 px-3 py-1.5 ${themeBg} text-white rounded-lg text-xs font-bold`}>
                                      <Merge size={12} /> Unir
                                  </button>
                              )}
                          </div>
                      )}
                      <button onClick={() => setSelectedSectionIds(new Set(sections.map(s=>s.id)))} className="text-xs text-slate-500 hover:text-white">Seleccionar Todos</button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-40"><Layers size={48} className="mb-2"/><p className="text-sm font-medium">No hay fragmentos cargados</p></div>
                  ) : (
                      sections.map((section) => (
                          <div key={section.id} className={`group relative rounded-xl border transition-all ${selectedSectionIds.has(section.id) ? 'bg-slate-800 border-indigo-500/50' : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'}`}>
                              
                              {/* CONTENIDO DEL FRAGMENTO */}
                              <div className="p-4 flex items-center gap-4">
                                  <button onClick={() => toggleSelection(section.id)} className={`shrink-0 ${selectedSectionIds.has(section.id) ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}>
                                      {selectedSectionIds.has(section.id) ? <CheckSquare size={22} fill="currentColor" /> : <Square size={22} />}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                      {editingId === section.id ? (
                                          <div className="space-y-2 animate-in fade-in zoom-in-95">
                                              <input value={editBuffer.title} onChange={e => setEditBuffer(b => ({...b, title: e.target.value}))} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold" />
                                              <textarea value={editBuffer.content} onChange={e => setEditBuffer(b => ({...b, content: e.target.value}))} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 h-24" />
                                              <div className="flex justify-end gap-2">
                                                  <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-slate-400">Cancelar</button>
                                                  <button onClick={saveEdit} className={`px-3 py-1 text-xs rounded font-bold text-white ${themeBg}`}>Guardar Cambios</button>
                                              </div>
                                          </div>
                                      ) : (
                                          <>
                                              <div className="flex items-center gap-2">
                                                  <h4 className="font-semibold text-slate-200 truncate">{section.title}</h4>
                                                  <button onClick={() => openEdit(section)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity"><Edit2 size={12}/></button>
                                              </div>
                                              <div className="flex items-center gap-3 mt-1">
                                                  <span className="text-[10px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800">{Math.round(section.charCount / 1000)}k chars</span>
                                                  {section.status === 'completed' && <span className="text-[10px] text-green-400 flex items-center gap-1"><Check size={10}/> Listo</span>}
                                                  {section.status === 'error' && <span className="text-[10px] text-red-400 flex items-center gap-1"><XCircle size={10}/> Error API</span>}
                                              </div>
                                          </>
                                      )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                      {section.status === 'idle' && (
                                          <button onClick={() => startGeneration(section.id)} className={`p-2 rounded-lg text-white shadow-lg ${themeBg} hover:scale-105 active:scale-95 transition-transform`}>
                                              <Zap size={16} fill="currentColor" />
                                          </button>
                                      )}
                                      {section.status === 'generating' && (
                                          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
                                              <Loader2 size={18} className="animate-spin" />
                                          </div>
                                      )}
                                      {section.status === 'completed' && (
                                          <button onClick={() => onSendToPlayer(section.audioUrl!, section.title, section.blob)} className="p-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                                              <PlayCircle size={20} />
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
