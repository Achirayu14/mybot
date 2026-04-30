# 🔨 Discord Image Ban Bot (v3 — Folder-based)

แบนผู้ใช้ที่ส่งรูปที่ตรงกับรูปในโฟลเดอร์ `banned_images/` โดยใช้ Perceptual Hashing (pHash)

---

## 📁 โครงสร้างโฟลเดอร์

```
discord-image-ban-bot/
├── bot.js
├── config.json
├── deploy-commands.js
├── package.json
├── banned_images/        ← วางรูปต้องห้ามที่นี่ได้เลย!
│   ├── meme1.png
│   ├── spam-image.jpg
│   └── ...
└── banned_hashes.json    ← cache hash (Bot สร้างเอง ไม่ต้องแตะ)
```

---

## 📦 ติดตั้ง

```bash
npm install
```
---

## 🖼️ วิธีเพิ่มรูปต้องห้าม

**ง่ายมาก! แค่วางไฟล์รูปลงใน `banned_images/` โฟลเดอร์**

- Bot จะ **โหลดอัตโนมัติ** ทันทีที่รันครั้งแรก
- ถ้าเพิ่มรูปขณะ Bot รันอยู่ Bot จะ **ตรวจเจอและโหลดภายใน 1 วินาที** (Hot Reload)
- ชื่อไฟล์ = ชื่อที่ใช้แสดงใน Log (เช่น `spam.png` → label คือ `spam`)
- รองรับ: `.jpg .jpeg .png .gif .webp .bmp`

---

## ⚙️ ตั้งค่า `config.json`

| ฟิลด์ | คำอธิบาย |
|-------|----------|
| `token` | Bot Token |
| `watchedChannels` | Channel ID ที่เฝ้าดู |
| `logChannelId` | Channel สำหรับ Log การแบน |
| `whitelistUsers` | User ID ที่ยกเว้น |
| `whitelistRoles` | Role ID ที่ยกเว้น |
| `deleteMessageDays` | ลบข้อความย้อนหลังกี่วัน (1-7) |
| `matchThreshold` | ความคลาดเคลื่อน pHash (แนะนำ: 10) |

---

## 🚀 รัน Bot

```bash
# ลง Slash Commands ก่อน (ทำครั้งเดียว)
node deploy-commands.js

# รัน Bot
node bot.js
```

---

## 💬 Slash Commands

| Command | คำอธิบาย |
|---------|----------|
| `/listimages` | ดูรายการรูปต้องห้ามทั้งหมด |
| `/rescan` | สั่งสแกนโฟลเดอร์ใหม่ด้วยตนเอง |
| `/status` | ดูสถานะ Bot |
/addchannel เพิ่มห้องที่จะ detect

---

## 📏 matchThreshold คืออะไร?

ค่าความต่างของ hash ระหว่างรูปที่ส่งกับรูปต้องห้าม:
- `0` = ต้องเหมือนกันทุก pixel
- `10` = แนะนำ (จับ resize/compress ได้)
- `20` = หลวม (จับรูปที่แก้ไขเล็กน้อยได้ แต่อาจ false positive)
