import React, { useState, useEffect } from 'react';
import { AudioWaveform, Languages, Key, ShieldCheck, Trash2, Terminal, X, Mic, PlayCircle, Type, Github, Copy, Check, Book, ExternalLink, Info, Eye, EyeOff, Shield } from 'lucide-react';
import { APP_VERSION, APP_NAME, UI_TEXT, GIT_CMDS, HELP_CONTENT } from './constants';
import { Language } from './types';
import TextToSpeechModule from './components/TextToSpeechModule';
import VoiceTranslationModule from './components/VoiceTranslationModule';
import MediaPlayerModule from './components/MediaPlayerModule';

const App: React.FC = () => {
  // --- Global Settings ---
  const [language, setLanguage] = useState<Language>('es');
  const [currentTab, setCurrentTab] = useState<'TTS' | 'VTV' | 'PLAYER'>('TTS');
  
  // --- Global Audio State (For Player) ---
  const [globalAudio, setGlobalAudio] = useState<{ url: string; title: string; blob?: Blob } | null>(null);

  // Theme Variables
  const isEs = language === 'es';
  const t = UI_TEXT[language];
  const themeColor = isEs ? 'indigo' : 'emerald';
  const themeText = isEs ? 'text-indigo-400' : 'text-emerald-400';
  const themeBg = isEs ? 'bg-indigo-600' : 'bg-emerald-600';
  const themeBorder = isEs ? 'border-indigo-500' : 'border-emerald-500';

  // --- API Key State ---
  // Check if we are running with a system/vercel key
  const envKey = process.env.API_KEY;
  const isEnvKey = !!(envKey && envKey.length > 5);

  const [apiKey, setApiKey] = useState<string>(() => {
    // Priority: Vercel Env Var (Process.env via Vite Define) -> LocalStorage
    if (isEnvKey) return envKey;
    return localStorage.getItem('gemini_api_key') || '';
  });
  
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // --- Git & Info Modals ---
  const [showGitModal, setShowGitModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [gitTab, setGitTab] = useState<'initial' | 'update'>('initial');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Show key modal on mount if no key exists
  useEffect(() => {
    if (!apiKey) setShowKeyModal(true);
  }, [apiKey]);

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem('gemini_api_key', tempKey.trim());
      setApiKey(tempKey.trim());
      setShowKeyModal(false);
      setTempKey('');
    }
  };

  const handleRemoveKey = () => {
    if(isEnvKey) {
        alert(isEs 
          ? "Estás usando una clave definida en Variables de Entorno (Vercel/Sistema). No se puede borrar desde aquí." 
          : "You are using an Environment Variable key (Vercel/System). Cannot remove it here.");
        return;
    }

    if(window.confirm(isEs ? "¿Seguro que quieres borrar/cambiar la clave?" : "Are you sure you want to remove/change the key?")) {
        localStorage.removeItem('gemini_api_key');
        setApiKey('');
        setShowKeyModal(true);
    }
  };

  const sendToPlayer = (url: string, title: string, blob?: Blob) => {
      setGlobalAudio({ url, title, blob });
      setCurrentTab('PLAYER');
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setCopiedCmd(text);
      setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="min-h-screen pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative flex flex-col font-sans">
      
      {/* API KEY MODAL */}
      {showKeyModal && !isEnvKey && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-8 space-y-6 shadow-2xl relative">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isEs ? 'bg-indigo-500/20' : 'bg-emerald-500/20'} mb-4`}>
                   <Key size={32} className={themeText} />
                </div>
                
                <div className="text-center space-y-2">
                   <h2 className="text-2xl font-bold text-white">{t.configKeyTitle}</h2>
                   <p className="text-slate-400 text-sm">{t.configKeyDesc}</p>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-xs text-slate-300 flex gap-3 text-left">
                    <Info size={24} className="text-blue-400 shrink-0" />
                    <p>{t.configKeyPaidInfo}</p>
                </div>

                <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="Paste API Key here (AIza...)"
                      className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-4 pr-12 text-white focus:${themeBorder} outline-none transition-all`}
                    />
                    <button 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                
                <div className="space-y-3">
                    <button 
                         onClick={handleSaveKey}
                         disabled={!tempKey.trim()}
                         className={`w-full ${themeBg} hover:opacity-90 text-white font-bold py-3 rounded-xl transition-all shadow-lg`}
                    >
                          {t.saveKey}
                    </button>
                    
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noreferrer"
                        className="block w-full text-center py-2 text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        {t.getKeyLink} <ExternalLink size={12} className="inline ml-1" />
                    </a>
                </div>

                {apiKey && (
                    <button onClick={() => setShowKeyModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                        <X size={20} />
                    </button>
                )}
            </div>
         </div>
      )}

      {/* GIT INFO MODAL */}
      {showGitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                      <div className="flex gap-4">
                        <button 
                            onClick={() => setGitTab('initial')}
                            className={`text-sm font-bold pb-1 transition-colors ${gitTab === 'initial' ? 'text-white border-b-2 border-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {t.gitTabInitial}
                        </button>
                        <button 
                            onClick={() => setGitTab('update')}
                            className={`text-sm font-bold pb-1 transition-colors ${gitTab === 'update' ? 'text-white border-b-2 border-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {t.gitTabUpdate}
                        </button>
                      </div>
                      <button onClick={() => setShowGitModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                      {(gitTab === 'initial' ? GIT_CMDS.initial : GIT_CMDS.update).map((c, i) => (
                          <div key={i} className="space-y-1">
                              <span className="text-xs font-semibold text-slate-500 uppercase ml-1">{c.label}</span>
                              <div className="flex items-center gap-2 bg-black/50 p-3 rounded-lg border border-slate-800 group relative">
                                  <Terminal size={16} className="text-slate-500 shrink-0" />
                                  <code className="text-sm text-green-400 font-mono flex-1 break-all">{c.cmd}</code>
                                  <button 
                                    onClick={() => copyToClipboard(c.cmd)}
                                    className="p-1.5 text-slate-500 hover:text-white rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                                    title="Copy"
                                  >
                                      {copiedCmd === c.cmd ? <Check size={14} className="text-green-400"/> : <Copy size={14} />}
                                  </button>
                              </div>
                          </div>
                      ))}
                      {gitTab === 'initial' && (
                        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500">
                             Recuerda reemplazar <code>&lt;TU_URL_REPO&gt;</code> por la URL real de tu repositorio GitHub.
                        </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* HELP / README MODAL */}
      {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Book size={20} className="text-amber-400" /> {t.helpInfo}
                      </h3>
                      <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="p-6 overflow-y-auto space-y-8">
                     <div className="space-y-2">
                         <h2 className="text-2xl font-bold text-white">{APP_NAME}</h2>
                         <p className="text-slate-400">{t.tagline}</p>
                     </div>
                     
                     {HELP_CONTENT[language].map((section, idx) => (
                        <div key={idx} className="space-y-4">
                            <h3 className={`text-lg font-bold ${themeText} border-b border-slate-800 pb-2`}>{section.title}</h3>
                            <div className="space-y-4">
                                {section.items.map((item, i) => (
                                    <div key={i}>
                                        <h4 className="text-white font-medium mb-1">{item.subtitle}</h4>
                                        <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed pl-2 border-l-2 border-slate-800">
                                            {item.text}
                                            {(item as any).link && (
                                              <a 
                                                href={(item as any).link} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className={`flex items-center gap-1 mt-2 font-medium ${themeText} hover:underline`}
                                              >
                                                {(item as any).link}
                                                <ExternalLink size={12} />
                                              </a>
                                            )}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                     ))}
                  </div>
              </div>
          </div>
      )}

      {/* HEADER */}
      <header className="py-6 border-b border-slate-800 mb-0">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl shadow-lg ${themeBg} shadow-${themeColor}-900/20`}>
              <AudioWaveform className="text-white h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                    {APP_NAME} <span className="text-xs text-slate-600 font-normal">v{APP_VERSION}</span>
                  </h1>
                  {/* SMALL GIT BUTTON NEXT TO TITLE */}
                  <button 
                    onClick={() => setShowGitModal(true)}
                    className="p-1.5 rounded-md hover:bg-slate-800 text-slate-600 hover:text-slate-300 transition-colors"
                    title={t.gitInfo}
                  >
                     <Github size={16} />
                  </button>
              </div>
              <p className="text-slate-400 text-sm">{t.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button onClick={() => setLanguage(l => l === 'es' ? 'en' : 'es')} className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700 transition-colors text-sm">
                <Languages size={16} className={themeText} />
                <span className="text-slate-300 font-medium">{language.toUpperCase()}</span>
             </button>
             
             {/* README / HELP BUTTON */}
             <button 
                onClick={() => setShowHelpModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700 transition-colors text-sm text-slate-400 hover:text-white"
                title={t.helpInfo}
             >
                <Book size={18} />
             </button>

             <div className="h-6 w-px bg-slate-800 mx-1"></div>

             {/* KEY STATUS */}
             {isEnvKey ? (
                 <div className="flex items-center gap-2 px-3 py-2 bg-green-900/10 border border-green-500/20 rounded-lg text-green-400 cursor-help" title="Using Vercel Environment Key">
                     <Shield size={16} />
                     <span className="text-xs font-bold hidden sm:inline">Vercel Key</span>
                 </div>
             ) : (
                 <>
                    <button onClick={() => setShowKeyModal(true)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${apiKey ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'bg-red-900/20 border-red-500/30 text-red-400'}`}>
                        {apiKey ? <ShieldCheck size={16} /> : <Key size={16} />}
                    </button>
                    {apiKey && <button onClick={handleRemoveKey} className="p-2 bg-slate-800/50 hover:bg-red-900/20 text-slate-400 hover:text-red-400 rounded-lg border border-slate-700"><Trash2 size={16} /></button>}
                 </>
             )}
          </div>
        </div>
      </header>

      {/* STICKY NAVIGATION TABS */}
      <div className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md py-4 border-b border-slate-800/50 mb-6 flex justify-center">
        <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 shadow-xl">
            <button 
                onClick={() => setCurrentTab('TTS')}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'TTS' ? `${themeBg} text-white shadow-lg` : 'text-slate-400 hover:text-white'}`}
            >
                <Type size={16} /> <span className="hidden sm:inline">{t.tabTTS}</span>
            </button>
            <button 
                onClick={() => setCurrentTab('VTV')}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'VTV' ? `${themeBg} text-white shadow-lg` : 'text-slate-400 hover:text-white'}`}
            >
                <Mic size={16} /> <span className="hidden sm:inline">{t.tabVTV}</span>
            </button>
            <button 
                onClick={() => setCurrentTab('PLAYER')}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'PLAYER' ? `${themeBg} text-white shadow-lg` : 'text-slate-400 hover:text-white'}`}
            >
                <PlayCircle size={16} /> <span className="hidden sm:inline">{t.tabPlayer}</span>
            </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 transition-all duration-300">
        {currentTab === 'TTS' && (
            <TextToSpeechModule 
                apiKey={apiKey} 
                language={language}
                themeColor={themeColor}
                themeBg={themeBg}
                themeBorder={themeBorder}
                themeText={themeText}
                setShowKeyModal={setShowKeyModal}
                onSendToPlayer={sendToPlayer}
            />
        )}
        {currentTab === 'VTV' && (
            <VoiceTranslationModule 
                apiKey={apiKey} 
                language={language}
                themeColor={themeColor}
                themeBg={themeBg}
                themeText={themeText}
                onSendToPlayer={sendToPlayer}
            />
        )}
        {currentTab === 'PLAYER' && (
            <MediaPlayerModule 
                language={language}
                themeColor={themeColor}
                themeBg={themeBg}
                externalAudio={globalAudio}
            />
        )}
      </main>

      <footer className="py-6 text-center text-slate-600 text-xs border-t border-slate-800/50 mt-8">
         <p>{APP_NAME} v{APP_VERSION} • {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;