import { test, expect, Page } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// Helper to generate random URLs
function generateRandomUrl(): string {
  const domains = ['example.com', 'test.org', 'sample.net', 'demo.io'];
  const paths = ['page', 'article', 'product', 'user', 'item'];
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  const randomPath = paths[Math.floor(Math.random() * paths.length)];
  const randomId = Math.floor(Math.random() * 10000);
  return `https://${randomDomain}/${randomPath}/${randomId}`;
}

// Helper to decode QR code using zbarimg
async function decodeQRCode(imagePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`zbarimg -q --raw ${imagePath}`);
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to decode QR code: ${error}`);
  }
}

// Helper to save SVG and convert to PNG for decoding
async function saveSvgAsPng(svgContent: string, outputPath: string): Promise<void> {
  const svgPath = outputPath.replace('.png', '.svg');
  fs.writeFileSync(svgPath, svgContent);
  
  // Use rsvg-convert to convert SVG to PNG
  await execAsync(`rsvg-convert -w 512 -h 512 ${svgPath} -o ${outputPath}`);
}

// Ensure test-downloads directory exists
const testDownloadsDir = path.join(process.cwd(), 'test-downloads');

test.beforeAll(async () => {
  if (!fs.existsSync(testDownloadsDir)) {
    fs.mkdirSync(testDownloadsDir, { recursive: true });
  }
});

test.describe('QR Code Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct elements', async ({ page }) => {
    // Check for main elements
    await expect(page.locator('h1')).toContainText('QR Code Generator');
    await expect(page.locator('#url-input')).toBeVisible();
    await expect(page.locator('#qr-code')).toBeVisible();
    await expect(page.locator('#copy-btn')).toBeVisible();
    await expect(page.locator('#save-btn')).toBeVisible();
    await expect(page.locator('#format-select')).toBeVisible();
  });

  test('buttons are disabled initially', async ({ page }) => {
    await expect(page.locator('#copy-btn')).toBeDisabled();
    await expect(page.locator('#save-btn')).toBeDisabled();
  });

  test('generates QR code when URL is entered', async ({ page }) => {
    const testUrl = 'https://example.com/test';
    
    await page.fill('#url-input', testUrl);
    
    // Wait for QR code SVG to be generated
    const svg = page.locator('#qr-code svg');
    await expect(svg).toBeVisible({ timeout: 5000 });
    
    // Buttons should now be enabled
    await expect(page.locator('#copy-btn')).toBeEnabled();
    await expect(page.locator('#save-btn')).toBeEnabled();
  });

  test('format dropdown has all options', async ({ page }) => {
    const formatSelect = page.locator('#format-select');
    
    const options = await formatSelect.locator('option').allTextContents();
    expect(options).toContain('SVG');
    expect(options).toContain('PNG');
    expect(options).toContain('JPG');
    expect(options).toContain('PDF');
  });

  test('QR code displays correctly on page and decodes to correct URL', async ({ page }) => {
    const testUrl = generateRandomUrl();
    
    // Enter URL and wait for QR code
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Get SVG content
    const svgContent = await page.locator('#qr-code').innerHTML();
    expect(svgContent).toContain('<svg');
    
    // Save SVG and convert to PNG for decoding
    const pngPath = path.join(testDownloadsDir, 'test-displayed-qr.png');
    await saveSvgAsPng(svgContent, pngPath);
    
    // Decode and verify
    const decodedUrl = await decodeQRCode(pngPath);
    expect(decodedUrl).toBe(testUrl);
  });

  test('copy button copies SVG to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    const testUrl = 'https://example.com/clipboard-test';
    
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Click copy button
    await page.click('#copy-btn');
    
    // Wait for notification
    await expect(page.locator('#notification')).toContainText('SVG copied');
    
    // Verify clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toContain('<svg');
  });

  test('download SVG format', async ({ page }) => {
    const testUrl = generateRandomUrl();
    
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Select SVG format
    await page.selectOption('#format-select', 'svg');
    
    // Set up download handler
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#save-btn')
    ]);
    
    // Save the file
    const filePath = path.join(testDownloadsDir, 'downloaded-qr.svg');
    await download.saveAs(filePath);
    
    // Verify file was downloaded and contains SVG
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('<svg');
    
    // Convert to PNG and decode
    const pngPath = path.join(testDownloadsDir, 'downloaded-qr-from-svg.png');
    await execAsync(`rsvg-convert -w 512 -h 512 ${filePath} -o ${pngPath}`);
    const decodedUrl = await decodeQRCode(pngPath);
    expect(decodedUrl).toBe(testUrl);
  });

  test('download PNG format', async ({ page }) => {
    const testUrl = generateRandomUrl();
    
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Select PNG format
    await page.selectOption('#format-select', 'png');
    
    // Set up download handler
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#save-btn')
    ]);
    
    // Save the file
    const filePath = path.join(testDownloadsDir, 'downloaded-qr.png');
    await download.saveAs(filePath);
    
    // Verify file exists and decode
    expect(fs.existsSync(filePath)).toBe(true);
    const decodedUrl = await decodeQRCode(filePath);
    expect(decodedUrl).toBe(testUrl);
  });

  test('download JPG format', async ({ page }) => {
    const testUrl = generateRandomUrl();
    
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Select JPG format
    await page.selectOption('#format-select', 'jpg');
    
    // Set up download handler
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#save-btn')
    ]);
    
    // Save the file
    const filePath = path.join(testDownloadsDir, 'downloaded-qr.jpg');
    await download.saveAs(filePath);
    
    // Verify file exists and decode
    expect(fs.existsSync(filePath)).toBe(true);
    const decodedUrl = await decodeQRCode(filePath);
    expect(decodedUrl).toBe(testUrl);
  });

  test('download PDF format', async ({ page }) => {
    const testUrl = generateRandomUrl();
    
    await page.fill('#url-input', testUrl);
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Select PDF format
    await page.selectOption('#format-select', 'pdf');
    
    // Set up download handler
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#save-btn')
    ]);
    
    // Save the file
    const filePath = path.join(testDownloadsDir, 'downloaded-qr.pdf');
    await download.saveAs(filePath);
    
    // Verify file exists
    expect(fs.existsSync(filePath)).toBe(true);
    
    // Convert PDF to PNG using pdftoppm
    const pngPrefix = path.join(testDownloadsDir, 'pdf-converted');
    await execAsync(`pdftoppm -png -r 300 ${filePath} ${pngPrefix}`);
    
    // pdftoppm creates files like pdf-converted-1.png
    const pngPath = `${pngPrefix}-1.png`;
    expect(fs.existsSync(pngPath)).toBe(true);
    
    // Decode and verify
    const decodedUrl = await decodeQRCode(pngPath);
    expect(decodedUrl).toBe(testUrl);
  });

  test('multiple random URLs decode correctly', async ({ page }) => {
    // Test with multiple random URLs
    for (let i = 0; i < 3; i++) {
      const testUrl = generateRandomUrl();
      const timestamp = Date.now();
      
      // Clear input first
      await page.fill('#url-input', '');
      await expect(page.locator('#qr-code .placeholder')).toBeVisible({ timeout: 5000 });
      
      // Enter new URL and wait for QR code
      await page.fill('#url-input', testUrl);
      await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
      
      // Get SVG content
      const svgContent = await page.locator('#qr-code').innerHTML();
      
      // Save and decode with unique filename
      const pngPath = path.join(testDownloadsDir, `random-qr-${timestamp}-${i}.png`);
      await saveSvgAsPng(svgContent, pngPath);
      
      const decodedUrl = await decodeQRCode(pngPath);
      expect(decodedUrl).toBe(testUrl);
    }
  });

  test('clearing input hides QR code', async ({ page }) => {
    // First generate a QR code
    await page.fill('#url-input', 'https://example.com');
    await expect(page.locator('#qr-code svg')).toBeVisible({ timeout: 5000 });
    
    // Clear input
    await page.fill('#url-input', '');
    
    // Wait for QR code to be replaced with placeholder
    await expect(page.locator('#qr-code .placeholder')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#qr-code svg')).not.toBeVisible();
    
    // Buttons should be disabled again
    await expect(page.locator('#copy-btn')).toBeDisabled();
    await expect(page.locator('#save-btn')).toBeDisabled();
  });
});
