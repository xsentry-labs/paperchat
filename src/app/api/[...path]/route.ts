/**
 * Catch-all API proxy route.
 *
 * Proxies every /api/* request to the Python FastAPI backend.
 * We use an actual route handler instead of next.config.ts rewrites() because
 * Vercel's edge network can fail to proxy rewrites to external URLs, returning
 * a 308 self-redirect loop instead.
 *
 * This handler runs as a serverless function, giving us reliable control over
 * the outbound request to the backend.
 */
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND_URL = (
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function proxyRequest(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const targetUrl = `${PYTHON_BACKEND_URL}${pathname}${search}`;

  // Forward all headers except host (which should match the backend)
  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-expect-error -- Node fetch supports duplex for streaming request bodies
      duplex: "half",
    });

    // Forward the backend response back to the client, preserving status,
    // headers, and streaming body.
    const responseHeaders = new Headers(backendResponse.headers);
    // Remove hop-by-hop headers that shouldn't be forwarded
    responseHeaders.delete("transfer-encoding");

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[api-proxy] Failed to reach backend at ${targetUrl}:`, error);
    return NextResponse.json(
      { error: "Backend unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
