import React, { useState, useRef, useEffect } from 'react';
import { Mic, Upload, Loader2, Volume2, Link as LinkIcon, AlertTriangle, Download, Music, RefreshCw, Scissors, Check, SquareCheck, Square, XCircle, Merge, FileAudio, Zap, PlayCircle } from 'lucide-react';
import { Language, VoiceOption } from '../types';
import { UI_TEXT, VOICES_ES, VOICES_EN } from '../constants';
import { transcribeAndTranslateAudio, generateSpeechFromText } from '../services/geminiService';
import { splitAudioBlob, mergeWavBlobs } from '../utils/audioUtils';
import VoiceCard from './VoiceCard';

interface VTVProps {
  apiKey: string;
  language: Language;
  themeColor: string;
  themeBg: string;
  themeText: string;
  onSendToPlayer: (url: string, title: string, blob?: Blob) => void;
}

interface AudioChunk {
  id: number;
  blob: Blob;
  url: string;
  selected: boolean;
  status: 'pending' | 'processing' | 'success' | 'error';
  transcription?: string;
  translation?: string;
  error?: string;
  // Dubbing fields
  dubbingStatus?: 'pending' | 'generating' | 'success' | 'error';
  dubbingBlob?: Blob;
  dubbingUrl?: string;
}

const VoiceTranslationModule: React.FC<VTVProps> = ({ apiKey, language, themeColor, themeBg, themeText, onSendToPlayer }) => {
  const t = UI_TEXT[language];
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  
  // Main Input State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [inputAudioUrl, setInputAudioUrl] = useState<string | null>(null); // For small files
  
  // Large File / Chunking State
  const [sourceChunks, setSourceChunks] = useState<AudioChunk[]>([]);
  
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>('');
  
  // Results State (Aggregated)
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);
  const [resultAudioBlob, setResultAudioBlob] = useState<Blob | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Target Logic
  const targetVoices = language === 'es' ? VOICES_ES : VOICES_EN;
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(targetVoices[0]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
        if (inputAudioUrl) URL.revokeObjectURL(inputAudioUrl);
        sourceChunks.forEach(c => {
            URL.revokeObjectURL(c.url);
            if (c.dubbingUrl) URL.revokeObjectURL(c.dubbingUrl);
        });
    };
  }, [inputAudioUrl, sourceChunks]);

  const resetAll = () => {
     setSourceChunks([]);
     setTranscription('');
     setTranslation('');
     setResultAudioUrl(null);
     setResultAudioBlob(null);
     setProcessError(null);
     setProgressMsg('');
     if (inputAudioUrl) URL.revokeObjectURL(inputAudioUrl);
     setInputAudioUrl(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const file = e.target.files[0];
        setAudioFile(file);
        resetAll();
        
        await processNewFile(file);
    }
  };

  const processNewFile = async (file: File) => {
    // Large File Check (> 18MB)
    if (file.size > 18 * 1024 * 1024) {
        setIsSplitting(true);
        try {
            // Split immediately
            const chunks = await splitAudioBlob(file, 300); // 5 min chunks
            const chunkObjects: AudioChunk[] = chunks.map((blob, idx) => ({
                id: idx,
                blob,
                url: URL.createObjectURL(blob),
                selected: true,
                status: 'pending',
                dubbingStatus: 'pending'
            }));
            setSourceChunks(chunkObjects);
        } catch (err: any) {
            setProcessError("Error splitting file: " + err.message);
        } finally {
            setIsSplitting(false);
        }
    } else {
        // Small file, just standard view
        setInputAudioUrl(URL.createObjectURL(file));
    }
  };

  const handleUrlLoad = async () => {
    setUrlError(null);
    setProcessError(null);
    if (!urlInput.trim()) return;
    
    if (urlInput.includes('youtube.com') || urlInput.includes('youtu.be')) {
        setUrlError(t.vtvYoutubeError);
        return;
    }

    setIsLoadingUrl(true);
    try {
        const response = await fetch(urlInput);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        
        // Try to derive name from URL
        let name = urlInput.split('/').pop() || 'downloaded_audio';
        if (!name.includes('.')) name += '.mp3'; 
        
        const file = new File([blob], name, { type: blob.type });
        setAudioFile(file);
        resetAll();
        setUrlInput('');
        
        await processNewFile(file);
    } catch (e) {
        console.error(e);
        setUrlError(t.vtvUrlError);
    } finally {
        setIsLoadingUrl(false);
    }
  };

  const toggleChunkSelection = (id: number) => {
      setSourceChunks(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const retryChunk = async (id: number) => {
      const chunk = sourceChunks.find(c => c.id === id);
      if (!chunk || !apiKey) return;
      
      setSourceChunks(prev => prev.map(c => c.id === id ? { ...c, status: 'processing', error: undefined } : c));
      
      try {
          const result = await transcribeAndTranslateAudio(chunk.blob, apiKey, language, `part_${chunk.id}.wav`);
          setSourceChunks(prev => prev.map(c => c.id === id ? { 
              ...c, 
              status: 'success', 
              transcription: result.transcription, 
              translation: result.translation 
          } : c));
      } catch (err: any) {
          setSourceChunks(prev => prev.map(c => c.id === id ? { ...c, status: 'error', error: err.message } : c));
      }
  };

  const generateChunkDubbing = async (id: number) => {
      const chunk = sourceChunks.find(c => c.id === id);
      if (!chunk || !chunk.translation || !apiKey) return;

      setSourceChunks(prev => prev.map(c => c.id === id ? { ...c, dubbingStatus: 'generating' } : c));

      try {
         const audioBlob = await generateSpeechFromText(
             chunk.translation, 
             selectedVoice, 
             // Use numeric defaults
             { pitch: 0, speed: 1.0, dialogueMode: false, autoOptimize: false, isPaid: false },
             apiKey,
             language
         );
         const url = URL.createObjectURL(audioBlob);
         setSourceChunks(prev => prev.map(c => c.id === id ? { 
             ...c, 
             dubbingStatus: 'success', 
             dubbingBlob: audioBlob, 
             dubbingUrl: url 
         } : c));
      } catch (e: any) {
         setSourceChunks(prev => prev.map(c => c.id === id ? { ...c, dubbingStatus: 'error', error: e.message } : c));
      }
  };

  const generateAllDubbings = async () => {
      const pending = sourceChunks.filter(c => c.status === 'success' && c.translation && (!c.dubbingBlob));
      if (pending.length === 0) return;

      setIsGeneratingAudio(true);
      
      for (const chunk of pending) {
          await generateChunkDubbing(chunk.id);
          // Small delay to be gentle on API
          await new Promise(r => setTimeout(r, 300));
      }
      
      setIsGeneratingAudio(false);
  };

  const mergeDubbings = async () => {
      const blobs = sourceChunks.filter(c => c.dubbingBlob).map(c => c.dubbingBlob!);
      if (blobs.length === 0) return;

      setIsMerging(true);
      try {
          const mergedBlob = await mergeWavBlobs(blobs);
          const url = URL.createObjectURL(mergedBlob);
          setResultAudioUrl(url);
          setResultAudioBlob(mergedBlob);
      } catch (e: any) {
          setProcessError("Merge Error: " + e.message);
      } finally {
          setIsMerging(false);
      }
  };

  const generateDubbing = async (textToSpeak: string) => {
      if (!textToSpeak || !apiKey) return;
      setIsGeneratingAudio(true);
      try {
         const audioBlob = await generateSpeechFromText(
             textToSpeak, 
             selectedVoice, 
             // Use numeric defaults
             { pitch: 0, speed: 1.0, dialogueMode: false, autoOptimize: false, isPaid: false },
             apiKey,
             language
         );
         const url = URL.createObjectURL(audioBlob);
         setResultAudioUrl(url);
         setResultAudioBlob(audioBlob);
      } catch (e: any) {
          setProcessError("Dubbing Generation Error: " + e.message);
      } finally {
          setIsGeneratingAudio(false);
      }
  };

  const handleProcess = async () => {
    if (!audioFile || !apiKey) return;
    setIsProcessing(true);
    setProcessError(null);
    
    // Do NOT clear source chunks here, we want to update them in place
    setTranscription('');
    setTranslation('');
    setResultAudioUrl(null);
    setResultAudioBlob(null);

    let fullTrans = "";
    let fullTransl = "";
    
    // We work with current state reference
    let currentChunks = [...sourceChunks];

    try {
        if (sourceChunks.length > 0) {
            const selected = sourceChunks.filter(c => c.selected);
            if (selected.length === 0) {
                alert("Please select at least one part.");
                setIsProcessing(false);
                return;
            }

            // Ensure results panel is visible immediately by setting partial state if needed
            // (State updates will trigger re-render)

            for (const chunk of selected) {
                if (chunk.status === 'success') continue;

                setSourceChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'processing', error: undefined } : c));
                
                try {
                    const result = await transcribeAndTranslateAudio(chunk.blob, apiKey, language, `part_${chunk.id}.wav`);
                    
                    setSourceChunks(prev => prev.map(c => c.id === chunk.id ? { 
                        ...c, 
                        status: 'success', 
                        transcription: result.transcription, 
                        translation: result.translation 
                    } : c));
                    
                    // Update local reference for final aggregation
                    const idx = currentChunks.findIndex(c => c.id === chunk.id);
                    if (idx !== -1) {
                        currentChunks[idx] = { ...currentChunks[idx], status: 'success', ...result };
                    }

                } catch (err: any) {
                     setSourceChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'error', error: err.message } : c));
                     // Continue to next chunk even if this one fails
                }
            }
            
            // Re-read from state/local ref to build full text
            const validChunks = currentChunks.filter(c => c.selected && c.status === 'success');
            
            fullTrans = validChunks.map(c => `[Part ${c.id + 1}]\n${c.transcription || ''}`).join('\n\n');
            fullTransl = validChunks.map(c => c.translation || '').join('\n\n');

        } else {
            const result = await transcribeAndTranslateAudio(audioFile, apiKey, language, audioFile.name);
            fullTrans = result.transcription;
            fullTransl = result.translation;
        }

        setTranscription(fullTrans);
        setTranslation(fullTransl);

        // Auto-generate ONLY if it's a small single file. 
        // For chunks, we let the user decide in the UI to avoid massive API usage at once.
        if (sourceChunks.length === 0 && fullTransl.trim()) {
             setProgressMsg(language === 'es' ? "Generando audio final..." : "Generating final audio...");
             await generateDubbing(fullTransl);
             setTimeout(() => {
                 resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
             }, 100);
        } else if (sourceChunks.length > 0) {
             // Just scroll to results to show the partials
             setTimeout(() => {
                 resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
             }, 100);
        }

    } catch (e: any) {
        console.error(e);
        let msg = e.message;
        if (msg.includes('500') || msg.includes('Internal error')) {
            msg = language === 'es' 
              ? 'Error interno de Gemini (500). El formato de audio podría no ser compatible.' 
              : 'Gemini Internal Error (500). Audio format incompatible.';
        }
        setProcessError(msg);
    } finally {
        setIsProcessing(false);
        setProgressMsg('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">{t.vtvTitle}</h2>
        <p className="text-slate-400">{t.vtvDesc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Upload Area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed ${audioFile ? `border-${themeColor}-500 bg-${themeColor}-900/10` : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'} rounded-2xl p-8 text-center cursor-pointer transition-all min-h-[220px] relative`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*,video/*" onChange={handleFileChange} />
            <div className="flex flex-col items-center gap-4">
                <div className={`p-4 rounded-full ${audioFile ? themeBg : 'bg-slate-800'}`}>
                    {isSplitting ? <Loader2 size={32} className="animate-spin text-white"/> : (audioFile ? <Volume2 size={32} className="text-white"/> : <Upload size={32} className="text-slate-400"/>)}
                </div>
                <div className="px-4">
                    <p className="text-lg font-medium text-slate-200 break-all">
                        {audioFile ? audioFile.name : t.vtvDrop}
                    </p>
                    {isSplitting && <p className="text-xs text-slate-400 mt-2">{language === 'es' ? 'Archivo grande detectado. Preparando segmentos...' : 'Large file detected. Preparing segments...'}</p>}
                </div>
                {audioFile && !isSplitting && (
                    <button onClick={(e) => { e.stopPropagation(); setAudioFile(null); resetAll(); }} className="text-xs text-red-400 hover:underline z-10">
                        Remove
                    </button>
                )}
            </div>
          </div>

          {/* URL Input Area */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-center space-y-4 bg-slate-800/30 rounded-2xl p-8 border border-slate-700 min-h-[220px]">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <LinkIcon size={16} /> {t.vtvUrlLabel}
                </label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={urlInput}
                        onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                        placeholder={t.vtvUrlPlaceholder}
                        className={`flex-1 bg-slate-900 border ${urlError ? 'border-red-500' : 'border-slate-600'} rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-slate-400 placeholder:text-slate-600`}
                    />
                    <button 
                        onClick={handleUrlLoad}
                        disabled={isLoadingUrl || !urlInput.trim()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${isLoadingUrl ? 'bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                    >
                        {isLoadingUrl ? <Loader2 size={16} className="animate-spin" /> : t.vtvLoadBtn}
                    </button>
                </div>
                
                {urlError ? (
                    <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300">{urlError}</p>
                    </div>
                ) : (
                    <p className="text-xs text-slate-500 flex items-start gap-1">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        {t.vtvYoutubeError}
                    </p>
                )}
            </div>
          </div>
      </div>

      {/* 1. Small File Source Player */}
      {audioFile && inputAudioUrl && (
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row items-center gap-4 animate-in fade-in">
              <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${themeBg} text-white`}><Volume2 size={20}/></div>
                  <span className="font-medium text-slate-300 text-sm">{t.vtvSourceAudio}</span>
              </div>
              <audio controls src={inputAudioUrl} className="w-full md:flex-1 h-10" />
          </div>
      )}

      {/* 2. Large File Chunks UI */}
      {sourceChunks.length > 0 && (
          <div className="bg-slate-800/20 rounded-xl border border-slate-800 animate-in slide-in-from-bottom-2 overflow-hidden">
             <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center flex-wrap gap-3">
                 <div className="flex items-center gap-2">
                     <Scissors size={18} className="text-amber-400" />
                     <h3 className="font-semibold text-slate-200 text-sm">
                         {language === 'es' ? `Segmentos Detectados (${sourceChunks.length})` : `Detected Segments (${sourceChunks.length})`}
                     </h3>
                 </div>
                 
                 <div className="flex items-center gap-4">
                     {/* START PROCESSING BUTTON */}
                     <button 
                        onClick={handleProcess}
                        disabled={isProcessing}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg ${isProcessing ? 'bg-slate-700 text-slate-400' : 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/30'}`}
                     >
                        {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} fill="currentColor" />}
                        {language === 'es' ? 'Procesar Seleccionados' : 'Process Selected'}
                     </button>

                     <div className="h-4 w-px bg-slate-700 mx-2 hidden sm:block"></div>

                     <button 
                        onClick={() => {
                            const allSelected = sourceChunks.every(c => c.selected);
                            setSourceChunks(prev => prev.map(c => ({...c, selected: !allSelected})));
                        }}
                        className="text-xs text-slate-400 hover:text-white"
                     >
                        {sourceChunks.every(c => c.selected) ? (language === 'es' ? 'Deseleccionar todos' : 'Deselect all') : (language === 'es' ? 'Seleccionar todos' : 'Select all')}
                     </button>
                 </div>
             </div>
             
             <div className="max-h-[400px] overflow-y-auto p-2 space-y-2">
                {sourceChunks.map((chunk, idx) => (
                    <div key={chunk.id} className={`flex flex-col md:flex-row items-center gap-3 p-3 rounded-lg border transition-all ${chunk.selected ? 'bg-slate-800 border-slate-700' : 'bg-slate-900/30 border-transparent opacity-60'}`}>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => toggleChunkSelection(chunk.id)}
                                className={`shrink-0 ${chunk.selected ? themeText : 'text-slate-600'}`}
                            >
                                {chunk.selected ? <SquareCheck size={20} /> : <Square size={20} />}
                            </button>
                            <span className="text-sm font-medium text-slate-300 w-16">Part {idx + 1}</span>
                        </div>
                        
                        <audio controls src={chunk.url} className="h-8 w-full md:flex-1" />
                        
                        <div className="w-full md:w-32 flex justify-end">
                            {chunk.status === 'processing' && <span className="flex items-center gap-1 text-xs text-amber-400"><Loader2 size={12} className="animate-spin"/> Processing</span>}
                            {chunk.status === 'success' && <span className="flex items-center gap-1 text-xs text-green-400"><Check size={12} /> Done</span>}
                            {chunk.status === 'error' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} /> Error</span>
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); retryChunk(chunk.id); }}
                                       className="p-1 hover:bg-slate-700 rounded text-slate-300"
                                       title="Retry this chunk"
                                    >
                                       <RefreshCw size={12} />
                                    </button>
                                </div>
                            )}
                            {chunk.status === 'pending' && <span className="text-xs text-slate-500">{language === 'es' ? 'Listo' : 'Ready'}</span>}
                        </div>
                    </div>
                ))}
             </div>
          </div>
      )}

      {/* Process Error Banner */}
      {processError && (
          <div className="animate-in fade-in p-4 bg-red-900/20 border border-red-500/40 rounded-xl flex items-start gap-3">
              <AlertTriangle className="text-red-400 shrink-0 mt-1" />
              <div>
                  <h4 className="font-bold text-red-400 text-sm">Error</h4>
                  <p className="text-red-300 text-sm mt-1">{processError}</p>
              </div>
          </div>
      )}

      {/* Voice Selection & Generate Button - Only show if NO chunks, otherwise manual processing above */}
      {audioFile && sourceChunks.length === 0 && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2 bg-slate-800/20 p-6 rounded-2xl border border-slate-800">
             <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full ${themeBg} flex items-center justify-center text-white font-bold`}>1</div>
                 <h3 className="text-lg font-semibold text-white">Select Target Voice ({language.toUpperCase()})</h3>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-11">
                 {targetVoices.slice(0, 4).map(v => (
                     <VoiceCard 
                        key={v.id} 
                        voice={v} 
                        isSelected={selectedVoice.id === v.id} 
                        onSelect={setSelectedVoice} 
                        apiKey={apiKey} 
                        language={language}
                        settings={{ pitch: 0, speed: 1.0, dialogueMode: false, autoOptimize: false, isPaid: false }}
                     />
                 ))}
             </div>

             <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <div className={`w-8 h-8 rounded-full ${themeBg} flex items-center justify-center text-white font-bold`}>2</div>
                <h3 className="text-lg font-semibold text-white">Generate Result</h3>
             </div>

             <button 
                onClick={handleProcess}
                disabled={isProcessing}
                className={`ml-11 w-[calc(100%-2.75rem)] py-4 rounded-xl font-bold text-lg text-white shadow-lg transition-all ${isProcessing ? 'bg-slate-700' : themeBg} hover:opacity-90`}
              >
                {isProcessing ? (
                    <div className="flex flex-col items-center">
                        <span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin"/> {t.vtvTranscribing}</span>
                        {progressMsg && <span className="text-xs font-normal opacity-80 mt-1">{progressMsg}</span>}
                    </div>
                ) : (
                    <span className="flex items-center justify-center gap-2"><Mic/> {t.vtvGenerateBtn}</span>
                )}
             </button>
          </div>
      )}

      {/* Results - Show if we have text OR if we have chunks being processed */}
      {(transcription || translation || sourceChunks.length > 0) && (
          <div ref={resultsRef} className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 scroll-mt-24">
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                  <h4 className="text-slate-400 text-sm uppercase font-bold mb-3">{t.vtvOriginalTitle}</h4>
                  <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                     <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-sm">
                        {transcription || (sourceChunks.length > 0 ? (language === 'es' ? 'Esperando procesamiento de segmentos...' : 'Waiting for segments processing...') : '')}
                     </p>
                  </div>
              </div>
              <div className={`bg-${themeColor}-900/20 p-6 rounded-xl border border-${themeColor}-500/30 flex flex-col`}>
                  <div className="flex items-center justify-between mb-3">
                      <h4 className={`${themeText} text-sm uppercase font-bold`}>{t.vtvTranslationTitle}</h4>
                      {/* Only show Regenerate if we have a full single translation and no chunks */}
                      {sourceChunks.length === 0 && translation && (
                          <button 
                             onClick={() => generateDubbing(translation)} 
                             disabled={isGeneratingAudio}
                             className={`text-xs flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors`}
                             title="Regenerate audio from this text"
                          >
                             {isGeneratingAudio ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
                             {t.vtvRegenerateBtn}
                          </button>
                      )}
                  </div>
                  
                  <div className="max-h-[300px] overflow-y-auto pr-2 mb-4 custom-scrollbar flex-1">
                     <p className="text-white leading-relaxed whitespace-pre-wrap text-sm">
                        {translation || (sourceChunks.length > 0 ? (language === 'es' ? 'Los resultados aparecerán aquí...' : 'Results will appear here...') : '')}
                     </p>
                  </div>

                  {/* Partial Audio Management for Large Files - ALWAYS VISIBLE if chunks exist */}
                  {sourceChunks.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                          <div className="flex justify-between items-center mb-3">
                              <h5 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                  <FileAudio size={16} /> {language === 'es' ? 'Audios Parciales' : 'Partial Audios'}
                              </h5>
                              <button 
                                onClick={generateAllDubbings}
                                disabled={isGeneratingAudio || sourceChunks.every(c => !c.translation || c.dubbingBlob)}
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 flex items-center gap-1 disabled:opacity-50"
                              >
                                  {isGeneratingAudio ? <Loader2 size={12} className="animate-spin" /> : <Music size={12} />}
                                  {language === 'es' ? 'Generar Todos' : 'Generate All'}
                              </button>
                          </div>
                          
                          {/* Voice Selector for Partials if needed */}
                          {sourceChunks.some(c => c.translation && !c.dubbingBlob) && (
                              <div className="mb-3 bg-slate-900/40 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
                                  <span className="text-xs text-slate-400">Voice:</span>
                                  <select 
                                    className="bg-transparent text-xs text-white outline-none flex-1"
                                    value={selectedVoice.id}
                                    onChange={(e) => {
                                        const v = targetVoices.find(tv => tv.id === e.target.value);
                                        if (v) setSelectedVoice(v);
                                    }}
                                  >
                                      {targetVoices.map(v => (
                                          <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>
                                      ))}
                                  </select>
                              </div>
                          )}

                          <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 mb-4 custom-scrollbar">
                              {sourceChunks.map(chunk => (
                                  <div key={chunk.id} className={`bg-slate-900/50 p-2 rounded-lg flex items-center justify-between gap-2 border ${chunk.status === 'success' ? 'border-green-900/30' : 'border-slate-800'} transition-all`}>
                                      <div className="flex items-center gap-2">
                                          <span className="text-xs text-slate-400 font-medium w-12">Part {chunk.id + 1}</span>
                                          {chunk.status === 'success' ? (
                                              <Check size={12} className="text-green-500"/>
                                          ) : chunk.status === 'error' ? (
                                              <XCircle size={12} className="text-red-500"/>
                                          ) : (
                                              <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                                          )}
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                        {chunk.dubbingStatus === 'generating' && <Loader2 size={14} className="animate-spin text-amber-400" />}
                                        {chunk.dubbingStatus === 'error' && <span title={chunk.error} className="text-red-400 cursor-help"><XCircle size={14} /></span>}
                                        
                                        {chunk.dubbingUrl ? (
                                            <audio controls src={chunk.dubbingUrl} className="h-6 w-24" />
                                        ) : (
                                            <button 
                                                onClick={() => generateChunkDubbing(chunk.id)}
                                                disabled={chunk.dubbingStatus === 'generating' || !chunk.translation}
                                                className={`text-[10px] px-2 py-0.5 rounded border border-slate-600 ${!chunk.translation ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                            >
                                                Generate
                                            </button>
                                        )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                          
                          <button
                             onClick={mergeDubbings}
                             disabled={isMerging || sourceChunks.filter(c => c.dubbingBlob).length < 2}
                             className={`w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${sourceChunks.filter(c => c.dubbingBlob).length < 2 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : `${themeBg} text-white hover:opacity-90`}`}
                          >
                             {isMerging ? <Loader2 size={14} className="animate-spin"/> : <Merge size={14}/>}
                             {language === 'es' ? 'Unir Audios Generados' : 'Merge Generated Audios'}
                          </button>
                      </div>
                  )}
                  
                  {resultAudioUrl && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3 animate-in fade-in">
                          <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-green-400 uppercase tracking-wider">{language === 'es' ? 'Audio Final' : 'Final Audio'}</span>
                          </div>
                          <div className="bg-black/20 p-2 rounded-lg">
                             <audio controls src={resultAudioUrl} className="w-full" />
                          </div>
                          <div className="flex gap-2">
                            <a 
                                href={resultAudioUrl} 
                                download="translated_dubbing.wav" 
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors border border-slate-700`}
                            >
                                <Download size={16}/> Download
                            </a>
                            <button
                                onClick={() => onSendToPlayer(resultAudioUrl!, `Translated: ${audioFile?.name}`, resultAudioBlob || undefined)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${themeBg} hover:opacity-90 text-white font-medium transition-colors`}
                            >
                                <Music size={16} /> Open in Player
                            </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default VoiceTranslationModule;