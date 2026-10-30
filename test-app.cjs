const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('C:/Users/ABD/.gemini/antigravity/brain/296ef399-84c3-4242-a8e6-157bb774ddfb/screenshots');
const TEST_PORT = 3123;
const APP_URL = `http://127.0.0.1:${TEST_PORT}`;

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Server did not start within ${timeout}ms`);
}

async function clickButtonWithText(page, text) {
  const clicked = await page.evaluate((btnText) => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const btn = btns.find((b) => {
      const t = (b.innerText || b.textContent || '').toLowerCase();
      return t.includes(btnText.toLowerCase());
    });
    if (btn) {
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      btn.click();
      return true;
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Button or clickable element with text "${text}" not found!`);
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text
  );
}

async function setReactInput(page, selector, value) {
  await page.evaluate((sel, val) => {
    const input = document.querySelector(sel);
    if (!input) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, value);
}

async function runTests() {
  console.log('--- STARTING SMARTFIX AI E2E ACTUATION TESTS ---');

  const viteBin = path.resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
  const serverProcess = spawn(process.execPath, [viteBin, '--port', String(TEST_PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.resolve(__dirname),
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (d) => console.log(`[Vite]: ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.log(`[Vite err]: ${d.toString().trim()}`));

  try {
    console.log('Waiting for Vite server at', APP_URL);
    await waitForServer(APP_URL);
    console.log('Vite server is UP and responding at', APP_URL);

    console.log('Launching headless Chrome from:', CHROME_PATH);
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    page.on('console', (msg) => console.log(`[Browser console]: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[Browser error]: ${err.toString()}`));

    // 1. TEST LOGIN SCREEN & STRICT GATING
    console.log('\n[TEST 1] Testing Modern SmartFix AI Login & Admin Auth Validation...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });

    await waitForText(page, 'SmartFix AI');
    await waitForText(page, 'Email Address');
    await waitForText(page, 'Password');
    console.log('✓ Found SmartFix AI login header, Email Address, and Password inputs.');

    // 1a. Test pending login restriction
    console.log('\n[TEST 1a] Testing Gated Login: Pending user cannot log in...');
    await setReactInput(page, 'input[type="email"]', 'jordan@campus.edu');
    await setReactInput(page, 'input[type="password"]', 'password123');
    await new Promise((r) => setTimeout(r, 400));
    await clickButtonWithText(page, 'Log In');
    await waitForText(page, 'Access Denied: Your account is still pending admin approval.');
    console.log('✓ Verified: Pending user received exact error: "Access Denied: Your account is still pending admin approval."');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_pending_blocked.png') });

    // 1a-2. Test Domain Matching Security Check: Admin credentials on User domain rejected!
    console.log('\n[TEST 1a-2] Testing Domain Matching: Admin credentials entered on User portal are strictly blocked...');
    await clickButtonWithText(page, 'User');
    await setReactInput(page, 'input[type="email"]', 'admin@campus.edu');
    await setReactInput(page, 'input[type="password"]', 'admin123');
    await new Promise((r) => setTimeout(r, 400));
    await clickButtonWithText(page, 'Log In');
    await waitForText(page, 'Invalid ID or password for this specific domain. Please ensure you have selected the correct role.');
    console.log('✓ Verified: Cross-domain admin bypass blocked with message: "Invalid ID or password for this specific domain. Please ensure you have selected the correct role."');

    // 1b. Test Registration with Pending Status (Campus User)
    console.log('\n[TEST 1b] Testing Sign-Up: Registers with Pending status...');
    await clickButtonWithText(page, 'Request account approval');
    await waitForText(page, 'Full Name');
    
    // Fill in sign up details with unique test email (default Campus User role)
    const uniqueEmail = `test.gated.${Date.now()}@campus.edu`;
    await page.type('input[placeholder="Alex Rivera"]', 'Taylor Morgan');
    await page.type('input[type="email"]', uniqueEmail);
    await page.type('input[type="password"]', 'password123');

    // Submit sign up
    await clickButtonWithText(page, 'Request Account Approval');
    await waitForText(page, 'Account created successfully. Please wait for an Administrator to approve your account before logging in.');
    console.log('✓ Verified: Registration success message shown: "Account created successfully. Please wait for an Administrator to approve your account before logging in."');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01b_signup_success_pending.png') });

    // 1b-2. Test Admin Direct Sign-Up (Auto-Approved)
    console.log('\n[TEST 1b-2] Testing Admin Sign-Up & Automatic Approval...');
    await clickButtonWithText(page, 'Request account approval');
    await waitForText(page, 'Full Name');
    
    // Select Admin role
    await clickButtonWithText(page, 'Admin');
    await waitForText(page, 'Auto-Approved');
    console.log('✓ Selected Admin role: Auto-Approved notice verified.');

    const newAdminEmail = `registered.admin.${Date.now()}@campus.edu`;
    await page.type('input[placeholder="Alex Rivera"]', 'Morgan Vance');
    await page.type('input[type="email"]', newAdminEmail);
    await page.type('input[type="password"]', 'adminpass123');

    await clickButtonWithText(page, 'Create Administrator Account');
    await waitForText(page, 'Administrator account created and automatically approved! You can now log in.');
    console.log('✓ Verified: Admin registration success message shown.');

    // 1c. Test New Admin Login & Route to AdminDashboard
    console.log('\n[TEST 1c] Testing Newly Registered Admin Login & Dashboard Access...');
    // Email is already pre-filled from registration! Just enter password:
    await page.type('input[type="password"]', 'adminpass123');
    await new Promise((r) => setTimeout(r, 300));
    await clickButtonWithText(page, 'Log In');
    await waitForText(page, 'Safety first. Progress visible.');
    console.log('✓ Newly registered admin successfully logged in and routed to AdminDashboard!');

    // Switch to Pending Approvals Tab
    await clickButtonWithText(page, 'Pending Approvals');
    await waitForText(page, 'jordan@campus.edu');
    console.log('✓ Verified Jordan Taylor (jordan@campus.edu) is in Pending Approvals queue.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01c_admin_pending_approvals.png') });

    // Click Approve specifically on Jordan Taylor's row by email
    const approved = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const jordanRow = rows.find((r) => r.innerText.includes('jordan@campus.edu'));
      if (jordanRow) {
        const btn = Array.from(jordanRow.querySelectorAll('button')).find((b) => b.innerText.includes('Approve'));
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (!approved) throw new Error('Could not find Approve button for jordan@campus.edu');
    console.log('✓ Clicked Approve specifically for Jordan Taylor (jordan@campus.edu).');
    await new Promise((r) => setTimeout(r, 800));
    console.log('✓ Jordan Taylor approved!');

    // Log out Admin
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');

    // 1d. Verify Jordan Taylor can now log in
    console.log('\n[TEST 1d] Testing Approved User Login...');
    await setReactInput(page, 'input[type="email"]', 'jordan@campus.edu');
    await setReactInput(page, 'input[type="password"]', 'password123');
    await new Promise((r) => setTimeout(r, 500));
    await clickButtonWithText(page, 'Log In');
    await page.waitForSelector('main', { timeout: 10000 });
    await waitForText(page, 'New Maintenance Issue');
    console.log('✓ Jordan Taylor successfully logged in after admin approval!');
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');

    // 2. TEST MOBILE USER VIEW & CAMERA CAPTURE (iPhone viewport: 390x844)
    console.log('\n[TEST 2] Testing Mobile User View & Native Camera Upload (iPhone viewport: 390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    
    // Fill credentials & Log In as Approved User
    await clickButtonWithText(page, 'User');
    await new Promise((r) => setTimeout(r, 500));
    await clickButtonWithText(page, 'Log In');
    await page.waitForSelector('nav');
    console.log('✓ Logged in as User on mobile.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_user_mobile_new_issue.png') });

    // Verify HTML5 Camera capture input attribute
    const cameraInput = await page.$('input[capture="environment"]');
    if (!cameraInput) {
      throw new Error('FAILED: <input type="file" accept="image/*" capture="environment" /> not found!');
    }
    const acceptAttr = await page.evaluate((el) => el.getAttribute('accept'), cameraInput);
    const captureAttr = await page.evaluate((el) => el.getAttribute('capture'), cameraInput);
    console.log(`✓ HTML5 Camera input verified: accept="${acceptAttr}", capture="${captureAttr}"`);

    // Verify "Describe the problem / complaint" textarea
    const textarea = await page.$('textarea#complaint, textarea#description');
    if (!textarea) throw new Error('FAILED: complaint textarea not found');
    console.log('✓ "Describe the problem / complaint" textarea verified.');

    // Click sample photo button for testing
    await clickButtonWithText(page, 'Water Leak');
    console.log('✓ Sample fault photo attached.');

    // Type problem description
    await textarea.type('Automated Test: High pressure water pipe burst in Cafeteria Kitchen spraying near socket.');
    console.log('✓ Problem description entered.');

    // Click "Analyze & Create Ticket" submit button
    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();
    console.log('✓ "Analyze & Create Ticket" button clicked. Waiting for confirmation...');

    await waitForText(page, 'Maintenance Ticket Created');
    console.log('✓ Success confirmation card displayed!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_user_mobile_issue_success.png') });

    // Click "View in My Tickets"
    await clickButtonWithText(page, 'View in My Tickets');
    await waitForText(page, 'My Maintenance Tickets');
    console.log('✓ Navigated to "My Tickets" tab.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_user_mobile_my_tickets.png') });

    // 3. TEST TECHNICIAN ROLE & DUAL-APPROVAL "MARK AS FIXED"
    console.log('\n[TEST 3] Testing Technician Role & Dual-Approval Workflow...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });

    // Logout from user and login as technician
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');
    await clickButtonWithText(page, 'Technician');
    await new Promise((r) => setTimeout(r, 500));
    await clickButtonWithText(page, 'Log In');
    await waitForText(page, 'Work Order Queue');
    console.log('✓ Logged in as Field Technician Role.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_technician_dashboard.png') });

    // Verify "Mark as Fixed" button exists on open tickets
    await waitForText(page, 'Mark as Fixed');
    console.log('✓ Found "Mark as Fixed" button on active ticket.');

    // Click "Mark as Fixed"
    await clickButtonWithText(page, 'Mark as Fixed');
    console.log('✓ Clicked "Mark as Fixed". Button transitions to "Sent for User Verification".');
    await waitForText(page, 'Sent for User Verification');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_technician_sent_verification.png') });

    // 4. TEST USER DUAL CONFIRMATION: "Confirm Issue Resolved"
    console.log('\n[TEST 4] Testing User Dual Confirmation ("Confirm Issue Resolved")...');
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');
    await clickButtonWithText(page, 'User');
    await new Promise((r) => setTimeout(r, 500));
    await clickButtonWithText(page, 'Log In');
    
    // Switch to "My Tickets"
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('My Tickets') || b.textContent.includes('My Tickets'));
      if (btn) btn.click();
    });
    await waitForText(page, 'My Maintenance Tickets');
    await waitForText(page, 'Confirm Issue Resolved');
    console.log('✓ Found "Confirm Issue Resolved" button for pending verification ticket.');

    // Click "Confirm Issue Resolved"
    await clickButtonWithText(page, 'Confirm Issue Resolved');
    console.log('✓ Clicked "Confirm Issue Resolved".');
    await waitForText(page, 'Completed');
    console.log('✓ Ticket verified and closed as Completed!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06b_user_confirmed_completed.png') });

    // 5. TEST ADMIN ROLE & STATUS OVERRIDE
    console.log('\n[TEST 5] Testing Admin Role & Master Oversight...');
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');
    await clickButtonWithText(page, 'Admin');
    await new Promise((r) => setTimeout(r, 500));
    await clickButtonWithText(page, 'Log In');
    await waitForText(page, 'Safety first. Progress visible.');
    console.log('✓ Logged in as System Administrator Role.');

    // Verify Admin Metrics Cards
    await waitForText(page, 'Total requests');
    await waitForText(page, 'Open requests');
    await waitForText(page, 'Resolved / closed');
    console.log('✓ Master metrics verified: Total requests, Open requests, Resolved / closed.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_admin_dashboard.png') });

    // 6. TEST LOGOUT
    console.log('\n[TEST 6] Testing Logout...');
    await clickButtonWithText(page, 'Log out');
    await waitForText(page, 'Choose Role / Account Type');
    console.log('✓ Successfully logged out and returned to login screen.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_logout_complete.png') });

    await browser.close();
    console.log('\n======================================================');
    console.log('>>> ALL 6 E2E AUTH & OPERATIONS TESTS PASSED 100%! <<<');
    console.log('======================================================');
  } finally {
    serverProcess.kill();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
