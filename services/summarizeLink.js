import fetch from "node-fetch";
import { JSDOM, VirtualConsole } from "jsdom";

/**
 * Fetches metadata for the provided URL and asks OpenAI for a single-sentence summary.
 * @param {string} url - The public URL to summarize.
 * @returns {Promise<{ title: string|null, description: string|null, summary: string }>}
 */
export async function summarizeLink(url) {
  if (!url) throw new Error("summarizeLink: url is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("summarizeLink: OPENAI_API_KEY missing");

  const pageMeta = await fetchPageMetadata(url);
  const summary = await createOpenAiSummary({
    url,
    title: pageMeta.title,
    description: pageMeta.description,
  });

  return { ...pageMeta, summary };
}

async function fetchPageMetadata(url) {
  try {
    const resp = await fetch(url, { timeout: 5000 });
    const html = await resp.text();
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", () => {
      /* Ignore parse errors from remote stylesheets/scripts */
    });
    const dom = new JSDOM(html, { virtualConsole });
    const { document } = dom.window;

    const titleSelectors = [
      () => document.querySelector("title")?.textContent,
      () => document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
      () => document.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
    ];
    const descriptionSelectors = [
      () => document.querySelector('meta[name="description"]')?.getAttribute("content"),
      () => document.querySelector('meta[property="og:description"]')?.getAttribute("content"),
      () => document.querySelector('meta[name="twitter:description"]')?.getAttribute("content"),
    ];

    const firstValue = selectors =>
      selectors
        .map(sel => {
          try {
            return sel();
          } catch {
            return null;
          }
        })
        .find(text => !!text?.trim());

    const title = firstValue(titleSelectors)?.trim() || null;
    const description = firstValue(descriptionSelectors)?.trim() || null;

    return { title, description };
  } catch (err) {
    console.error("summarizeLink: failed to load HTML", err);
    return { title: null, description: null };
  }
}

async function createOpenAiSummary({ url, title, description }) {
  const prompt = [
    "You are a focused summarization agent for saved links.",
    "Return exactly one concise sentence (<=30 words).",
    "Use any supplied title, description, and URL slug to infer the topic.",
    "If the content body is unavailable, state what is known (publisher, author, topic) rather than saying you cannot access it.",
    "Mention when details are missing, but still provide the most useful clue possible.",
    "Never include API keys or sensitive tokens.",
    "",
    `URL: ${url}`,
    `Title: ${title ?? "N/A"}`,
    `Description: ${description ?? "N/A"}`,
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write accurate, single-sentence summaries." },
        { role: "user", content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`summarizeLink: OpenAI request failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    console.error("summarizeLink: Unexpected OpenAI payload", JSON.stringify(data, null, 2));
    throw new Error("summarizeLink: Missing summary text in OpenAI response");
  }

  return text;
}
