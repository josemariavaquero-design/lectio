
import React, { useState, useRef, useEffect } from 'react';
import { AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, Hourglass, StopCircle, CheckSquare } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { VOICES_ES, VOICES_EN, MAX_CHARS_PER_CHUNK, UI_TEXT, SAMPLE_RATE } from '../constants';
import { VoiceOption, GenerationSettings, Language, ProjectSection } from '../types';
import VoiceCard from './VoiceCard';
import { generateSpeechFromText, optimizeTextForSpeech } from '../services/geminiService';
import { mergeWavBlobs } from '../utils/audioUtils';

// Sincronizado con la versión 4.8.69 del importmap en index.html
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.mjs`;

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
  
  const controlRefs = useRef<Record<string, { paused: boolean; cancelled: boolean }>>({});
  const batchStopRef = useRef(false);

  const [editingSection, setEditingSection] = useState<ProjectSection | null>(null);
  const [tempEditText, setTempEditText] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  
  const [isMergingSelected, setIsMergingSelected] = useState(false);
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

  useEffect(() => {
    const currentList = language === 'es' ? VOICES_ES : VOICES_EN;
    if (!currentList.find(v => v.id === selectedVoice.id)) {
        setSelectedVoice(currentList[0]);
    }
  }, [language, selectedVoice.id]);

  const parseAndSetSections = (text: string, titleBase: string) => {
      const lines = text.split('\n');
      const foundSections: ProjectSection[] = [];
      let currentTitle = "Inicio";
      let currentBuffer: string[] = [];
      
      const chapterRegex = /^(#{1,3}\s+|Cap[íi]tulo\s+|Chapter\s+|Parte\s+|[IVXLCDM]+\.\s+|[0-9]+\.\s+)(.+)/i;

      const pushSection = (title: string, content: string) => {
          if (!content.trim()) return;

          if (content.length > LONG_AUDIO_THRESHOLD_CHARS) {
              const partCount = Math.ceil(content.length / LONG_AUDIO_THRESHOLD_CHARS);
              const partSize = Math.ceil(content.length / partCount);
              
              for (let i = 0; i < partCount; i++) {
                  const start = i * partSize;
                  const end = Math.min((i + 1) * partSize, content.length);
                  let safeEnd = end;
                  if (end < content.length) {
                      const lastSpace = content.lastIndexOf(' ', end);
                      if (lastSpace > start) safeEnd = lastSpace;
                  }
                  
                  const partContent = content.substring(start, safeEnd).trim();
                  
                  foundSections.push({
                      id: `sec-${Date.now()}-${foundSections.length}-${i}-${Math.random().toString(36).substr(2, 9)}`,
                      index: foundSections.length,
                      title: `${title} (Pte ${i + 1})`,
                      content: partContent,
                      status: 'idle',
                      progress: 0,
                      charCount: partContent.length,
                      estimatedDuration: Math.ceil(partContent.length / 16)
                  });
              }
          } else {
              foundSections.push({
                  id: `sec-${Date.now()}-${foundSections.length}-${Math.random().toString(36).substr(2, 9)}`,
                  index: foundSections.length,
                  title: title,
                  content: content,
                  status: 'idle',
                  progress: 0,
                  charCount: content.length,
                  estimatedDuration: Math.ceil(content.length / 16)
              });
          }
      };

      lines.forEach((line) => {
          const match = line.match(chapterRegex);
          const isUpperCaseTitle = line.length > 3 && line.length < 80 && line === line.toUpperCase() && /[A-Z]/.test(line);

          if ((match && line.length < 100) || isUpperCaseTitle) {
              if (currentBuffer.length > 0) {
                  pushSection(currentTitle, currentBuffer.join('\n').trim());
              }
              currentTitle = match ? line.trim() : line.trim(); 
              currentBuffer = []; 
          } else {
              currentBuffer.push(line);
          }
      });

      if (currentBuffer.length > 0) {
          pushSection(currentTitle, currentBuffer.join('\n').trim());
      }

      if (foundSections.length === 0 && text.trim()) {
          pushSection(titleBase || (language === 'es' ? 'Documento' : 'Document'), text);
      }

      setSections(foundSections);
      setSelectedSectionIds(new Set());
  };

  const handleFileUpload = async (file: File) => {
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setProjectTitle(fileName);
    setIsReadingFile(true);

    try {
        let text = "";
        if (file.type === "application/pdf") {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let extractedText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                extractedText += pageText + "\n";
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

  const handleTextChange = (newText: string) => {
      setFullText(newText);
      if (sections.length <= 1) {
          setSections([{
              id: sections[0]?.id || `sec-${Date.now()}`,
              index: 0,
              title: projectTitle || (language === 'es' ? 'Documento' : 'Document'),
              content: newText,
              status: sections[0]?.status === 'completed' ? 'idle' : (sections[0]?.status || 'idle'),
              progress: 0,
              charCount: newText.length,
              estimatedDuration: Math.ceil(newText.length / 16),
              audioUrl: sections[0]?.audioUrl, 
              blob: sections[0]?.blob
          }]);
      }
  };

  const toggleSelection = (id: string) => {
    setSelectedSectionIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSectionIds.size === sections.length) {
        setSelectedSectionIds(new Set());
    } else {
        setSelectedSectionIds(new Set(sections.map(s => s.id)));
    }
  };

  const startGeneration = async (sectionId: string): Promise<boolean> => {
    if (!apiKey) { setShowKeyModal(true); return false; }
    const section = sections.find(s => s.id === sectionId);
    if (!section) return false;

    const startTime = Date.now();
    controlRefs.current[sectionId] = { paused: false, cancelled: false };

    const splitTextInternal = (text: string): string[] => {
        if (text.length <= MAX_CHARS_PER_CHUNK) return [text];
        const chunks: string[] = [];
        const paragraphs = text.split(/\n+/);
        let currentChunk = '';
        for (const p of paragraphs) {
            const potential = currentChunk ? currentChunk + '\n' + p : p;
            if (potential.length <= MAX_CHARS_PER_CHUNK) {
                currentChunk = potential;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = p;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    };

    const textParts = splitTextInternal(section.content);
    const totalParts = textParts.length;

    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 0 } : s));

    const generatedBlobs: Blob[] = [];

    try {
        for (let i = 0; i < totalParts; i++) {
            if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled");
            
            let textToGen = textParts[i];
            setSections(prev => prev.map(s => s.id === sectionId ? { 
                ...s, 
                progress: Math.round((i / totalParts) * 100),
                currentStep: `Pte ${i+1}/${totalParts}`
            } : s));

            if (settings.autoOptimize) {
                try { textToGen = await optimizeTextForSpeech(textToGen, apiKey, language); } catch (e) {}
            }

            const blob = await generateSpeechFromText(textToGen, selectedVoice, settings, apiKey, language);
            generatedBlobs.push(blob);
            
            if (i < totalParts - 1) {
                await new Promise(r => setTimeout(r, settings.isPaid ? 500 : 12000));
            }
        }

        const finalBlob = generatedBlobs.length > 1 ? await mergeWavBlobs(generatedBlobs) : generatedBlobs[0];
        const finalUrl = URL.createObjectURL(finalBlob);
        const genTimeSec = (Date.now() - startTime) / 1000;
        
        const bytesPerSec = SAMPLE_RATE * 1 * 2;
        const audioDurationSec = Math.max(0, (finalBlob.size - 44) / bytesPerSec);

        setSections(prev => prev.map(s => s.id === sectionId ? { 
            ...s, 
            status: 'completed', 
            progress: 100, 
            audioUrl: finalUrl,
            blob: finalBlob,
            actualDuration: audioDurationSec,
            generationTime: genTimeSec
        } : s));

        return true;
    } catch (error: any) {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', currentStep: error.message } : s));
        return false;
    } finally {
        delete controlRefs.current[sectionId];
    }
  };

  const handleBatchGenerate = async () => {
    if (selectedSectionIds.size === 0) return;
    setIsBatchGenerating(true);
    batchStopRef.current = false;
    const targets = sections.filter(s => selectedSectionIds.has(s.id) && s.status !== 'completed');
    for (const s of targets) {
        if (batchStopRef.current) break;
        await startGeneration(s.id);
        if (!settings.isPaid) await new Promise(r => setTimeout(r, 1000));
    }
    setIsBatchGenerating(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full animate-in fade-in duration-300">
      
      {/* LADO IZQUIERDO: TEXTO / PDF */}
      <div className="lg:col-span-5 flex flex-col h-full space-y-6">
         <div className="flex items-center gap-4">
             <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                 <FileText size={18} className="text-slate-500" />
                 <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="bg-transparent font-semibold text-white focus:outline-none w-full" />
             </div>
             <button onClick={() => fileInputRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium ${themeBg} text-white hover:opacity-90 shadow-lg`}>
                 {isReadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                 <span className="hidden sm:inline">Subir .txt / .pdf</span>
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>

         <div className={`flex-1 bg-slate-800/20 rounded-2xl border-2 border-dashed transition-all relative flex flex-col ${isDragging ? `${themeBorder} bg-indigo-900/10` : 'border-slate-800'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]); }}>
             <textarea value={fullText} onChange={(e) => handleTextChange(e.target.value)} placeholder={t.placeholderText} className="w-full h-full bg-transparent p-6 rounded-2xl resize-none outline-none text-slate-300 leading-relaxed font-light custom-scrollbar" />
             {fullText.length === 0 && !isReadingFile && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-600">
                     <div className="text-center"><FileText size={48} className="mx-auto mb-2 opacity-50" /><p>Pega texto o arrastra un PDF aquí</p></div>
                 </div>
             )}
             {isReadingFile && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm rounded-2xl">
                    <div className="text-center space-y-3"><Loader2 size={32} className="animate-spin text-indigo-500 mx-auto"/><p className="text-white font-bold">Extrayendo texto...</p></div>
                </div>
             )}
         </div>
      </div>

      {/* LADO DERECHO: DASHBOARD */}
      <div className="lg:col-span-7 flex flex-col space-y-6">
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide"><Settings2 size={16} className={themeText} /> Configuración Global</h3>
                 {isSettingsOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
             </button>
             {isSettingsOpen && (
                 <div className="p-5 pt-0 space-y-5 animate-in slide-in-from-top-2">
                     <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[200px]"><VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} /></div>
                         ))}
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-400"><span>Velocidad</span><span className={`font-bold ${themeText}`}>{settings.speed}x</span></div>
                                <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
                            <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </button>
                            <div className="text-xs"><div className="font-bold text-slate-200">Modo Turbo (Pago)</div><p className="text-slate-500">Activa si tu clave no tiene límites.</p></div>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><FolderOpen size={18} className="text-amber-400" /> Fragmentos Detectados</h3>
                  {sections.length > 0 && <button onClick={toggleSelectAll} className="text-xs text-slate-400 hover:text-white">{selectedSectionIds.size === sections.length ? 'Deseleccionar' : 'Todos'}</button>}
              </div>
              
              {selectedSectionIds.size > 0 && (
                  <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700 animate-in slide-in-from-top-1">
                      <div className="text-sm text-slate-300 font-medium pl-2">{selectedSectionIds.size} seleccionados</div>
                      <div className="flex gap-2">
                           <button onClick={handleBatchGenerate} disabled={isBatchGenerating} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-green-600">
                               {isBatchGenerating ? <StopCircle size={14} /> : <Zap size={14} fill="currentColor" />} Generar
                           </button>
                           {selectedSectionIds.size > 1 && <button onClick={() => {}} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white ${themeBg}`}>Unir</button>}
                      </div>
                  </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60"><Layers size={32} className="mb-2"/><p className="text-sm">No hay documentos cargados</p></div>
                  ) : (
                      sections.map((section) => (
                          <div key={section.id} className={`rounded-xl border transition-all overflow-hidden relative ${section.status === 'completed' ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-800/40 border-slate-700/50'} ${selectedSectionIds.has(section.id) ? 'ring-2 ring-indigo-500' : ''}`}>
                              <div className="absolute top-4 left-3 z-10">
                                  <button onClick={() => toggleSelection(section.id)} className={`p-1 rounded transition-colors ${selectedSectionIds.has(section.id) ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}>
                                      {selectedSectionIds.has(section.id) ? <CheckSquare size={22} fill="currentColor" className="text-indigo-500" /> : <Square size={22} />}
                                  </button>
                              </div>

                              <div className="p-4 pl-12 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${section.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                                      {section.status === 'generating' ? <Loader2 size={20} className="animate-spin" /> : section.status === 'completed' ? <CheckSquare size={20} /> : <FileAudio size={20} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-slate-200 truncate">{section.title}</h4>
                                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                          <span>{Math.round(section.charCount / 1000)}k chars</span>
                                          {section.status === 'completed' && <span className="text-indigo-400">• {formatTime(section.actualDuration || 0)}</span>}
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {section.status === 'idle' && <button onClick={() => startGeneration(section.id)} className={`p-2 rounded-lg text-white ${themeBg}`}><Zap size={16} fill="currentColor"/></button>}
                                    {section.status === 'completed' && <button onClick={() => section.audioUrl && onSendToPlayer(section.audioUrl, section.title, section.blob)} className="p-2 bg-slate-800 text-white rounded-lg"><PlayCircle size={20}/></button>}
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

const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default TextToSpeechModule;
