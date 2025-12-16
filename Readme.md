# Lectio - AI Audio Suite

Lectio is an advanced web application for synthetic speech generation, audio translation, and media playback, powered by Google Gemini technology.

## Key Features

### 1. Text to Speech (TTS)
Convert long texts into professional-grade audio.
*   **Natural Voices:** Selection of voices in Spanish (Spain accents) and English (British/American).
*   **Chunk Management:** Automatically splits long texts to optimize generation and bypass limits.
*   **Dialogue Mode:** Keeps short lines separate, perfect for assigning different voices to characters.
*   **AI Optimization:** Automatically rewrites text to sound more natural when read aloud (abbreviation expansion, punctuation improvement).

### 2. Voice Translator (VTV)
Automatically translate and dub audio files.
*   **Voice-to-Voice:** Upload audio in Spanish and get a dubbed version in English (or vice versa).
*   **Transcription:** Extracts the original text from the audio.
*   **URL Loading:** Allows loading direct audio files from the internet.
    *   *Note on YouTube:* Due to browser security restrictions (CORS), direct YouTube video downloading is not possible client-side without a backend server. To use YouTube videos, please download them to your device first and use the "Upload File" option.

### 3. Local Player
Integrated audio visualizer.
*   Play your creations or any local file.
*   Real-time frequency spectrum visualization.

## Usage & Configuration

### Requirement: Google Gemini API Key
Lectio runs 100% in your browser but requires access to Google Gemini intelligence.
1.  Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and get a free API Key.
2.  When opening Lectio, enter your key in the configuration modal.
3.  The key is stored **only in your browser's local storage**. It is never sent to external servers other than the official Google API.

### How to Use

1.  **Select Language:** Use the header button (ES/EN) to toggle the interface and target voices.
2.  **Generate Audio:** Type your text, select a voice, and click "Generate".
3.  **Download:** You can download chunks individually or merge them into a single "Master" file.

## Tech Stack
*   React 19 + Vite
*   TailwindCSS
*   Google GenAI SDK (Gemini 2.5 Flash)
*   Web Audio API