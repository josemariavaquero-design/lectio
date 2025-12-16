import { GoogleGenAI, Modality, Type, SchemaType } from "@google/genai";
import { decodeBase64, pcmToWav } from "../utils/audioUtils";
import { GenerationSettings, VoiceOption, Language } from "../types";

// Chunk size for optimization requests to prevent timeouts
const OPTIMIZATION_CHUNK_SIZE = 4000;
// Max file size for inline data (approx 19MB). 
const MAX_INLINE_FILE_SIZE_BYTES = 18 * 1024 * 1024;
// API Timeout
const API_TIMEOUT_MS = 120000; // 120 seconds
// Max Retries
const MAX_RETRIES = 3; 

/**
 * Helper to get a robust MIME type for Gemini.
 */
const getRobustMimeType = (blob: Blob, fileName: string = ''): string => {
  let type = blob.type;
  if (type === 'audio/mp3') return 'audio/mpeg';
  if (!type || type === 'application/octet-stream') {
    if (fileName.toLowerCase().endsWith('.wav')) return 'audio/wav';
    if (fileName.toLowerCase().endsWith('.ogg')) return 'audio/ogg';
    if (fileName.toLowerCase().endsWith('.m4a')) return 'audio/mp4';
    if (fileName.toLowerCase().endsWith('.aac')) return 'audio/aac';
    return 'audio/mpeg';
  }
  return type;
};

/**
 * Helper to clean JSON string from Markdown code blocks or extraneous text
 */
const cleanAndParseJSON = (text: string) => {
    let cleaned = text.trim();
    // Remove markdown code blocks if present
    if (cleaned.includes('```')) {
        cleaned = cleaned.replace(/```json/g, '').replace(/```/g, '');
    }
    
    // Find valid JSON bounds
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse failed:", text);
        throw new Error("Invalid JSON response from Gemini. Please retry.");
    }
};

/**
 * Helper to extract meaningful message from Gemini errors
 */
const parseGeminiError = (error: any): string => {
    let msg = error.message || String(error);
    
    // Check for rate limits (Quota Exceeded)
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return "Quota Exceeded (429).";
    }
    
    // Check for JSON error object in string
    try {
        if (msg.startsWith('{') || msg.includes('{"error":')) {
            // Try to find the JSON part
            const match = msg.match(/{.*}/);
            if (match) {
                const jsonErr = JSON.parse(match[0]);
                if (jsonErr.error && jsonErr.error.message) {
                    if (jsonErr.error.code === 429 || jsonErr.error.status === 'RESOURCE_EXHAUSTED') {
                        return "Quota Exceeded (429).";
                    }
                    return jsonErr.error.message;
                }
            }
        }
    } catch (e) {
        // ignore parsing error
    }
    
    return msg;
};

/**
 * Helper for retrying async operations
 */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        const errorMsg = parseGeminiError(err);
        const isQuota = errorMsg.includes('Quota') || errorMsg.includes('429');

        // Stop retrying if it's a hard rate limit or auth error
        if (errorMsg.includes('API Key') || errorMsg.includes('permission')) {
             throw new Error(errorMsg);
        }

        if (retries > 0) {
            // If it's a rate limit, wait 30 seconds to clear the RPM window
            const waitTime = isQuota ? 30000 : delay;
            
            console.warn(`Operation failed, retrying... (${retries} attempts left). Waiting ${waitTime/1000}s. Error: ${errorMsg}`);
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return withRetry(fn, retries - 1, delay * 2); // Exponential backoff for other errors
        } else {
            // Final failure logic
            if (isQuota) {
                throw new Error("Límite de cuota excedido. Si has esperado y sigue fallando, has alcanzado tu límite DIARIO (1500 reqs). Se renueva a las 09:00 AM (España).");
            }
            throw new Error(errorMsg);
        }
    }
}

/**
 * Uses a generic LLM model to rewrite text for better TTS performance.
 */
export const optimizeTextForSpeech = async (text: string, apiKey: string, language: Language): Promise<string> => {
    if (!apiKey) throw new Error(language === 'es' ? "API Key no proporcionada." : "API Key not provided.");
    if (!text.trim()) return "";

    const ai = new GoogleGenAI({ apiKey });
    const chunks: string[] = [];
    
    if (text.length <= OPTIMIZATION_CHUNK_SIZE) {
        chunks.push(text);
    } else {
        const paragraphs = text.split(/\n+/);
        let currentChunk = "";
        for (const p of paragraphs) {
            if ((currentChunk + p).length < OPTIMIZATION_CHUNK_SIZE) {
                currentChunk += (currentChunk ? "\n\n" : "") + p;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = p;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
    }

    let finalOptimizedText = "";

    const promptES = `
      Eres un experto redactor de guiones para locución en español de España. 
      Tu tarea es reescribir el siguiente texto para que suene 100% natural al ser leído por una IA (Text-to-Speech).
      Reglas OBLIGATORIAS:
      1. NO resumas. Mantén TODO el contenido.
      2. Expande abreviaturas ("Sr." -> "Señor").
      3. Cifras y fechas a texto si mejora la fluidez.
      4. Puntuación para pausas naturales.
      5. Español de España neutro.
    `;

    const promptEN = `
      You are an expert scriptwriter for English voiceovers.
      Your task is to rewrite the following text so it sounds 100% natural when read by an AI (Text-to-Speech).
      MANDATORY Rules:
      1. DO NOT summarize. Keep ALL content.
      2. Expand abbreviations ("Mr." -> "Mister", "St." -> "Street").
      3. Convert numbers/dates to text if it improves flow.
      4. Use punctuation for natural pauses.
      5. Standard English (neutral).
    `;

    const basePrompt = language === 'es' ? promptES : promptEN;

    for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const fullPrompt = `${basePrompt}\n\nInput Text (Part ${i + 1} of ${chunks.length}):\n"${chunkText}"\n\nOutput (Rewritten text only):`;

        // Wrap optimization calls in retry too
        try {
            const makeOptCall = async () => {
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash", 
                    contents: [{ parts: [{ text: fullPrompt }] }],
                });
                return response.text;
            }

            const result = await withRetry(makeOptCall, 1, 2000) || chunkText; 
            finalOptimizedText += (finalOptimizedText ? "\n\n" : "") + result;
        } catch (error) {
            console.error(`Optimization error on chunk ${i}:`, error);
            finalOptimizedText += (finalOptimizedText ? "\n\n" : "") + chunkText;
        }
    }

    return finalOptimizedText;
};

export const generateSpeechFromText = async (
  text: string, 
  voiceOption: VoiceOption,
  settings: GenerationSettings,
  apiKey: string,
  language: Language
): Promise<Blob> => {
  if (!apiKey) throw new Error(language === 'es' ? "Clave API no configurada." : "API Key not configured.");

  const ai = new GoogleGenAI({ apiKey });
  
  // --- Enhanced Pitch Instructions ---
  let toneInstruction = "";
  if (language === 'es') {
      if (settings.pitch <= -1.5) toneInstruction = "TONO: EXTREMADAMENTE GRAVE. Voz muy profunda, seria y resonante.";
      else if (settings.pitch < 0) toneInstruction = "TONO: GRAVE. Voz más profunda de lo habitual.";
      else if (settings.pitch === 0) toneInstruction = "TONO: NATURAL. Voz equilibrada y estándar.";
      else if (settings.pitch <= 1.5) toneInstruction = "TONO: AGUDO. Voz brillante y ligera.";
      else toneInstruction = "TONO: MUY AGUDO. Voz juvenil y alta.";
  } else {
      if (settings.pitch <= -1.5) toneInstruction = "PITCH: VERY DEEP. Low, resonant, and serious voice.";
      else if (settings.pitch < 0) toneInstruction = "PITCH: LOW. Deeper than normal.";
      else if (settings.pitch === 0) toneInstruction = "PITCH: NATURAL. Balanced standard voice.";
      else if (settings.pitch <= 1.5) toneInstruction = "PITCH: HIGH. Bright and light voice.";
      else toneInstruction = "PITCH: VERY HIGH. Youthful and high-pitched.";
  }

  // --- Enhanced Speed Instructions ---
  let speedInstruction = "";
  if (language === 'es') {
      if (settings.speed <= 0.6) speedInstruction = "VELOCIDAD: EXTREMADAMENTE LENTA. Habla muy despacio, separando cada sílaba. Pausas largas.";
      else if (settings.speed <= 0.8) speedInstruction = "VELOCIDAD: LENTA. Habla pausadamente y con calma.";
      else if (settings.speed < 1.0) speedInstruction = "VELOCIDAD: RELAJADA. Un poco más despacio de lo normal.";
      else if (settings.speed === 1.0) speedInstruction = "VELOCIDAD: NORMAL. Ritmo de conversación natural.";
      else if (settings.speed <= 1.3) speedInstruction = "VELOCIDAD: RÁPIDA. Habla con agilidad y dinamismo.";
      else if (settings.speed <= 1.6) speedInstruction = "VELOCIDAD: MUY RÁPIDA. Habla de forma acelerada.";
      else speedInstruction = "VELOCIDAD: EXTREMA. Habla lo más rápido posible, como si tuvieras mucha prisa.";
  } else {
      if (settings.speed <= 0.6) speedInstruction = "SPEED: EXTREMELY SLOW. Speak very slowly, enunciating every syllable. Long pauses.";
      else if (settings.speed <= 0.8) speedInstruction = "SPEED: SLOW. Speak calmly and take your time.";
      else if (settings.speed < 1.0) speedInstruction = "SPEED: RELAXED. Slightly slower than normal.";
      else if (settings.speed === 1.0) speedInstruction = "SPEED: NORMAL. Natural conversational pace.";
      else if (settings.speed <= 1.3) speedInstruction = "SPEED: FAST. Agile and dynamic speaking.";
      else if (settings.speed <= 1.6) speedInstruction = "SPEED: VERY FAST. Accelerated speech.";
      else speedInstruction = "SPEED: EXTREME. Speak as fast as possible, in a rush.";
  }

  // Re-structured prompt to prioritize instructions
  const prompt = `
    [Role: Professional Voice Actor]
    [Task: Read the text below]
    
    [INSTRUCTIONS START]
    1. Language: ${language === 'es' ? 'Spanish (Spain)' : 'English'}
    2. Accent: ${voiceOption.accent || 'Standard'}
    3. ${toneInstruction}
    4. ${speedInstruction}
    5. Voice Gender: ${voiceOption.gender}
    [INSTRUCTIONS END]
    
    [TEXT TO READ START]
    "${text}"
    [TEXT TO READ END]
  `;

  const makeCall = async () => {
      const apiCall = ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceOption.geminiVoiceName },
            },
          },
        },
      });

      // Timeout wrapper
      const response = await Promise.race([
          apiCall,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: Gemini API request timed out after ${API_TIMEOUT_MS/1000}s.`)), API_TIMEOUT_MS))
      ]);

      const candidate = response.candidates?.[0];
      const audioPart = candidate?.content?.parts?.[0];

      if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
        throw new Error("No audio received from model.");
      }

      const base64Audio = audioPart.inlineData.data;
      const pcmData = decodeBase64(base64Audio);
      return pcmToWav(pcmData);
  };

  try {
    return await withRetry(makeCall);
  } catch (error) {
    console.error("Error generating speech after retries:", error);
    throw error;
  }
};

/**
 * Transcribes audio and translates it.
 * Uses strict JSON schema to prevent parsing errors.
 */
export const transcribeAndTranslateAudio = async (
  audioBlob: Blob,
  apiKey: string,
  targetLanguage: Language,
  fileName?: string
): Promise<{ transcription: string; translation: string }> => {
  if (!apiKey) throw new Error("API Key missing");

  if (audioBlob.size > MAX_INLINE_FILE_SIZE_BYTES) {
    throw new Error(`File chunk too large (${(audioBlob.size/1024/1024).toFixed(1)}MB). Max 18MB per chunk.`);
  }

  const ai = new GoogleGenAI({ apiKey });
  const targetLangName = targetLanguage === 'es' ? "Spanish (Spain)" : "English";

  const base64Audio = await blobToBase64(audioBlob);
  const mimeType = getRobustMimeType(audioBlob, fileName);

  const prompt = `
    Listen to this audio chunk.
    Task 1: Transcribe the audio precisely in its original language.
    Task 2: Translate the transcription into ${targetLangName}.
    
    IMPORTANT: If the audio is already in ${targetLangName}, you MUST strictly copy the transcription to the translation field. Do not leave it empty.
  `;

  const makeCall = async () => {
      const apiCall = ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType, data: base64Audio } },
              { text: prompt }
            ]
          }
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    transcription: { type: Type.STRING, description: "The original transcription of the audio" },
                    translation: { type: Type.STRING, description: `The translation into ${targetLangName}` }
                },
                required: ["transcription", "translation"]
            }
        }
      });

      const response = await Promise.race([
          apiCall,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout: Gemini API took too long (120s).")), API_TIMEOUT_MS))
      ]);

      const json = cleanAndParseJSON(response.text || "{}");
      return {
        transcription: json.transcription || "",
        translation: json.translation || ""
      };
  };

  return await withRetry(makeCall);
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};