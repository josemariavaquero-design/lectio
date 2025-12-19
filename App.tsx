
import React, { useState, useEffect } from 'https://esm.sh/react@19.0.0';
import { 
  AudioWaveform, Languages, Key, ShieldCheck, Trash2, Terminal, X, Mic, 
  PlayCircle, Type, Github, Copy, Check, Book, ExternalLink, Info, Eye, 
  EyeOff, Shield 
} from 'https://esm.sh/lucide-react@0.463.0';
import { APP_VERSION, APP_NAME, UI_TEXT, GIT_CMDS, HELP_CONTENT } from './constants';
import { Language } from './types';
import TextToSpeechModule from './components/TextToSpeechModule';
import VoiceTranslationModule from './components/VoiceTranslationModule';
import MediaPlayerModule from './components/MediaPlayerModule';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('es');
  const [currentTab, setCurrentTab] = useState<'TTS' | 'VTV' | 'PLAYER'>('TTS');
  const [globalAudio, setGlobalAudio] = useState<{ url: string; title: string; blob?: Blob } | null>(null);

  const isEs = language === 'es';
  const t = UI_TEXT[language];
  const themeColor = isEs ? 'indigo' : 'emerald';
  const themeText = isEs ? 'text-indigo-400' : 'text-emerald-400';
  const themeBg = isEs ? 'bg-indigo-600' : 'bg-emerald-600';
  const themeBorder = isEs ? 'border-indigo-500' : 'border-emerald-500';

  const envKey = process.env.API_KEY;
  const isEnvKey = !!(envKey && envKey.length > 5);

  const [apiKey, setApiKey] = useState<string>(() => {
    if (isEnvKey) return envKey;
    return localStorage.getItem('gemini_api_key') || '';
  });
  
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [gitTab, setGitTab] = useState<'initial' | 'update'>('initial');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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
    if(isEnvKey) return;
    if(window.confirm(isEs ? "¿Borrar clave?" : "Delete key?")) {
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
      {showKeyModal && !isEnvKey && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-8 space-y-6 shadow-2xl relative">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isEs ? 'bg-indigo-500/20' : 'bg-emerald-500/20'}`}>
                   <Key size={32} className={themeText} />
                </div>
                <div className="text-center">
                   <h2 className="text-2xl font-bold text-white">{t.configKeyTitle}</h2>
                   <p className="text-slate-400 text-sm">{t.configKeyDesc}</p>
                </div>
                <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="AIza..."
                      className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white focus:${themeBorder} outline-none font-mono text-sm`}
                    />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                <button onClick={handleSaveKey} disabled={!tempKey.trim()} className={`w-full ${themeBg} text-white font-bold py-3 rounded-xl shadow-lg`}>
                  {t.saveKey}
                </button>
                {apiKey && <button onClick={() => setShowKeyModal(false)} className="absolute top-4 right-4 text-slate-500"><X size={20}/></button>}
            </div>
         </div>
      )}

      {showGitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                      <div className="flex gap-4">
                        <button onClick={() => setGitTab('initial')} className={`text-sm font-bold pb-1 ${gitTab === 'initial' ? 'text-white border-b-2' : 'text-slate-500'}`}>{t.gitTabInitial}</button>
                        <button onClick={() => setGitTab('update')} className={`text-sm font-bold pb-1 ${gitTab === 'update' ? 'text-white border-b-2' : 'text-slate-500'}`}>{t.gitTabUpdate}</button>
                      </div>
                      <button onClick={() => setShowGitModal(false)} className="text-slate-400"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                      {(gitTab === 'initial' ? GIT_CMDS.initial : GIT_CMDS.update).map((c, i) => (
                          <div key={i} className="space-y-1">
                              <span className="text-xs font-semibold text-slate-500 uppercase">{c.label}</span>
                              <div className="flex items-center gap-2 bg-black/50 p-3 rounded-lg border border-slate-800 group">
                                  <Terminal size={16} className="text-slate-500 shrink-0" />
                                  <code className="text-sm text-green-400 font-mono flex-1 truncate">{c.cmd}</code>
                                  <button onClick={() => copyToClipboard(c.cmd)} className="p-1.5 text-slate-500 hover:text-white rounded bg-slate-800">{copiedCmd === c.cmd ? <Check size={14} className="text-green-400"/> : <Copy size={14} />}</button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      <header className="py-6 border-b border-slate-800">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl shadow-lg ${themeBg}`}>
              <AudioWaveform className="text-white h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{APP_NAME} <span className="text-xs text-slate-600 font-normal">v{APP_VERSION}</span></h1>
                  <button onClick={() => setShowGitModal(true)} className="p-1.5 text-slate-600 hover:text-slate-300"><Github size={16} /></button>
              </div>
              <p className="text-slate-400 text-sm">{t.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setLanguage(l => l === 'es' ? 'en' : 'es')} className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700 text-sm">
                <Languages size={16} className={themeText} />
                <span className="text-slate-300 font-medium">{language.toUpperCase()}</span>
             </button>
             <button onClick={() => setShowHelpModal(true)} className="p-2 text-slate-400 hover:text-white"><Book size={18} /></button>
             <div className="h-6 w-px bg-slate-800"></div>
             {isEnvKey ? (
                 <div className="flex items-center gap-2 px-3 py-2 bg-green-900/10 border border-green-500/20 rounded-lg text-green-400"><Shield size={16} /><span className="text-xs font-bold">Vercel Key</span></div>
             ) : (
                 <>
                    <button onClick={() => setShowKeyModal(true)} className={`p-2 rounded-lg border ${apiKey ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'bg-red-900/20 border-red-500/30 text-red-400'}`}>{apiKey ? <ShieldCheck size={16} /> : <Key size={16} />}</button>
                    {apiKey && <button onClick={handleRemoveKey} className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={16} /></button>}
                 </>
             )}
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md py-4 border-b border-slate-800/50 mb-6 flex justify-center">
        <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setCurrentTab('TTS')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'TTS' ? `${themeBg} text-white` : 'text-slate-400 hover:text-white'}`}><Type size={16} /> <span className="hidden sm:inline">{t.tabTTS}</span></button>
            <button onClick={() => setCurrentTab('VTV')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'VTV' ? `${themeBg} text-white` : 'text-slate-400 hover:text-white'}`}><Mic size={16} /> <span className="hidden sm:inline">{t.tabVTV}</span></button>
            <button onClick={() => setCurrentTab('PLAYER')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${currentTab === 'PLAYER' ? `${themeBg} text-white` : 'text-slate-400 hover:text-white'}`}><PlayCircle size={16} /> <span className="hidden sm:inline">{t.tabPlayer}</span></button>
        </div>
      </nav>

      <main className="flex-1">
        {currentTab === 'TTS' && <TextToSpeechModule apiKey={apiKey} language={language} themeColor={themeColor} themeBg={themeBg} themeBorder={themeBorder} themeText={themeText} setShowKeyModal={setShowKeyModal} onSendToPlayer={sendToPlayer}/>}
        {currentTab === 'VTV' && <VoiceTranslationModule apiKey={apiKey} language={language} themeColor={themeColor} themeBg={themeBg} themeText={themeText} onSendToPlayer={sendToPlayer}/>}
        {currentTab === 'PLAYER' && <MediaPlayerModule language={language} themeColor={themeColor} themeBg={themeBg} externalAudio={globalAudio}/>}
      </main>

      <footer className="py-6 text-center text-slate-600 text-xs border-t border-slate-800/50 mt-8">
         <p>{APP_NAME} v{APP_VERSION} • {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;
