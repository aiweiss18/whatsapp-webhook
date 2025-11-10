import fetch from "node-fetch";
import { JSDOM, VirtualConsole } from "jsdom";

/**
 * Fetches metadata for the provided URL and asks OpenAI for a summary and descriptive title.
 * @param {string} url - The public URL to summarize.
 * @returns {Promise<{ title: string, description: string|null, summary: string, pageTitle: string|null }>}
 */
export async function summarizeLink(url) {
  if (!url) throw new Error("summarizeLink: url is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("summarizeLink: OPENAI_API_KEY missing");

  const pageMeta = await fetchPageMetadata(url);
  const aiResult = await createOpenAiSummary({
    url,
    title: pageMeta.title,
    description: pageMeta.description,
    author: pageMeta.author,
    publishDate: pageMeta.publishDate,
    siteName: pageMeta.siteName,
    articleContent: pageMeta.articleContent,
  });

  return { 
    title: aiResult.title,           // AI-generated descriptive title
    pageTitle: pageMeta.title,       // Original page title
    description: pageMeta.description,
    summary: aiResult.summary,       // AI-generated summary
  };
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

    // Extract additional metadata for better context
    const author = document.querySelector('meta[name="author"]')?.getAttribute("content")?.trim() || 
                   document.querySelector('meta[property="article:author"]')?.getAttribute("content")?.trim() ||
                   document.querySelector('[rel="author"]')?.textContent?.trim() || null;
    
    const publishDate = document.querySelector('meta[property="article:published_time"]')?.getAttribute("content")?.trim() ||
                        document.querySelector('meta[name="publish_date"]')?.getAttribute("content")?.trim() ||
                        document.querySelector('time[datetime]')?.getAttribute("datetime")?.trim() || null;

    const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || null;

    // Extract article content for better summarization (first few paragraphs)
    const articleContent = extractArticleContent(document);

    return { title, description, author, publishDate, siteName, articleContent };
  } catch (err) {
    console.error("summarizeLink: failed to load HTML", err);
    return { title: null, description: null, author: null, publishDate: null, siteName: null, articleContent: null };
  }
}

function extractArticleContent(document) {
  try {
    // Try common article selectors
    const selectors = [
      'article',
      '[role="article"]',
      '.article-content',
      '.post-content',
      '.entry-content',
      'main',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Get all paragraph text, limit to first 500 words for context
        const paragraphs = Array.from(element.querySelectorAll('p'))
          .map(p => p.textContent?.trim())
          .filter(text => text && text.length > 50) // Filter out short snippets
          .slice(0, 5) // Take first 5 substantial paragraphs
          .join(' ');

        if (paragraphs.length > 100) {
          // Truncate to ~500 words for API efficiency
          const words = paragraphs.split(/\s+/).slice(0, 500).join(' ');
          return words.length > 2000 ? words.slice(0, 2000) + '...' : words;
        }
      }
    }

    // Fallback: get all paragraphs from body
    const allParas = Array.from(document.querySelectorAll('body p'))
      .map(p => p.textContent?.trim())
      .filter(text => text && text.length > 50)
      .slice(0, 3)
      .join(' ');

    if (allParas.length > 100) {
      const words = allParas.split(/\s+/).slice(0, 500).join(' ');
      return words.length > 2000 ? words.slice(0, 2000) + '...' : words;
    }

    return null;
  } catch (err) {
    return null;
  }
}

async function createOpenAiSummary({ url, title, description, author, publishDate, siteName, articleContent }) {
  // Detect content type from URL for specialized instructions
  const urlLower = url.toLowerCase();
  let contentType = "article";
  if (urlLower.includes("linkedin.com")) contentType = "linkedin";
  else if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) contentType = "tweet";
  else if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) contentType = "video";
  else if (urlLower.includes("spotify.com") || urlLower.includes("podcast")) contentType = "podcast";
  else if (urlLower.includes("github.com")) contentType = "github";

  const contextParts = [
    `URL: ${url}`,
    title ? `Title: ${title}` : null,
    description ? `Description: ${description}` : null,
    author ? `Author: ${author}` : null,
    publishDate ? `Published: ${publishDate}` : null,
    siteName ? `Site: ${siteName}` : null,
    articleContent ? `Content excerpt: ${articleContent}` : null,
  ].filter(Boolean);

  const typeInstructions = {
    linkedin: "This is a LinkedIn post. Summarize the key professional insight, announcement, or discussion point. Focus on the main value or takeaway.",
    tweet: "This is a Twitter/X post. Capture the core message, opinion, or news being shared in a clear, concise way.",
    video: "This is a video. Describe what the video is about, who created it, and what viewers will learn or experience.",
    podcast: "This is a podcast episode. Summarize the main topic, guests, or key themes discussed.",
    github: "This is a GitHub repository or discussion. Describe what the project does or what the discussion is about.",
    article: "This is an article or webpage. Extract the main topic, key argument, or primary information being presented.",
  };

  const prompt = [
    "You are an expert at creating highly accurate, informative summaries of web content.",
    "",
    "GOAL: Create both a descriptive title and a summary that help someone quickly understand what this content is about.",
    "",
    "Return a JSON object with this exact structure:",
    '{"title": "Descriptive title here", "summary": "Summary here"}',
    "",
    "TITLE INSTRUCTIONS:",
    "- Create a clear, specific title (5-12 words) that captures what this content is about",
    "- Include key specifics: main topic, person, product, or finding",
    "- Make it descriptive enough to identify the content later",
    "- Examples: 'Why Remote Work Increases Productivity' NOT 'Interesting Article'",
    "- Examples: 'OpenAI Launches GPT-5 with Video Capabilities' NOT 'Tech News'",
    "- Examples: 'Sarah Chen on Building AI Startups' NOT 'LinkedIn Post'",
    "",
    "SUMMARY INSTRUCTIONS:",
    "- Write 1-2 clear, specific sentences (max 60 words)",
    "- Focus on the MAIN point, insight, or value of the content",
    "- Include specific details: names, topics, key findings, or claims when available",
    "- For articles: summarize the main argument or key information",
    "- For posts: capture the key message or announcement",
    "- For videos/podcasts: describe the topic and what viewers/listeners will learn",
    "- Avoid generic phrases like 'this article discusses' - be direct and specific",
    "- If author is notable or relevant, mention them",
    "- Use the actual content excerpt when available for accuracy",
    "",
    typeInstructions[contentType],
    "",
    "CONTENT TO ANALYZE:",
    ...contextParts,
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
        { 
          role: "system", 
          content: "You are a professional content analyzer who creates accurate, specific, and helpful titles and summaries. You focus on extracting the core value and key details from content. Always return valid JSON."
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 250,
      temperature: 0.3,
    }),
    timeout: 15000, // 15 second timeout for better quality
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

  try {
    const parsed = JSON.parse(text);
    if (!parsed.title || !parsed.summary) {
      throw new Error("Missing required fields in OpenAI response");
    }
    return {
      title: parsed.title.trim(),
      summary: parsed.summary.trim(),
    };
  } catch (parseErr) {
    console.error("summarizeLink: Failed to parse OpenAI response:", text, parseErr);
    // Fallback to treating it as a plain summary
    return {
      title: title || "Saved Link",
      summary: text,
    };
  }
}
