/**
 * OCR module - Tesseract.js + pdfjs-dist + @napi-rs/canvas
 *
 * Used when a PDF appears to be scanned (image-based) rather than
 * digitally typeset. Detection is based on text density per page.
 *
 * Pipeline per page:
 *   1. Render PDF page → PNG buffer  (pdfjs-dist + @napi-rs/canvas)
 *   2. Pass PNG buffer to Tesseract.js (pure WASM, no system deps)
 *   3. Return extracted text
 *
 * Limits:
 *   - Maximum OCR_MAX_PAGES pages processed (default 20) to cap latency
 *   - Scale factor 2.0 for decent OCR accuracy on standard documents
 *
 * All imports are dynamic to keep the module out of the browser bundle
 * and to avoid top-level initialization of WASM.
 */

/** Minimum average non-whitespace chars per page before we try OCR */
const SCANNED_THRESHOLD = 80;

/** Maximum pages to OCR - beyond this the user should use a native PDF */
export const OCR_MAX_PAGES = 20;

/**
 * Decide whether a PDF is likely scanned based on extracted text density.
 * Returns true if the average meaningful character count per page is below
 * the threshold (indicating mostly empty / image pages).
 */
export function isLikelyScanned(text: string, pageCount: number): boolean {
  const meaningful = text.replace(/\s/g, "").length;
  const avgPerPage = meaningful / Math.max(pageCount, 1);
  return avgPerPage < SCANNED_THRESHOLD;
}

/**
 * Render a single PDF page to a PNG Buffer.
 * Uses pdfjs-dist (already a transitive dep via unpdf) + @napi-rs/canvas.
 */
async function renderPageToBuffer(
  pdfData: Uint8Array,
  pageNum: number,
  scale = 2.0
): Promise<Buffer> {
  // Dynamic imports keep these out of the webpack client bundle
  const pdfjsLib = await import("pdfjs-dist");
  const { createCanvas } = await import("@napi-rs/canvas");

  // Disable the web worker - we're in Node.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const pdfDoc = await pdfjsLib.getDocument({
    data: pdfData,
    // Suppress pdfjs console noise
    verbosity: 0,
  }).promise;

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );
  // @napi-rs/canvas context is API-compatible with browser CanvasRenderingContext2D
  const ctx = canvas.getContext("2d");

  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).promise;

  await pdfDoc.destroy();

  return canvas.toBuffer("image/png");
}

export interface OcrResult {
  text: string;
  pages: { text: string; page: number }[];
  pagesProcessed: number;
  totalPages: number;
}

/**
 * OCR an entire PDF (up to OCR_MAX_PAGES pages).
 *
 * Creates one Tesseract worker, processes pages sequentially, then
 * terminates the worker. Progress is logged at the INFO level.
 */
export async function ocrPdf(
  pdfData: Uint8Array,
  totalPages: number
): Promise<OcrResult> {
  const Tesseract = (await import("tesseract.js")).default;

  const pagesToProcess = Math.min(totalPages, OCR_MAX_PAGES);
  if (pagesToProcess < totalPages) {
    console.warn(
      `[ocr] PDF has ${totalPages} pages; OCR limited to first ${pagesToProcess}`
    );
  }

  // Single worker reused across all pages for efficiency
  const worker = await Tesseract.createWorker("eng", 1, {
    // Suppress Tesseract's own logging
    logger: () => {},
    errorHandler: (e: unknown) => console.error("[ocr] Tesseract error:", e),
  });

  const pages: { text: string; page: number }[] = [];

  try {
    for (let i = 1; i <= pagesToProcess; i++) {
      console.log(`[ocr] Processing page ${i}/${pagesToProcess}…`);
      const imageBuffer = await renderPageToBuffer(pdfData, i);
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      pages.push({ text: text.trim(), page: i });
    }
  } finally {
    await worker.terminate();
  }

  const text = pages.map((p) => p.text).join("\n\n");
  console.log(
    `[ocr] Extracted ${text.replace(/\s/g, "").length} chars from ${pagesToProcess} pages`
  );

  return { text, pages, pagesProcessed: pagesToProcess, totalPages };
}
