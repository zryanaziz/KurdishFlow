import { GoogleGenAI } from "@google/genai";

const getAi = () => {
  // Check for manual key in localStorage first, then environment variables
  const manualKey = typeof window !== 'undefined' ? localStorage.getItem('manual_gemini_key') : null;
  
  // Safely access process.env
  const env = typeof process !== 'undefined' ? process.env : {};
  const envKey = (env as any).GEMINI_API_KEY || (env as any).API_KEY;
  
  const key = manualKey || envKey;
  
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

export enum Language {
  SORANI = "Kurdish Sorani",
  ENGLISH = "English",
  ARABIC = "Arabic",
  MIXED = "Mixed Religious",
}

export enum TranslationMode {
  TRANSLATE = "translate",
  REFINE = "refine",
  PARAPHRASE = "paraphrase",
  SUMMARIZE = "summarize",
}

export interface TranslationResult {
  original: string;
  translated: string;
  refined?: string;
  summary?: string;
  timestamp: number;
  mode: TranslationMode;
  targetLanguage: Language;
}

const getSystemInstructions = (targetLanguage: Language) => {
  if (targetLanguage === Language.MIXED) {
    return `You are a professional translator and linguist tasked with translating religious speeches (e.g., from an Imam). 
    For normal speech, translate into English. 
    For Ayats (Quranic verses) and Hadiths, ALWAYS maintain the EXASt Arabic text. 
    DO NOT translate Arabic religious quotes into English. 
    You MUST verify the accuracy of the Arabic Ayats/Hadiths and ensure there are no missing words.
    
    Structure: Maintain the structural flow of the speech.
    Formatting: CRITICAL: You MUST preserve the exact formatting, spacing, and line breaks of the original text.`;
  }
  return `You are a professional translator and linguist specializing in ${targetLanguage}. 
Your goal is to provide high-quality, natural, and context-aware translations from any language into ${targetLanguage}.
${targetLanguage === Language.SORANI ? "Kurdish Sorani uses a modified Arabic script and is written from right to left (RTL)." : ""}
Always ensure the output is grammatically correct and culturally appropriate.

CRITICAL: You MUST preserve the exact formatting, spacing, and line breaks of the original text. If the input has multiple paragraphs or specific indentation, the ${targetLanguage} output must mirror that structure exactly.

Follow these rules for the output:
1. If asked to translate, provide only the translation, preserving all original line breaks and spacing.
2. If asked to refine, provide only the refined, natural-sounding ${targetLanguage} version, preserving all original line breaks and spacing.
3. If asked to summarize, provide only the concise summary in ${targetLanguage}.

Do not include any labels like 'Initial Translation:' or 'Summary:' in your response. Just the text itself.`;
};

export async function generateSoraniSpeech(text: string): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("Text-to-speech requires an internet connection.");
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-2.0-flash-lite",
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
      model: "gemini-2.0-flash-lite",
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
      model: "gemini-2.0-flash-lite",
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

export async function detectReligiousContent(text: string): Promise<boolean> {
  try {
    const response = await getAi().models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: `Analyze the following text. Does it contain religious content like Quranic verses (Ayats) or Hadiths? Answer ONLY with "yes" or "no":\n\n${text}`
    });
    return response.text?.trim().toLowerCase() === "yes";
  } catch (err) {
    return false;
  }
}

export async function translateText(
  text: string,
  targetLanguage: Language = Language.SORANI,
  mode: TranslationMode = TranslationMode.TRANSLATE
): Promise<TranslationResult> {
  if (!navigator.onLine) {
    throw new Error("You are currently offline. New translations require an internet connection.");
  }

  const isReligious = await detectReligiousContent(text);
  const finalLanguage = isReligious ? Language.MIXED : targetLanguage;

  let prompt = "";
  switch (mode) {
    case TranslationMode.TRANSLATE:
      prompt = finalLanguage === Language.MIXED 
        ? `Translate the following religious speech into English, but KEEP all Arabic Ayats and Hadiths in Arabic without translating them. Ensure the Arabic is authentic and complete:\n\n${text}`
        : `Translate the following text into natural ${finalLanguage}:\n\n${text}`;
      break;
    case TranslationMode.REFINE:
      prompt = finalLanguage === Language.MIXED
        ? `Refine the following religious speech for flow and clarity. Keep Arabic Ayats/Hadiths in Arabic:\n\n${text}`
        : `Translate the following text into ${finalLanguage} and then refine it to sound more natural, professional, and idiomatic for a native speaker. Provide ONLY the refined ${finalLanguage} version.\n\n${text}`;
      break;
    case TranslationMode.PARAPHRASE:
      prompt = finalLanguage === Language.MIXED
        ? `Paraphrase the following religious speech, keeping the original meaning and maintaining key Arabic Ayats/Hadiths as they are. Ensure the complete content and all points are retained, just reworded for better clarity/flow:\n\n${text}`
        : `Translate the following text into ${finalLanguage}, then paraphrase it to present the same information in a different, clearer way while maintaining the original tone AND full length/detail. Do not summarize or shorten it; reword all sentences to be more natural while keeping all original details. Provide ONLY the paraphrased ${finalLanguage} version.\n\n${text}`;
      break;
    case TranslationMode.SUMMARIZE:
      prompt = finalLanguage === Language.MIXED
        ? `Summarize the following religious speech, keeping key Arabic Ayats/Hadiths as is:\n\n${text}`
        : `Translate the following text into ${finalLanguage}, refine it for natural flow, and then provide a concise summary in ${finalLanguage}. Provide ONLY the summary in ${finalLanguage}.\n\n${text}`;
      break;
  }

  try {
    const response = await getAi().models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: getSystemInstructions(finalLanguage),
      },
    });

    const resultText = response.text || "";
    
    const result: TranslationResult = {
      original: text,
      translated: resultText.trim(),
      timestamp: Date.now(),
      mode,
      targetLanguage: finalLanguage,
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
