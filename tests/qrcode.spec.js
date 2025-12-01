import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Generate a random URL for testing
function generateRandomUrl() {
  const randomId = Math.random().toString(36).substring(2, 15);
  return `https://example.com/test/${randomId}`;
}

test.describe('QR Code Generator', () => {
  test('page loads with correct elements', async ({ page }) => {
    await page.goto('/');
    
    // Check that page title is correct
    await expect(page).toHaveTitle('QR Code Generator');
    
    // Check that URL input exists
    const urlInput = page.locator('#url-input');
    await expect(urlInput).toBeVisible();
    
    // Check that placeholder is visible initially
    const placeholder = page.locator('#placeholder');
    await expect(placeholder).toBeVisible();
    
    // Check that QR canvas is hidden initially
    const qrCanvas = page.locator('#qr-canvas');
    await expect(qrCanvas).toBeHidden();
    
    // Check that download button is hidden initially
    const downloadBtn = page.locator('#download-btn');
    await expect(downloadBtn).toBeHidden();
  });

  test('generates QR code when URL is entered', async ({ page }) => {
    await page.goto('/');
    
    const testUrl = 'https://example.com';
    const urlInput = page.locator('#url-input');
    
    // Enter URL
    await urlInput.fill(testUrl);
    
    // Wait for QR code to be generated (debounce is 300ms)
    await page.waitForTimeout(500);
    
    // Check that QR canvas is now visible
    const qrCanvas = page.locator('#qr-canvas');
    await expect(qrCanvas).toBeVisible();
    
    // Check that download button is visible
    const downloadBtn = page.locator('#download-btn');
    await expect(downloadBtn).toBeVisible();
    
    // Check that placeholder is hidden
    const placeholder = page.locator('#placeholder');
    await expect(placeholder).toBeHidden();
  });

  test('QR code encodes correct URL', async ({ page }) => {
    await page.goto('/');
    
    const testUrl = generateRandomUrl();
    const urlInput = page.locator('#url-input');
    
    // Enter URL
    await urlInput.fill(testUrl);
    
    // Wait for QR code to be generated
    await page.waitForTimeout(500);
    
    // Take screenshot of the canvas
    const qrCanvas = page.locator('#qr-canvas');
    await expect(qrCanvas).toBeVisible();
    
    // Get the canvas as a PNG data URL
    const dataUrl = await page.evaluate(() => {
      const canvas = document.getElementById('qr-canvas');
      return canvas.toDataURL('image/png');
    });
    
    // Save the PNG to a temporary file
    const tempDir = '/tmp/qrcode-test';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `qr-${Date.now()}.png`);
    
    // Remove the data URL prefix and decode base64
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(tempFile, base64Data, 'base64');
    
    // Use zbarimg to decode the QR code
    try {
      const result = execSync(`zbarimg -q --raw "${tempFile}"`, { encoding: 'utf-8' });
      const decodedUrl = result.trim();
      
      // Verify the decoded URL matches the input
      expect(decodedUrl).toBe(testUrl);
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('QR code updates when URL changes', async ({ page }) => {
    await page.goto('/');
    
    const urlInput = page.locator('#url-input');
    const qrCanvas = page.locator('#qr-canvas');
    
    // Enter first URL
    const firstUrl = generateRandomUrl();
    await urlInput.fill(firstUrl);
    await page.waitForTimeout(500);
    await expect(qrCanvas).toBeVisible();
    
    // Get first QR code data
    const firstDataUrl = await page.evaluate(() => {
      return document.getElementById('qr-canvas').toDataURL('image/png');
    });
    
    // Enter second URL
    const secondUrl = generateRandomUrl();
    await urlInput.fill(secondUrl);
    await page.waitForTimeout(500);
    
    // Get second QR code data
    const secondDataUrl = await page.evaluate(() => {
      return document.getElementById('qr-canvas').toDataURL('image/png');
    });
    
    // QR codes should be different
    expect(firstDataUrl).not.toBe(secondDataUrl);
    
    // Verify second URL is correctly encoded
    const tempDir = '/tmp/qrcode-test';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `qr-${Date.now()}.png`);
    const base64Data = secondDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(tempFile, base64Data, 'base64');
    
    try {
      const result = execSync(`zbarimg -q --raw "${tempFile}"`, { encoding: 'utf-8' });
      expect(result.trim()).toBe(secondUrl);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test('QR code hides when URL is cleared', async ({ page }) => {
    await page.goto('/');
    
    const urlInput = page.locator('#url-input');
    const qrCanvas = page.locator('#qr-canvas');
    const downloadBtn = page.locator('#download-btn');
    const placeholder = page.locator('#placeholder');
    
    // Enter URL
    await urlInput.fill('https://example.com');
    await page.waitForTimeout(500);
    await expect(qrCanvas).toBeVisible();
    await expect(downloadBtn).toBeVisible();
    
    // Clear URL
    await urlInput.fill('');
    await page.waitForTimeout(500);
    
    // QR code should be hidden
    await expect(qrCanvas).toBeHidden();
    await expect(downloadBtn).toBeHidden();
    await expect(placeholder).toBeVisible();
  });

  test('download button triggers download', async ({ page }) => {
    await page.goto('/');
    
    const testUrl = 'https://example.com/download-test';
    const urlInput = page.locator('#url-input');
    
    // Enter URL
    await urlInput.fill(testUrl);
    await page.waitForTimeout(500);
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click download button
    const downloadBtn = page.locator('#download-btn');
    await downloadBtn.click();
    
    // Wait for download
    const download = await downloadPromise;
    
    // Check download filename
    expect(download.suggestedFilename()).toBe('qrcode.png');
    
    // Save and verify the downloaded file
    const tempDir = '/tmp/qrcode-test';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const downloadPath = path.join(tempDir, 'downloaded-qr.png');
    await download.saveAs(downloadPath);
    
    try {
      // Verify the downloaded QR code contains the correct URL
      const result = execSync(`zbarimg -q --raw "${downloadPath}"`, { encoding: 'utf-8' });
      expect(result.trim()).toBe(testUrl);
    } finally {
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
    }
  });

  test('multiple random URLs encode correctly', async ({ page }) => {
    await page.goto('/');
    
    const urlInput = page.locator('#url-input');
    const qrCanvas = page.locator('#qr-canvas');
    
    // Test with multiple random URLs
    for (let i = 0; i < 5; i++) {
      const testUrl = generateRandomUrl();
      
      await urlInput.fill(testUrl);
      await page.waitForTimeout(500);
      await expect(qrCanvas).toBeVisible();
      
      // Get QR code data
      const dataUrl = await page.evaluate(() => {
        return document.getElementById('qr-canvas').toDataURL('image/png');
      });
      
      // Save and decode
      const tempDir = '/tmp/qrcode-test';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFile = path.join(tempDir, `qr-${Date.now()}-${i}.png`);
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(tempFile, base64Data, 'base64');
      
      try {
        const result = execSync(`zbarimg -q --raw "${tempFile}"`, { encoding: 'utf-8' });
        expect(result.trim()).toBe(testUrl);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    }
  });
});
