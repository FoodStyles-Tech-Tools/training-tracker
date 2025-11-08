import { toNextJsHandler } from "better-auth/next-js";
import { APIError } from "better-auth";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

const { GET: baseGET, POST: basePOST } = toNextJsHandler(auth);

async function handleRequest(
  handler: (request: NextRequest, context: { params: { "better-auth": string[] } }) => Promise<Response>,
  request: NextRequest,
  context: { params: { "better-auth": string[] } }
) {
  try {
    const response = await handler(request, context);
    
    // Check if this is a request to the error endpoint
    const url = new URL(request.url);
    if (url.pathname.includes("/error")) {
      const error = url.searchParams.get("error");
      // Redirect to login with error message
      if (error) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent("User not found.")}`, request.url)
        );
      }
    }
    
    // Check if response is a redirect to error page
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location?.includes("/error")) {
        const errorUrl = new URL(location, request.url);
        const error = errorUrl.searchParams.get("error");
        if (error) {
          return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent("User not found.")}`, request.url)
          );
        }
      }
    }

    // Check if response is a JSON error response
    if (response.status === 401 || response.status === 403) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("User not found.")}`, request.url)
      );
    }
    
    return response;
  } catch (error) {
    // Catch Better Auth API errors
    if (error instanceof APIError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message || "User not found.")}`, request.url)
      );
    }
    
    // If error contains "User not found", redirect to login
    if (error instanceof Error && error.message.includes("User not found")) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("User not found.")}`, request.url)
      );
    }
    throw error;
  }
}

export async function GET(request: NextRequest, context: { params: { "better-auth": string[] } }) {
  return handleRequest(baseGET, request, context);
}

export async function POST(request: NextRequest, context: { params: { "better-auth": string[] } }) {
  return handleRequest(basePOST, request, context);
}

