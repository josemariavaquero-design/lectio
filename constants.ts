import { VoiceOption } from './types';

export const APP_VERSION = '3.3.0';
export const APP_NAME = 'Lectio';

// --- HELP / README CONTENT ---
export const HELP_CONTENT = {
  es: [
    {
      title: 'Límites y Costes (Free vs Paid)',
      items: [
        {
          subtitle: 'Modo Gratuito (Free Tier)',
          text: '• Coste: 0€.\n• Límites: 15 Peticiones/minuto (RPM) y 1.500 al día (RPD).\n• Ideal para: Pruebas y textos cortos.\n• Si recibes error 429, espera unos segundos.'
        },
        {
          subtitle: 'Modo Pago (Pay-as-you-go)',
          text: '• Coste: ~0,05€ - 0,15€ por libro entero (¡Céntimos!).\n• Basado en precios Gemini Flash: ~$0.30/1M tokens.\n• Límites: 1000+ RPM (Mucho más rápido).\n• Cómo activar: Usa una API Key de un proyecto de Google Cloud con facturación. La app lo detecta sola.'
        }
      ]
    },
    {
      title: 'Funcionalidades Principales',
      items: [
        {
          subtitle: '1. Texto a Voz (TTS)',
          text: 'Convierte textos largos en audio profesional.\n• Voces Naturales: Español (España) e Inglés.\n• Gestión de Fragmentos: Divide textos largos automáticamente.\n• Modo Diálogo: No agrupa líneas cortas, ideal para conversaciones.\n• Optimización IA: Reescribe el texto para una lectura más natural.'
        },
        {
          subtitle: '2. Traductor de Voz (VTV)',
          text: 'Traduce y dobla audios automáticamente.\n• Voz a Voz: Sube un audio y obtén la versión doblada.\n• Transcripción: Extrae el texto original.\n• Importante: Para vídeos de YouTube, descárgalos primero a tu equipo.'
        },
        {
          subtitle: '3. Reproductor Local',
          text: 'Visualizador de audio integrado con espectro de frecuencia en tiempo real.'
        }
      ]
    },
    {
      title: 'Uso y Configuración',
      items: [
        {
          subtitle: 'Requisito: API Key',
          text: 'Obtén tu clave en Google AI Studio. La clave se guarda solo en tu navegador (o en Vercel si lo configuras).',
          link: 'https://aistudio.google.com/api-keys'
        }
      ]
    }
  ],
  en: [
    {
      title: 'Limits & Costs (Free vs Paid)',
      items: [
        {
          subtitle: 'Free Tier',
          text: '• Cost: $0.\n• Limits: 15 Requests/min (RPM) and 1,500/day (RPD).\n• Best for: Testing and short texts.\n• If you get error 429, wait a few seconds.'
        },
        {
          subtitle: 'Paid Tier (Pay-as-you-go)',
          text: '• Cost: ~$0.05 - $0.15 per full book (Cents!).\n• Based on Gemini Flash pricing: ~$0.30/1M tokens.\n• Limits: 1000+ RPM (Much faster).\n• How to activate: Use an API Key from a billing-enabled Google Cloud Project.'
        }
      ]
    },
    {
      title: 'Main Features',
      items: [
        {
          subtitle: '1. Text to Speech (TTS)',
          text: 'Convert long texts into professional audio.\n• Natural Voices: Spanish (Spain) and English.\n• Smart Splitting: Automatically manages long texts.\n• Dialogue Mode: Keeps short lines separate.\n• AI Optimization: Rewrites text for better flow.'
        },
        {
          subtitle: '2. Voice Translator (VTV)',
          text: 'Translate and dub audios automatically.\n• Voice-to-Voice: Upload audio and get dubbed version.\n• Transcription: Extract original text.\n• Note: For YouTube videos, please download them first.'
        },
        {
          subtitle: '3. Local Player',
          text: 'Integrated audio visualizer with real-time frequency spectrum.'
        }
      ]
    },
    {
      title: 'Usage & Config',
      items: [
        {
          subtitle: 'Requirement: API Key',
          text: 'Get your key at Google AI Studio. It is stored locally in your browser.',
          link: 'https://aistudio.google.com/api-keys'
        }
      ]
    }
  ]
};

// --- GIT COMMANDS ---
export const GIT_CMDS = {
  initial: [
    { label: '1. Inicializar', cmd: 'git init' },
    { label: '2. Añadir archivos', cmd: 'git add .' },
    { label: '3. Primer commit', cmd: 'git commit -m "Initial commit"' },
    { label: '4. Rama principal', cmd: 'git branch -M main' },
    { label: '5. Conectar remoto', cmd: 'git remote add origin <TU_URL_REPO>' },
    { label: '6. Subir', cmd: 'git push -u origin main' }
  ],
  update: [
    { label: '1. Añadir cambios', cmd: 'git add .' },
    { label: '2. Confirmar cambios', cmd: 'git commit -m "Actualización"' },
    { label: '3. Subir cambios', cmd: 'git push' }
  ]
};

export const VOICES_ES: VoiceOption[] = [
  {
    id: 'es_voice_1',
    name: 'Mateo',
    geminiVoiceName: 'Charon', 
    gender: 'male',
    accent: 'España (Neutro)',
    description: 'Voz profunda, grave y autoritaria. Ideal para narraciones épicas.'
  },
  {
    id: 'es_voice_2',
    name: 'Lucía',
    geminiVoiceName: 'Kore', 
    gender: 'female',
    accent: 'España (Neutro)',
    description: 'Voz calmada, relajante y clara. Ideal para audiolibros.'
  },
  {
    id: 'es_voice_3',
    name: 'Alejandro',
    geminiVoiceName: 'Puck', 
    gender: 'male',
    accent: 'España (Juvenil)',
    description: 'Voz suave, expresiva y lúdica. Ideal para cuentos.'
  },
  {
    id: 'es_voice_4',
    name: 'Marcos', 
    geminiVoiceName: 'Fenrir', 
    gender: 'male', 
    accent: 'España (Profesional)',
    description: 'Voz rápida, profesional y enérgica. Ideal para noticias.'
  },
  {
    id: 'es_voice_5',
    name: 'Elena', 
    geminiVoiceName: 'Zephyr', 
    gender: 'female', 
    accent: 'España (Amable)',
    description: 'Voz equilibrada, estándar y amable. Asistente virtual.'
  }
];

export const VOICES_EN: VoiceOption[] = [
  {
    id: 'en_voice_1',
    name: 'Arthur',
    geminiVoiceName: 'Charon', 
    gender: 'male',
    accent: 'British',
    description: 'Deep, authoritative, and classic British narrator.'
  },
  {
    id: 'en_voice_2',
    name: 'Emily',
    geminiVoiceName: 'Kore', 
    gender: 'female',
    accent: 'American',
    description: 'Calm, soothing, and clear. Perfect for audiobooks.'
  },
  {
    id: 'en_voice_3',
    name: 'Oliver',
    geminiVoiceName: 'Puck', 
    gender: 'male',
    accent: 'British',
    description: 'Playful, expressive, and storytelling oriented.'
  },
  {
    id: 'en_voice_4',
    name: 'James', 
    geminiVoiceName: 'Fenrir', 
    gender: 'male', 
    accent: 'American',
    description: 'Fast-paced, energetic, and professional. Good for news.'
  },
  {
    id: 'en_voice_5',
    name: 'Sophia', 
    geminiVoiceName: 'Zephyr', 
    gender: 'female', 
    accent: 'British',
    description: 'Polite, balanced, and helpful. Virtual assistant style.'
  }
];

export const SAMPLE_RATE = 24000;
export const MAX_CHARS_PER_CHUNK = 1000; // Reduced from 2500 to 1000 to avoid timeouts/limits

export const UI_TEXT = {
  es: {
    tagline: 'Suite de Audio con IA',
    tabTTS: 'Texto a Voz',
    tabVTV: 'Traductor de Voz',
    tabPlayer: 'Reproductor',
    apiKeyConfig: 'Configuración de API Key',
    apiKeyMissing: 'Falta API Key',
    reset: 'Reiniciar',
    // TTS Specific
    projectTitlePlaceholder: 'Título del Proyecto',
    inputTextLabel: 'Texto de entrada',
    optimizeBtn: 'Optimizar',
    optimizing: 'Optimizando...',
    uploadBtn: 'Subir .txt / .md',
    placeholderText: 'Escribe o pega tu texto aquí...',
    splitTextTitle: 'Dividir Textos',
    splitTextDesc: 'Separar en partes para locución larga',
    dialogueModeTitle: 'Modo Diálogo',
    dialogueModeDesc: 'No agrupar líneas cortas. Ideal para diálogos.',
    fileManagerTitle: 'Gestor de Archivos',
    generated: 'GEN',
    downloaded: 'DL',
    autoAssignBtn: 'Auto-asignar Voces',
    autoAssigning: 'Analizando...',
    none: 'Ninguno',
    all: 'Todos',
    globalVoiceLabel: 'Global',
    pitchTitle: 'Tono de Voz',
    pitchLow: 'Grave',
    pitchNormal: 'Natural',
    pitchHigh: 'Agudo',
    speedTitle: 'Velocidad',
    speedSlow: 'Lenta',
    speedNormal: 'Normal',
    speedFast: 'Rápida',
    autoOptimizeTitle: 'Auto-optimizar al generar',
    autoOptimizeDesc: 'Mejora el texto de cada parte justo antes del audio',
    voiceSelectTitle: 'Selecciona una Voz Global',
    estDuration: 'Duración Total Est.',
    genTime: 'Tiempo Generación',
    generateBtn: 'Generar Locución',
    generatePartsBtn: 'Generar Partes',
    processing: 'Procesando...',
    readyTitle: 'Audios Listos',
    mergeBtn: 'Unir Todo',
    merging: 'Uniendo...',
    masterAudio: 'Audio Maestro Unificado',
    errorGeneral: 'Hubo un problema general. Revisa tu API Key.',
    gitInfo: 'Git Info',
    helpInfo: 'Ayuda / Costes',
    removeKey: 'Cambiar API Key',
    voiceH: 'H',
    voiceM: 'M',
    previewError: 'Error al reproducir demo. Revisa tu API Key.',
    previewText: 'Hola, soy {name}. Esta es una prueba de mi voz.',
    configKeyTitle: 'Configura tu API Key',
    configKeyDesc: 'Para usar Lectio necesitas una clave de Google Gemini. Se guarda en tu navegador.',
    configKeyPaidInfo: '¿Quieres usar la versión de pago (más rápida y sin límites diarios)? Simplemente introduce aquí una API Key creada en un proyecto de Google Cloud con facturación activada.',
    saveKey: 'Guardar y Continuar',
    getKeyLink: 'Obtener clave gratuita',
    cancel: 'Cancelar',
    gitTabInitial: 'Primera Subida',
    gitTabUpdate: 'Actualización',
    // VTV Specific
    vtvTitle: 'Traducción y Doblaje',
    vtvDesc: 'Sube un audio o pega una URL para obtener transcripción y doblaje.',
    vtvDrop: 'Arrastra un audio (mp3, wav) aquí',
    vtvUrlLabel: 'O pega una URL de audio directo',
    vtvUrlPlaceholder: 'https://ejemplo.com/archivo.mp3',
    vtvLoadBtn: 'Cargar URL',
    vtvTranscribing: 'Transcribiendo y Traduciendo...',
    vtvOriginalTitle: 'Transcripción Original',
    vtvTranslationTitle: 'Traducción',
    vtvGenerateBtn: 'Generar Doblaje',
    vtvRegenerateBtn: 'Regenerar Audio',
    vtvSourceAudio: 'Audio Fuente Cargado',
    vtvYoutubeError: 'YouTube no permite descarga directa. Por favor descarga el vídeo y súbelo manualmente.',
    vtvUrlError: 'No se pudo cargar la URL. Es probable que el servidor tenga protección CORS (común en la web). Intenta descargar el archivo y subirlo manualmente.',
    // Player Specific
    playerTitle: 'Local Player',
    playerDesc: 'Carga tus archivos generados o cualquier audio para reproducirlo.',
    playerDrop: 'Upload or drag audio files',
    playerNoTrack: 'No hay pista cargada'
  },
  en: {
    tagline: 'AI Audio Suite',
    tabTTS: 'Text to Speech',
    tabVTV: 'Voice Translator',
    tabPlayer: 'Player',
    apiKeyConfig: 'API Configuration',
    apiKeyMissing: 'Missing API Key',
    reset: 'Reset',
    // TTS Specific
    projectTitlePlaceholder: 'Project Title',
    inputTextLabel: 'Input Text',
    optimizeBtn: 'Optimize',
    optimizing: 'Optimizing...',
    uploadBtn: 'Upload .txt / .md',
    placeholderText: 'Type or paste your text here...',
    splitTextTitle: 'Split Text',
    splitTextDesc: 'Split into parts for long narrations',
    dialogueModeTitle: 'Dialogue Mode',
    dialogueModeDesc: 'Keep short lines separate. Best for dialogues.',
    fileManagerTitle: 'File Manager',
    generated: 'GEN',
    downloaded: 'DL',
    autoAssignBtn: 'Auto-assign Voices',
    autoAssigning: 'Analyzing...',
    none: 'None',
    all: 'All',
    globalVoiceLabel: 'Global',
    pitchTitle: 'Voice Pitch',
    pitchLow: 'Low',
    pitchNormal: 'Natural',
    pitchHigh: 'High',
    speedTitle: 'Speed',
    speedSlow: 'Slow',
    speedNormal: 'Normal',
    speedFast: 'Fast',
    autoOptimizeTitle: 'Auto-optimize on generate',
    autoOptimizeDesc: 'Improves text flow just before generation',
    voiceSelectTitle: 'Select Global Voice',
    estDuration: 'Est. Total Duration',
    genTime: 'Generation Time',
    generateBtn: 'Generate Speech',
    generatePartsBtn: 'Generate Parts',
    processing: 'Processing...',
    readyTitle: 'Ready Audio',
    mergeBtn: 'Merge All',
    merging: 'Merging...',
    masterAudio: 'Unified Master Audio',
    errorGeneral: 'General error occurred. Check your API Key.',
    gitInfo: 'Git Info',
    helpInfo: 'Help / Costs',
    removeKey: 'Change API Key',
    voiceH: 'M',
    voiceM: 'F',
    previewError: 'Error playing demo. Check API Key.',
    previewText: 'Hello, I am {name}. This is a test of my voice.',
    configKeyTitle: 'Configure API Key',
    configKeyDesc: 'To use Lectio you need a Google Gemini API Key. It is stored in your browser.',
    configKeyPaidInfo: 'Want to use the Paid Tier (faster, no daily limits)? Simply enter an API Key from a billing-enabled Google Cloud Project here.',
    saveKey: 'Save and Continue',
    getKeyLink: 'Get free key',
    cancel: 'Cancel',
    gitTabInitial: 'First Upload',
    gitTabUpdate: 'Update',
    // VTV Specific
    vtvTitle: 'Translation & Dubbing',
    vtvDesc: 'Upload audio or paste a URL to get transcription and dubbing.',
    vtvDrop: 'Drag an audio file (mp3, wav) here',
    vtvUrlLabel: 'Or paste a direct audio URL',
    vtvUrlPlaceholder: 'https://example.com/file.mp3',
    vtvLoadBtn: 'Load URL',
    vtvTranscribing: 'Transcribing & Translating...',
    vtvOriginalTitle: 'Original Transcription',
    vtvTranslationTitle: 'Translation',
    vtvGenerateBtn: 'Generate Dubbing',
    vtvRegenerateBtn: 'Regenerate Audio',
    vtvSourceAudio: 'Loaded Source Audio',
    vtvYoutubeError: 'YouTube does not allow direct downloads. Please download the video and upload manually.',
    vtvUrlError: 'Could not load URL. Likely due to CORS protection (common on the web). Please download the file and upload manually.',
    // Player Specific
    playerTitle: 'Local Player',
    playerDesc: 'Load your generated files or any audio to play.',
    playerDrop: 'Upload or drag audio files',
    playerNoTrack: 'No track loaded'
  }
};