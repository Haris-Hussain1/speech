import { jsPDF } from "jspdf";
import type { SpeechAnalysisResult } from "../api/speech";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 14;

type PdfContext = {
  doc: jsPDF;
  y: number;
};

export function downloadSpeechAnalysisPdf(
  analysis: SpeechAnalysisResult,
): Promise<void> {
  return createSpeechAnalysisPdf(analysis).then((doc) => {
    doc.save(`speak1-speech-analysis-report-${getFileTimestamp()}.pdf`);
  });
}

export function createSpeechAnalysisPdf(
  analysis: SpeechAnalysisResult,
): Promise<jsPDF> {
  return loadReportLogo().then((logoDataUrl) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const context: PdfContext = { doc, y: MARGIN };
  drawHeader(context, logoDataUrl);

  drawSectionTitle(context, "Summary");
  drawMetricGrid(context, [
    ["Speaking duration", formatSeconds(analysis.speaking_duration)],
    ["Recording duration", formatSeconds(analysis.recording_duration)],
    ["Total words", String(analysis.total_words)],
    ["Words per minute", formatNumber(analysis.words_per_minute)],
    ["Speaking WPM", formatNumber(analysis.speaking_words_per_minute)],
  ]);

  drawSectionTitle(context, "Transcript");
  drawWrappedText(context, analysis.transcript || "No speech detected.", {
    size: 10,
    color: [42, 55, 88],
    lineHeight: 5.2,
    indent: 3,
  });

  drawSectionTitle(context, "Detailed Analysis");
  drawMetricGrid(context, [
    ["Speaking duration", formatSeconds(analysis.speaking_duration)],
    ["Pause duration", formatSeconds(analysis.pause_duration)],
    ["Average word duration", `${formatNumber(analysis.average_word_duration)} sec`],
    ["Overall WPM", formatNumber(analysis.overall_words_per_minute)],
    ["Speaking WPM", formatNumber(analysis.speaking_words_per_minute)],
    ["Pace", analysis.pace],
    ["Pause count", String(analysis.pause_count)],
    ["Average pause", `${formatNumber(analysis.average_pause_duration)} sec`],
    ["Longest pause", `${formatNumber(analysis.longest_pause_duration)} sec`],
    ["Speech percentage", `${formatNumber(analysis.speech_percentage)}%`],
    ["Silence percentage", `${formatNumber(analysis.silence_percentage)}%`],
    ["Filler word count", String(analysis.filler_word_count)],
    ["Filler word rate", `${formatNumber(analysis.filler_word_rate)}%`],
    ["Fluency score", `${formatNumber(analysis.fluency_score)} / 100`],
  ]);

  drawSectionTitle(context, "Pause Analysis");
  if (analysis.pauses.length > 0) {
    drawTable(context, ["#", "Start", "End", "Duration"], analysis.pauses.map((pause, index) => [
      String(index + 1),
      formatTime(pause.start),
      formatTime(pause.end),
      `${formatNumber(pause.duration)} sec`,
    ]), [12, 54, 54, 54]);
  } else {
    drawWrappedText(context, "No significant pauses detected.", {
      size: 10,
      color: [86, 99, 132],
    });
  }

  drawSectionTitle(context, "Word-Level Timing");
  if (analysis.words.length > 0) {
    drawTable(context, ["Word", "Start", "End", "Duration"], analysis.words.map((word) => [
      word.text,
      formatTime(word.start),
      formatTime(word.end),
      `${formatNumber(word.duration)} sec`,
    ]), [86, 34, 34, 24]);
  } else {
    drawWrappedText(context, "No word-level timing data available.", {
      size: 10,
      color: [86, 99, 132],
    });
  }

  drawSectionTitle(context, "Assessment Note");
  drawWrappedText(
    context,
    "The fluency score is an application metric based on speaking pace, pauses, average pause duration, and filler-word rate. It is not a medical, psychological, or definitive language assessment.",
    { size: 9, color: [86, 99, 132], lineHeight: 4.5 },
  );

  addFooters(doc);
  return doc;
  });
}

function drawHeader(context: PdfContext, logoDataUrl: string | null): void {
  const { doc, y } = context;

  doc.setFillColor(248, 249, 255);
  doc.rect(0, 0, PAGE_WIDTH, 42, "F");
  doc.setFillColor(84, 62, 225);
  doc.rect(0, 0, PAGE_WIDTH, 2.5, "F");
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", MARGIN, y - 1, 17, 17, undefined, "FAST");
  }

  doc.setTextColor(20, 31, 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Learnova Speech Analyzer", MARGIN + 22, y + 8);
  doc.setTextColor(86, 99, 132);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Speech Analysis Report", MARGIN + 22, y + 14);

  doc.setDrawColor(221, 228, 240);
  doc.line(MARGIN, y + 21, PAGE_WIDTH - MARGIN, y + 21);
  doc.setTextColor(86, 99, 132);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, PAGE_WIDTH - MARGIN, y + 8, {
    align: "right",
  });

  context.y = y + 30;
}

function drawSectionTitle(context: PdfContext, title: string): void {
  ensureSpace(context, 16);
  context.doc.setTextColor(20, 31, 76);
  context.doc.setFont("helvetica", "bold");
  context.doc.setFontSize(13);
  context.doc.text(title, MARGIN, context.y + 5);
  context.doc.setDrawColor(221, 228, 240);
  context.doc.line(MARGIN, context.y + 8, PAGE_WIDTH - MARGIN, context.y + 8);
  context.y += 14;
}

async function loadReportLogo(): Promise<string | null> {
  try {
    const response = await fetch("/logos/logo.png");

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Unable to read report logo."));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read report logo."));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawMetricGrid(context: PdfContext, metrics: string[][]): void {
  const columnWidth = (CONTENT_WIDTH - 6) / 2;
  const rowHeight = 18;

  for (let index = 0; index < metrics.length; index += 2) {
    ensureSpace(context, rowHeight + 3);
    const row = Math.floor(index / 2);
    const top = context.y;

    for (let column = 0; column < 2; column += 1) {
      const metric = metrics[index + column];

      if (!metric) {
        continue;
      }

      const left = MARGIN + column * (columnWidth + 6);
      context.doc.setFillColor(247, 249, 253);
      context.doc.setDrawColor(225, 231, 241);
      context.doc.roundedRect(left, top, columnWidth, rowHeight, 2, 2, "FD");
      context.doc.setTextColor(91, 105, 139);
      context.doc.setFont("helvetica", "normal");
      context.doc.setFontSize(8);
      context.doc.text(metric[0], left + 4, top + 6);
      context.doc.setTextColor(20, 31, 76);
      context.doc.setFont("helvetica", "bold");
      context.doc.setFontSize(10);
      context.doc.text(metric[1], left + 4, top + 13);
    }

    context.y = top + rowHeight + (row >= 0 ? 3 : 0);
  }
}

function drawWrappedText(
  context: PdfContext,
  text: string,
  options: {
    size: number;
    color: [number, number, number];
    lineHeight?: number;
    indent?: number;
  },
): void {
  const lineHeight = options.lineHeight ?? 4.8;
  const indent = options.indent ?? 0;
  context.doc.setFont("helvetica", "normal");
  context.doc.setFontSize(options.size);
  context.doc.setTextColor(...options.color);

  const lines = context.doc.splitTextToSize(text, CONTENT_WIDTH - indent);

  for (const line of lines) {
    ensureSpace(context, lineHeight);
    context.doc.text(line, MARGIN + indent, context.y);
    context.y += lineHeight;
  }

  context.y += 3;
}

function drawTable(
  context: PdfContext,
  headers: string[],
  rows: string[][],
  widths: number[],
): void {
  const rowHeight = 7;
  drawTableHeader(context, headers, widths, rowHeight);

  for (const row of rows) {
    const wrappedCells = row.map((cell, index) =>
      context.doc.splitTextToSize(cell, widths[index] - 4),
    );
    const height = Math.max(...wrappedCells.map((cell) => cell.length), 1) * 4.2 + 2.5;

    if (context.y + height > PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT) {
      context.doc.addPage();
      context.y = MARGIN;
      drawTableHeader(context, headers, widths, rowHeight);
    }

    const top = context.y;
    let left = MARGIN;
    context.doc.setDrawColor(225, 231, 241);
    context.doc.setFont("helvetica", "normal");
    context.doc.setFontSize(8);

    for (let index = 0; index < row.length; index += 1) {
      context.doc.setFillColor(255, 255, 255);
      context.doc.rect(left, top, widths[index], height, "FD");
      context.doc.setTextColor(42, 55, 88);
      context.doc.text(wrappedCells[index], left + 2, top + 4.5);
      left += widths[index];
    }

    context.y = top + height;
  }

  context.y += 4;
}

function drawTableHeader(
  context: PdfContext,
  headers: string[],
  widths: number[],
  height: number,
): void {
  ensureSpace(context, height + 2);
  let left = MARGIN;
  context.doc.setFillColor(239, 241, 255);
  context.doc.setDrawColor(213, 218, 238);
  context.doc.setTextColor(48, 55, 116);
  context.doc.setFont("helvetica", "bold");
  context.doc.setFontSize(8);

  for (let index = 0; index < headers.length; index += 1) {
    context.doc.rect(left, context.y, widths[index], height, "FD");
    context.doc.text(headers[index], left + 2, context.y + 4.5);
    left += widths[index];
  }

  context.y += height;
}

function ensureSpace(context: PdfContext, height: number): void {
  if (context.y + height <= PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT) {
    return;
  }

  context.doc.addPage();
  context.y = MARGIN;
}

function addFooters(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(221, 228, 240);
    doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 5, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 5);
    doc.setTextColor(125, 137, 163);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Speech Analyzer", MARGIN, PAGE_HEIGHT - MARGIN);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN, {
      align: "right",
    });
  }
}

function formatSeconds(value: number): string {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function formatTime(value: number): string {
  return `${Math.max(0, value).toFixed(2)}s`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function getFileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
}
