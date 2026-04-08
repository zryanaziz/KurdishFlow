import { GoogleGenAI } from "@google/genai";

const getAi = () => {
  // Check for manual key in localStorage first, then environment variables
  const manualKey = typeof window !== 'undefined' ? localStorage.getItem('manual_gemini_key') : null;
  const key = manualKey || process.env.GEMINI_API_KEY || (process.env as any).API_KEY;
  
  if (!key) {
    throw new Error("API Key is missing. Please use the 'Manual Key' button or the Settings menu.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export const setManualApiKey = (key: string) => {
  localStorage.setItem('manual_gemini_key', key);
};

export const getManualApiKey = () => {
  return localStorage.getItem('manual_gemini_key') || "";
};

export enum TranslationMode {
  TRANSLATE = "translate",
  REFINE = "refine",
  SUMMARIZE = "summarize",
}

export interface TranslationResult {
  original: string;
  translated: string;
  refined?: string;
  summary?: string;
  timestamp: number;
  mode: TranslationMode;
}

const SYSTEM_INSTRUCTIONS = `You are a professional translator and linguist specializing in Kurdish Sorani. 
Your goal is to provide high-quality, natural, and context-aware translations from any language into Kurdish Sorani.
Kurdish Sorani uses a modified Arabic script and is written from right to left (RTL).
Always ensure the output is grammatically correct and culturally appropriate.

Follow these rules for the output:
1. If asked to translate, provide only the translation.
2. If asked to refine, provide only the refined, natural-sounding Kurdish Sorani version.
3. If asked to summarize, provide only the concise summary in Kurdish Sorani.

Do not include any labels like 'Initial Translation:' or 'Summary:' in your response. Just the text itself.`;

export async function generateSoraniSpeech(text: string): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("Text-to-speech requires an internet connection.");
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this Kurdish Sorani text clearly: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received from the model.");
    }

    return base64Audio;
  } catch (error) {
    console.error("TTS error:", error);
    throw error;
  }
}

export async function performOCR(
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("OCR requires an internet connection.");
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        {
          text: "Extract all text from this image. Provide ONLY the extracted text, no other commentary.",
        },
      ],
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("OCR error:", error);
    throw error;
  }
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = "audio/wav"
): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("Transcription requires an internet connection.");
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
        {
          text: "Transcribe the following audio into text. Provide ONLY the transcription, no other text.",
        },
      ],
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

export async function translateText(
  text: string,
  mode: TranslationMode = TranslationMode.TRANSLATE
): Promise<TranslationResult> {
  if (!navigator.onLine) {
    throw new Error("You are currently offline. New translations require an internet connection.");
  }

  let prompt = "";
  switch (mode) {
    case TranslationMode.TRANSLATE:
      prompt = `Translate the following text into natural Kurdish Sorani:\n\n${text}`;
      break;
    case TranslationMode.REFINE:
      prompt = `Translate the following text into Kurdish Sorani and then refine it to sound more natural, professional, and idiomatic for a native speaker. Provide ONLY the refined Kurdish Sorani version.\n\n${text}`;
      break;
    case TranslationMode.SUMMARIZE:
      prompt = `Translate the following text into Kurdish Sorani, refine it for natural flow, and then provide a concise summary in Kurdish Sorani. Provide ONLY the summary in Kurdish Sorani.\n\n${text}`;
      break;
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
      },
    });

    const resultText = response.text || "";
    
    const result: TranslationResult = {
      original: text,
      translated: resultText.trim(),
      timestamp: Date.now(),
      mode,
    };

    // Save to history
    saveToHistory(result);

    return result;
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
}

function saveToHistory(result: TranslationResult) {
  const history = getHistory();
  history.unshift(result);
  // Limit history to 50 items
  localStorage.setItem("sorani_history", JSON.stringify(history.slice(0, 50)));
}

export function getHistory(): TranslationResult[] {
  const history = localStorage.getItem("sorani_history");
  return history ? JSON.parse(history) : [];
}

export function clearHistory() {
  localStorage.removeItem("sorani_history");
}

export function updateHistoryItem(updatedResult: TranslationResult) {
  const history = getHistory();
  const index = history.findIndex(item => item.timestamp === updatedResult.timestamp);
  if (index !== -1) {
    history[index] = updatedResult;
    localStorage.setItem("sorani_history", JSON.stringify(history));
  }
}
