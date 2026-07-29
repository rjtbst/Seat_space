// src/lib/chat/providers/gemini.provider.ts
//
// Google Gemini — config wrapper around OpenAICompatibleProvider, same
// pattern as groq.provider.ts / grok.provider.ts. Google exposes an
// OpenAI-compatible endpoint specifically so existing OpenAI-shaped clients
// (like ours) work without a custom integration.
//
// Required env vars:
//   GEMINI_API_KEY   — server-side only, never exposed to the client.
//                      Get one free, no credit card, at https://aistudio.google.com/apikey
//   GEMINI_MODEL     — defaults to 'gemini-2.5-flash' if unset.
//
// FREE TIER NOTE — read this before going live with real users:
// On the free tier (no billing enabled on the Google Cloud project behind
// GEMINI_API_KEY), Google's terms allow using your prompts/responses to
// improve their products. That's fine while this app has no real
// customers (which is the situation as of writing this). The moment you
// onboard a real library, the fix is NOT a code change — enable billing on
// that same Google Cloud project (console.cloud.google.com), and every
// request from this same key is then covered by the paid-tier terms,
// which explicitly exclude your data from training. Nothing in this file
// or providers/index.ts needs to change when that happens.
//
// MODEL NOTE: 'gemini-2.5-flash' is Google's currently-free, currently-
// supported default as of writing, but Google has a habit of retiring
// Gemini models on a few months' notice — check
// https://ai.google.dev/gemini-api/docs/models for the current free-tier
// lineup before this stops working, and bump GEMINI_MODEL rather than
// waiting for a deploy to break.

import { OpenAICompatibleProvider } from './openai-compatible.provider'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

export class GeminiProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model?: string) {
    super(GEMINI_API_URL, apiKey, model || process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  }
}