export interface TranslationResult {
  urdu_transcript: string;
  english_translation: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function translateSpeech(
  audioBlob: Blob,
  filename: string,
): Promise<TranslationResult> {
  const formData = new FormData();
  formData.append("file", audioBlob, filename);

  const response = await fetch(`${API_BASE_URL}/speech/translate`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "Speech translation failed.";
    try {
      const errorData: unknown = await response.json();
      if (
        typeof errorData === "object" &&
        errorData !== null &&
        "detail" in errorData &&
        typeof errorData.detail === "string"
      ) {
        message = errorData.detail;
      }
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }

  return (await response.json()) as TranslationResult;
}
