import fetch from "node-fetch";

/**
 * Analyzes message content using OpenAI to detect category, title, and tags.
 * @param {string} content - The message content to analyze.
 * @returns {Promise<{ category: string, title: string, tags: string[] }>}
 */
export async function detectCategory(content) {
  if (!content) throw new Error("detectCategory: content is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("detectCategory: OPENAI_API_KEY missing");

  const trimmed = content.trim();

  // Check for optional prefix format like "book: Harry Potter"
  const prefixMatch = trimmed.match(/^([a-z\s]+):\s*(.+)$/i);
  let categoryHint = null;
  let actualContent = trimmed;

  if (prefixMatch) {
    categoryHint = prefixMatch[1].trim();
    actualContent = prefixMatch[2].trim();
  }

  const result = await analyzeWithOpenAI(actualContent, categoryHint);
  return result;
}

async function analyzeWithOpenAI(content, categoryHint) {
  const prompt = [
    "You are a smart categorization assistant that helps organize user messages into appropriate buckets.",
    "Analyze the user's message and return ONLY a valid JSON object with this exact structure:",
    '{"category": "Category Name", "title": "Clean title", "tags": ["tag1", "tag2"]}',
    "",
    "Category guidelines:",
    "- Books: book titles, reading recommendations",
    "- Movies: movie titles, film recommendations",
    "- TV Shows: series, show recommendations",
    "- Restaurants: restaurant names, food places, dining recommendations",
    "- Recipes: cooking instructions, recipe ideas",
    "- Gift Ideas: gift suggestions, present ideas",
    "- Travel: travel destinations, trip ideas, places to visit",
    "- Music: songs, albums, artists, playlists",
    "- Podcasts: podcast episodes, podcast recommendations",
    "- Articles: article ideas, writing topics, blog post ideas",
    "- Products: product recommendations, things to buy",
    "- Events: events, conferences, meetups, webinars",
    "- Courses: online courses, learning resources, classes",
    "- Tools: software tools, apps, services",
    "- Quotes: inspirational quotes, memorable sayings",
    "- Notes: general thoughts, reminders, anything that doesn't fit other categories",
    "",
    "Rules:",
    "- Use title case for category names (e.g., 'Gift Ideas', not 'gift ideas')",
    "- Keep titles clean and concise (under 100 characters)",
    "- Include 1-3 relevant tags",
    "- If unsure, use 'Notes' category",
    categoryHint ? `- User suggested category: "${categoryHint}"` : "",
    "",
    `User message: "${content}"`,
  ]
    .filter(line => line !== "")
    .join("\n");

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
          content: "You are a categorization expert. Always return valid JSON with category, title, and tags fields.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.3,
    }),
    timeout: 10000,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`❌ detectCategory: OpenAI request failed (${resp.status}): ${errText}`);
    // Fallback to Notes category
    return {
      category: "Notes",
      title: content.slice(0, 60) || "Untitled",
      tags: ["note", "whatsapp"],
    };
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    console.error("detectCategory: Unexpected OpenAI payload", JSON.stringify(data, null, 2));
    // Fallback to Notes category
    return {
      category: "Notes",
      title: content.slice(0, 60) || "Untitled",
      tags: ["note", "whatsapp"],
    };
  }

  try {
    const parsed = JSON.parse(text);
    
    // Validate the structure
    if (!parsed.category || !parsed.title) {
      throw new Error("Missing required fields");
    }

    return {
      category: parsed.category,
      title: parsed.title,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ["whatsapp"],
    };
  } catch (parseErr) {
    console.error("detectCategory: Failed to parse OpenAI response:", text, parseErr);
    // Fallback to Notes category
    return {
      category: "Notes",
      title: content.slice(0, 60) || "Untitled",
      tags: ["note", "whatsapp"],
    };
  }
}

