import React, { useState, useRef, DragEvent, useEffect } from 'react';
import { AudioWaveform, Loader2, Upload, FileText, Music, Clock, Edit2, Zap, PlayCircle, Settings2, Download, Trash2, FolderOpen, Layers, CheckCircle2, AlertCircle, FileAudio, Split, Merge, Pause, Square, Play, Save, X, ChevronDown, ChevronUp, Timer, Calculator, Coins } from 'lucide-react';
import { VOICES_ES, VOICES_EN, MAX_CHARS_PER_CHUNK, UI_TEXT, SAMPLE_RATE } from '../constants';
import { VoiceOption, GenerationSettings, Language, ProjectSection, InternalChunk } from '../types';
import VoiceCard from './VoiceCard';
import AudioPlayer from './AudioPlayer';
import { generateSpeechFromText, optimizeTextForSpeech } from '../services/geminiService';
import { mergeWavBlobs } from '../utils/audioUtils';

// --- Constants ---
const LONG_AUDIO_THRESHOLD_CHARS = 15000; // Approx 15 minutes of speech

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

  // --- Global State ---
  const [projectTitle, setProjectTitle] = useState('');
  const [fullText, setFullText] = useState('');
  const [sections, setSections] = useState<ProjectSection[]>([]);
  
  // Control Refs
  const controlRefs = useRef<Record<string, { paused: boolean; cancelled: boolean }>>({});

  // Editing State
  const [editingSection, setEditingSection] = useState<ProjectSection | null>(null);
  const [tempEditText, setTempEditText] = useState('');

  // UI State
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [showLongAudioModal, setShowLongAudioModal] = useState<{sectionId: string} | null>(null);

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES[0]);
  const [settings, setSettings] = useState<GenerationSettings>({
    pitch: 0,
    speed: 1.0,
    dialogueMode: false,
    autoOptimize: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Voice on Lang Change
  useEffect(() => {
    const currentList = language === 'es' ? VOICES_ES : VOICES_EN;
    if (!currentList.find(v => v.id === selectedVoice.id)) {
        setSelectedVoice(currentList[0]);
    }
  }, [language, selectedVoice.id]);

  // --- Logic: Chapter Parsing ---
  const parseAndSetSections = (text: string, titleBase: string) => {
      const lines = text.split('\n');
      const foundSections: ProjectSection[] = [];
      let currentTitle = "Intro";
      let currentBuffer: string[] = [];
      
      // Regex for common chapter headers
      const chapterRegex = /^(#{1,3}\s+|Cap[íi]tulo\s+|Chapter\s+|Parte\s+|[IVXLCDM]+\.\s+|[0-9]+\.\s+)(.+)/i;

      const pushSection = () => {
          if (currentBuffer.length > 0) {
              const content = currentBuffer.join('\n').trim();
              if (content) {
                  foundSections.push({
                      id: `sec-${Date.now()}-${foundSections.length}`,
                      index: foundSections.length,
                      title: currentTitle,
                      content: content,
                      status: 'idle',
                      progress: 0,
                      charCount: content.length,
                      estimatedDuration: Math.ceil(content.length / 15)
                  });
              }
          }
      };

      lines.forEach((line) => {
          const match = line.match(chapterRegex);
          const isUpperCaseTitle = line.length > 3 && line.length < 80 && line === line.toUpperCase() && /[A-Z]/.test(line);

          if ((match && line.length < 100) || isUpperCaseTitle) {
              pushSection();
              currentTitle = match ? line.trim() : line.trim(); 
              currentBuffer = []; 
          } else {
              currentBuffer.push(line);
          }
      });
      pushSection();

      if (foundSections.length === 0 && text.trim()) {
          foundSections.push({
              id: `sec-${Date.now()}-0`,
              index: 0,
              title: titleBase || (language === 'es' ? 'Documento Completo' : 'Full Document'),
              content: text,
              status: 'idle',
              progress: 0,
              charCount: text.length,
              estimatedDuration: Math.ceil(text.length / 15)
          });
      }

      setSections(foundSections);
  };

  const handleFileUpload = (file: File) => {
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setProjectTitle(fileName);
    const reader = new FileReader();
    reader.onload = (event) => {
        const result = event.target?.result as string;
        setFullText(result);
        parseAndSetSections(result, fileName);
    };
    reader.readAsText(file);
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
              estimatedDuration: Math.ceil(newText.length / 15),
              audioUrl: sections[0]?.audioUrl, 
              blob: sections[0]?.blob
          }]);
      }
  };

  // --- Logic: Editing ---
  const handleOpenEdit = (section: ProjectSection) => {
      setEditingSection(section);
      setTempEditText(section.content);
  };

  const handleSaveEdit = () => {
      if (!editingSection) return;

      const newContent = tempEditText;
      const newCharCount = newContent.length;
      const newDuration = Math.ceil(newContent.length / 15);

      setSections(prev => prev.map(s => s.id === editingSection.id ? {
          ...s,
          content: newContent,
          charCount: newCharCount,
          estimatedDuration: newDuration,
          // Reset status if it was completed or error to force regeneration
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

  // --- Logic: Invisible Splitting ---
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

  // --- Logic: Control Functions ---

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

  // --- Logic: Generation ---
  const startGeneration = async (sectionId: string, mode: 'merge' | 'separate') => {
      if (!apiKey) { setShowKeyModal(true); return; }
      
      const section = sections.find(s => s.id === sectionId);
      if (!section) return;

      const startTime = Date.now();
      controlRefs.current[sectionId] = { paused: false, cancelled: false };

      const textParts = splitTextInternal(section.content);
      const totalParts = textParts.length;

      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'generating', progress: 0, currentStep: `Initializing ${totalParts} segments...` } : s));

      const generatedBlobs: Blob[] = [];
      const separateParts: { url: string; blob: Blob; title: string }[] = [];

      try {
          for (let i = 0; i < totalParts; i++) {
              
              while (controlRefs.current[sectionId]?.paused) {
                  if (controlRefs.current[sectionId]?.cancelled) break;
                  await new Promise(r => setTimeout(r, 500)); 
              }
              if (controlRefs.current[sectionId]?.cancelled) {
                  throw new Error("Cancelled by user");
              }

              let textToGen = textParts[i];
              
              setSections(prev => prev.map(s => s.id === sectionId ? { 
                  ...s, 
                  progress: Math.round((i / totalParts) * 100),
                  currentStep: language === 'es' ? `Generando parte ${i+1}/${totalParts}` : `Generating part ${i+1}/${totalParts}`
              } : s));

              if (settings.autoOptimize) {
                  try {
                      textToGen = await optimizeTextForSpeech(textToGen, apiKey, language);
                  } catch (e) {
                      console.warn("Optimization failed, using raw text");
                  }
              }

              if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled by user");

              const blob = await generateSpeechFromText(textToGen, selectedVoice, settings, apiKey, language);
              generatedBlobs.push(blob);
              
              if (mode === 'separate') {
                  separateParts.push({
                      url: URL.createObjectURL(blob),
                      blob: blob,
                      title: `${section.title} - Part ${i + 1}`
                  });
              }
              
              // Throttling: Aggressive wait time to avoid 429
              // Base wait: 12 seconds
              let waitTime = 12000; 
              if (settings.autoOptimize) waitTime += 8000; 
              
              // Only wait if it's not the last chunk
              if (i < totalParts - 1) {
                  setSections(prev => prev.map(s => s.id === sectionId ? { 
                      ...s, 
                      currentStep: language === 'es' ? `Enfriando API... (${Math.round(waitTime/1000)}s)` : `Cooling down API... (${Math.round(waitTime/1000)}s)`
                  } : s));
                  await new Promise(r => setTimeout(r, waitTime));
              }
          }

          if (controlRefs.current[sectionId]?.cancelled) throw new Error("Cancelled by user");
          
          setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'merging', progress: 99, currentStep: 'Finalizing...' } : s));

          let finalUrl = '';
          let finalBlob: Blob | undefined;

          if (mode === 'merge' || generatedBlobs.length === 1) {
              if (generatedBlobs.length > 1) {
                  finalBlob = await mergeWavBlobs(generatedBlobs);
              } else {
                  finalBlob = generatedBlobs[0];
              }
              finalUrl = URL.createObjectURL(finalBlob);
          } else {
              finalBlob = generatedBlobs[0];
              finalUrl = URL.createObjectURL(finalBlob);
          }
          
          const endTime = Date.now();
          const genTimeSec = (endTime - startTime) / 1000;
          
          // Calculate Audio Duration from Blob Size (WAV)
          // Duration = (Size - Header) / (SampleRate * Channels * BytesPerSample)
          // 24kHz, 1 Channel, 16bit (2 bytes)
          let audioDurationSec = 0;
          if (finalBlob) {
             const headerSize = 44;
             const bytesPerSec = SAMPLE_RATE * 1 * 2;
             audioDurationSec = Math.max(0, (finalBlob.size - headerSize) / bytesPerSec);
          }

          setSections(prev => prev.map(s => s.id === sectionId ? { 
              ...s, 
              status: 'completed', 
              progress: 100, 
              audioUrl: finalUrl,
              blob: finalBlob,
              isMultiPart: mode === 'separate' && generatedBlobs.length > 1,
              parts: separateParts,
              actualDuration: audioDurationSec,
              generationTime: genTimeSec
          } : s));

      } catch (error: any) {
          if (error.message === "Cancelled by user") {
               console.log("Generation cancelled");
          } else {
               console.error(error);
               let msg = error.message;
               // Use the new error message from service directly or fallback
               if(msg.includes('Quota')) msg = msg; 
               else if (msg.includes('Límite')) msg = msg;
               else msg = language === 'es' ? 'Error desconocido. Revisa consola.' : 'Unknown error. Check console.';
               
               setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'error', currentStep: msg } : s));
          }
      } finally {
          delete controlRefs.current[sectionId];
      }
  };

  const handleGenerateClick = (sectionId: string) => {
      const section = sections.find(s => s.id === sectionId);
      if (!section) return;
      if (section.charCount > LONG_AUDIO_THRESHOLD_CHARS) {
          setShowLongAudioModal({ sectionId });
      } else {
          startGeneration(sectionId, 'merge');
      }
  };

  const handleDeleteSection = (id: string) => {
      if(window.confirm(language === 'es' ? "¿Eliminar este audio?" : "Delete this audio?")) {
        setSections(prev => prev.map(s => s.id === id ? { ...s, status: 'idle', audioUrl: undefined, blob: undefined, parts: undefined, actualDuration: undefined, generationTime: undefined } : s));
      }
  };

  const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}m ${s}s`;
  };

  // Helper for Slider Colors
  const accentColorClass = language === 'es' ? 'accent-indigo-500' : 'accent-emerald-500';

  // --- Statistics Calculation ---
  const totalChars = sections.reduce((acc, curr) => acc + curr.charCount, 0);
  const totalEstimatedMins = sections.reduce((acc, curr) => acc + curr.estimatedDuration, 0);
  
  // Cost Estimation for Gemini 1.5 Flash (Paid Tier)
  // Input: $0.075 / 1 Million Tokens
  // Output: $0.30 / 1 Million Tokens
  // Approx conversion: 1 token = 4 chars.
  // Input Tokens = Chars / 4.
  // Output Tokens = Chars / 4 (Rough estimate for speech tokens, usually slightly more but this is safe)
  // Total Cost = (InputTokens/1M * 0.075) + (OutputTokens/1M * 0.30)
  // Simplified: (Chars/4/1M) * (0.075 + 0.30) = (Chars / 4,000,000) * 0.375
  const estimatedCost = (totalChars / 4000000) * 0.375; 

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full relative animate-in fade-in duration-300">
        
        {/* --- MODAL: EDIT SECTION TEXT --- */}
        {editingSection && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
                 <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative">
                     {/* Header */}
                     <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                         <div>
                             <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                 <Edit2 size={18} className="text-amber-400"/>
                                 {language === 'es' ? 'Editar Contenido' : 'Edit Content'}
                             </h3>
                             <p className="text-xs text-slate-500">{editingSection.title}</p>
                         </div>
                         <div className="flex gap-3">
                             <div className="bg-slate-800 px-3 py-1 rounded text-xs text-slate-400 border border-slate-700">
                                 {tempEditText.length} chars
                             </div>
                             <button onClick={() => setEditingSection(null)} className="text-slate-400 hover:text-white">
                                 <X size={24} />
                             </button>
                         </div>
                     </div>
                     
                     {/* Editor */}
                     <div className="flex-1 p-4 bg-slate-900/50">
                         <textarea 
                             value={tempEditText}
                             onChange={(e) => setTempEditText(e.target.value)}
                             className="w-full h-full bg-slate-800/50 text-slate-200 p-4 rounded-xl border border-slate-700 focus:border-amber-500 outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
                             placeholder="Edit text here..."
                         />
                     </div>

                     {/* Footer */}
                     <div className="p-4 border-t border-slate-800 bg-slate-950 rounded-b-2xl flex justify-end gap-3">
                         <button 
                             onClick={() => setEditingSection(null)}
                             className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                         >
                             {language === 'es' ? 'Cancelar' : 'Cancel'}
                         </button>
                         <button 
                             onClick={handleSaveEdit}
                             className={`px-6 py-2 rounded-lg ${themeBg} text-white font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2`}
                         >
                             <Save size={18} />
                             {language === 'es' ? 'Guardar Cambios' : 'Save Changes'}
                         </button>
                     </div>
                 </div>
             </div>
        )}

        {/* --- MODAL: LONG AUDIO DECISION --- */}
        {showLongAudioModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                    <div className="flex items-center gap-3 text-amber-400">
                        <AlertCircle size={24} />
                        <h3 className="text-lg font-bold">{language === 'es' ? 'Audio Extenso Detectado' : 'Long Audio Detected'}</h3>
                    </div>
                    <p className="text-slate-300 text-sm">
                        {language === 'es' 
                         ? 'Este capítulo dura más de 15 minutos. ¿Cómo prefieres generar el resultado?' 
                         : 'This chapter is over 15 minutes long. How do you want the result?'}
                    </p>
                    
                    <div className="grid grid-cols-1 gap-3 pt-2">
                        <button 
                            onClick={() => { startGeneration(showLongAudioModal.sectionId, 'merge'); setShowLongAudioModal(null); }}
                            className={`p-4 rounded-xl border flex items-center gap-3 hover:bg-slate-800 transition-colors text-left ${themeBorder} bg-slate-900`}
                        >
                            <div className={`p-2 rounded-full ${themeBg} text-white`}><Merge size={20}/></div>
                            <div>
                                <div className="font-bold text-white">{language === 'es' ? 'Un solo archivo (Unido)' : 'Single File (Merged)'}</div>
                                <div className="text-xs text-slate-400">{language === 'es' ? 'Mejor para escuchar. Tarda un poco más al final.' : 'Best for listening. Takes a bit longer to finalize.'}</div>
                            </div>
                        </button>

                        <button 
                            onClick={() => { startGeneration(showLongAudioModal.sectionId, 'separate'); setShowLongAudioModal(null); }}
                            className="p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex items-center gap-3 hover:bg-slate-800 transition-colors text-left"
                        >
                             <div className="p-2 rounded-full bg-slate-700 text-slate-300"><Split size={20}/></div>
                            <div>
                                <div className="font-bold text-white">{language === 'es' ? 'Archivos Separados' : 'Separate Files'}</div>
                                <div className="text-xs text-slate-400">{language === 'es' ? 'Genera Parte 1, Parte 2... en una lista.' : 'Generates Part 1, Part 2... as a list.'}</div>
                            </div>
                        </button>
                    </div>
                    <button onClick={() => setShowLongAudioModal(null)} className="w-full py-2 text-slate-500 hover:text-white text-sm">Cancel</button>
                </div>
            </div>
        )}

      {/* --- LEFT: EDITOR & INPUT --- */}
      <div className="lg:col-span-7 flex flex-col h-full space-y-6">
         
         {/* Title & Import */}
         <div className="flex items-center gap-4">
             <div className="flex-1 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3 focus-within:border-slate-500 transition-colors">
                 <Edit2 size={18} className="text-slate-500 ml-1" />
                 <input 
                   type="text"
                   value={projectTitle}
                   onChange={(e) => setProjectTitle(e.target.value)}
                   placeholder={t.projectTitlePlaceholder}
                   className="bg-transparent text-lg font-semibold text-white placeholder-slate-600 focus:outline-none w-full"
                 />
             </div>
             <button 
                 onClick={() => fileInputRef.current?.click()}
                 className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${themeBg} text-white hover:opacity-90 shadow-lg`}
             >
                 <Upload size={18} />
                 <span className="hidden sm:inline">{t.uploadBtn}</span>
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}/>
         </div>

         {/* Editor Area */}
         <div 
            className={`flex-1 bg-slate-800/20 rounded-2xl border-2 border-dashed transition-all relative flex flex-col ${isDragging ? `${themeBorder} bg-${themeColor}-900/10` : 'border-slate-800'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { 
                e.preventDefault(); setIsDragging(false); 
                if(e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]); 
            }}
         >
             <div className="absolute top-4 right-4 flex gap-2 pointer-events-none z-10">
                 <span className="bg-slate-900/80 text-slate-400 text-xs px-2 py-1 rounded border border-slate-700">
                     {fullText.length} chars
                 </span>
             </div>
             <textarea
                value={fullText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={t.placeholderText}
                className="w-full h-full bg-transparent p-6 rounded-2xl resize-none outline-none text-slate-300 leading-relaxed font-light custom-scrollbar"
             />
             {fullText.length === 0 && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="text-center text-slate-600">
                         <FileText size={48} className="mx-auto mb-2 opacity-50" />
                         <p>{language === 'es' ? 'Escribe o arrastra un archivo aquí' : 'Type or drag a file here'}</p>
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* --- RIGHT: DASHBOARD & GENERATION --- */}
      <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* Voice & Settings - Collapsible */}
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
             {/* Header */}
             <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
             >
                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                     <Settings2 size={16} className={themeText} /> {language === 'es' ? 'Configuración Global' : 'Global Settings'}
                 </h3>
                 {isSettingsOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
             </button>
             
             {isSettingsOpen && (
                 <div className="p-5 pt-0 space-y-5 animate-in slide-in-from-top-2 duration-200">
                     {/* Voice Select Scroll */}
                     <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar snap-x">
                         {VOICES.map((voice) => (
                             <div key={voice.id} className="min-w-[200px] snap-center">
                                <VoiceCard 
                                    voice={voice} 
                                    isSelected={selectedVoice.id === voice.id} 
                                    onSelect={setSelectedVoice} 
                                    apiKey={apiKey} 
                                    language={language}
                                    settings={settings}
                                />
                             </div>
                         ))}
                     </div>

                     {/* Sliders for Pitch and Speed */}
                     <div className="space-y-4 pt-2">
                        {/* Speed Slider */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-400">
                                <span>{t.speedTitle}</span>
                                <span className={`font-bold ${themeText}`}>{settings.speed.toFixed(1)}x</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.5" 
                                max="2.0" 
                                step="0.1" 
                                value={settings.speed} 
                                onChange={(e) => setSettings(s => ({...s, speed: parseFloat(e.target.value)}))}
                                className={`w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer ${accentColorClass}`}
                            />
                            <div className="flex justify-between text-[10px] text-slate-600">
                                <span>Slow (0.5x)</span>
                                <span>Fast (2.0x)</span>
                            </div>
                        </div>

                        {/* Pitch Slider */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-400">
                                <span>{t.pitchTitle}</span>
                                <span className={`font-bold ${themeText}`}>
                                    {settings.pitch === 0 ? 'Natural' : (settings.pitch < 0 ? 'Low' : 'High')} ({settings.pitch > 0 ? '+' : ''}{settings.pitch})
                                </span>
                            </div>
                            <input 
                                type="range" 
                                min="-2" 
                                max="2" 
                                step="1" 
                                value={settings.pitch} 
                                onChange={(e) => setSettings(s => ({...s, pitch: parseFloat(e.target.value)}))}
                                className={`w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer ${accentColorClass}`}
                            />
                             <div className="flex justify-between text-[10px] text-slate-600">
                                <span>Deep (-2)</span>
                                <span>High (+2)</span>
                            </div>
                        </div>
                     </div>
                 </div>
             )}
          </div>

          {/* DOCUMENT LIST (Sections) */}
          <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2">
                      <FolderOpen size={18} className="text-amber-400" />
                      {language === 'es' ? 'Documentos de Audio' : 'Audio Documents'}
                  </h3>
                  {sections.length > 0 && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full">{sections.length}</span>
                  )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  {sections.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-60">
                          <Layers size={32} />
                          <p className="text-sm">{language === 'es' ? 'No hay documentos detectados' : 'No documents detected'}</p>
                      </div>
                  ) : (
                      sections.map((section) => (
                          <div 
                            key={section.id} 
                            className={`rounded-xl border transition-all overflow-hidden ${section.status === 'completed' ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-800/40 border-slate-700/50'}`}
                          >
                              {/* HEADER */}
                              <div className="p-4 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${section.status === 'completed' ? 'bg-green-500/20 text-green-400' : (section.status === 'generating' || section.status === 'merging' ? 'bg-amber-500/20 text-amber-400' : (section.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' : (section.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400')))}`}>
                                      {section.status === 'generating' || section.status === 'merging' ? <Loader2 size={20} className="animate-spin" /> : 
                                       section.status === 'paused' ? <Pause size={20} /> :
                                       section.status === 'completed' ? <CheckCircle2 size={20} /> : 
                                       section.status === 'error' ? <AlertCircle size={20} /> : <FileAudio size={20} />}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-slate-200 truncate">{section.title}</h4>
                                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                          {section.status === 'completed' && section.actualDuration !== undefined ? (
                                              <>
                                                  <span className={`flex items-center gap-1 font-bold ${language === 'es' ? 'text-indigo-300' : 'text-emerald-300'}`}>
                                                      <Clock size={10} /> {formatTime(section.actualDuration)}
                                                  </span>
                                                  <span>•</span>
                                                  <span className="flex items-center gap-1" title={language === 'es' ? 'Tiempo de generación' : 'Generation time'}>
                                                      <Timer size={10} /> {section.generationTime?.toFixed(1)}s
                                                  </span>
                                              </>
                                          ) : (
                                              <span className="flex items-center gap-1"><Clock size={10} /> ~{formatTime(section.estimatedDuration * 60)}</span>
                                          )}
                                          <span>•</span>
                                          <span>{Math.round(section.charCount / 1000)}k chars</span>
                                      </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-2">
                                    {/* Edit Button - Allowed unless generating */}
                                    {section.status !== 'generating' && section.status !== 'merging' && (
                                        <button 
                                            onClick={() => handleOpenEdit(section)}
                                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
                                            title={language === 'es' ? 'Editar texto' : 'Edit text'}
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    )}

                                    {section.status === 'idle' || section.status === 'error' ? (
                                        <button 
                                            onClick={() => handleGenerateClick(section.id)}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${themeBg} hover:opacity-90`}
                                        >
                                            <Zap size={16} fill="currentColor" /> {t.generateBtn}
                                        </button>
                                    ) : section.status === 'generating' || section.status === 'paused' ? (
                                        <>
                                            {section.status === 'generating' ? (
                                                <button onClick={() => handlePause(section.id)} className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-600">
                                                    <Pause size={18} fill="currentColor" />
                                                </button>
                                            ) : (
                                                <button onClick={() => handleResume(section.id)} className="p-2 bg-slate-800 hover:bg-slate-700 text-green-400 rounded-lg border border-slate-600">
                                                    <Play size={18} fill="currentColor" />
                                                </button>
                                            )}
                                            <button onClick={() => handleCancel(section.id)} className="p-2 bg-slate-800 hover:bg-red-900/30 text-red-400 rounded-lg border border-slate-600">
                                                <Square size={18} fill="currentColor" />
                                            </button>
                                        </>
                                    ) : section.status === 'completed' ? (
                                        <>
                                            <button onClick={() => section.audioUrl && onSendToPlayer(section.audioUrl, section.title, section.blob)} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-600">
                                                <PlayCircle size={20} />
                                            </button>
                                            <button onClick={() => handleDeleteSection(section.id)} className="p-2 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded-lg">
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    ) : null}
                                  </div>
                              </div>

                              {/* PROGRESS BAR */}
                              {(section.status === 'generating' || section.status === 'merging' || section.status === 'paused') && (
                                  <div className="px-4 pb-4">
                                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                                          <span>{section.status === 'paused' ? (language === 'es' ? 'Pausado' : 'Paused') : section.currentStep}</span>
                                          <span>{section.progress}%</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full transition-all duration-300 ${section.status === 'paused' ? 'bg-yellow-500' : themeBg}`} 
                                            style={{ width: `${section.progress}%` }}
                                          ></div>
                                      </div>
                                  </div>
                              )}

                              {/* RESULT: SINGLE PLAYER */}
                              {section.status === 'completed' && !section.isMultiPart && section.audioUrl && (
                                  <div className="bg-black/20 p-3 border-t border-slate-800">
                                      <AudioPlayer 
                                        chunk={{
                                            id: section.id,
                                            index: 0,
                                            text: 'Full Audio',
                                            title: section.title,
                                            charCount: section.charCount,
                                            estimatedDurationSec: section.estimatedDuration * 60,
                                            estimatedGenTimeSec: 0,
                                            status: 'success',
                                            downloaded: false,
                                            audioUrl: section.audioUrl,
                                            blob: section.blob
                                        }}
                                        onDownload={()=>{}}
                                        language={language}
                                      />
                                  </div>
                              )}

                              {/* RESULT: MULTI PARTS */}
                              {section.status === 'completed' && section.isMultiPart && section.parts && (
                                  <div className="bg-black/20 p-3 border-t border-slate-800 space-y-2">
                                      <div className="text-xs font-bold text-slate-500 uppercase px-1">Partes Generadas</div>
                                      {section.parts.map((part, idx) => (
                                          <div key={idx} className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800">
                                              <span className="text-xs text-slate-300 ml-2">Part {idx + 1}</span>
                                              <div className="flex gap-2">
                                                  <a href={part.url} download={`${part.title}.wav`} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><Download size={14}/></a>
                                                  <button onClick={() => onSendToPlayer(part.url, part.title, part.blob)} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><PlayCircle size={14}/></button>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}

                              {/* ERROR MSG */}
                              {section.status === 'error' && (
                                  <div className="px-4 pb-4 text-xs text-red-400 flex items-center gap-2">
                                      <AlertCircle size={12} /> {section.currentStep}
                                  </div>
                              )}
                          </div>
                      ))
                  )}
              </div>

              {/* STATS FOOTER */}
              <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2" title={language === 'es' ? 'Total Caracteres' : 'Total Characters'}>
                          <FileText size={14} className="text-slate-500" />
                          <span className="font-mono">{totalChars.toLocaleString()} chars</span>
                      </div>
                      <div className="flex items-center gap-2" title={language === 'es' ? 'Duración Total Estimada' : 'Total Estimated Duration'}>
                          <Clock size={14} className="text-slate-500" />
                          <span className="font-mono">~{Math.ceil(totalEstimatedMins)} min</span>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800" title={language === 'es' ? 'Coste estimado con Gemini Flash (Pago)' : 'Estimated cost with Gemini Flash (Paid)'}>
                      <Coins size={14} className="text-amber-400" />
                      <span className="text-slate-300 font-semibold">Est. Cost: </span>
                      <span className="text-green-400 font-mono">€{estimatedCost.toFixed(4)}</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default TextToSpeechModule;