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

  try {
    const page = await browser.newPage();

    console.log("⏳ Navigating to AI image generator site...");
    await page.goto("https://perchance.org/ai-text-to-image-generator", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    const promptSelector = 'textarea.paragraph-input[data-name="description"]';
    const generateBtnSelector = "#generateButtonEl";
    const resultImgSelector = "#resultImgEl";

    console.log("⌛ Waiting for prompt input and generate button...");
    await page.waitForSelector(promptSelector, { timeout: 30000 });
    await page.waitForSelector(generateBtnSelector, { timeout: 30000 });

    // Clear previous text and type new prompt
    await page.fill(promptSelector, "");
    await page.type(promptSelector, prompt);

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
        // Element not found yet
        imageUrl = null;
      }

      if (!imageUrl) {
        console.log("⏳ Image not ready yet, waiting...");
        await delay(pollInterval);
      }
    }

    if (!imageUrl) {
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
