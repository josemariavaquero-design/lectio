# Lectio - Suite de Audio con IA

Lectio es una aplicación web avanzada para la generación de voz sintética, traducción de audio y reproducción multimedia, potenciada por la tecnología de Google Gemini.

## Funcionalidades Principales

### 1. Texto a Voz (TTS)
Convierte textos largos en audio profesional.
*   **Voces Naturales:** Selección de voces en Español (con acentos de España) e Inglés (Británico/Americano).
*   **Gestión de Fragmentos:** Divide textos largos automáticamente para optimizar la generación.
*   **Modo Diálogo:** Mantiene líneas cortas separadas para facilitar la asignación de distintas voces a distintos personajes.
*   **Optimización IA:** Reescribe el texto automáticamente para que suene más natural al ser leído (expansión de abreviaturas, mejora de puntuación).

### 2. Traductor de Voz (VTV)
Traduce y dobla audios automáticamente.
*   **Voz a Voz:** Sube un audio en inglés y obtén una versión doblada en español (o viceversa).
*   **Transcripción:** Obtiene el texto original del audio.
*   **Carga por URL:** Permite cargar archivos de audio directos desde internet.
    *   *Nota sobre YouTube:* Debido a restricciones de seguridad de los navegadores (CORS), no es posible descargar vídeos de YouTube directamente desde la web sin un servidor intermedio. Para usar vídeos de YouTube, descárgalos primero a tu equipo y usa la opción de "Subir Archivo".

### 3. Reproductor Local
Visualizador de audio integrado.
*   Reproduce tus creaciones o cualquier archivo local.
*   Visualización de espectro de frecuencia en tiempo real.

## Uso y Configuración

### Requisitos: API Key de Google Gemini
Lectio funciona 100% en tu navegador, pero requiere acceso a la inteligencia de Google Gemini.
1.  Ve a [Google AI Studio](https://aistudio.google.com/app/apikey) y obtén una API Key gratuita.
2.  Al abrir Lectio, introduce tu clave en la ventana de configuración.
3.  La clave se guarda **únicamente en el almacenamiento local de tu navegador**. Nunca se envía a servidores externos que no sean la API oficial de Google.

### Cómo usar

1.  **Selecciona el Idioma:** Usa el botón en la cabecera (ES/EN) para cambiar la interfaz y las voces de destino.
2.  **Generar Audio:** Escribe tu texto, elige una voz y pulsa "Generar".
3.  **Descargar:** Puedes descargar cada fragmento individualmente o unirlos todos en un solo archivo "Master".

## Tecnologías
*   React 19 + Vite
*   TailwindCSS
*   Google GenAI SDK (Gemini 2.5 Flash)
*   Web Audio API