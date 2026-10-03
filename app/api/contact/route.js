import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey
);

async function notifyTelegram({ name, email, mobile, classInterested, targetExam, message }) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!botToken || !chatId) {
      console.warn("Telegram tokens missing in environment variables");
      return;
    }

    const text =
      `🔔 New Enquiry — Bihani Chemistry Classes\n\n` +
      `👤 Name: ${name}\n` +
      `📞 Phone: ${mobile}\n` +
      `✉️ Email: ${email || "-"}\n` +
      `🎓 Class: ${classInterested || "-"}\n` +
      `🎯 Exam: ${targetExam || "-"}\n` +
      `💬 Message: ${message || "-"}\n` +
      `🕒 Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, mobile, classInterested, targetExam, message } = body;

    if (!name || !mobile) {
      return NextResponse.json({ error: "Name and phone are required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contact_inquiries")
      .insert({
        name,
        email: email || null,
        mobile,
        class_interested: classInterested || null,
        target_exam: targetExam || null,
        message: message || null,
        status: "Unread",
      })
      .select()
      .single();

    if (error) throw error;

    // 🟢 CHANGE HERE: Await this call so Vercel keeps the connection open
    await notifyTelegram({ name, email, mobile, classInterested, targetExam, message });

    return NextResponse.json({ success: true, inquiry: data });
  } catch (error) {
    console.error("Contact enquiry insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}