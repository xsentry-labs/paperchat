import type { NextConfig } from "next";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling these server-only native/WASM packages.
  // They're loaded at runtime by Node.js directly.
  serverExternalPackages: [
    "tesseract.js",    // WASM OCR — must run in Node, not webpack bundle
    "@napi-rs/canvas", // Native canvas bindings for PDF rendering
    "officeparser",    // Native XML parsing for PPTX/XLSX
    "pdfjs-dist",      // Already a dep of unpdf; keep out of webpack
  ],

  // Proxy all /api/* requests to the Python FastAPI backend.
  // The Next.js API routes are superseded by the Python backend.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${PYTHON_BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
