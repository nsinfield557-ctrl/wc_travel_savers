import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "wc2030_travellers";
const BUDGETS_TABLE = "wc2030_budgets";
const CONTRIBUTIONS_TABLE = "wc2030_contributions";
const REACTIONS_TABLE = "wc2030_reactions";
const POLLS_TABLE = "wc2030_polls";

const TRIP_DATE = new Date("2030-06-08");
const FIRST_GAME_DATE = new Date("2030-06-15"); // placeholder - update when draw confirmed

const COLORS = ["#4f8ef7","#a78bfa","#34d399","#f87171","#ffcd00","#fb923c","#e879f9","#38bdf8","#4ade80","#f472b6"];
const EMOJIS = ["🦘","⚽","🌏","🍺","🎉","🏆","🔥","💪","✈️","🎸"];

const DEFAULT_CATEGORIES = [
  { label: "Flights", amount: 5000, icon: "✈️", color: "#4f8ef7" },
  { label: "Accommodation", amount: 3500, icon: "🏨", color: "#a78bfa" },
  { label: "Match Tickets", amount: 900, icon: "⚽", color: "#ffcd00" },
  { label: "Food & Drink", amount: 3500, icon: "🍷", color: "#f87171" },
  { label: "Transport", amount: 1200, icon: "🚄", color: "#34d399" },
  { label: "Insurance", amount: 500, icon: "🛡️", color: "#fb923c" },
  { label: "Spending money", amount: 2400, icon: "💶", color: "#e879f9" },
];

const DEFAULT_TARGET = DEFAULT_CATEGORIES.reduce((s, c) => s + c.amount, 0);

const BADGES = [
  { id: "first_save", icon: "🌱", label: "First Save", desc: "Made first contribution", threshold: (saved) => saved > 0 },
  { id: "one_k", icon: "💯", label: "$1K Club", desc: "Saved $1,000", threshold: (saved) => saved >= 1000 },
  { id: "five_k", icon: "🔥", label: "On Fire", desc: "Saved $5,000", threshold: (saved) => saved >= 5000 },
  { id: "ten_k", icon: "⚡", label: "Halfway Hero", desc: "Saved $10,000", threshold: (saved) => saved >= 10000 },
  { id: "flights", icon: "✈️", label: "Flight Ready", desc: "Saved enough for flights", threshold: (saved) => saved >= 5000 },
  { id: "fully_funded", icon: "🏆", label: "Fully Funded", desc: "Hit personal target!", threshold: (saved, target) => saved >= target },
];

const ITINERARY = [
  { phase: "Week 1–2", emoji: "🇮🇹🇪🇸", title: "Pre-match Europe", cities: ["Rome & Amalfi Coast", "Barcelona", "Madrid"], type: "explore" },
  { phase: "Week 3", emoji: "⚽🦘", title: "Game Week 1", cities: ["Seville — MATCH DAY 1", "Granada & Córdoba", "Bilbao / San Sebastián"], type: "match" },
  { phase: "Week 4", emoji: "⚽🦘", title: "Game Week 2", cities: ["Madrid fan zones", "MATCH DAY 2", "Valencia"], type: "match" },
  { phase: "Week 5", emoji: "🇵🇹", title: "Portugal Wind-down", cities: ["Lisbon", "Sintra & Cascais", "Porto → Fly home"], type: "explore" },
];

function monthsUntilTrip() {
  return Math.max(1, Math.round((TRIP_DATE - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
}

function daysUntil(date) {
  return Math.max(0, Math.floor((date - new Date()) / (1000 * 60 * 60 * 24)));
}

function fmt(n) {
  return "$" + Math.round(n).toLocaleString("en-AU");
}

function projectedFinishDate(saved, target, monthlyPledge) {
  if (saved >= target) return "Fully funded! 🏆";
  if (!monthlyPledge || monthlyPledge <= 0) return "Set a monthly pledge";
  const monthsNeeded = Math.ceil((target - saved) / monthlyPledge);
  const finish = new Date();
  finish.setMonth(finish.getMonth() + monthsNeeded);
  return finish.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function getStreak(contributions) {
  if (!contributions || contributions.length === 0) return 0;
  const months = new Set(contributions.map(c => {
    const d = new Date(c.created_at);
    return `${d.getFullYear()}-${d.getMonth()}`;
  }));
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (months.has(`${d.getFullYear()}-${d.getMonth()}`)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function ProgressRing({ pct, size = 80, stroke = 7, color = "#ffcd00", children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 1));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2040" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

export default function SavingsTracker() {
  const [travellers, setTravellers] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [contributions, setContributions] = useState({});
  const [reactions, setReactions] = useState({});
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [editingId, setEditingId] = useState(null);
  const [editSaved, setEditSaved] = useState("");
  const [editPledge, setEditPledge] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("🦘");
  const [editCategories, setEditCategories] = useState({});
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewingBudgetId, setViewingBudgetId] = useState(null);
  const [viewingHistoryId, setViewingHistoryId] = useState(null);
  const [myName, setMyName] = useState(localStorage.getItem("wc2030_myname") || "");
  const [showNamePicker, setShowNamePicker] = useState(!localStorage.getItem("wc2030_myname"));
  const [addingPoll, setAddingPoll] = useState(false);
  const [newPollQ, setNewPollQ] = useState("");
  const [newPollOpts, setNewPollOpts] = useState(["", ""]);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(null);

  const months = monthsUntilTrip();
  const daysToTrip = daysUntil(TRIP_DATE);
  const daysToGame = daysUntil(FIRST_GAME_DATE);

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2800);
  }

  function getPersonalTarget(travellerId) {
    const cats = budgets[travellerId];
    if (!cats || Object.keys(cats).length === 0) return DEFAULT_TARGET;
    return Object.values(cats).reduce((s, a) => s + a, 0);
  }

  const loadData = useCallback(async () => {
    try {
      const [travData, budgetData, contribData, reactData, pollData] = await Promise.all([
        sbFetch(`${TABLE}?order=id.asc`),
        sbFetch(`${BUDGETS_TABLE}?order=id.asc`),
        sbFetch(`${CONTRIBUTIONS_TABLE}?order=created_at.desc`),
        sbFetch(`${REACTIONS_TABLE}?order=created_at.desc`),
        sbFetch(`${POLLS_TABLE}?order=created_at.desc`),
      ]);

      setTravellers(travData.map((t, i) => ({
        ...t,
        color: t.color || COLORS[i % COLORS.length],
        emoji: t.emoji || "🦘"
      })));

      const budgetMap = {};
      budgetData.forEach(b => {
        if (!budgetMap[b.traveller_id]) budgetMap[b.traveller_id] = {};
        budgetMap[b.traveller_id][b.category] = b.amount;
      });
      setBudgets(budgetMap);

      const contribMap = {};
      contribData.forEach(c => {
        if (!contribMap[c.traveller_id]) contribMap[c.traveller_id] = [];
        contribMap[c.traveller_id].push(c);
      });
      setContributions(contribMap);

      const reactMap = {};
      reactData.forEach(r => {
        if (!reactMap[r.traveller_id]) reactMap[r.traveller_id] = [];
        reactMap[r.traveller_id].push(r);
      });
      setReactions(reactMap);

      setPolls(pollData);
      setError(null);
    } catch (e) {
      setError("Couldn't connect to database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function addTraveller() {
    if (!newName.trim()) return;
    setSyncing(true);
    try {
      const color = COLORS[travellers.length % COLORS.length];
      const newT = await sbFetch(TABLE, {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), saved: 0, monthly_pledge: 355, color, emoji: "🦘" })
      });
      const travellerId = newT[0].id;
      await Promise.all(DEFAULT_CATEGORIES.map(cat =>
        sbFetch(BUDGETS_TABLE, {
          method: "POST",
          body: JSON.stringify({ traveller_id: travellerId, category: cat.label, amount: cat.amount })
        })
      ));
      setNewName("");
      setAdding(false);
      await loadData();
      showToast(`${newName.trim()} added ✓`);
    } catch (e) {
      showToast("Failed to add traveller", true);
    } finally {
      setSyncing(false);
    }
  }

  async function saveEdit(t) {
    setSyncing(true);
    try {
      await sbFetch(`${TABLE}?id=eq.${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName || t.name,
          saved: Math.max(0, parseFloat(editSaved) || 0),
          monthly_pledge: Math.max(0, parseFloat(editPledge) || 0),
          emoji: editEmoji,
        })
      });
      const existingCats = budgets[t.id] || {};
      await Promise.all(DEFAULT_CATEGORIES.map(async cat => {
        const amount = Math.max(0, parseFloat(editCategories[cat.label]) || 0);
        if (existingCats[cat.label] !== undefined) {
          await sbFetch(`${BUDGETS_TABLE}?traveller_id=eq.${t.id}&category=eq.${encodeURIComponent(cat.label)}`, {
            method: "PATCH",
            body: JSON.stringify({ amount })
          });
        } else {
          await sbFetch(BUDGETS_TABLE, {
            method: "POST",
            body: JSON.stringify({ traveller_id: t.id, category: cat.label, amount })
          });
        }
      }));
      setEditingId(null);
      await loadData();
      showToast("Saved ✓");
    } catch (e) {
      showToast("Save failed", true);
    } finally {
      setSyncing(false);
    }
  }

  async function addContribution(t, amount) {
    if (!amount || amount <= 0) return;
    setSyncing(true);
    try {
      const newSaved = Math.max(0, (t.saved || 0) + amount);
      await Promise.all([
        sbFetch(`${TABLE}?id=eq.${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ saved: newSaved })
        }),
        sbFetch(CONTRIBUTIONS_TABLE, {
          method: "POST",
          body: JSON.stringify({ traveller_id: t.id, amount })
        })
      ]);
      await loadData();
      showToast(`+${fmt(amount)} logged ✓`);
    } catch (e) {
      showToast("Update failed", true);
    } finally {
      setSyncing(false);
      setShowCustomInput(null);
      setCustomAmount("");
    }
  }

  async function addReaction(travellerId, emoji) {
    try {
      await sbFetch(REACTIONS_TABLE, {
        method: "POST",
        body: JSON.stringify({ traveller_id: travellerId, emoji, reactor_name: myName || "Someone" })
      });
      await loadData();
    } catch (e) {}
  }

  async function voteOnPoll(pollId, option, currentVotes) {
    try {
      const votes = { ...currentVotes };
      votes[option] = (votes[option] || 0) + 1;
      if (myName) votes[`_voter_${myName}`] = option;
      await sbFetch(`${POLLS_TABLE}?id=eq.${pollId}`, {
        method: "PATCH",
        body: JSON.stringify({ votes })
      });
      await loadData();
      showToast("Vote cast ✓");
    } catch (e) {}
  }

  async function addPoll() {
    const opts = newPollOpts.filter(o => o.trim());
    if (!newPollQ.trim() || opts.length < 2) return;
    setSyncing(true);
    try {
      await sbFetch(POLLS_TABLE, {
        method: "POST",
        body: JSON.stringify({ question: newPollQ.trim(), options: opts, votes: {} })
      });
      setNewPollQ("");
      setNewPollOpts(["", ""]);
      setAddingPoll(false);
      await loadData();
      showToast("Poll created ✓");
    } catch (e) {
      showToast("Failed to create poll", true);
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditSaved(String(t.saved || 0));
    setEditPledge(String(t.monthly_pledge || 355));
    setEditName(t.name);
    setEditEmoji(t.emoji || "🦘");
    const existingCats = budgets[t.id] || {};
    const cats = {};
    DEFAULT_CATEGORIES.forEach(cat => {
      cats[cat.label] = existingCats[cat.label] !== undefined ? existingCats[cat.label] : cat.amount;
    });
    setEditCategories(cats);
  }

  // This month's contributions
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const leaderboard = travellers.map(t => {
    const thisMonthContribs = (contributions[t.id] || []).filter(c => {
      const d = new Date(c.created_at);
      return `${d.getFullYear()}-${d.getMonth()}` === thisMonthKey;
    });
    const thisMonthTotal = thisMonthContribs.reduce((s, c) => s + c.amount, 0);
    return { ...t, thisMonthTotal };
  }).sort((a, b) => b.thisMonthTotal - a.thisMonthTotal);

  const totalSaved = travellers.reduce((s, t) => s + (t.saved || 0), 0);
  const totalTarget = travellers.reduce((s, t) => s + getPersonalTarget(t.id), 0) || DEFAULT_TARGET;
  const totalPct = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const totalPledged = travellers.reduce((s, t) => s + (t.monthly_pledge || 0), 0);
  const totalMonthlyNeeded = travellers.reduce((s, t) => {
    const target = getPersonalTarget(t.id);
    return s + Math.max(0, target - (t.saved || 0)) / months;
  }, 0);
  const groupShortfall = totalMonthlyNeeded - totalPledged;

  const tabs = [
    { id: "overview", label: "📊" },
    { id: "travellers", label: "👥" },
    { id: "leaderboard", label: "🏆" },
    { id: "polls", label: "🗳️" },
    { id: "itinerary", label: "🗺️" },
  ];

  if (loading) return (
    <div style={{ background: "#0a0a1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontSize: "40px" }}>🦘</div>
      <div style={{ color: "#ffcd00", fontSize: "16px", fontWeight: "700", fontFamily: "system-ui" }}>Loading trip tracker...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#0a0a1a", minHeight: "100vh", color: "#e8eaf6", maxWidth: "480px", margin: "0 auto", position: "relative" }}>

      {/* Name picker modal */}
      {showNamePicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#111128", borderRadius: "16px", padding: "28px 24px", border: "2px solid #ffcd00", maxWidth: "320px", width: "100%" }}>
            <div style={{ fontSize: "32px", textAlign: "center", marginBottom: "12px" }}>🦘</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: "6px" }}>Who are you?</div>
            <div style={{ fontSize: "13px", color: "#6680a0", textAlign: "center", marginBottom: "20px" }}>So we know who's reacting and voting</div>
            <input type="text" value={myName} onChange={e => setMyName(e.target.value)}
              placeholder="Your name..."
              onKeyDown={e => e.key === "Enter" && myName.trim() && (localStorage.setItem("wc2030_myname", myName), setShowNamePicker(false))}
              style={{ width: "100%", background: "#0a0a18", border: "1px solid #334466", borderRadius: "8px", padding: "12px", color: "#e8eaf6", fontSize: "16px", outline: "none", boxSizing: "border-box", marginBottom: "12px" }} />
            <button onClick={() => { if (myName.trim()) { localStorage.setItem("wc2030_myname", myName); setShowNamePicker(false); }}}
              style={{ width: "100%", padding: "12px", borderRadius: "8px", background: "#ffcd00", color: "#000", border: "none", fontWeight: "800", fontSize: "16px", cursor: "pointer" }}>
              Let's go ⚽
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", background: toast.isError ? "#3d1a1a" : "#1b4332", color: toast.isError ? "#f87171" : "#74c69d", padding: "10px 20px", borderRadius: "20px", fontSize: "14px", fontWeight: "600", zIndex: 1000, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", border: `1px solid ${toast.isError ? "#6a2d2d" : "#2d6a4f"}`, whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #003f88 0%, #0a0a1a 100%)", padding: "28px 20px 20px", borderBottom: "2px solid #ffcd00" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#ffcd00", textTransform: "uppercase" }}>🦘 World Cup 2030</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {syncing && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffcd00" }} />}
            <button onClick={() => setShowNamePicker(true)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid #334", borderRadius: "6px", color: "#8090a8", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>{myName || "Set name"}</button>
            <button onClick={loadData} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid #334", borderRadius: "6px", color: "#8090a8", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>↻</button>
          </div>
        </div>

        {/* Dual countdown */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#ffcd00", lineHeight: 1 }}>{daysToTrip}</div>
            <div style={{ fontSize: "10px", color: "#6680a0", marginTop: "2px" }}>days to World Cup</div>
            <div style={{ fontSize: "9px", color: "#334455", marginTop: "1px" }}>8 Jun 2030</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#34d399", lineHeight: 1 }}>{daysToGame}</div>
            <div style={{ fontSize: "10px", color: "#6680a0", marginTop: "2px" }}>days to first game</div>
            <div style={{ fontSize: "9px", color: "#334455", marginTop: "1px" }}>🦘 Socceroos</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "26px", fontWeight: "800", color: "#a78bfa", lineHeight: 1 }}>{months}</div>
            <div style={{ fontSize: "10px", color: "#6680a0", marginTop: "2px" }}>months to save</div>
            <div style={{ fontSize: "9px", color: "#334455", marginTop: "1px" }}>{travellers.length} travellers</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "32px", fontWeight: "800", lineHeight: 1, color: "#fff" }}>{fmt(totalSaved)}</div>
            <div style={{ fontSize: "13px", color: "#6680a0", marginTop: "4px" }}>of {fmt(totalTarget)} group target</div>
          </div>
          <ProgressRing pct={totalPct} size={72} stroke={6} color="#ffcd00">
            <div style={{ fontSize: "15px", fontWeight: "800", color: "#ffcd00" }}>{Math.round(totalPct * 100)}%</div>
          </ProgressRing>
        </div>

        <div style={{ marginTop: "12px", background: "#111132", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, totalPct * 100)}%`, background: "linear-gradient(90deg, #003f88, #ffcd00)", borderRadius: "6px", transition: "width 0.6s ease" }} />
        </div>

        {/* Group shortfall warning */}
        {groupShortfall > 50 && (
          <div style={{ marginTop: "10px", background: "#2d1a0a", border: "1px solid #fb923c", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#fb923c" }}>
            ⚠️ Group is {fmt(groupShortfall)}/mo short of target — nudge your crew!
          </div>
        )}

        {error && (
          <div style={{ marginTop: "10px", background: "#2d1010", border: "1px solid #6a2d2d", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#f87171" }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#0d0d20", borderBottom: "1px solid #1a1a35" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, background: "none", border: "none", padding: "14px 0",
            color: activeTab === tab.id ? "#ffcd00" : "#445566",
            borderBottom: activeTab === tab.id ? "2px solid #ffcd00" : "2px solid transparent",
            fontSize: "18px", cursor: "pointer", transition: "all 0.2s"
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: "16px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div>
            <div style={{ marginBottom: "8px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>Group Progress</div>
            {travellers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#445566" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>👥</div>
                <div style={{ fontSize: "15px", color: "#8090a8" }}>No travellers yet — go to 👥 to add your crew</div>
              </div>
            ) : travellers.map(t => {
              const target = getPersonalTarget(t.id);
              const pct = (t.saved || 0) / target;
              const remaining = Math.max(0, target - (t.saved || 0));
              const onTrack = (t.monthly_pledge || 0) * months >= remaining;
              const streak = getStreak(contributions[t.id]);
              const earnedBadges = BADGES.filter(b => b.threshold(t.saved || 0, target));
              const hasBudget = budgets[t.id] && Object.keys(budgets[t.id]).length > 0;
              const tReactions = reactions[t.id] || [];
              const reactionCounts = tReactions.reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {});
              const finishDate = projectedFinishDate(t.saved || 0, target, t.monthly_pledge || 0);

              return (
                <div key={t.id} style={{ background: "#111128", borderRadius: "12px", marginBottom: "12px", border: "1px solid #1a1a35", overflow: "hidden" }}>
                  <div style={{ padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: (t.color || "#4f8ef7") + "22", border: `2px solid ${t.color || "#4f8ef7"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                          {t.emoji || t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "15px" }}>{t.name}
                            {streak > 1 && <span style={{ marginLeft: "6px", fontSize: "11px", color: "#fb923c" }}>🔥 {streak}mo streak</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: "#445566" }}>{fmt(t.monthly_pledge || 0)}/mo · {finishDate}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "800", fontSize: "18px", color: t.color || "#4f8ef7" }}>{fmt(t.saved || 0)}</div>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: onTrack ? "#34d399" : "#f87171" }}>
                          {onTrack ? "✓ ON TRACK" : "⚠ BEHIND"}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "#0a0a18", borderRadius: "4px", height: "5px", overflow: "hidden", marginBottom: "6px" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct * 100)}%`, background: t.color || "#4f8ef7", borderRadius: "4px", transition: "width 0.5s ease" }} />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ fontSize: "11px", color: "#445566" }}>{fmt(remaining)} remaining · {Math.round(pct * 100)}%</div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {hasBudget && (
                          <button onClick={() => setViewingBudgetId(viewingBudgetId === t.id ? null : t.id)} style={{ background: "none", border: "none", color: "#445566", fontSize: "11px", cursor: "pointer" }}>
                            {viewingBudgetId === t.id ? "▲" : "▼ budget"}
                          </button>
                        )}
                        {(contributions[t.id] || []).length > 0 && (
                          <button onClick={() => setViewingHistoryId(viewingHistoryId === t.id ? null : t.id)} style={{ background: "none", border: "none", color: "#445566", fontSize: "11px", cursor: "pointer" }}>
                            📋
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    {earnedBadges.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                        {earnedBadges.map(b => (
                          <div key={b.id} title={b.desc} style={{ background: "#1a1a35", borderRadius: "20px", padding: "3px 8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                            {b.icon} <span style={{ fontSize: "10px", color: "#8090a8" }}>{b.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reactions */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      {["🦘","⚽","🔥","💪"].map(emoji => (
                        <button key={emoji} onClick={() => addReaction(t.id, emoji)} style={{ background: "#1a1a35", border: "1px solid #2a2a50", borderRadius: "20px", padding: "4px 8px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}>
                          {emoji} {reactionCounts[emoji] ? <span style={{ fontSize: "11px", color: "#8090a8" }}>{reactionCounts[emoji]}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Budget breakdown */}
                  {viewingBudgetId === t.id && hasBudget && (
                    <div style={{ borderTop: "1px solid #1a1a35", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>{t.name}'s Budget</div>
                      {DEFAULT_CATEGORIES.map(cat => {
                        const amount = budgets[t.id][cat.label] !== undefined ? budgets[t.id][cat.label] : cat.amount;
                        return (
                          <div key={cat.label} style={{ marginBottom: "7px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                              <span style={{ fontSize: "12px", color: "#c8d0e0" }}>{cat.icon} {cat.label}</span>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: cat.color }}>{fmt(amount)}</span>
                            </div>
                            <div style={{ background: "#0a0a18", borderRadius: "3px", height: "3px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(amount / target) * 100}%`, background: cat.color, borderRadius: "3px" }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: "1px solid #1a1a35", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700" }}>Total</span>
                        <span style={{ fontSize: "12px", fontWeight: "800", color: "#ffcd00" }}>{fmt(target)}</span>
                      </div>
                    </div>
                  )}

                  {/* Contribution history */}
                  {viewingHistoryId === t.id && (
                    <div style={{ borderTop: "1px solid #1a1a35", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>Contribution History</div>
                      {(contributions[t.id] || []).slice(0, 10).map((c, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #0d0d1e" }}>
                          <span style={{ fontSize: "12px", color: "#8090a8" }}>{new Date(c.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "#34d399" }}>+{fmt(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Milestones */}
            <div style={{ marginTop: "8px", marginBottom: "8px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>Group Milestones</div>
            {[
              { label: "Flights booked", pct: 0.29, icon: "✈️", desc: "~$5k pp saved" },
              { label: "Accommodation locked", pct: 0.50, icon: "🏨", desc: "~$8.5k pp saved" },
              { label: "Tickets purchased", pct: 0.56, icon: "⚽", desc: "~$9.4k pp saved" },
              { label: "Fully funded!", pct: 1.0, icon: "🏆", desc: `${fmt(DEFAULT_TARGET)} pp saved` },
            ].map(m => {
              const reached = totalPct >= m.pct;
              return (
                <div key={m.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", marginBottom: "8px", background: reached ? "#0d2818" : "#0d0d1e", borderRadius: "10px", border: `1px solid ${reached ? "#2d6a4f" : "#1a1a35"}`, opacity: reached ? 1 : 0.6 }}>
                  <div style={{ fontSize: "20px" }}>{reached ? "✅" : m.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "700", fontSize: "13px", color: reached ? "#74c69d" : "#c8d0e0" }}>{m.label}</div>
                    <div style={{ fontSize: "11px", color: "#445566" }}>{m.desc}</div>
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: reached ? "#74c69d" : "#2a3050" }}>{Math.round(m.pct * 100)}%</div>
                </div>
              );
            })}
          </div>
        )}

        {/* TRAVELLERS */}
        {activeTab === "travellers" && (
          <div>
            <div style={{ marginBottom: "12px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>
              Update Savings · {travellers.length} traveller{travellers.length !== 1 ? "s" : ""}
            </div>

            {travellers.map(t => (
              <div key={t.id} style={{ background: "#111128", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: `1px solid ${editingId === t.id ? (t.color || "#4f8ef7") : "#1a1a35"}` }}>
                {editingId === t.id ? (
                  <div>
                    <div style={{ fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "14px" }}>Editing {t.name}</div>

                    {/* Emoji picker */}
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ fontSize: "12px", color: "#556070", marginBottom: "6px" }}>Your avatar</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {EMOJIS.map(e => (
                          <button key={e} onClick={() => setEditEmoji(e)} style={{ fontSize: "22px", background: editEmoji === e ? "#1a2a50" : "none", border: editEmoji === e ? `2px solid ${t.color || "#4f8ef7"}` : "2px solid transparent", borderRadius: "8px", padding: "4px", cursor: "pointer" }}>{e}</button>
                        ))}
                      </div>
                    </div>

                    {[
                      { label: "Name", val: editName, set: setEditName, type: "text" },
                      { label: "Total saved ($)", val: editSaved, set: setEditSaved, type: "number" },
                      { label: "Monthly pledge ($)", val: editPledge, set: setEditPledge, type: "number" },
                    ].map(field => (
                      <div key={field.label} style={{ marginBottom: "10px" }}>
                        <div style={{ fontSize: "12px", color: "#556070", marginBottom: "4px" }}>{field.label}</div>
                        <input type={field.type} value={field.val} onChange={e => field.set(e.target.value)}
                          style={{ width: "100%", background: "#0a0a18", border: `1px solid ${(t.color || "#4f8ef7")}44`, borderRadius: "8px", padding: "10px 12px", color: "#e8eaf6", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}

                    <div style={{ marginTop: "16px", marginBottom: "8px" }}>
                      <div style={{ fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>My Budget by Category</div>
                      {DEFAULT_CATEGORIES.map(cat => (
                        <div key={cat.label} style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "16px", minWidth: "24px" }}>{cat.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "11px", color: "#556070", marginBottom: "3px" }}>{cat.label}</div>
                            <input type="number" value={editCategories[cat.label] ?? cat.amount}
                              onChange={e => setEditCategories(prev => ({ ...prev, [cat.label]: e.target.value }))}
                              style={{ width: "100%", background: "#0a0a18", border: `1px solid ${cat.color}44`, borderRadius: "6px", padding: "8px 10px", color: "#e8eaf6", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ fontSize: "12px", color: cat.color, minWidth: "52px", textAlign: "right" }}>
                            {fmt(parseFloat(editCategories[cat.label]) || 0)}
                          </div>
                        </div>
                      ))}
                      <div style={{ background: "#0a0a18", borderRadius: "8px", padding: "10px 12px", display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                        <span style={{ fontSize: "13px", color: "#8090a8" }}>My total target</span>
                        <span style={{ fontSize: "16px", fontWeight: "800", color: "#ffcd00" }}>
                          {fmt(DEFAULT_CATEGORIES.reduce((s, cat) => s + (parseFloat(editCategories[cat.label]) || 0), 0))}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                      <button onClick={() => saveEdit(t)} disabled={syncing} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: t.color || "#4f8ef7", color: "#000", border: "none", fontWeight: "700", fontSize: "14px", cursor: "pointer", opacity: syncing ? 0.6 : 1 }}>
                        {syncing ? "Saving..." : "Save"}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#1a1a35", color: "#8090a8", border: "none", fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: (t.color || "#4f8ef7") + "22", border: `2px solid ${t.color || "#4f8ef7"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                          {t.emoji || t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "15px" }}>{t.name}</div>
                          <div style={{ fontSize: "12px", color: "#445566" }}>{fmt(t.monthly_pledge || 0)}/mo · target {fmt(getPersonalTarget(t.id))}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "800", fontSize: "18px", color: t.color || "#4f8ef7" }}>{fmt(t.saved || 0)}</div>
                        <div style={{ fontSize: "11px", color: "#445566" }}>{Math.round((t.saved || 0) / getPersonalTarget(t.id) * 100)}% of goal</div>
                      </div>
                    </div>

                    {/* Quick add */}
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                      {[100, 250, 500, 1000].map(amt => (
                        <button key={amt} onClick={() => addContribution(t, amt)} disabled={syncing} style={{ flex: 1, padding: "8px 0", background: (t.color || "#4f8ef7") + "18", border: `1px solid ${(t.color || "#4f8ef7")}44`, borderRadius: "6px", color: t.color || "#4f8ef7", fontSize: "12px", fontWeight: "700", cursor: "pointer", opacity: syncing ? 0.5 : 1 }}>
                          +{fmt(amt)}
                        </button>
                      ))}
                    </div>

                    {/* Custom amount */}
                    {showCustomInput === t.id ? (
                      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                        <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="Custom amount..."
                          style={{ flex: 1, background: "#0a0a18", border: "1px solid #334466", borderRadius: "6px", padding: "8px 10px", color: "#e8eaf6", fontSize: "14px", outline: "none" }} />
                        <button onClick={() => addContribution(t, parseFloat(customAmount) || 0)} style={{ padding: "8px 14px", background: t.color || "#4f8ef7", border: "none", borderRadius: "6px", color: "#000", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>Add</button>
                        <button onClick={() => { setShowCustomInput(null); setCustomAmount(""); }} style={{ padding: "8px 10px", background: "#1a1a35", border: "none", borderRadius: "6px", color: "#8090a8", fontSize: "13px", cursor: "pointer" }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowCustomInput(t.id)} style={{ width: "100%", padding: "7px", background: "none", border: "1px dashed #2a2a50", borderRadius: "6px", color: "#445566", fontSize: "12px", cursor: "pointer", marginBottom: "8px" }}>
                        + Custom amount
                      </button>
                    )}

                    <button onClick={() => startEdit(t)} style={{ width: "100%", padding: "9px", background: "#1a1a35", border: "1px solid #2a2a50", borderRadius: "8px", color: "#8090a8", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                      Edit details & budget
                    </button>
                  </div>
                )}
              </div>
            ))}

            {adding ? (
              <div style={{ background: "#111128", borderRadius: "12px", padding: "16px", border: "1px solid #2a2a50" }}>
                <div style={{ fontSize: "12px", color: "#556070", marginBottom: "8px" }}>Name</div>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Enter name..." onKeyDown={e => e.key === "Enter" && addTraveller()} autoFocus
                  style={{ width: "100%", background: "#0a0a18", border: "1px solid #334466", borderRadius: "8px", padding: "10px 12px", color: "#e8eaf6", fontSize: "15px", outline: "none", boxSizing: "border-box", marginBottom: "10px" }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={addTraveller} disabled={syncing || !newName.trim()} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#ffcd00", color: "#000", border: "none", fontWeight: "700", fontSize: "14px", cursor: "pointer", opacity: (!newName.trim() || syncing) ? 0.5 : 1 }}>
                    {syncing ? "Adding..." : "Add"}
                  </button>
                  <button onClick={() => { setAdding(false); setNewName(""); }} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#1a1a35", color: "#8090a8", border: "none", fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "14px", background: "#0d0d20", border: "2px dashed #2a2a50", borderRadius: "12px", color: "#445566", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                + Add traveller
              </button>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab === "leaderboard" && (
          <div>
            <div style={{ marginBottom: "8px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>This Month's Top Savers</div>
            {leaderboard.map((t, i) => {
              const target = getPersonalTarget(t.id);
              const pct = (t.saved || 0) / target;
              const streak = getStreak(contributions[t.id]);
              const medals = ["🥇","🥈","🥉"];
              return (
                <div key={t.id} style={{ background: i === 0 ? "#1a1a0a" : "#111128", borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", border: `1px solid ${i === 0 ? "#ffcd00" : "#1a1a35"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "24px", minWidth: "32px" }}>{medals[i] || `${i+1}`}</div>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: (t.color || "#4f8ef7") + "22", border: `2px solid ${t.color || "#4f8ef7"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                      {t.emoji || t.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "700", fontSize: "15px" }}>{t.name}
                        {streak > 1 && <span style={{ marginLeft: "6px", fontSize: "11px", color: "#fb923c" }}>🔥 {streak}mo</span>}
                      </div>
                      <div style={{ background: "#0a0a18", borderRadius: "3px", height: "4px", overflow: "hidden", marginTop: "6px" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct * 100)}%`, background: t.color || "#4f8ef7", borderRadius: "3px" }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: "800", fontSize: "16px", color: i === 0 ? "#ffcd00" : (t.color || "#4f8ef7") }}>{fmt(t.saved || 0)}</div>
                      {t.thisMonthTotal > 0 && <div style={{ fontSize: "11px", color: "#34d399" }}>+{fmt(t.thisMonthTotal)} this month</div>}
                    </div>
                  </div>

                  {/* Badges */}
                  {BADGES.filter(b => b.threshold(t.saved || 0, target)).length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                      {BADGES.filter(b => b.threshold(t.saved || 0, target)).map(b => (
                        <div key={b.id} title={b.desc} style={{ background: "#1a1a35", borderRadius: "20px", padding: "2px 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}>
                          {b.icon} <span style={{ color: "#8090a8" }}>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* POLLS */}
        {activeTab === "polls" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>Group Polls</div>
              <button onClick={() => setAddingPoll(!addingPoll)} style={{ background: "#003f88", border: "none", borderRadius: "6px", color: "#ffcd00", fontSize: "12px", fontWeight: "700", padding: "6px 12px", cursor: "pointer" }}>
                + New poll
              </button>
            </div>

            {addingPoll && (
              <div style={{ background: "#111128", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "1px solid #2a2a50" }}>
                <div style={{ fontSize: "12px", color: "#556070", marginBottom: "6px" }}>Question</div>
                <input type="text" value={newPollQ} onChange={e => setNewPollQ(e.target.value)} placeholder="e.g. Seville or Valencia first?"
                  style={{ width: "100%", background: "#0a0a18", border: "1px solid #334466", borderRadius: "8px", padding: "10px 12px", color: "#e8eaf6", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "10px" }} />
                <div style={{ fontSize: "12px", color: "#556070", marginBottom: "6px" }}>Options</div>
                {newPollOpts.map((opt, i) => (
                  <input key={i} type="text" value={opt} onChange={e => { const o = [...newPollOpts]; o[i] = e.target.value; setNewPollOpts(o); }}
                    placeholder={`Option ${i + 1}`}
                    style={{ width: "100%", background: "#0a0a18", border: "1px solid #334466", borderRadius: "8px", padding: "8px 12px", color: "#e8eaf6", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "6px" }} />
                ))}
                <button onClick={() => setNewPollOpts([...newPollOpts, ""])} style={{ background: "none", border: "1px dashed #2a2a50", borderRadius: "6px", color: "#445566", fontSize: "12px", padding: "6px 12px", cursor: "pointer", marginBottom: "10px" }}>
                  + Add option
                </button>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={addPoll} disabled={syncing} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#ffcd00", color: "#000", border: "none", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>Create</button>
                  <button onClick={() => setAddingPoll(false)} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#1a1a35", color: "#8090a8", border: "none", fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            {polls.length === 0 && !addingPoll ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#445566" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🗳️</div>
                <div style={{ fontSize: "14px", color: "#8090a8" }}>No polls yet — create one to get the group deciding!</div>
              </div>
            ) : polls.map(poll => {
              const opts = Array.isArray(poll.options) ? poll.options : [];
              const votes = poll.votes || {};
              const totalVotes = opts.reduce((s, o) => s + (votes[o] || 0), 0);
              const myVote = myName ? votes[`_voter_${myName}`] : null;
              return (
                <div key={poll.id} style={{ background: "#111128", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: "1px solid #1a1a35" }}>
                  <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "12px", color: "#e8eaf6" }}>{poll.question}</div>
                  {opts.map(opt => {
                    const count = votes[opt] || 0;
                    const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                    const isMyVote = myVote === opt;
                    return (
                      <button key={opt} onClick={() => !myVote && voteOnPoll(poll.id, opt, votes)}
                        style={{ width: "100%", marginBottom: "8px", background: isMyVote ? "#1a2a50" : "#0d0d20", border: `1px solid ${isMyVote ? "#4f8ef7" : "#2a2a50"}`, borderRadius: "8px", padding: "10px 12px", cursor: myVote ? "default" : "pointer", position: "relative", overflow: "hidden", textAlign: "left" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: isMyVote ? "#1a3a6e" : "#1a1a35", transition: "width 0.5s ease" }} />
                        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "14px", color: isMyVote ? "#4f8ef7" : "#c8d0e0", fontWeight: isMyVote ? "700" : "400" }}>
                            {isMyVote && "✓ "}{opt}
                          </span>
                          <span style={{ fontSize: "12px", color: "#445566" }}>{count} vote{count !== 1 ? "s" : ""} · {Math.round(pct)}%</span>
                        </div>
                      </button>
                    );
                  })}
                  <div style={{ fontSize: "11px", color: "#445566", marginTop: "4px" }}>{totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ITINERARY */}
        {activeTab === "itinerary" && (
          <div>
            <div style={{ marginBottom: "12px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>5-Week Trip Plan</div>
            {ITINERARY.map((week, i) => (
              <div key={i} style={{ background: week.type === "match" ? "#001a3d" : "#111128", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: `1px solid ${week.type === "match" ? "#ffcd00" : "#1a1a35"}`, boxShadow: week.type === "match" ? "0 0 20px rgba(255,205,0,0.1)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "22px" }}>{week.emoji}</div>
                  <div>
                    <div style={{ fontSize: "10px", color: week.type === "match" ? "#ffcd00" : "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>{week.phase}</div>
                    <div style={{ fontWeight: "800", fontSize: "16px", color: week.type === "match" ? "#ffcd00" : "#e8eaf6" }}>{week.title}</div>
                  </div>
                </div>
                {week.cities.map((city, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: j < week.cities.length - 1 ? "1px solid #1a1a35" : "none" }}>
                    <span style={{ color: week.type === "match" ? "#ffcd00" : "#445566", fontSize: "12px" }}>→</span>
                    <span style={{ fontSize: "13px", color: city.includes("MATCH") ? "#ffcd00" : "#c8d0e0", fontWeight: city.includes("MATCH") ? "700" : "400" }}>{city}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ background: "#0d0d20", borderRadius: "10px", padding: "12px 14px", border: "1px solid #1a1a35", fontSize: "12px", color: "#445566", lineHeight: "1.6" }}>
              📌 Exact Socceroos match cities TBC after the 2029 group draw. Socceroos first game date is a placeholder — update when confirmed.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
