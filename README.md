# WhatsApp Webhook Link Saver

A WhatsApp webhook that saves links, notes, and screenshots to Base44 with automatic categorization and enrichment.

## 🚀 Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables** (create `.env` file):
   ```env
   BASE44_API_URL=your_base44_notes_api_url
   BASE44_ENTITY_URL=your_base44_entities_api_url
   BASE44_API_KEY=your_base44_api_key
   APP_TIMEZONE=America/New_York
   PORT=3000
   
   # For AI-powered link summarization and category detection
   OPENAI_API_KEY=your_openai_api_key
   
   # For screenshot uploads (optional)
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud
   CLOUDINARY_API_KEY=your_cloudinary_key
   CLOUDINARY_API_SECRET=your_cloudinary_secret
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Expose webhook to internet** (for WhatsApp integration):
   ```bash
   ngrok http 3000
   ```

5. **Configure Twilio/WhatsApp** to send messages to:
   ```
   https://your-domain.com/api/whatsapp-webhook
   ```

## 📱 WhatsApp Commands

### User Registration
Register yourself so your name appears with saved items:
```
register Your Name
```
Example: `register Adam Weiss`

### Saving Content

#### 1. **Save Links with AI-Powered Summarization** 🤖
Just send any URL and it will be automatically analyzed, summarized, and categorized with intelligent titles:

```
https://www.linkedin.com/posts/example
https://www.youtube.com/watch?v=example
https://twitter.com/user/status/example
```

**🚀 Enhanced with AI:**
- ✨ **Smart Titles** - Descriptive titles that capture what the content is actually about (not just "LinkedIn Post")
- 📝 **Detailed Summaries** - AI reads the actual content and creates specific, informative summaries
- 🎯 **Content-Aware** - Different analysis strategies for articles, videos, posts, and podcasts
- 🔍 **Rich Metadata** - Extracts author, publish date, and key content from pages

**Example outputs:**
- Instead of: "LinkedIn update"
  - **You get:** "Sarah Chen on Building AI Startups in 2024"
- Instead of: "Video highlight"
  - **You get:** "How to Build a REST API in Node.js - Complete Tutorial"
- Instead of: "News article"
  - **You get:** "Why Remote Work Increases Developer Productivity by 20%"

**Automatic categories:**
- 📎 **LinkedIn Posts** - LinkedIn links
- 🎥 **Videos** - YouTube videos
- 🎙️ **Podcasts** - Spotify, Apple Podcasts
- 📰 **News Articles** - NYT, WSJ, BBC, CNN, Reuters, Bloomberg
- 📱 **Social** - Twitter/X, Facebook, Instagram, TikTok
- 📁 **Other** - Everything else

#### 2. **Save Notes with AI Category Detection** 🤖
Send any text message without a URL and AI will automatically detect the category and organize it into the appropriate bucket:

**Simple messages:**
```
Harry Potter
Inception
The Italian place on Main Street
```

**With optional category prefix:**
```
book: The Great Gatsby
movie: The Godfather
gift idea: wireless headphones for dad
restaurant: That new sushi spot downtown
```

**AI-detected categories include:**
- 📚 **Books** - book titles, reading recommendations
- 🎬 **Movies** - movie titles, film recommendations
- 📺 **TV Shows** - series, show recommendations
- 🍽️ **Restaurants** - restaurant names, dining recommendations
- 🍳 **Recipes** - cooking ideas, recipe suggestions
- 🎁 **Gift Ideas** - gift suggestions, present ideas
- ✈️ **Travel** - destinations, trip ideas, places to visit
- 🎵 **Music** - songs, albums, artists
- 🎙️ **Podcasts** - podcast episodes, recommendations
- 📝 **Articles** - article ideas, writing topics
- 🛒 **Products** - product recommendations, things to buy
- 📅 **Events** - conferences, meetups, webinars
- 📖 **Courses** - online courses, learning resources
- 🔧 **Tools** - software tools, apps, services
- 💭 **Quotes** - inspirational quotes, sayings
- 📋 **Notes** - general thoughts, anything else

**Example responses:**
- Send: `Harry Potter` → Response: `✅ Saved to Books: Harry Potter`
- Send: `gift idea: noise-canceling headphones` → Response: `✅ Saved to Gift Ideas: Noise-canceling headphones`
- Send: `Try that new Thai restaurant` → Response: `✅ Saved to Restaurants: That new Thai restaurant`

#### 3. **Save Screenshots**
Send any image with optional caption:
```
[Attach image] Optional caption here
```

### Viewing Content

#### **Show Inbox**
View the first 5 items in your inbox with summaries:
```
show
```

#### **View Recent Saves**
See your last 10 saved items grouped by category with timestamps:
```
recent
```
or
```
last
```

**Example output:**
```
🕒 Last 10 saves:

📁 LinkedIn Posts (3)
  • LinkedIn update (LinkedIn) · Adam [2m ago]
  • Job opportunity (LinkedIn) · Adam [15m ago]
  • LinkedIn update (LinkedIn) · Adam [1h ago]

📁 Videos (2)
  • Video highlight (YouTube) · Adam [3h ago]
  • Video highlight (YouTube) · Adam [5h ago]

📁 Notes (1)
  • Quick reminder (WhatsApp Note) · Adam [just now]
```

### Managing Content

#### **Clear Inbox**
Delete all content from your inbox:
```
clear
```

#### **Show & Clear**
View inbox then automatically clear it:
```
show & clear
```

## 🏗️ Architecture

### Main Components

- **`server.js`** - Express webhook server and main logic
- **`services/detectCategory.js`** - AI-powered category detection for messages
- **`services/summarizeLink.js`** - AI-powered link summarization
- **`services/downloadTwilioMedia.js`** - Download media from Twilio
- **`services/uploadToCloudinary.js`** - Upload images to Cloudinary

### Link Processing Pipeline

1. **Receive WhatsApp message** → Extract URL
2. **Clean URL** → Normalize LinkedIn/shortened URLs
3. **Fetch metadata** → Get page title
4. **Summarize** → AI summary of content (optional)
5. **Categorize** → Auto-assign to bucket
6. **Tag** → Add platform tags
7. **Save to Base44** → Store with enriched metadata

### Message Processing Pipeline (AI Category Detection)

1. **Receive WhatsApp message** → Extract text content
2. **AI Analysis** → OpenAI analyzes message to detect category type
3. **Extract prefix** → Check for optional category hints (e.g., "book: ...")
4. **Generate metadata** → AI creates clean title and relevant tags
5. **Fallback handling** → Use "Notes" category if AI detection fails
6. **Save to Base44** → Store in detected category bucket

### User Management

Users are stored in Base44 as entities with `type: "user"`. The webhook:
- Loads all registered users on startup
- Caches name mappings in memory
- Allows updates via `register` command
- Tags all saves with user's name

## 🔌 API Endpoints

### WhatsApp Webhook
```
POST /api/whatsapp-webhook
```
Main webhook endpoint for receiving WhatsApp messages.

### Link Management
```
GET  /links?status=inbox&category=Videos
GET  /links/summary
POST /links/:id/archive
POST /links/:id/unarchive
POST /links/:id/viewed
```

## 🛠️ Development

### Local Testing
```bash
# Start with auto-reload
node --watch server.js

# Test with curl
curl -X POST http://localhost:3000/api/whatsapp-webhook \
  -d "From=whatsapp:+1234567890" \
  -d "Body=https://example.com"
```

### Testing Enhanced Link Summarization
Test the AI-powered summarization directly with any URL:

```bash
# Test with any public URL
node test-summary.js https://www.nytimes.com/2024/01/15/technology/ai.html
node test-summary.js https://www.youtube.com/watch?v=dQw4w9WgXcQ
node test-summary.js https://github.com/microsoft/vscode

# You'll see:
# ✅ ANALYSIS COMPLETE
# 📝 AI-Generated Title: "Microsoft's Visual Studio Code - Free Code Editor"
# 📄 Original Page Title: "Visual Studio Code - Code Editing. Redefined"
# 📋 AI-Generated Summary: "Open-source code editor by Microsoft..."
```

The test script demonstrates:
- Specific, descriptive AI-generated titles
- Detailed summaries with key information
- Content-aware analysis for different types of links
- Processing time and metadata extraction

See `ENHANCEMENTS.md` for detailed information about the improvements.

### Code Style
- Modern ES modules (`type: "module"`)
- Two-space indentation
- Single quotes in template literals
- Descriptive camelCase for functions

## 📝 Recent Updates

- ✨ **Enhanced AI link summarization** - Major upgrade with descriptive titles, detailed summaries, content extraction, and content-type-aware analysis (see `ENHANCEMENTS.md`)
- ✅ **AI-powered category detection** - Automatically organizes messages into smart buckets (Books, Movies, Restaurants, Gift Ideas, etc.)
- ✅ Added `recent`/`last` command to view recent saves grouped by category
- ✅ Added timestamps showing how long ago items were saved
- ✅ Support for screenshots via Cloudinary
- ✅ User registration and tracking

## 🔐 Security Notes

- Never commit `.env` files or API keys
- Rotate keys after sharing test endpoints
- Clean up stale ngrok tunnels
- Sensitive data is not logged

## 📦 Dependencies

- `express` - Web framework
- `body-parser` - Parse incoming requests
- `dotenv` - Environment configuration
- `node-fetch` - HTTP requests
- `jsdom` - HTML parsing
- `cloudinary` - Image hosting

## 🤝 Contributing

1. Keep commit messages short and imperative (<72 chars)
2. Request review before merging
3. Document environment/config changes
4. Include screenshots for webhook behavior changes
