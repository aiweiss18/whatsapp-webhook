import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch"; // for fetching webpage titles
import { JSDOM } from "jsdom"; // parse HTML
import { summarizeLink } from "./services/summarizeLink.js";
import { downloadTwilioMedia } from "./services/downloadTwilioMedia.js";
import { uploadBufferToCloudinary } from "./services/uploadToCloudinary.js";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const urlRegex = /(https?:\/\/[^\s]+)/i;

const NOTE_PREFIXES = {
  todo: "todo",
  note: "note",
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseIncomingMessage(rawBody) {
  const trimmed = (rawBody || "").trim();
  if (!trimmed) {
    return { tag: "note", content: "" };
  }

  const prefixMatch = trimmed.match(/^(todo|note):\s*/i);
  if (!prefixMatch) {
    return { tag: "note", content: trimmed };
  }

  const matchedPrefix = prefixMatch[1].toLowerCase();
  const remaining = trimmed.slice(prefixMatch[0].length).trim();
  return {
    tag: NOTE_PREFIXES[matchedPrefix] || "note",
    content: remaining || trimmed,
  };
}

async function sendNoteToBase44({ content, tag }) {
  if (!process.env.BASE44_API_URL) {
    throw new Error("BASE44_API_URL is not configured");
  }
  if (!process.env.BASE44_API_KEY) {
    throw new Error("BASE44_API_KEY is not configured");
  }

  const payload = {
    content,
    source: "whatsapp",
    created_at: new Date().toISOString(),
    tags: [tag],
  };

  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BASE44_API_KEY}`,
    },
    body: JSON.stringify(payload),
  };

  const execute = async () => {
    const resp = await fetch(process.env.BASE44_API_URL, requestInit);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Base44 responded ${resp.status}: ${text}`);
    }
  };

  try {
    await execute();
  } catch (err) {
    console.warn("⚠️ Failed to send note to Base44, retrying in 5s:", err.message);
    await delay(5000);
    await execute();
  }
}

const users = {};
const userRecords = new Map(); // whatsapp:number -> { id, name }

async function loadUserMappings() {
  if (!process.env.BASE44_ENTITY_URL || !process.env.BASE44_API_KEY) return;
  try {
    const resp = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "GET",
      headers: { api_key: process.env.BASE44_API_KEY },
    });
    const items = await resp.json();
    items
      .filter(item => item.type === "user" && item.savedByNumber)
      .forEach(item => {
        const name =
          item.name || item.title || item.summary || item.savedBy || item.savedByNumber;
        users[item.savedByNumber] = name;
        if (item.id) {
          userRecords.set(item.savedByNumber, { id: item.id, name });
        }
      });
    console.log(`✅ Loaded ${userRecords.size} registered WhatsApp users`);
  } catch (err) {
    console.warn("⚠️ Failed to load user mappings from Base44:", err);
  }
}

loadUserMappings();

async function upsertUser(number, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  const payload = {
    type: "user",
    savedByNumber: number,
    savedBy: trimmed,
    name: trimmed,
    title: trimmed,
    summary: `WhatsApp registration for ${trimmed}`,
    category: "Profiles",
    tags: ["user"],
    status: "profile",
    url: `https://whatsapp.me/${encodeURIComponent(number.replace("whatsapp:", ""))}`,
    timestamp: new Date().toISOString(),
  };

  if (!process.env.BASE44_ENTITY_URL || !process.env.BASE44_API_KEY) {
    throw new Error("Base44 credentials missing");
  }

  let data;
  const existing = userRecords.get(number);
  if (existing?.id) {
    const resp = await fetch(`${process.env.BASE44_ENTITY_URL}/${existing.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to update Base44 user (${resp.status}): ${text}`);
    }
    data = await resp.json();
  } else {
    const resp = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to create Base44 user (${resp.status}): ${text}`);
    }
    data = await resp.json();
    if (data?.id) {
      userRecords.set(number, { id: data.id, name: trimmed });
    }
  }

  users[number] = trimmed;
  return trimmed;
}

// 🟢 Helper: map WhatsApp sender to display name
function resolveSenderName(from) {
  if (!from) return "Unknown";
  return users[from] || from.replace("whatsapp:", "");
}

// 🟢 Helper: clean LinkedIn URLs
function cleanLinkedInUrl(url) {
  try {
    const u = new URL(url);

    // Case 1: If it's a feed/update/urn:li:activity link
    if (u.pathname.includes("/feed/update/urn:li:activity")) {
      const parts = u.pathname.split(":");
      const activityId = parts[parts.length - 1];
      if (activityId) {
        return `https://www.linkedin.com/feed/update/${activityId}`;
      }
    }

    // Case 2: Already a /posts/ link → leave it as-is
    if (u.pathname.includes("/posts/")) {
      return url;
    }

    return url;
  } catch (err) {
    return url;
  }
}

// 🟢 Helper: get page title with fallbacks
async function fetchPageTitle(url) {
  try {
    const resp = await fetch(url, { timeout: 5000 });
    const html = await resp.text();
    const dom = new JSDOM(html);
    const rawTitle = dom.window.document.querySelector("title")?.textContent;

    if (rawTitle && rawTitle.trim().length > 0) {
      return rawTitle.trim();
    }
  } catch {
    // Ignore errors and fall back
  }

  // Fallbacks based on domain
  if (url.includes("linkedin.com") || url.includes("lnkd.in")) return "LinkedIn Post";
  if (url.includes("twitter.com") || url.includes("x.com")) return "Twitter/X Post";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube Video";
  if (url.includes("spotify.com") || url.includes("podcasts.apple.com")) return "Podcast Episode";
  if (
    url.includes("nytimes.com") ||
    url.includes("wsj.com") ||
    url.includes("bbc.com") ||
    url.includes("cnn.com") ||
    url.includes("reuters.com") ||
    url.includes("bloomberg.com")
  )
    return "News Article";

  return "Saved Link"; // default fallback
}

// 🟢 Helper: generate tags
function generateTags(url) {
  const tags = [];
  if (url.includes("youtube.com")) tags.push("youtube");
  if (url.includes("spotify.com")) tags.push("podcast");
  if (url.includes("twitter.com") || url.includes("x.com")) tags.push("twitter");
  if (url.includes("linkedin.com") || url.includes("lnkd.in")) tags.push("linkedin");
  if (tags.length === 0) tags.push("unlabeled");
  return tags;
}

// 🟢 Helper: categorize link
function categorizeLink(url) {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com") || u.includes("lnkd.in")) return "LinkedIn Posts";
  if (
    u.includes("twitter.com") ||
    u.includes("x.com") ||
    u.includes("facebook.com") ||
    u.includes("tiktok.com") ||
    u.includes("instagram.com")
  )
    return "Social";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "Videos";
  if (u.includes("spotify.com") || u.includes("podcasts.apple.com") || u.includes("podcast"))
    return "Podcasts";
  if (
    u.includes("nytimes.com") ||
    u.includes("wsj.com") ||
    u.includes("bbc.com") ||
    u.includes("cnn.com") ||
    u.includes("bloomberg.com") ||
    u.includes("reuters.com")
  )
    return "News Articles";
  return "Other";
}

// 🟢 Helper: determine source label
function determineSource(url) {
  try {
    const { hostname } = new URL(url);
    const normalized = hostname.replace(/^www\./, "");
    const mapping = {
      "x.com": "X",
      "twitter.com": "X",
      "linkedin.com": "LinkedIn",
      "lnkd.in": "LinkedIn",
      "facebook.com": "Facebook",
      "instagram.com": "Instagram",
      "tiktok.com": "TikTok",
      "youtube.com": "YouTube",
      "youtu.be": "YouTube",
      "spotify.com": "Spotify",
      "podcasts.apple.com": "Apple Podcasts",
      "nytimes.com": "The New York Times",
      "wsj.com": "The Wall Street Journal",
      "bbc.com": "BBC",
      "cnn.com": "CNN",
      "bloomberg.com": "Bloomberg",
      "reuters.com": "Reuters",
    };
    if (mapping[normalized]) return mapping[normalized];

    const base = normalized.split(".")[0];
    if (!base) return "Unknown";
    return base.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return "Unknown";
  }
}

// 🟢 Helper: generate short title
function generateLinkTitle(category, summaryText) {
  const normalizedSummary = summaryText?.toLowerCase() || "";

  if (normalizedSummary.includes("job") || normalizedSummary.includes("hiring"))
    return "Job opportunity";
  if (normalizedSummary.includes("webinar") || normalizedSummary.includes("event"))
    return "Event highlight";
  if (normalizedSummary.includes("podcast") || normalizedSummary.includes("episode"))
    return "Podcast episode";
  if (normalizedSummary.includes("video") || normalizedSummary.includes("clip"))
    return "Video highlight";
  if (normalizedSummary.includes("news") || normalizedSummary.includes("report"))
    return "News article";

  const categoryMap = {
    "LinkedIn Posts": "LinkedIn update",
    Social: "Social update",
    Videos: "Video highlight",
    Podcasts: "Podcast episode",
    "News Articles": "News article",
    Other: "Saved link",
  };

  return categoryMap[category] || "Saved link";
}

app.post("/whatsapp-webhook", async (req, res) => {
  try {
    const { tag, content } = parseIncomingMessage(req.body.Body);

    if (!content) {
      console.warn("⚠️ Received WhatsApp message with no body");
      return res
        .status(400)
        .send("<Response><Message>Message body is required.</Message></Response>");
    }

    await sendNoteToBase44({ content, tag });

    return res
      .status(200)
      .send("<Response><Message>✅ Saved your note to Base44.</Message></Response>");
  } catch (err) {
    console.error("❌ Failed to forward WhatsApp message to Base44:", err);
    return res
      .status(502)
      .send("<Response><Message>⚠️ Could not save your note. Try again later.</Message></Response>");
  }
});

// 🟢 WhatsApp webhook
app.post("/api/whatsapp-webhook", async (req, res) => {
  const from = req.body.From;
  const body = (req.body.Body || "").trim();
  const savedBy = resolveSenderName(from);
  const numMedia = Number(req.body.NumMedia || 0);

  console.log(`📩 Message from ${from}: ${body}`);

  if (body.toLowerCase().startsWith("register")) {
    const name = body.slice("register".length).trim();
    if (!name) {
      return res.send(
        "<Response><Message>ℹ️ Send `register Your Name` so I know who you are.</Message></Response>"
      );
    }
    try {
      const savedName = await upsertUser(from, name);
      console.log(`✅ Registered ${from} as ${savedName}`);
      return res.send(
        `<Response><Message>👍 Thanks ${savedName}! I’ll tag future saves with your name.</Message></Response>`
      );
    } catch (err) {
      console.error("❌ Failed to register user:", err);
      return res.send("<Response><Message>⚠️ Could not save your name. Try again later.</Message></Response>");
    }
  }

  if (numMedia > 0) {
    try {
      const caption = body || "";
      const mediaResults = [];

      for (let idx = 0; idx < numMedia; idx += 1) {
        const mediaUrl = req.body[`MediaUrl${idx}`];
        const mediaContentType = req.body[`MediaContentType${idx}`] || "image/jpeg";
        const { buffer } = await downloadTwilioMedia(mediaUrl);
        const upload = await uploadBufferToCloudinary(buffer, {
          filename: `whatsapp-media-${Date.now()}-${idx}`,
          contentType: mediaContentType,
        });
        mediaResults.push({
          secureUrl: upload.secure_url,
          contentType: mediaContentType,
        });
      }

      await Promise.all(
        mediaResults.map((media, idx) =>
          fetch(process.env.BASE44_ENTITY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              api_key: process.env.BASE44_API_KEY,
            },
            body: JSON.stringify({
              title: caption || "Screenshot",
              pageTitle: `Screenshot ${idx + 1}`,
              url: media.secureUrl,
              type: "image",
              tags: ["screenshot"],
              category: "Screenshots",
              status: "inbox",
              timestamp: new Date().toISOString(),
              summary: caption || `Screenshot shared by ${savedBy}`,
              source: "Screenshot",
              savedBy,
              savedByNumber: from,
              mediaType: media.contentType,
            }),
          })
        )
      );

      const plural = mediaResults.length > 1 ? "screenshots" : "screenshot";
      return res.send(
        `<Response><Message>🖼️ Saved ${mediaResults.length} ${plural} for ${savedBy}${
          caption ? `\nCaption: ${caption}` : ""
        }</Message></Response>`
      );
    } catch (err) {
      console.error("❌ Error processing media:", err);
      return res.send("<Response><Message>⚠️ Failed to save screenshot.</Message></Response>");
    }
  }

  // ⚡ SHOW CONTENT
  if (body.toLowerCase() === "show" || body.toLowerCase() === "show & clear") {
    try {
      const resp = await fetch(process.env.BASE44_ENTITY_URL, {
        method: "GET",
        headers: { api_key: process.env.BASE44_API_KEY },
      });
      const items = await resp.json();

      if (!items.length) {
        return res.send("<Response><Message>📭 Inbox is empty</Message></Response>");
      }

      const filteredItems = items.filter(i => i.type !== "user");
      const preview = filteredItems
        .slice(0, 5)
        .map(i => {
          const tagsLabel = (i.tags || []).join(", ");
          const contributor = i.savedBy || "Unknown";
          const baseLine = `- ${i.title || "Untitled"} — ${i.source || "Unknown"} (${i.category || "Other"})${tagsLabel ? ` [${tagsLabel}]` : ""} · by ${contributor}`;
          if (i.summary) {
            const snippet = i.summary.length > 100 ? `${i.summary.slice(0, 97)}…` : i.summary;
            return `${baseLine}\n    ↳ ${snippet}`;
          }
          return baseLine;
        })
        .join("\n\n");

      if (body.toLowerCase() === "show & clear") {
        await fetch(process.env.BASE44_ENTITY_URL, {
          method: "DELETE",
          headers: { api_key: process.env.BASE44_API_KEY },
        });
        return res.send(
          `<Response><Message>📋 Inbox:\n${preview}\n\n🗑️ Cleared after viewing</Message></Response>`
        );
      }

      return res.send(`<Response><Message>📋 Inbox:\n${preview}</Message></Response>`);
    } catch (err) {
      console.error("❌ Error fetching inbox:", err);
      return res.send("<Response><Message>⚠️ Could not fetch inbox</Message></Response>");
    }
  }

  // ⚡ CLEAR CONTENT (manual)
  if (body.toLowerCase() === "clear") {
    try {
      const resp = await fetch(process.env.BASE44_ENTITY_URL, {
        method: "DELETE",
        headers: { api_key: process.env.BASE44_API_KEY },
      });
      console.log("🗑️ All content cleared:", resp.status);
      return res.send("<Response><Message>🗑️ Content Inbox cleared</Message></Response>");
    } catch (err) {
      console.error("❌ Error clearing content:", err);
      return res.send("<Response><Message>⚠️ Failed to clear content</Message></Response>");
    }
  }

  // ⚡ SAVE TEXT MESSAGE AS NOTE (for messages without URLs)
  const match = body.match(urlRegex);
  
  // If message contains text but no URL, save as a note
  if (!match && body && body.trim().length > 0) {
    try {
      const title = body.slice(0, 60) || "Untitled";
      const payload = {
        title,
        pageTitle: title,
        summary: body,
        content: body,
        url: `https://whatsapp.local/${encodeURIComponent(title.replace(/\s+/g, "-").toLowerCase())}`,
        type: "note",
        status: "inbox",
        timestamp: new Date().toISOString(),
        tags: ["whatsapp", "note"],
        category: "Notes",
        savedBy,
        savedByNumber: from,
        source: "WhatsApp Note",
      };

      const response = await fetch(process.env.BASE44_ENTITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: process.env.BASE44_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Base44 API returned ${response.status}:`, errorText);
        console.error("❌ Payload that failed:", JSON.stringify(payload, null, 2));
        throw new Error(`Base44 API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("✅ Note saved to Base44:", JSON.stringify(data, null, 2));

      return res.send("<Response><Message>✅ Message saved to Base44.</Message></Response>");
    } catch (err) {
      console.error("❌ Error saving note to Base44:", err.message);
      return res.send("<Response><Message>⚠️ Error saving message.</Message></Response>");
    }
  }

  // ⚡ SAVE LINK (if URL is found)
  if (!match) {
    // Empty message or no URL found
    return res.send("<Response><Message>⚠️ Please send a message or link.</Message></Response>");
  }

  const link = match[0];
  const cleanedLink = link.includes("linkedin.com") ? cleanLinkedInUrl(link) : link;

  try {
    let summaryPayload = null;
    try {
      summaryPayload = await summarizeLink(cleanedLink);
    } catch (summaryErr) {
      console.warn("⚠️ summarizeLink failed, continuing without summary:", summaryErr);
    }

    const title = summaryPayload?.title || (await fetchPageTitle(cleanedLink));
    const tags = generateTags(cleanedLink);
    const category = categorizeLink(cleanedLink);
    const summary = summaryPayload?.summary || null;
    const shortTitle = generateLinkTitle(category, summary);
    const source = determineSource(cleanedLink);

    const response = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify({
        title: shortTitle,
        pageTitle: title,
        url: cleanedLink, // ✅ use cleaned link here
        type: "link",
        tags,
        category,
        status: "inbox", // ✅ new: default to inbox
        timestamp: new Date().toISOString(),
        summary,
        source,
        savedBy,
        savedByNumber: from,
      }),
    });

    const data = await response.json();
    console.log("✅ Base44 saved:", JSON.stringify(data, null, 2));

    return res.send(`<Response><Message>📌 Saved: ${title}</Message></Response>`);
  } catch (err) {
    console.error("❌ Error saving to Base44:", err);
    return res.send("<Response><Message>⚠️ Error saving content.</Message></Response>");
  }
});

// =============================
// 🟢 Extra API routes for Base44 UI
// =============================

// Get all links (optionally filter by status/category)
app.get("/links", async (req, res) => {
  try {
    const { status, category } = req.query;
    const resp = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "GET",
      headers: { api_key: process.env.BASE44_API_KEY },
    });
    let items = await resp.json();
    items = items.filter(i => i.type !== "user");

    if (status) items = items.filter(i => i.status === status);
    if (category) items = items.filter(i => i.category === category);

    res.json(items);
  } catch (err) {
    console.error("❌ Error fetching links:", err);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

// Get summary counts by category
app.get("/links/summary", async (req, res) => {
  try {
    const resp = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "GET",
      headers: { api_key: process.env.BASE44_API_KEY },
    });
    const items = (await resp.json()).filter(i => i.type !== "user");

    const summary = {};
    items.forEach(i => {
      const cat = i.category || "Other";
      summary[cat] = (summary[cat] || 0) + 1;
    });

    res.json(summary);
  } catch (err) {
    console.error("❌ Error building summary:", err);
    res.status(500).json({ error: "Failed to build summary" });
  }
});

// Archive a link
app.post("/links/:id/archive", async (req, res) => {
  try {
    const resp = await fetch(`${process.env.BASE44_ENTITY_URL}/${req.params.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify({ status: "archived" }),
    });
    res.json(await resp.json());
  } catch (err) {
    console.error("❌ Error archiving:", err);
    res.status(500).json({ error: "Failed to archive" });
  }
});

// Unarchive a link
app.post("/links/:id/unarchive", async (req, res) => {
  try {
    const resp = await fetch(`${process.env.BASE44_ENTITY_URL}/${req.params.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify({ status: "inbox" }),
    });
    res.json(await resp.json());
  } catch (err) {
    console.error("❌ Error unarchiving:", err);
    res.status(500).json({ error: "Failed to unarchive" });
  }
});

// Mark link as viewed
app.post("/links/:id/viewed", async (req, res) => {
  try {
    const resp = await fetch(`${process.env.BASE44_ENTITY_URL}/${req.params.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify({ viewedAt: new Date().toISOString() }),
    });
    res.json(await resp.json());
  } catch (err) {
    console.error("❌ Error marking viewed:", err);
    res.status(500).json({ error: "Failed to mark viewed" });
  }
});

app.listen(3000, () => {
  console.log("🚀 Webhook server running on port 3000");
});
