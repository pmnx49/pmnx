import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://qwwytgkbeatehqtphzfd.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3d3l0Z2tiZWF0ZWhxdHBoemZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAwMzAxNywiZXhwIjoyMDkzNTc5MDE3fQ.zhzikwejpUnIVbr2KnvzkY5Qm0OmL_k8fcbvf7zmJD0"; 
const BOT_TOKEN = "8684581925:AAE1KX40c-SkyPGRxydJNhClSKuZjlu1CSM";
const CHAT_ID = "7622102612";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();

    // Обработка кнопок из Telegram (Принять/Отклонить)
    if (body.callback_query) {
      const [action, leadId] = body.callback_query.data.split("_");
      const newStatus = action === "accept" ? "accepted" : "rejected";
      const statusText = action === "accept" ? "✅ ПРИНЯТА" : "❌ ОТКЛОНЕНА";

      await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.callback_query.message.chat.id,
          message_id: body.callback_query.message.message_id,
          text: body.callback_query.message.text + `\n\n📢 Статус изменен: ${statusText}`,
        })
      });
      return new Response("ok");
    }

    // Проверка статуса (для кнопки на сайте)
    if (body.type === "status") {
      const { data } = await supabase.from("leads").select("*").eq("id", body.id).maybeSingle();
      return new Response(JSON.stringify(data || { status: "not_found" }), { headers: corsHeaders });
    }

    // Новая заявка с сайта
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    
    const { error: dbError } = await supabase.from("leads").insert([{ 
      id, 
      name: body.name, 
      phone: body.phone, 
      service: body.service, 
      message: body.message, 
      status: 'pending' 
    }]);

    if (dbError) throw dbError;

    // Текст сообщения в Telegram
    const tgText = `👷 *Новая заявка*\n\n🆔 ID: ${id}\n👤 Имя: ${body.name}\n📞 Тел: ${body.phone}\n📂 Услуга: ${body.service}\n📝 Вопрос: ${body.message}`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: tgText,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Принять", callback_data: `accept_${id}` },
            { text: "❌ Отклонить", callback_data: `reject_${id}` }
          ]]
        }
      })
    });

    return new Response(JSON.stringify({ id }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 400 });
  }
});