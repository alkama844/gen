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

// Optional concurrency limit (uncomment and adapt if needed)
// import pLimit from 'p-limit';
// const limit = pLimit(2); // max 2 concurrent requests

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
      timeout: 120000, // increased timeout to 2 minutes
    });

    const promptSelector = 'textarea[aria-label="Prompt"]';
    const generateBtnSelector = "button.btn.btn-primary.submit-button";

    console.log("⌛ Waiting for prompt input and generate button...");
    await page.waitForSelector(promptSelector, { timeout: 30000 });
    await page.waitForSelector(generateBtnSelector, { timeout: 30000 });

    // Clear previous text, then type new prompt
    await page.fill(promptSelector, "");
    await page.type(promptSelector, prompt);

    console.log(`▶ Clicking generate for prompt: "${prompt}"`);
    await page.click(generateBtnSelector);

    // Wait a short delay after clicking generate for images to start loading
    await delay(3000);

    // Wait for images to appear with a generous timeout
    await page.waitForSelector(".image-container img", { timeout: 120000 });

    // Extract image URLs (filter and dedupe)
    const imageUrls = await page.$$eval(".image-container img", imgs =>
      [...new Set(imgs.map(img => img.src).filter(src => src.startsWith("https")))]
    );

    if (imageUrls.length === 0) {
      throw new Error("No images generated after waiting.");
    }

    console.log(`✅ Generated ${imageUrls.length} images.`);
    return imageUrls;
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
    // If concurrency limiting is needed:
    // const images = await limit(() => generateImagesFromPrompt(prompt.trim()));
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
