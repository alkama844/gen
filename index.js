import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function generateImagesFromPrompt(prompt) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Go to Perchance AI image generator
    await page.goto("https://perchance.org/ai-image-generator", { waitUntil: "networkidle" });

    // Wait for prompt input (textarea) and generate button
    const promptSelector = 'textarea[aria-label="Prompt"]';
    const generateBtnSelector = "button.btn.btn-primary.submit-button";

    await page.waitForSelector(promptSelector, { timeout: 30000 });
    await page.waitForSelector(generateBtnSelector, { timeout: 30000 });

    // Fill prompt
    await page.fill(promptSelector, prompt);

    // Click generate
    await page.click(generateBtnSelector);

    // Wait for images to appear — selector based on site HTML
    await page.waitForSelector(".image-container img", { timeout: 120000 });

    // Extract all image URLs
    const imageUrls = await page.$$eval(".image-container img", imgs =>
      imgs.map(img => img.src).filter(src => src.startsWith("https"))
    );

    if (imageUrls.length === 0) {
      throw new Error("No images generated");
    }

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
    const images = await generateImagesFromPrompt(prompt.trim());
    return res.json({ prompt, images });
  } catch (error) {
    console.error("Image generation error:", error);
    return res.status(500).json({ error: "Failed to generate images", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
