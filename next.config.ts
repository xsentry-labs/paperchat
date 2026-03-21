import type { NextConfig } from "next";

// Strip trailing slash from backend URL to avoid double-slash in rewrite destinations
const PYTHON_BACKEND_URL = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");

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
  // These permanent redirects get cached by the browser and can cause redirect loops
  // when combined with middleware auth redirects.
  skipTrailingSlashRedirect: true,

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
