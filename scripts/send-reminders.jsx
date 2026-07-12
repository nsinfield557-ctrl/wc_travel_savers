// Monthly savings reminder script
// Runs via GitHub Actions on the 1st of each month
// Fetches all travellers with emails and sends personalised reminders via Resend

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.SITE_URL || "https://nsinfield557-ctrl.github.io/wc_travel_savers/";

const DEFAULT_TARGET = 17000;
const TRIP_DATE = new Date("2030-06-08");

function monthsUntilTrip() {
  return Math.max(1, Math.round((TRIP_DATE - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
}

function fmt(n) {
  return "$" + Math.round(n).toLocaleString("en-AU");
}

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    }
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "WC2030 Trip 🦘 <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error for ${to}: ${err}`);
  }
  return await res.json();
}

function buildEmailHtml(traveller, target, months) {
  const saved = traveller.saved || 0;
  const remaining = Math.max(0, target - saved);
  const pct = Math.round((saved / target) * 100);
  const pledge = traveller.monthly_pledge || 0;
  const onTrack = pledge * months >= remaining;
  const monthlyNeeded = remaining > 0 ? Math.ceil(remaining / months) : 0;
  const emoji = traveller.emoji || "🦘";

  const statusColour = onTrack ? "#34d399" : "#f87171";
  const statusText = onTrack
    ? `✅ You're on track! Keep up the ${fmt(pledge)}/month and you'll be there.`
    : `⚠️ You're a little behind — you need ${fmt(monthlyNeeded)}/month to hit your target in time.`;

  // Progress bar width capped at 100%
  const barWidth = Math.min(100, pct);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#003f88,#0a0a1a);border-radius:16px;padding:32px;text-align:center;border-bottom:3px solid #ffcd00;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">${emoji}</div>
      <div style="font-size:12px;letter-spacing:3px;color:#ffcd00;text-transform:uppercase;margin-bottom:8px;">World Cup 2030</div>
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 6px;">Hey ${traveller.name}!</h1>
      <p style="color:#6680a0;margin:0;font-size:15px;">Time to log this month's savings 💰</p>
    </div>

    <!-- Progress card -->
    <div style="background:#111128;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #1a1a35;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;">
        <div>
          <div style="font-size:32px;font-weight:800;color:#ffffff;">${fmt(saved)}</div>
          <div style="font-size:13px;color:#6680a0;margin-top:2px;">of ${fmt(target)} target</div>
        </div>
        <div style="font-size:28px;font-weight:800;color:#ffcd00;">${pct}%</div>
      </div>

      <!-- Progress bar -->
      <div style="background:#0a0a18;border-radius:6px;height:10px;overflow:hidden;margin-bottom:16px;">
        <div style="height:100%;width:${barWidth}%;background:linear-gradient(90deg,#003f88,#ffcd00);border-radius:6px;"></div>
      </div>

      <div style="font-size:14px;color:${statusColour};padding:10px 14px;background:${onTrack ? "#0d2818" : "#2d1010"};border-radius:8px;border:1px solid ${statusColour}33;">
        ${statusText}
      </div>
    </div>

    <!-- Stats row -->
    <div style="display:flex;gap:10px;margin-bottom:24px;">
      <div style="flex:1;background:#111128;border-radius:10px;padding:14px;text-align:center;border:1px solid #1a1a35;">
        <div style="font-size:20px;font-weight:800;color:#a78bfa;">${fmt(remaining)}</div>
        <div style="font-size:11px;color:#556070;margin-top:3px;">still to save</div>
      </div>
      <div style="flex:1;background:#111128;border-radius:10px;padding:14px;text-align:center;border:1px solid #1a1a35;">
        <div style="font-size:20px;font-weight:800;color:#34d399;">${months}</div>
        <div style="font-size:11px;color:#556070;margin-top:3px;">months to go</div>
      </div>
      <div style="flex:1;background:#111128;border-radius:10px;padding:14px;text-align:center;border:1px solid #1a1a35;">
        <div style="font-size:20px;font-weight:800;color:#ffcd00;">${fmt(monthlyNeeded)}</div>
        <div style="font-size:11px;color:#556070;margin-top:3px;">needed/month</div>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${SITE_URL}" style="display:inline-block;background:#ffcd00;color:#000000;font-weight:800;font-size:16px;padding:16px 40px;border-radius:10px;text-decoration:none;">
        Log my savings 🦘
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:12px;color:#334455;padding-top:16px;border-top:1px solid #1a1a35;">
      <p style="margin:0 0 4px;">Spain · Portugal · 2030 ⚽</p>
      <p style="margin:0;">You're receiving this because you signed up for monthly reminders.</p>
    </div>

  </div>
</body>
</html>
  `;
}

async function main() {
  console.log("🦘 WC2030 Monthly Reminder — starting...");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !RESEND_API_KEY) {
    console.error("❌ Missing environment variables. Check VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, RESEND_API_KEY");
    process.exit(1);
  }

  // Fetch all travellers with emails and their budgets
  const [travellers, budgets] = await Promise.all([
    sbFetch(`wc2030_travellers?order=id.asc`),
    sbFetch(`wc2030_budgets?order=id.asc`)
  ]);

  // Build budget map
  const budgetMap = {};
  budgets.forEach(b => {
    if (!budgetMap[b.traveller_id]) budgetMap[b.traveller_id] = [];
    budgetMap[b.traveller_id].push(b.amount);
  });

  const withEmails = travellers.filter(t => t.email && t.email.trim());
  console.log(`Found ${withEmails.length} travellers with email addresses`);

  const months = monthsUntilTrip();
  let sent = 0;
  let failed = 0;

  for (const traveller of withEmails) {
    const cats = budgetMap[traveller.id];
    const target = cats && cats.length > 0
      ? cats.reduce((s, a) => s + a, 0)
      : DEFAULT_TARGET;

    try {
      const html = buildEmailHtml(traveller, target, months);
      const subject = `🦘 WC2030 — Log your savings for ${new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" })}!`;
      await sendEmail(traveller.email, subject, html);
      console.log(`✅ Sent to ${traveller.name} (${traveller.email})`);
      sent++;
    } catch (e) {
      console.error(`❌ Failed for ${traveller.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n🏁 Done — ${sent} sent, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
