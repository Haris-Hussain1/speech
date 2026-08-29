export interface WordResult {
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface PauseResult {
  start: number;
  end: number;
  duration: number;
}

export interface SpeechAnalysisResult {
  transcript: string;
  recording_duration: number;
  speaking_duration: number;
  pause_duration: number;
  total_words: number;
  /** Legacy alias for speaking_words_per_minute. */
  words_per_minute: number;
  average_word_duration: number;
  words: WordResult[];
  /** WPM over the full recording duration. */
  overall_words_per_minute: number;
  /** WPM over detected speaking duration. */
  speaking_words_per_minute: number;
  pause_count: number;
  average_pause_duration: number;
  longest_pause_duration: number;
  silence_percentage: number;
  speech_percentage: number;
  filler_word_count: number;
  filler_word_rate: number;
  pace: string;
  fluency_score: number;
  pauses: PauseResult[];
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function analyzeSpeech(
  audioBlob: Blob,
  filename: string,
): Promise<SpeechAnalysisResult> {
  const formData = new FormData();

  formData.append("file", audioBlob, filename);

  const response = await fetch(
    `${API_BASE_URL}/speech/analyze`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    let message = "Speech analysis failed.";

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
      // Keep the default error message.
    }

    throw new Error(message);
  }

  return (await response.json()) as SpeechAnalysisResult;
}
