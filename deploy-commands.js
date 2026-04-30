const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const config = require("./config.json");

// ข้อมูลจากรูป image_0feb8f.jpg ของคุณ
const CLIENT_ID = "1494423317657157703"; 
const GUILD_ID  = "1491778574284492873"; // ไอดีเซิร์ฟเวอร์ที่คุณใส่มา

const commands = [
    // เพิ่มคำสั่งลบย้อนหลังที่คุณต้องการ
    new SlashCommandBuilder()
        .setName('cleanhistory')
        .setDescription('สแกนและลบรูปภาพที่ถูกสั่งแบนย้อนหลังในแชนแนลนี้'),

    new SlashCommandBuilder()
        .setName("listimages")
        .setDescription("ดูรายการรูปต้องห้ามทั้งหมดในโฟลเดอร์ banned_images/"),

    new SlashCommandBuilder()
        .setName("rescan")
        .setDescription("สั่งให้ Bot สแกนโฟลเดอร์ banned_images/ ใหม่ด้วยตัวเอง"),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("ดูสถานะ Bot"),

    new SlashCommandBuilder()
        .setName("addchannel")
        .setDescription("เพิ่มห้องที่ให้ Bot เฝ้าดู")
        .addChannelOption((opt) =>
            opt.setName("channel").setDescription("ห้องที่ต้องการเพิ่ม").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("removechannel")
        .setDescription("ลบห้องออกจากรายการที่ Bot เฝ้าดู")
        .addChannelOption((opt) =>
            opt.setName("channel").setDescription("ห้องที่ต้องการลบ").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("listchannels")
        .setDescription("ดูรายการห้องที่ Bot เฝ้าดูอยู่"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
    try {
        console.log("🔄 กำลังลง Slash Commands...");
        // บรรทัดนี้จะส่งคำสั่งไปยังเซิร์ฟเวอร์ที่คุณกำหนดไว้
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✅ ลง Guild Commands สำเร็จ (รวม /cleanhistory แล้ว)");
    } catch (err) {
        console.error("❌ ลง Commands ไม่สำเร็จ:", err);
    }
})();