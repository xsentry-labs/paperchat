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

  // Disable Next.js automatic trailing-slash → non-trailing-slash 308 redirects.
  // These permanent redirects get cached by the browser and can cause redirect loops.
  skipTrailingSlashRedirect: true,

  // NOTE: API proxying to the Python backend is handled by the catch-all route
  // handler at src/app/api/[...path]/route.ts instead of rewrites().
  // Vercel's edge network was returning 308 self-redirect loops for rewrites()
  // pointing to external URLs, so we proxy from within the serverless function.
};

export default nextConfig;
