// server/ai-providers.js
// ============================================================
// AI Provider Abstraction Layer
// ============================================================
// Supported providers & how to configure them:
//
//  1. gemini   (Google Gemini) - FREE tier available
//              Set env: AI_PROVIDER=gemini  GEMINI_API_KEY=your_key
//              Get key: https://aistudio.google.com/app/apikey
//
//  2. openai   (OpenAI GPT) - Paid, but gpt-4o-mini is cheap
//              Set env: AI_PROVIDER=openai  OPENAI_API_KEY=your_key
//              Get key: https://platform.openai.com/api-keys
//
//  3. groq     (Groq Cloud - FREE tier) - Very fast, free LLaMA/Mixtral
//              Set env: AI_PROVIDER=groq    GROQ_API_KEY=your_key
//              Get key: https://console.groq.com/keys
//
//  4. openrouter (OpenRouter - FREE models available)
//              Set env: AI_PROVIDER=openrouter  OPENROUTER_API_KEY=your_key
//              Get key: https://openrouter.ai/keys
//              Free models: meta-llama/llama-3.1-8b-instruct:free, etc.
//
//  5. ollama   (Local Ollama - completely FREE, runs locally)
//              Set env: AI_PROVIDER=ollama  OLLAMA_BASE_URL=http://localhost:11434
//              Install: https://ollama.ai  then: ollama pull llama3.2
//
// Default: gemini (if GEMINI_API_KEY is set) else groq
// ============================================================

import { GoogleGenAI, Type } from '@google/genai';

// ---- Helper: call a generic OpenAI-compatible JSON API ----
async function callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt, headers = {} }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI returned empty response');
  return JSON.parse(text.trim());
}

// ---- Provider implementations ----

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });

  const aiResponse = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          companyName: { type: Type.STRING },
          jobPositions: { type: Type.ARRAY, items: { type: Type.STRING } },
          education: { type: Type.STRING },
          experience: { type: Type.STRING },
          deadline: { type: Type.STRING },
          detailContent: { type: Type.STRING },
          howToApply: { type: Type.STRING },
          location: { type: Type.STRING },
        },
        required: ['companyName', 'jobPositions', 'education', 'experience', 'deadline', 'detailContent', 'howToApply', 'location'],
      },
    },
  });

  const text = aiResponse.text;
  if (!text) throw new Error('Gemini returned empty response');
  return JSON.parse(text.trim());
}

async function callOpenAI(prompt) {
  return callOpenAICompatible({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    systemPrompt: 'You are an expert recruitment parser. Always respond with valid JSON only.',
    userPrompt: prompt,
  });
}

async function callGroq(prompt) {
  return callOpenAICompatible({
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    systemPrompt: 'You are an expert recruitment parser. Always respond with valid JSON only.',
    userPrompt: prompt,
  });
}

async function callOpenRouter(prompt) {
  return callOpenAICompatible({
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    systemPrompt: 'You are an expert recruitment parser. Always respond with valid JSON only.',
    userPrompt: prompt,
    headers: {
      'HTTP-Referer': 'https://localhost:3000',
      'X-Title': 'Job Scraper',
    },
  });
}

async function callOllama(prompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an expert recruitment parser. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.message?.content;
  if (!text) throw new Error('Ollama returned empty response');
  return JSON.parse(text.trim());
}

// ---- Main export: call the configured provider ----

export async function callAI(prompt) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase() || detectProvider();

  console.log(`[AI] Using provider: ${provider}`);

  switch (provider) {
    case 'gemini':
      return callGemini(prompt);
    case 'openai':
      return callOpenAI(prompt);
    case 'groq':
      return callGroq(prompt);
    case 'openrouter':
      return callOpenRouter(prompt);
    case 'ollama':
      return callOllama(prompt);
    default:
      throw new Error(
        `Unknown AI provider: "${provider}". ` +
        'Set AI_PROVIDER to one of: gemini, openai, groq, openrouter, ollama'
      );
  }
}

function detectProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama'; // fallback to local
}

export function getProviderInfo() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase() || detectProvider();
  const models = {
    gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    openrouter: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    ollama: process.env.OLLAMA_MODEL || 'llama3.2',
  };
  return { provider, model: models[provider] || 'unknown' };
}
