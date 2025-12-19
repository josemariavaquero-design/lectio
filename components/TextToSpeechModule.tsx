
import React, { useState, useRef, useEffect } from 'react';
import { AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, CheckCircle2, AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, X, ChevronDown, ChevronUp, Timer, Calculator, Coins, Rocket, Hourglass, SquareCheck, StopCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { VOICES_ES, VOICES_EN, MAX_CHARS_PER_CHUNK, UI_TEXT, SAMPLE_RATE } from '../constants';
import { VoiceOption, GenerationSettings, Language, ProjectSection } from '../types';
import VoiceCard from './VoiceCard';
import AudioPlayer from './AudioPlayer';
import { generateSpeechFromText, optimizeTextForSpeech } from '../services/geminiService';
import { mergeWavBlobs } from '../utils/audioUtils';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

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
      let currentTitle = "Intro";
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
                      id: `sec-${Date.now()}-${foundSections.length}`,
                      index: foundSections.length,
                      title: `${title} (Part ${i + 1})`,
                      content: partContent,
                      status: 'idle',
                      progress: 0,
                      charCount: partContent.length,
                      estimatedDuration: Math.ceil(partContent.length / 16)
                  });
              }
          } else {
              foundSections.push({
                  id: `sec-${Date.now()}-${foundSections.length}`,
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
          pushSection(titleBase || (language === 'es' ? 'Documento Completo' : 'Full Document'), text);
      }

      setSections(foundSections);
      setSelectedSectionIds(new Set());
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + "\n";
    }
    return fullText;
  };

  const handleFileUpload = async (file: File) => {
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setProjectTitle(fileName);
    setIsReadingFile(true);

    try {
        let text = "";
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            text = await extractTextFromPDF(file);
        } else {
            text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }
        setFullText(text);
        parseAndSetSections(text, fileName);
    } catch (error) {
        console.error("Error al leer el archivo:", error);
        alert(language === 'es' ? "Error al leer el archivo. Asegúrate de que sea un PDF o texto válido." : "Error reading file. Make sure it's a valid PDF or text.");
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

  const handleOpenEdit = (section: ProjectSection) => {
      setEditingSection(section);
      setTempEditText(section.content);
  };

  const handleSaveEdit = () => {
      if (!editingSection) return;
      const newContent = tempEditText;
      const newCharCount = newContent.length;

      setSections(prev => prev.map(s => s.id === editingSection.id ? {
          ...s,
          content: newContent,
          charCount: newCharCount,
          estimatedDuration: Math.ceil(newCharCount / 16),
          status: 'idle',
          progress: 0,
          currentStep: undefined,
          audioUrl: undefined,
          blob: undefined,
          parts: undefined,
          actualDuration: undefined,
          generationTime: undefined
      } : s));

      setEditingSection(null);
      setTempEditText('');
  };

  const splitTextInternal = (text: string): string[] => {
      if (text.length <= MAX_CHARS_PER_CHUNK) return [text];
      
      const chunks: string[] = [];
      const paragraphs = text.split(/\n+/);
      let currentChunk = '';

      for (const p of paragraphs) {
          if (settings.dialogueMode && currentChunk) {
               chunks.push(currentChunk);
               currentChunk = '';
          }
          const potential = currentChunk ? currentChunk + '\n' + p : p;
          if (potential.length <= MAX_CHARS_PER_CHUNK) {
              currentChunk = potential;
          } else {
              if (currentChunk) {
                  chunks.push(currentChunk);
                  currentChunk = '';
              }
              if (p.length > MAX_CHARS_PER_CHUNK) {
                  const sentences = p.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [p];
                  let subChunk = '';
                  for (const s of sentences) {
                      if ((subChunk + s).length <= MAX_CHARS_PER_CHUNK) {
                          subChunk += s;
                      } else {
                          if (subChunk) chunks.push(subChunk);
                          subChunk = s;
                      }
                  }
                  if (subChunk) currentChunk = subChunk;
              } else {
                  currentChunk = p;
              }
          }
      }
      if (currentChunk) chunks.push(currentChunk);
      return chunks;
  };

  const handleCancel = (sectionId: string) => {
      if (controlRefs.current[sectionId]) {
          controlRefs.current[sectionId].cancelled = true;
          controlRefs.current[sectionId].paused = false; 
      }
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'idle', progress: 0, currentStep: undefined } : s));
  };

  const handlePause = (sectionId: string) => {
      if (controlRefs.current[sectionId]) {
          controlRefs.current[sectionId].paused = true;
      }
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'paused' } : s));
  };

  const handleResume = (sectionId: string) => {
      if (controlRefs.current[sectionId]) {
          controlRefs.current[sectionId].paused = false;
      }
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating' } : s));
  };

  const startGeneration = async (sectionId: string): Promise<boolean> => {
      if (!apiKey) { setShowKeyModal(true); return false; }
      const section = sections.find(s => s.id === sectionId);
      if (!section) return false;

      const startTime = Date.now();
      controlRefs.current[sectionId] = { paused: false, cancelled: false };

      const textParts = splitTextInternal(section.content);
      const totalParts = textParts.length;

      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 0, currentStep: `Initializing ${totalParts} segments...` } : s));

      const generatedBlobs: Blob[] = [];

      try {
          for (let i = 0; i < totalParts; i++) {
              while (controlRefs.current[sectionId]?.paused) {
                  if (controlRefs.current[sectionId]?.cancelled) break;
                  await new Promise(r => setTimeout(r, 500)); 
              }
              if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled by user");

              let textToGen = textParts[i];
              setSections(prev => prev.map(s => s.id === sectionId ? { 
                  ...s, 
                  progress: Math.round((i / totalParts) * 100),
                  currentStep: language === 'es' ? `Generando parte ${i+1}/${totalParts}` : `Generating part ${i+1}/${totalParts}`
              } : s));

              if (settings.autoOptimize) {
                  try {
                      textToGen = await optimizeTextForSpeech(textToGen, apiKey, language);
                  } catch (e) { console.warn("Optimization failed"); }
              }

              if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled by user");

              const blob = await generateSpeechFromText(textToGen, selectedVoice, settings, apiKey, language);
              generatedBlobs.push(blob);
              
              let waitTime = 12000; 
              if (settings.isPaid) waitTime = 500;
              else if (settings.autoOptimize) waitTime += 8000; 
              
              if (i < totalParts - 1) {
                  await new Promise(r => setTimeout(r, waitTime));
              }
          }

          if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled by user");
          
          setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'merging', progress: 99, currentStep: 'Finalizing...' } : s));

          const finalBlob = generatedBlobs.length > 1 ? await mergeWavBlobs(generatedBlobs) : generatedBlobs[0];
          const finalUrl = URL.createObjectURL(finalBlob);
          const genTimeSec = (Date.now() - startTime) / 1000;
          
          const headerSize = 44;
          const bytesPerSec = SAMPLE_RATE * 1 * 2;
          const audioDurationSec = Math.max(0, (finalBlob.size - headerSize) / bytesPerSec);

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
          if (error.message !== "Cancelled by user") {
               setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', currentStep: error.message } : s));
          }
          return false;
      } finally {
          delete controlRefs.current[sectionId];
      }
  };

  const handleDeleteSection = (id: string) => {
      if(window.confirm(language === 'es' ? "¿Eliminar este audio?" : "Delete this audio?")) {
        setSections(prev => prev.map(s => s.id === id ? { ...s, status: 'idle', audioUrl: undefined, blob: undefined, parts: undefined, actualDuration: undefined, generationTime: undefined } : s));
        setSelectedSectionIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
      }
  };

  const toggleSelection = (id: string) => {
      setSelectedSectionIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
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

  const handleBatchGenerate = async () => {
      if (selectedSectionIds.size === 0) return;
      setIsBatchGenerating(true);
      batchStopRef.current = false;
      const targetSections = sections
          .filter(s => selectedSectionIds.has(s.id) && (s.status === 'idle' || s.status === 'error'))
          .sort((a, b) => a.index - b.index);

      for (const section of targetSections) {
          if (batchStopRef.current) break;
          const success = await startGeneration(section.id);
          if (!success) {
               batchStopRef.current = true;
               break;
          }
          if (!settings.isPaid) await new Promise(r => setTimeout(r, 1000));
      }
      setIsBatchGenerating(false);
  };

  const handleMergeSelected = async () => {
      const selected = sections.filter(s => selectedSectionIds.has(s.id) && s.status === 'completed' && s.blob);
      if (selected.length < 2) return;
      setIsMergingSelected(true);
      try {
          const mergedBlob = await mergeWavBlobs(selected.map(s => s.blob!));
          const url = URL.createObjectURL(mergedBlob);
          const totalDuration = selected.reduce((acc, s) => acc + (s.actualDuration || 0), 0);
          const totalChars = selected.reduce((acc, s) => acc + s.charCount, 0);

          setSections(prev => [{
              id: `merged-${Date.now()}`,
              index: sections.length,
              title: `${projectTitle || 'Merged'} - Combined Audio`,
              content: '(Merged Content)',
              charCount: totalChars,
              estimatedDuration: Math.ceil(totalDuration / 60),
              actualDuration: totalDuration,
              status: 'completed',
              progress: 100,
              audioUrl: url,
              blob: mergedBlob
          }, ...prev]);
          setSelectedSectionIds(new Set());
      } catch (e) { alert("Error merging"); }
      finally { setIsMergingSelected(false); }
  };

  const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}m ${s}s`;
  };

  const accentColorClass = language === 'es' ? 'accent-indigo-500' : 'accent-emerald-500';
  const totalChars = sections.reduce((acc, curr) => acc + curr.charCount, 0);
  const totalEstimatedMins = sections.reduce((acc, curr) => acc + curr.estimatedDuration, 0);
  const estimatedCost = (totalChars / 4000000) * 0.375; 

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full relative animate-in fade-in duration-300">
        {editingSection && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
                 <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative">
                     <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                         <div>
                             <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                 <Edit2 size={18} className="text-amber-400"/>
                                 {language === 'es' ? 'Editar Contenido' : 'Edit Content'}
                             </h3>
                             <p className="text-xs text-slate-500">{editingSection.title}</p>
                         </div>
                         <button onClick={() => setEditingSection(null)} className="text-slate-400 hover:text-white"><X size={24} /></button>
                     </div>
                     <div className="flex-1 p-4 bg-slate-900/50">
                         <textarea 
                             value={tempEditText}
                             onChange={(e) => setTempEditText(e.target.value)}
                             className="w-full h-full bg-slate-800/50 text-slate-200 p-4 rounded-xl border border-slate-700 focus:border-amber-500 outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
                         />
                     </div>
                     <div className="p-4 border-t border-slate-800 bg-slate-950 rounded-b-2xl flex justify-end gap-3">
                         <button onClick={() => setEditingSection(null)} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white">{t.cancel}</button>
                         <button onClick={handleSaveEdit} className={`px-6 py-2 rounded-lg ${themeBg} text-white font-bold flex items-center gap-2`}><Save size={18} />{language === 'es' ? 'Guardar' : 'Save'}</button>
                     </div>
                 </div>
             </div>
        )}

      <div className="lg:col-span-5 flex flex-col h-full space-y-6">
         <div className="flex items-center gap-4">
             <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                 <Edit2 size={18} className="text-slate-500" />
                 <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder={t.projectTitlePlaceholder} className="bg-transparent text-lg font-semibold text-white focus:outline-none w-full" />
             </div>
             <button onClick={() => fileInputRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium ${themeBg} text-white hover:opacity-90 shadow-lg`}>
                 {isReadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                 <span className="hidden sm:inline">{t.uploadBtn} / PDF</span>
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>

         <div className={`flex-1 bg-slate-800/20 rounded-2xl border-2 border-dashed transition-all relative flex flex-col ${isDragging ? `${themeBorder} bg-${themeColor}-900/10` : 'border-slate-800'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]); }}>
             <textarea value={fullText} onChange={(e) => handleTextChange(e.target.value)} placeholder={t.placeholderText} className="w-full h-full bg-transparent p-6 rounded-2xl resize-none outline-none text-slate-300 leading-relaxed font-light custom-scrollbar" />
             {fullText.length === 0 && !isReadingFile && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="text-center text-slate-600">
                         <FileText size={48} className="mx-auto mb-2 opacity-50" />
                         <p>{language === 'es' ? 'Texto o PDF aquí' : 'Text or PDF here'}</p>
                     </div>
                 </div>
             )}
             {isReadingFile && (
                 <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm rounded-2xl">
                     <div className="text-center space-y-4">
                         <Loader2 size={40} className="animate-spin text-white mx-auto" />
                         <p className="text-white font-medium">{language === 'es' ? 'Extrayendo contenido...' : 'Extracting content...'}</p>
                     </div>
                 </div>
             )}
         </div>
      </div>

      <div className="lg:col-span-7 flex flex-col space-y-6">
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
             <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                     <Settings2 size={16} className={themeText} /> {language === 'es' ? 'Configuración' : 'Settings'}
                 </h3>
                 {isSettingsOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
             </button>
             {isSettingsOpen && (
                 <div className="p-5 pt-0 space-y-5 animate-in slide-in-from-top-2">
                     <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[200px]">
                                <VoiceCard voice={voice} isSelected={selectedVoice.id === voice.id} onSelect={setSelectedVoice} apiKey={apiKey} language={language} settings={settings} />
                             </div>
                         ))}
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-400"><span>{t.speedTitle}</span><span className={`font-bold ${themeText}`}>{settings.speed.toFixed(1)}x</span></div>
                                <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))} className={`w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer ${accentColorClass}`} />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-400"><span>{t.pitchTitle}</span><span className={`font-bold ${themeText}`}>{settings.pitch}</span></div>
                                <input type="range" min="-2" max="2" step="1" value={settings.pitch} onChange={(e) => setSettings(s => ({...s, pitch: parseFloat(e.target.value)}))} className={`w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer ${accentColorClass}`} />
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
                            <button onClick={() => setSettings(s => ({...s, isPaid: !s.isPaid}))} className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${settings.isPaid ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.isPaid ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </button>
                            <div className="text-xs">
                                <div className="font-bold text-slate-200 flex items-center gap-2"><Rocket size={14} className={settings.isPaid ? 'text-amber-400' : 'text-slate-500'} /> {t.paidModeTitle}</div>
                                <p className="text-slate-500 mt-1">{t.paidModeDesc}</p>
                            </div>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-wrap gap-3 items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2"><FolderOpen size={18} className="text-amber-400" />{language === 'es' ? 'Documentos' : 'Documents'}</h3>
                  {sections.length > 0 && <button onClick={toggleSelectAll} className="text-xs text-slate-400 hover:text-white">{selectedSectionIds.size === sections.length ? t.deselectAll : t.selectAll}</button>}
              </div>
              
              {selectedSectionIds.size > 0 && (
                  <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
                      <div className="text-sm text-slate-300 font-medium pl-2">{t.itemsSelected.replace('{n}', selectedSectionIds.size.toString())}</div>
                      <div className="flex gap-2">
                           <button onClick={handleBatchGenerate} disabled={isBatchGenerating} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-green-600`}>
                               {isBatchGenerating ? <StopCircle size={14} className="animate-pulse" /> : <Zap size={14} fill="currentColor" />} {language === 'es' ? 'Generar' : 'Generate'}
                           </button>
                           {selectedSectionIds.size > 1 && <button onClick={handleMergeSelected} disabled={isMergingSelected || isBatchGenerating} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white ${themeBg}`}>{isMergingSelected ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}{t.mergeSelected}</button>}
                      </div>
                  </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60"><Layers size={32} className="mb-2"/><p className="text-sm">{language === 'es' ? 'No hay documentos' : 'No documents'}</p></div>
                  ) : (
                      sections.map((section) => (
                          <div key={section.id} className={`rounded-xl border transition-all overflow-hidden relative ${section.status === 'completed' ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-800/40 border-slate-700/50'} ${selectedSectionIds.has(section.id) ? 'ring-2 ring-amber-500/50' : ''}`}>
                              <div className="absolute top-4 left-3 z-10">
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelection(section.id); }} className={`p-1 rounded transition-colors ${selectedSectionIds.has(section.id) ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}>
                                      {selectedSectionIds.has(section.id) ? <SquareCheck size={20} fill="currentColor" /> : <Square size={20} />}
                                  </button>
                              </div>

                              <div className="p-4 pl-12 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${section.status === 'completed' ? 'bg-green-500/20 text-green-400' : (section.status === 'generating' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400')}`}>
                                      {section.status === 'generating' ? <Loader2 size={20} className="animate-spin" /> : section.status === 'completed' ? <CheckCircle2 size={20} /> : <FileAudio size={20} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-slate-200 truncate">{section.title}</h4>
                                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                          {section.status === 'completed' ? <span className="text-indigo-400">{formatTime(section.actualDuration || 0)}</span> : <span>{Math.round(section.charCount / 1000)}k chars</span>}
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {section.status === 'idle' && (
                                        <button onClick={() => startGeneration(section.id)} className={`p-2 rounded-lg text-white ${themeBg}`}><Zap size={16} fill="currentColor"/></button>
                                    )}
                                    {section.status === 'generating' && (
                                        <button onClick={() => handleCancel(section.id)} className="p-2 bg-red-900/20 text-red-400 rounded-lg"><Square size={16} fill="currentColor"/></button>
                                    )}
                                    {section.status === 'completed' && (
                                        <button onClick={() => section.audioUrl && onSendToPlayer(section.audioUrl, section.title, section.blob)} className="p-2 bg-slate-800 text-white rounded-lg"><PlayCircle size={20}/></button>
                                    )}
                                    <button onClick={() => handleOpenEdit(section)} className="p-2 text-slate-500 hover:text-white"><Edit2 size={16}/></button>
                                    <button onClick={() => handleDeleteSection(section.id)} className="p-2 text-slate-500 hover:text-red-400"><Trash2 size={16}/></button>
                                  </div>
                              </div>
                              {section.status === 'generating' && (
                                  <div className="px-4 pb-4 pl-12">
                                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${themeBg}`} style={{ width: `${section.progress}%` }}></div></div>
                                  </div>
                              )}
                          </div>
                      ))
                  )}
              </div>
              <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500 font-mono">
                  <span>{totalChars.toLocaleString()} chars</span>
                  <div className="flex items-center gap-1 text-green-500"><Coins size={14}/><span>€{estimatedCost.toFixed(4)}</span></div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default TextToSpeechModule;
