import { toNextJsHandler } from "better-auth/next-js";
import { APIError } from "better-auth";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

const { GET: baseGET, POST: basePOST } = toNextJsHandler(auth);

async function handleRequest(
  handler: (request: NextRequest, context: { params: { "better-auth": string[] } }) => Promise<Response>,
  request: NextRequest,
  context: { params: Promise<{ "better-auth": string[] }> }
) {
  try {
    const resolvedParams = await context.params;
    const response = await handler(request, { params: resolvedParams });
    
    // Check if this is an API request (from fetch, not browser navigation)
    const acceptHeader = request.headers.get("accept") || "";
    const contentType = request.headers.get("content-type") || "";
    const isApiRequest = acceptHeader.includes("application/json") || contentType.includes("application/json");
    
    // If response is successful, return it as-is
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    
    // Check if response is an error status (401, 403, etc.)
    if (response.status === 401 || response.status === 403) {
      // Try to get error message from response body if it's JSON
      let errorMessage = "Unable to sign in with those credentials";
      try {
        const clonedResponse = response.clone();
        const responseContentType = clonedResponse.headers.get("content-type");
        if (responseContentType?.includes("application/json")) {
          const data = await clonedResponse.json();
          errorMessage = data?.error || data?.message || errorMessage;
        }
      } catch {
        // If parsing fails, use default message
      }
      
      if (isApiRequest) {
        return NextResponse.json({ error: errorMessage }, { status: response.status });
      }
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }
    
    // Check if response is a redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        // Check if redirect is to error page
        if (location.includes("/error")) {
          const errorUrl = new URL(location, request.url);
          const error = errorUrl.searchParams.get("error");
          const errorMessage = error || "Unable to sign in with those credentials";
          if (isApiRequest) {
            return NextResponse.json({ error: errorMessage }, { status: 401 });
          }
          return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
          );
        }
        // For API requests, convert redirects to JSON errors
        if (isApiRequest) {
          return NextResponse.json({ error: "Unable to sign in with those credentials" }, { status: 401 });
        }
      }
    }
    
    // Check if this is a request to the error endpoint
    const url = new URL(request.url);
    if (url.pathname.includes("/error")) {
      const error = url.searchParams.get("error");
      const errorMessage = error || "User not found.";
      if (isApiRequest) {
        return NextResponse.json({ error: errorMessage }, { status: 401 });
      }
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }
    
    return response;
  } catch (error) {
    // Catch Better Auth API errors
    const errorMessage = error instanceof APIError 
      ? (error.message || "User not found.")
      : (error instanceof Error && error.message.includes("User not found"))
        ? "User not found."
        : "Unable to sign in with those credentials";
    
    // Check if this is an API request
    const acceptHeader = request.headers.get("accept") || "";
    const contentType = request.headers.get("content-type") || "";
    const isApiRequest = acceptHeader.includes("application/json") || contentType.includes("application/json");
    
    if (isApiRequest) {
      return NextResponse.json({ error: errorMessage }, { status: 401 });
    }
    
    if (error instanceof APIError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }
    
    // If error contains "User not found", redirect to login
    if (error instanceof Error && error.message.includes("User not found")) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }
    throw error;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ "better-auth": string[] }> }) {
  return handleRequest(baseGET, request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ "better-auth": string[] }> }) {
  return handleRequest(basePOST, request, context);
}

