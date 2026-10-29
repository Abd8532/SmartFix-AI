const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const APP_URL = 'http://127.0.0.1:3124';
const SCREENSHOT_DIR = path.resolve('C:/Users/ABD/.gemini/antigravity/brain/296ef399-84c3-4242-a8e6-157bb774ddfb/screenshots');

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout },
    text
  );
}

async function run() {
  const viteBin = path.resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, '--port', '3124', '--strictPort', '--host', '127.0.0.1'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  try {
    await new Promise((r) => setTimeout(r, 1500));
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });

    // Login as Admin
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const adminBtn = btns.find(b => b.innerText.includes('Admin'));
      if (adminBtn) adminBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const loginBtn = btns.find(b => b.innerText.includes('Log In'));
      if (loginBtn) loginBtn.click();
    });
    await waitForText(page, 'Safety first. Progress visible.');
    console.log('✓ Admin logged in successfully');

    // 1. Click "All requests" in sidebar
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const reqBtn = btns.find(b => b.innerText.includes('All requests'));
      if (reqBtn) reqBtn.click();
    });
    await waitForText(page, 'Work-Order Request Queue');
    console.log('✓ "All requests" sidebar button clicked -> Work-Order Request Queue displayed');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_admin_request_queue.png') });

    // 2. Click "Hazard queue" in sidebar
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const hazBtn = btns.find(b => b.innerText.includes('Hazard queue'));
      if (hazBtn) hazBtn.click();
    });
    await waitForText(page, 'Critical Facility Hazard Queue');
    console.log('✓ "Hazard queue" sidebar button clicked -> Hazard Queue displayed');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_admin_hazard_queue.png') });

    // 3. Click "Settings" in sidebar
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const setBtn = btns.find(b => b.innerText.includes('Settings'));
      if (setBtn) setBtn.click();
    });
    await waitForText(page, 'Facilities Operations & System Settings');
    console.log('✓ "Settings" sidebar button clicked -> Facilities Operations & System Settings displayed');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_admin_settings.png') });

    await browser.close();
    console.log('\n>>> ALL 3 SIDEBAR TABS VERIFIED AND SCREENSHOTS CAPTURED! <<<');
  } finally {
    server.kill();
  }
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
