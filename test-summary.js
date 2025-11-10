#!/usr/bin/env node
/**
 * Test script to demonstrate enhanced link summarization
 * Usage: node test-summary.js [URL]
 */

import dotenv from "dotenv";
import { summarizeLink } from "./services/summarizeLink.js";

dotenv.config();

async function testSummarization(url) {
  if (!url) {
    console.error("❌ Usage: node test-summary.js [URL]");
    console.error("\nExample URLs to try:");
    console.error("  - https://www.nytimes.com/2024/01/15/technology/ai-artificial-intelligence.html");
    console.error("  - https://www.linkedin.com/posts/...");
    console.error("  - https://www.youtube.com/watch?v=...");
    console.error("  - https://github.com/microsoft/vscode");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not found in .env file");
    process.exit(1);
  }

  console.log("🔍 Analyzing URL:", url);
  console.log("━".repeat(80));
  console.log("");

  try {
    const startTime = Date.now();
    const result = await summarizeLink(url);
    const duration = Date.now() - startTime;

    console.log("✅ ANALYSIS COMPLETE");
    console.log("━".repeat(80));
    console.log("");
    console.log("📝 AI-Generated Title:");
    console.log(`   "${result.title}"`);
    console.log("");
    console.log("📄 Original Page Title:");
    console.log(`   "${result.pageTitle || 'N/A'}"`);
    console.log("");
    console.log("📋 AI-Generated Summary:");
    console.log(`   ${result.summary}`);
    console.log("");
    console.log("📊 Metadata:");
    console.log(`   • Description: ${result.description ? `"${result.description.slice(0, 100)}..."` : "N/A"}`);
    console.log("");
    console.log(`⏱️  Processing time: ${duration}ms`);
    console.log("");
    console.log("━".repeat(80));
    console.log("");
    console.log("💡 Key Improvements:");
    console.log("   ✓ Specific, descriptive title (not generic)");
    console.log("   ✓ Detailed summary with key information");
    console.log("   ✓ Content-aware analysis");
    console.log("");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("");
    console.error("Common issues:");
    console.error("  • Invalid or inaccessible URL");
    console.error("  • OpenAI API key not configured");
    console.error("  • Network connectivity issues");
    process.exit(1);
  }
}

// Get URL from command line args
const url = process.argv[2];
testSummarization(url);

