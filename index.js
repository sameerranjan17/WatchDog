require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');

// Puppeteer ko Stealth mode me activate karna
puppeteer.use(StealthPlugin());

const dataFile = './data.json';

function readData() {
    if (fs.existsSync(dataFile)) {
        return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    }
    return { lastSbiUpdate: "", lastJecaUpdate: "" };
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendEmail(subject, text) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.RECEIVER_EMAIL,
        subject: subject,
        text: text
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("Email error:", error);
        else console.log("✅ Email Alert Sent: " + subject);
    });
}

async function checkUpdates() {
    let savedData = readData();
    let isUpdated = false;
    let sbiUpdateText = "No new updates found.";
    let jecaUpdateText = "No new updates found.";
    
    console.log("🚀 Starting Stealth Browser... Please wait.");
    
    const browser = await puppeteer.launch({ 
        headless: true, // Background me chalega
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        console.log("🔍 Checking WB JECA and SBI websites...");

        // 1. WB JECA Check (with Stealth & wait till network is quiet)
        try {
            await page.goto('https://wbjeeb.nic.in/jeca/', { waitUntil: 'networkidle2', timeout: 60000 });
            
            const currentJecaNotice = await page.evaluate(() => {
                const element = document.querySelector('.notices-section ul li:first-child');
                return element ? element.innerText.trim() : null;
            });

            if (currentJecaNotice && currentJecaNotice !== savedData.lastJecaUpdate) {
                savedData.lastJecaUpdate = currentJecaNotice;
                isUpdated = true;
                jecaUpdateText = `Naya Notice: ${currentJecaNotice}`;
                console.log("WB JECA: New update found!");
            } else {
                console.log("WB JECA: No new update.");
            }
        } catch (jecaErr) {
            console.error("❌ WB JECA check failed:", jecaErr.message);
            jecaUpdateText = "Failed to fetch data this hour due to network or server issues.";
        }

        // 2. SBI JA Clerk Check
        try {
            await page.goto('https://sbi.co.in/web/careers/current-openings', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            const currentSbiNotice = await page.evaluate(() => {
                const element = document.querySelector('.latest-announcement-class'); 
                return element ? element.innerText.trim() : null;
            });

            if (currentSbiNotice && currentSbiNotice !== savedData.lastSbiUpdate) {
                savedData.lastSbiUpdate = currentSbiNotice;
                isUpdated = true;
                sbiUpdateText = `Naya Notice: ${currentSbiNotice}`;
                console.log("SBI: New update found!");
            } else {
                console.log("SBI: No new update.");
            }
        } catch (sbiErr) {
            console.error("❌ SBI check failed:", sbiErr.message);
             sbiUpdateText = "Failed to fetch data this hour due to network or server issues.";
        }

        // ---  Har ghante summary send karne ka logic ---
        const summarySubject = isUpdated ? "🚨 New Updates Found!" : "🕒 Hourly Update Report";
        const summaryText = `
        Here is your hourly update summary:
        
        **WB JECA:**
        ${jecaUpdateText}
        Link: https://wbjeeb.nic.in/jeca/

        **SBI JA Clerk:**
        ${sbiUpdateText}
        Link: https://sbi.co.in/web/careers/current-openings
        `;

        sendEmail(summarySubject, summaryText);

        if (isUpdated) {
            saveData(savedData);
            console.log("💾 New updates saved to data.json!");
        } else {
            console.log("✅ Check complete. No new updates.");
        }

    } catch (error) {
        console.error("🚨 Critical Error: ", error.message);
    } finally {
        await browser.close(); 
        console.log("Browser closed. Waiting for next schedule...\n");
    }
}

// Har ghante run karne ke liye cron job
// cron.schedule('0 * * * *', () => {
//     console.log("Running Scheduled Check...");
//     checkUpdates();
// });

// console.log("🤖 WatchDog Monitoring Service Started...");
// // Script start hote hi pehli baar check karega
// checkUpdates();

// Purana cron.schedule hata do aur bas ye likho:
console.log("🤖 WatchDog Checking Updates (GitHub Actions)...");
checkUpdates();