import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html on root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Helper delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImagesFromPrompt(prompt) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // ✅ Create context with realistic user environment
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });

  const page = await context.newPage();

  try {
    // Log page console messages and errors for debugging
    page.on("console", msg => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", err => console.log("PAGE ERROR:", err));

    console.log("⏳ Navigating to AI image generator site...");
    await page.goto("https://perchance.org/ai-text-to-image-generator", {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    // Debug screenshot after page load
    const loadedScreenshot = path.join(__dirname, "debug_page_loaded.png");
    await page.screenshot({ path: loadedScreenshot, fullPage: true });
    console.log(`📸 Screenshot taken after page load. Here is screenshoturl: ${loadedScreenshot}`);

    const promptSelector = 'textarea.paragraph-input[data-name="description"]';
    const generateBtnSelector = "#generateButtonEl";
    const resultImgSelector = "#resultImgEl";

    console.log("⌛ Waiting for prompt input and generate button...");
    try {
      await page.waitForSelector(promptSelector, { timeout: 60000 });
      await page.waitForSelector(generateBtnSelector, { timeout: 60000 });
    } catch (error) {
      const timeoutScreenshot = path.join(__dirname, "debug_selector_timeout.png");
      console.log("⚠️ Selector timeout. Capturing page for inspection.");
      await page.screenshot({ path: timeoutScreenshot, fullPage: true });
      console.log(`⚠️ Selector timeout screenshot. Here is screenshoturl: ${timeoutScreenshot}`);
      throw error;
    }

    // Clear previous text and type new prompt like a real user
    await page.fill(promptSelector, "");
    await page.type(promptSelector, prompt, { delay: 50 }); // simulate typing with slight delay

    console.log(`▶ Clicking generate for prompt: "${prompt}"`);
    await page.click(generateBtnSelector);

    // Wait a short delay to allow image generation to begin
    await delay(3000);

    console.log("⬆️ Waiting for image result to appear...");
    const maxWaitTime = 120000; // 2 minutes
    const pollInterval = 5000; // check every 5 seconds
    const start = Date.now();

    let imageUrl = null;
    while (!imageUrl && (Date.now() - start) < maxWaitTime) {
      try {
        // Check if image has loaded with valid src
        imageUrl = await page.$eval(resultImgSelector, img => {
          if (img && img.src && img.src.startsWith("https")) {
            return img.src;
          }
          return null;
        });
      } catch {
        imageUrl = null; // Element not found yet
      }

      if (!imageUrl) {
        console.log("⏳ Image not ready yet, waiting...");
        await delay(pollInterval);
      }
    }

    if (!imageUrl) {
      const noImageScreenshot = path.join(__dirname, "debug_no_image.png");
      await page.screenshot({ path: noImageScreenshot, fullPage: true });
      console.log(`❌ No image generated after waiting. Here is screenshoturl: ${noImageScreenshot}`);
      throw new Error("No image generated after waiting.");
    }

    console.log(`✅ Generated image URL: ${imageUrl}`);
    return [imageUrl];

  } catch (err) {
    console.error("❌ Error during generation:", err);
    throw err;
  } finally {
    await browser.close();
  }
}

app.post("/generate", async (req, res) => {
  const prompt = req.body.prompt;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid prompt" });
  }

  try {
    const images = await generateImagesFromPrompt(prompt.trim());
    return res.json({ prompt, images });
  } catch (error) {
    console.error("🔥 Image generation error:", error);
    return res.status(500).json({
      error: "Failed to generate images",
      details: error.message || "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
