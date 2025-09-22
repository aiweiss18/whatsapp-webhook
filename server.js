import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch"; // for fetching webpage titles
import { JSDOM } from "jsdom"; // parse HTML

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const urlRegex = /(https?:\/\/[^\s]+)/i;

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

// 🟢 WhatsApp webhook
app.post("/api/whatsapp-webhook", async (req, res) => {
  const from = req.body.From;
  const body = (req.body.Body || "").trim();

  console.log(`📩 Message from ${from}: ${body}`);

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

      const preview = items
        .slice(0, 5)
        .map(
          (i) =>
            `- ${i.title || "Untitled"} (${i.category || "Other"}) [${(i.tags || []).join(", ")}]`
        )
        .join("\n");

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

  // ⚡ SAVE LINK
  const match = body.match(urlRegex);
  if (!match) {
    return res.send("<Response><Message>⚠️ Please send a link.</Message></Response>");
  }

  const link = match[0];
  const cleanedLink = link.includes("linkedin.com") ? cleanLinkedInUrl(link) : link;

  try {
    const title = await fetchPageTitle(cleanedLink);
    const tags = generateTags(cleanedLink);
    const category = categorizeLink(cleanedLink);

    const response = await fetch(process.env.BASE44_ENTITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: process.env.BASE44_API_KEY,
      },
      body: JSON.stringify({
        title,
        url: cleanedLink, // ✅ use cleaned link here
        type: "link",
        tags,
        category,
        timestamp: new Date().toISOString(),
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

app.listen(3000, () => {
  console.log("🚀 Webhook server running on port 3000");
});
