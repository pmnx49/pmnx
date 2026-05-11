import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();

    // 1. ПРОВЕРКА СТАТУСА
    if (body.type === "status") {
      const { data, error } = await supabase
        .from("leads")
        .select("id, status")
        .eq("id", body.id)
        .single();

      if (error || !data) return new Response(JSON.stringify({ status: "not_found" }), { headers: corsHeaders });
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // 2. CALLBACK ОТ ТЕЛЕГРАМ
    if (body.callback_query) {
      const cb = body.callback_query;
      const [action, orderId] = cb.data.split(":");
      const newStatus = action === "accept" ? "accepted" : "rejected";

      await supabase.from("leads").update({ status: newStatus }).eq("id", orderId);

      const statusText = action === "accept" ? "✅ ПРИНЯТО" : "❌ ОТКЛОНЕНО";
      
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: cb.message.message_id,
          text: `${cb.message.text}\n\nИТОГ: ${statusText}`
        })
      });

      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // 3. НОВАЯ ЗАЯВКА (Валидация)
    const { name, phone, service, message } = body;

    if (!name || name.trim().length < 2) throw new Error("Введите имя (минимум 2 символа)");
    if (!phone || !/^\+7\d{10}$/.test(phone)) throw new Error("Формат телефона: +77XXXXXXXXX (12 цифр)");
    if (!service) throw new Error("Выберите услугу из списка");
    if (!message || message.trim().length < 5) throw new Error("Опишите ваш вопрос (минимум 5 символов)");

    const { data, error: dbError } = await supabase
      .from("leads")
      .insert([{ name, phone, service, message, status: "pending" }])
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    const text = `🚀 НОВАЯ ЗАЯВКА #${data.id}\n👤 Имя: ${name}\n📞 Тел: ${phone}\n🛠 Услуга: ${service}\n📝 Вопрос: ${message}`;
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Принять", callback_data: `accept:${data.id}` },
            { text: "❌ Отклонить", callback_data: `reject:${data.id}` }
          ]]
        }
      })
    });

    return new Response(JSON.stringify({ id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
})