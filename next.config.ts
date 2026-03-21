import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling these server-only native/WASM packages.
  // They're loaded at runtime by Node.js directly.
  serverExternalPackages: [
    "tesseract.js",    // WASM OCR — must run in Node, not webpack bundle
    "@napi-rs/canvas", // Native canvas bindings for PDF rendering
    "officeparser",    // Native XML parsing for PPTX/XLSX
    "pdfjs-dist",      // Already a dep of unpdf; keep out of webpack
  ],
};

export default nextConfig;
