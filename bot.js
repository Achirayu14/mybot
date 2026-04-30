const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive!');
}).listen(process.env.PORT || 3000);

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");
// ลบบรรทัด const http = require("http"); ตรงนี้ออกไป
const Jimp = require("jimp");

// ===========================
// ⚙️ CONFIG
// ===========================
const config = require("./config.json");

// โฟลเดอร์เก็บรูปต้องห้าม (วางรูปที่นี่ได้เลย)
const BANNED_IMAGES_DIR = path.join(__dirname, "banned_images");
const BANNED_HASHES_FILE = path.join(__dirname, "banned_hashes.json");
const SUPPORTED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(BANNED_IMAGES_DIR)) {
  fs.mkdirSync(BANNED_IMAGES_DIR);
  console.log(`📁 สร้างโฟลเดอร์ banned_images/ แล้ว`);
}

// ===========================
// 🔢 Perceptual Hash (pHash)
// ===========================
const HASH_SIZE = 16;

async function computePHash(input) {
  // input = Buffer หรือ path string
  const img = await Jimp.read(input);
  img.resize(HASH_SIZE, HASH_SIZE);
  const data = img.bitmap.data; // RGBA buffer, row-major

  const gray = [];
  for (let i = 0; i < data.length; i += 4)
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);

  const dct = computeDCT(gray, HASH_SIZE);
  const dctTop = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      dctTop.push(dct[y * HASH_SIZE + x]);

  const dctNoDC = dctTop.slice(1);
  const avg = dctNoDC.reduce((a, b) => a + b, 0) / dctNoDC.length;
  return dctTop.map((v) => (v > avg ? "1" : "0")).join("");
}

function computeDCT(pixels, N) {
  const result = new Array(N * N).fill(0);
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++)
        for (let y = 0; y < N; y++)
          sum +=
            pixels[y * N + x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      result[v * N + u] = (2 / N) * cu * cv * sum;
    }
  }
  return result;
}

function hammingDistance(h1, h2) {
  let d = 0;
  for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
  return d;
}

// ===========================
// 📂 โหลด + สแกน banned_images/
// ===========================
let bannedHashes = [];

// โหลด cache จากไฟล์ JSON ถ้ามี
function loadHashCache() {
  if (fs.existsSync(BANNED_HASHES_FILE)) {
    try {
      bannedHashes = JSON.parse(fs.readFileSync(BANNED_HASHES_FILE, "utf-8"));
      console.log(`📂 โหลด hash cache: ${bannedHashes.length} รูป`);
    } catch {
      bannedHashes = [];
    }
  }
}

function saveHashCache() {
  fs.writeFileSync(BANNED_HASHES_FILE, JSON.stringify(bannedHashes, null, 2));
}

// สแกนโฟลเดอร์ banned_images/ และ hash รูปที่ยังไม่มีใน cache
async function scanBannedImages() {
  const files = fs.readdirSync(BANNED_IMAGES_DIR).filter((f) =>
    SUPPORTED_EXT.includes(path.extname(f).toLowerCase())
  );

  // ลบ hash ของไฟล์ที่ถูกลบออกจาก cache
  const existingFiles = new Set(files);
  const before = bannedHashes.length;
  bannedHashes = bannedHashes.filter((e) => !e.filename || existingFiles.has(e.filename));
  if (bannedHashes.length < before)
    console.log(`🗑️ ลบ hash ของรูปที่ถูกลบออก ${before - bannedHashes.length} รูป`);

  // เพิ่ม hash ของไฟล์ใหม่ที่ยังไม่ได้ hash
  const cachedFiles = new Set(bannedHashes.map((e) => e.filename));
  let added = 0;

  for (const file of files) {
    if (cachedFiles.has(file)) continue; // มี cache แล้ว ข้าม
    const filePath = path.join(BANNED_IMAGES_DIR, file);
    try {
      const hash = await computePHash(filePath);
      const label = path.basename(file, path.extname(file)); // ใช้ชื่อไฟล์เป็น label
      bannedHashes.push({ filename: file, label, hash, addedAt: new Date().toISOString() });
      console.log(`  ✅ hash รูป: ${file} → ${hash.substring(0, 16)}...`);
      added++;
    } catch (err) {
      console.error(`  ❌ hash ไม่ได้: ${file} — ${err.message}`);
    }
  }

  if (added > 0) {
    saveHashCache();
    console.log(`🔄 เพิ่ม ${added} รูปใหม่ รวม ${bannedHashes.length} รูปทั้งหมด`);
  } else {
    console.log(`✅ รูปต้องห้าม: ${bannedHashes.length} รูป (ไม่มีรูปใหม่)`);
  }
}

// ===========================
// 👀 Watch โฟลเดอร์ (Hot Reload)
// ===========================
function watchBannedImagesFolder() {
  fs.watch(BANNED_IMAGES_DIR, async (eventType, filename) => {
    if (!filename) return;
    if (!SUPPORTED_EXT.includes(path.extname(filename).toLowerCase())) return;

    // หน่วงนิดนึงเพื่อให้ไฟล์เขียนเสร็จก่อน
    setTimeout(async () => {
      const filePath = path.join(BANNED_IMAGES_DIR, filename);
      const exists = fs.existsSync(filePath);

      if (exists) {
        // ไฟล์ใหม่ถูกเพิ่ม
        const alreadyCached = bannedHashes.find((e) => e.filename === filename);
        if (alreadyCached) return;
        try {
          const hash = await computePHash(filePath);
          const label = path.basename(filename, path.extname(filename));
          bannedHashes.push({ filename, label, hash, addedAt: new Date().toISOString() });
          saveHashCache();
          console.log(`➕ [Hot Reload] เพิ่มรูป: ${filename} (รวม ${bannedHashes.length} รูป)`);
          if (client.isReady()) {
            client.user.setActivity(`เฝ้าดู ${bannedHashes.length} รูปต้องห้าม 👁️`, { type: 3 });
          }
        } catch (err) {
          console.error(`❌ [Hot Reload] hash ไม่ได้: ${filename} — ${err.message}`);
        }
      } else {
        // ไฟล์ถูกลบ
        const idx = bannedHashes.findIndex((e) => e.filename === filename);
        if (idx !== -1) {
          const removed = bannedHashes.splice(idx, 1)[0];
          saveHashCache();
          console.log(`➖ [Hot Reload] ลบรูป: ${removed.label} (รวม ${bannedHashes.length} รูป)`);
          if (client.isReady()) {
            client.user.setActivity(`เฝ้าดู ${bannedHashes.length} รูปต้องห้าม 👁️`, { type: 3 });
          }
        }
      }
    }, 500);
  });

  console.log(`👀 กำลัง Watch โฟลเดอร์ banned_images/ (Hot Reload เปิดอยู่)`);
}

// ===========================
// 📥 ดาวน์โหลดรูปจาก Discord
// ===========================
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ===========================
// 🔍 ตรวจสอบรูปในข้อความ
// ===========================
async function checkMessageImages(message) {
  const imageUrls = [];

  for (const [, att] of message.attachments) {
    if (
      (att.contentType && att.contentType.startsWith("image/")) ||
      /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(att.url)
    ) {
      imageUrls.push(att.url);
    }
  }
  for (const embed of message.embeds) {
    if (embed.image?.url) imageUrls.push(embed.image.url);
    if (embed.thumbnail?.url) imageUrls.push(embed.thumbnail.url);
  }

  const threshold = config.matchThreshold ?? 10;

  for (const url of imageUrls) {
    try {
      const buffer = await downloadImage(url);
      const hash = await computePHash(buffer);

      for (const entry of bannedHashes) {
        const dist = hammingDistance(hash, entry.hash);
        if (dist <= threshold) {
          return { matched: true, matchedEntry: entry, distance: dist };
        }
      }
    } catch (err) {
      console.error(`⚠️ ประมวลผลรูปไม่ได้: ${err.message}`);
    }
  }
  return { matched: false };
}

// ===========================
// 🤖 Bot
// ===========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
  ],
});

client.once("ready", async () => {
  console.log(`\n✅ Bot พร้อมทำงาน: ${client.user.tag}`);
  console.log(`🔒 ช่องที่เฝ้าดู: ${config.watchedChannels.join(", ")}`);

  // สแกนโฟลเดอร์ตอนเริ่ม
  console.log(`\n🔍 กำลังสแกน banned_images/...`);
  loadHashCache();
  await scanBannedImages();
  watchBannedImagesFolder();

  client.user.setActivity(`เฝ้าดู ${bannedHashes.length} รูปต้องห้าม 👁️`, { type: 3 });
  console.log(`\n🚀 Bot พร้อมรับงาน!\n`);
});

// ===========================
// 📨 ตรวจสอบข้อความ
// ===========================
client.on("messageCreate", async (message) => {
    // 1. ตรวจสอบเงื่อนไขพื้นฐาน (ข้ามบอท, ตรวจสอบเฉพาะห้องที่ตั้งค่าไว้)
    if (message.author.bot || !message.guild) return;
    if (!config.watchedChannels.includes(message.channelId)) return;
    if (message.attachments.size === 0 && message.embeds.length === 0) return;
    if (bannedHashes.length === 0) return;

    // 2. ตรวจสอบว่ารูปภาพตรงกับรูปต้องห้ามหรือไม่
    const result = await checkMessageImages(message);
    if (!result.matched) return;

    // 3. ตรวจสอบ Whitelist (ข้าม Admin หรือคนที่มี Role พิเศษ)
    if (config.whitelistUsers?.includes(message.author.id)) return;
    const targetMember = message.member;
    if (targetMember && config.whitelistRoles?.some((r) => targetMember.roles.cache.has(r))) return;
    if (message.guild.ownerId === message.author.id) return;

    console.log(`🚨 พบรูปต้องห้าม "${result.matchedEntry.label}" จาก ${message.author.tag}`);

    try {
        // 4. สั่งลบรูปภาพทันที
        await message.delete().catch(() => {});

        // 5. ส่งข้อความแจ้งเตือนและลบทิ้งภายใน 5 วินาที
        const warning = await message.channel.send(`⚠️ ${message.author} รูปที่คุณส่งเป็นรูปต้องห้ามและถูกลบออกแล้วครับ`);
        setTimeout(() => warning.delete().catch(() => {}), 5000);

        // 6. ส่ง Log ไปยังช่องที่ตั้งค่าไว้
        if (config.logChannelId) {
            const logCh = await message.guild.channels.fetch(config.logChannelId).catch(() => null);
            if (logCh?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor(0xffaa00) // สีส้มสำหรับการลบข้อความ
                    .setTitle("📸 Auto-Delete: พบรูปต้องห้าม")
                    .addFields(
                        { name: "👤 ผู้ใช้", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                        { name: "📌 ช่อง", value: `<#${message.channelId}>`, inline: true },
                        { name: "🖼️ รูปที่ตรงกัน", value: result.matchedEntry.label, inline: true },
                        { name: "📏 Hash Distance", value: `${result.distance} / ${config.matchThreshold ?? 10}`, inline: true },
                        { name: "⏰ เวลา", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                    )
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: "Discord Image Filter Bot" })
                    .setTimestamp();
                await logCh.send({ embeds: [embed] });
            }
        }
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาดในการลบรูปอัตโนมัติ:", error);
    }
});

// ===========================
// 💬 Slash Commands
// ===========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ ต้องการสิทธิ์ Administrator", ephemeral: true });
  } // <--- จุดที่ต้องมีปีกกาปิดตรงนี้ครับ

// --- ส่วนที่เพิ่มใหม่สำหรับลบรูปย้อนหลังทุกห้องที่เฝ้าดู ---
  if (interaction.commandName === "cleanall") {
    await interaction.deferReply({ ephemeral: true });
    
    let totalDeleted = 0;
    const watched = config.watchedChannels;

    if (watched.length === 0) {
      return interaction.editReply("⚠️ ยังไม่ได้เพิ่มห้องที่เฝ้าดูเลยครับ ใช้ /addchannel ก่อนนะ");
    }

    for (const channelId of watched) {
      try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        const messages = await channel.messages.fetch({ limit: 100 });
        for (const msg of messages.values()) {
          if (msg.author.bot) continue;
          const res = await checkMessageImages(msg);
          if (res.matched) {
            await msg.delete().catch(() => {});
            totalDeleted++;
          }
        }
      } catch (err) {
        console.error(`❌ สแกนห้อง ${channelId} ไม่ได้:`, err);
      }
    }
    return interaction.editReply(`✅ สแกนเสร็จสิ้นทุกห้อง! ลบรูปต้องห้ามไปทั้งหมด **${totalDeleted} รูป**`);
  }

  // /listimages (คำสั่งเดิมของคุณ)
  if (interaction.commandName === "listimages") {
    if (bannedHashes.length === 0)
      return interaction.reply({ content: "📭 ยังไม่มีรูปต้องห้าม\nวางรูปลงในโฟลเดอร์ `banned_images/` ได้เลยครับ", ephemeral: true });
    const list = bannedHashes
      .map((e, i) => `\`${i + 1}\` **${e.label}** (${e.filename}) — ${new Date(e.addedAt).toLocaleString("th-TH")}`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`🚫 รูปต้องห้าม (${bannedHashes.length} รูป)`)
      .setDescription(list.length > 4096 ? list.substring(0, 4090) + "..." : list)
      .setFooter({ text: "วางรูปเพิ่มใน banned_images/ ได้เลย Bot จะโหลดอัตโนมัติ" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  // /listimages
  if (interaction.commandName === "listimages") {
    if (bannedHashes.length === 0)
      return interaction.reply({ content: "📭 ยังไม่มีรูปต้องห้าม\nวางรูปลงในโฟลเดอร์ `banned_images/` ได้เลยครับ", ephemeral: true });
    const list = bannedHashes
      .map((e, i) => `\`${i + 1}\` **${e.label}** (${e.filename}) — ${new Date(e.addedAt).toLocaleString("th-TH")}`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`🚫 รูปต้องห้าม (${bannedHashes.length} รูป)`)
      .setDescription(list.length > 4096 ? list.substring(0, 4090) + "..." : list)
      .setFooter({ text: "วางรูปเพิ่มใน banned_images/ ได้เลย Bot จะโหลดอัตโนมัติ" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /rescan — สแกนโฟลเดอร์ใหม่ manual
  if (interaction.commandName === "rescan") {
    await interaction.deferReply({ ephemeral: true });
    const before = bannedHashes.length;
    await scanBannedImages();
    client.user.setActivity(`เฝ้าดู ${bannedHashes.length} รูปต้องห้าม 👁️`, { type: 3 });
    return interaction.editReply(
      `🔄 สแกนเสร็จแล้ว!\nก่อน: ${before} รูป → ตอนนี้: **${bannedHashes.length} รูป**`
    );
  }

  // /addchannel
  if (interaction.commandName === "addchannel") {
    const channel = interaction.options.getChannel("channel");
    if (config.watchedChannels.includes(channel.id)) {
      return interaction.reply({ content: `⚠️ <#${channel.id}> อยู่ในรายการอยู่แล้ว`, ephemeral: true });
    }
    config.watchedChannels.push(channel.id);
    fs.writeFileSync(path.join(__dirname, "config.json"), JSON.stringify(config, null, 2));
    return interaction.reply({ content: `✅ เพิ่ม <#${channel.id}> แล้ว (รวม ${config.watchedChannels.length} ห้อง)`, ephemeral: true });
  }

  // /removechannel
  if (interaction.commandName === "removechannel") {
    const channel = interaction.options.getChannel("channel");
    const idx = config.watchedChannels.indexOf(channel.id);
    if (idx === -1) {
      return interaction.reply({ content: `⚠️ <#${channel.id}> ไม่ได้อยู่ในรายการ`, ephemeral: true });
    }
    config.watchedChannels.splice(idx, 1);
    fs.writeFileSync(path.join(__dirname, "config.json"), JSON.stringify(config, null, 2));
    return interaction.reply({ content: `✅ ลบ <#${channel.id}> แล้ว (เหลือ ${config.watchedChannels.length} ห้อง)`, ephemeral: true });
  }

  // /listchannels
  if (interaction.commandName === "listchannels") {
    const list = config.watchedChannels.length
      ? config.watchedChannels.map((id) => `<#${id}>`).join("\n")
      : "ยังไม่มีห้องที่เฝ้าดู";
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`👀 ห้องที่ Bot เฝ้าดู (${config.watchedChannels.length} ห้อง)`)
      .setDescription(list)
      .setFooter({ text: "ใช้ /addchannel หรือ /removechannel เพื่อแก้ไข" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /status
  if (interaction.commandName === "status") {
    const files = fs.readdirSync(BANNED_IMAGES_DIR).filter((f) =>
      SUPPORTED_EXT.includes(path.extname(f).toLowerCase())
    );
    const embed = new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("📊 สถานะ Image Ban Bot")
      .addFields(
        { name: "🤖 Bot", value: client.user.tag, inline: true },
        { name: "🚫 รูปต้องห้าม", value: `${bannedHashes.length} รูป`, inline: true },
        { name: "📁 ไฟล์ในโฟลเดอร์", value: `${files.length} ไฟล์`, inline: true },
        { name: "📏 Threshold", value: `${config.matchThreshold ?? 10}`, inline: true },
        { name: "🔒 ช่องที่เฝ้าดู", value: config.watchedChannels.map((id) => `<#${id}>`).join("\n") || "ไม่มี" }
      )
      .setFooter({ text: "📂 วางรูปใน banned_images/ แล้ว Bot จะโหลดอัตโนมัติ" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// เปลี่ยนจาก client.login(config.token); เป็นแบบด้านล่างนี้
client.login(process.env.DISCORD_TOKEN || config.token);
