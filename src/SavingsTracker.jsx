import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "wc2030_travellers";
const BUDGETS_TABLE = "wc2030_budgets";
const TRIP_DATE = new Date("2030-06-08");

const COLORS = ["#4f8ef7","#a78bfa","#34d399","#f87171","#ffcd00","#fb923c","#e879f9","#38bdf8","#4ade80","#f472b6"];

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

function monthsUntilTrip() {
  return Math.max(1, Math.round((TRIP_DATE - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
}

function fmt(n) {
  return "$" + Math.round(n).toLocaleString("en-AU");
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
  const [budgets, setBudgets] = useState({}); // { traveller_id: { category: amount } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [editingId, setEditingId] = useState(null);
  const [editSaved, setEditSaved] = useState("");
  const [editPledge, setEditPledge] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategories, setEditCategories] = useState({});
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewingBudgetId, setViewingBudgetId] = useState(null);

  const months = monthsUntilTrip();

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2800);
  }

  // Get personal target for a traveller from their category budgets
  function getPersonalTarget(travellerId) {
    const cats = budgets[travellerId];
    if (!cats || Object.keys(cats).length === 0) return DEFAULT_TARGET;
    return Object.values(cats).reduce((s, a) => s + a, 0);
  }

  const loadData = useCallback(async () => {
    try {
      const [travData, budgetData] = await Promise.all([
        sbFetch(`${TABLE}?order=id.asc`),
        sbFetch(`${BUDGETS_TABLE}?order=id.asc`)
      ]);

      setTravellers(travData.map((t, i) => ({
        ...t,
        color: t.color || COLORS[i % COLORS.length]
      })));

      // Build budgets map: { traveller_id: { category: amount } }
      const budgetMap = {};
      budgetData.forEach(b => {
        if (!budgetMap[b.traveller_id]) budgetMap[b.traveller_id] = {};
        budgetMap[b.traveller_id][b.category] = b.amount;
      });
      setBudgets(budgetMap);
      setError(null);
    } catch (e) {
      setError("Couldn't connect to database. Check your connection.");
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
      const newTraveller = await sbFetch(TABLE, {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), saved: 0, monthly_pledge: 355, color })
      });
      // Create default budget categories for new traveller
      const travellerId = newTraveller[0].id;
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
      // Save traveller details
      await sbFetch(`${TABLE}?id=eq.${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName || t.name,
          saved: Math.max(0, parseFloat(editSaved) || 0),
          monthly_pledge: Math.max(0, parseFloat(editPledge) || 0),
        })
      });

      // Save each category budget
      const existingCats = budgets[t.id] || {};
      await Promise.all(DEFAULT_CATEGORIES.map(async cat => {
        const amount = Math.max(0, parseFloat(editCategories[cat.label]) || 0);
        if (existingCats[cat.label] !== undefined) {
          // Update existing
          await sbFetch(`${BUDGETS_TABLE}?traveller_id=eq.${t.id}&category=eq.${encodeURIComponent(cat.label)}`, {
            method: "PATCH",
            body: JSON.stringify({ amount })
          });
        } else {
          // Insert new
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
    setSyncing(true);
    try {
      const newSaved = Math.max(0, (t.saved || 0) + amount);
      await sbFetch(`${TABLE}?id=eq.${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: newSaved })
      });
      await loadData();
      showToast(`${amount >= 0 ? "+" : ""}${fmt(amount)} logged ✓`);
    } catch (e) {
      showToast("Update failed", true);
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditSaved(String(t.saved || 0));
    setEditPledge(String(t.monthly_pledge || 355));
    setEditName(t.name);
    // Load existing category amounts or defaults
    const existingCats = budgets[t.id] || {};
    const cats = {};
    DEFAULT_CATEGORIES.forEach(cat => {
      cats[cat.label] = existingCats[cat.label] !== undefined ? existingCats[cat.label] : cat.amount;
    });
    setEditCategories(cats);
  }

  const totalSaved = travellers.reduce((s, t) => s + (t.saved || 0), 0);
  const totalTarget = travellers.reduce((s, t) => s + getPersonalTarget(t.id), 0) || DEFAULT_TARGET;
  const totalPct = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const totalPledged = travellers.reduce((s, t) => s + (t.monthly_pledge || 0), 0);
  const totalMonthlyNeeded = travellers.reduce((s, t) => {
    const target = getPersonalTarget(t.id);
    return s + Math.max(0, target - (t.saved || 0)) / months;
  }, 0);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "travellers", label: "Travellers" },
  ];

  if (loading) return (
    <div style={{ background: "#0a0a1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontSize: "40px" }}>🦘</div>
      <div style={{ color: "#ffcd00", fontSize: "16px", fontWeight: "700", fontFamily: "system-ui" }}>Connecting to savings tracker...</div>
      <div style={{ color: "#445566", fontSize: "13px", fontFamily: "system-ui" }}>Loading group data from Supabase</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#0a0a1a", minHeight: "100vh", color: "#e8eaf6", maxWidth: "480px", margin: "0 auto", position: "relative" }}>

      {toast && (
        <div style={{
          position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
          background: toast.isError ? "#3d1a1a" : "#1b4332",
          color: toast.isError ? "#f87171" : "#74c69d",
          padding: "10px 20px", borderRadius: "20px", fontSize: "14px", fontWeight: "600",
          zIndex: 1000, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          border: `1px solid ${toast.isError ? "#6a2d2d" : "#2d6a4f"}`,
          whiteSpace: "nowrap"
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(160deg, #003f88 0%, #0a0a1a 100%)", padding: "28px 20px 20px", borderBottom: "2px solid #ffcd00" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#ffcd00", textTransform: "uppercase" }}>
            🦘 World Cup 2030 — Group Savings
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {syncing && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffcd00" }} />}
            <button onClick={loadData} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid #334", borderRadius: "6px", color: "#8090a8", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>↻ Sync</button>
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
        <div style={{ marginTop: "16px", background: "#111132", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, totalPct * 100)}%`, background: "linear-gradient(90deg, #003f88, #ffcd00)", borderRadius: "6px", transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "14px" }}>
          {[
            { label: "Months to go", value: months },
            { label: "Need/month (group)", value: fmt(totalMonthlyNeeded) },
            { label: "Pledged/month", value: fmt(totalPledged) },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#e8eaf6" }}>{s.value}</div>
              <div style={{ fontSize: "10px", color: "#556070", marginTop: "2px", lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {error && (
          <div style={{ marginTop: "12px", background: "#2d1010", border: "1px solid #6a2d2d", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#f87171" }}>
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
            fontWeight: activeTab === tab.id ? "700" : "400",
            fontSize: "13px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.5px", transition: "all 0.2s"
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
                <div style={{ fontSize: "15px", marginBottom: "6px", color: "#8090a8" }}>No travellers yet</div>
                <div style={{ fontSize: "13px" }}>Go to Travellers tab to add your crew</div>
              </div>
            ) : travellers.map(t => {
              const target = getPersonalTarget(t.id);
              const pct = (t.saved || 0) / target;
              const remaining = Math.max(0, target - (t.saved || 0));
              const onTrack = (t.monthly_pledge || 0) * months >= remaining;
              const hasBudget = budgets[t.id] && Object.keys(budgets[t.id]).length > 0;
              return (
                <div key={t.id} style={{ background: "#111128", borderRadius: "10px", marginBottom: "10px", border: "1px solid #1a1a35", overflow: "hidden" }}>
                  <div style={{ padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: (t.color || "#4f8ef7") + "22", border: `2px solid ${t.color || "#4f8ef7"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "800", color: t.color || "#4f8ef7" }}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "14px" }}>{t.name}</div>
                          <div style={{ fontSize: "11px", color: "#445566" }}>{fmt(t.monthly_pledge || 0)}/mo · target {fmt(target)}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "800", fontSize: "16px", color: t.color || "#4f8ef7" }}>{fmt(t.saved || 0)}</div>
                        <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "1px", color: onTrack ? "#34d399" : "#f87171" }}>
                          {onTrack ? "✓ ON TRACK" : "⚠ BEHIND"}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: "#0a0a18", borderRadius: "4px", height: "5px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct * 100)}%`, background: t.color || "#4f8ef7", borderRadius: "4px", transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                      <div style={{ fontSize: "11px", color: "#445566" }}>{fmt(remaining)} remaining · {Math.round(pct * 100)}% there</div>
                      {hasBudget && (
                        <button onClick={() => setViewingBudgetId(viewingBudgetId === t.id ? null : t.id)} style={{ background: "none", border: "none", color: "#445566", fontSize: "11px", cursor: "pointer", padding: "0" }}>
                          {viewingBudgetId === t.id ? "▲ hide budget" : "▼ view budget"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable personal budget breakdown */}
                  {viewingBudgetId === t.id && hasBudget && (
                    <div style={{ borderTop: "1px solid #1a1a35", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>
                        {t.name}'s Budget
                      </div>
                      {DEFAULT_CATEGORIES.map(cat => {
                        const amount = budgets[t.id][cat.label] !== undefined ? budgets[t.id][cat.label] : cat.amount;
                        const catPct = amount / target;
                        return (
                          <div key={cat.label} style={{ marginBottom: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                              <span style={{ fontSize: "12px", color: "#c8d0e0" }}>{cat.icon} {cat.label}</span>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: cat.color }}>{fmt(amount)}</span>
                            </div>
                            <div style={{ background: "#0a0a18", borderRadius: "3px", height: "3px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${catPct * 100}%`, background: cat.color, borderRadius: "3px" }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: "1px solid #1a1a35", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#e8eaf6" }}>Total</span>
                        <span style={{ fontSize: "12px", fontWeight: "800", color: "#ffcd00" }}>{fmt(target)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Milestones */}
            <div style={{ marginTop: "20px", marginBottom: "8px", fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase" }}>Group Milestones</div>
            {[
              { label: "Flights booked", pct: 0.29, icon: "✈️", desc: "~$5k pp saved" },
              { label: "Accommodation locked", pct: 0.50, icon: "🏨", desc: "~$8.5k pp saved" },
              { label: "Tickets purchased", pct: 0.56, icon: "⚽", desc: "~$9.4k pp saved" },
              { label: "Fully funded!", pct: 1.0, icon: "🏆", desc: `${fmt(DEFAULT_TARGET)} pp saved` },
            ].map(m => {
              const reached = totalPct >= m.pct;
              return (
                <div key={m.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", marginBottom: "8px", background: reached ? "#0d2818" : "#0d0d1e", borderRadius: "10px", border: `1px solid ${reached ? "#2d6a4f" : "#1a1a35"}`, opacity: reached ? 1 : 0.6 }}>
                  <div style={{ fontSize: "22px" }}>{reached ? "✅" : m.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "700", fontSize: "14px", color: reached ? "#74c69d" : "#c8d0e0" }}>{m.label}</div>
                    <div style={{ fontSize: "12px", color: "#445566" }}>{m.desc}</div>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: reached ? "#74c69d" : "#2a3050" }}>{Math.round(m.pct * 100)}%</div>
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

                    {/* Basic fields */}
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

                    {/* Category budgets */}
                    <div style={{ marginTop: "16px", marginBottom: "8px" }}>
                      <div style={{ fontSize: "11px", color: "#445566", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>My Budget by Category</div>
                      {DEFAULT_CATEGORIES.map(cat => (
                        <div key={cat.label} style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "16px", minWidth: "24px" }}>{cat.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "11px", color: "#556070", marginBottom: "3px" }}>{cat.label}</div>
                            <input
                              type="number"
                              value={editCategories[cat.label] ?? cat.amount}
                              onChange={e => setEditCategories(prev => ({ ...prev, [cat.label]: e.target.value }))}
                              style={{ width: "100%", background: "#0a0a18", border: `1px solid ${cat.color}44`, borderRadius: "6px", padding: "8px 10px", color: "#e8eaf6", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                            />
                          </div>
                          <div style={{ fontSize: "12px", color: cat.color, minWidth: "50px", textAlign: "right" }}>
                            {fmt(parseFloat(editCategories[cat.label]) || 0)}
                          </div>
                        </div>
                      ))}
                      {/* Auto-total */}
                      <div style={{ background: "#0a0a18", borderRadius: "8px", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
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
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: (t.color || "#4f8ef7") + "22", border: `2px solid ${t.color || "#4f8ef7"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "800", color: t.color || "#4f8ef7" }}>
                          {t.name.charAt(0).toUpperCase()}
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
                    <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                      {[100, 250, 500, 1000].map(amt => (
                        <button key={amt} onClick={() => addContribution(t, amt)} disabled={syncing} style={{ flex: 1, padding: "8px 0", background: (t.color || "#4f8ef7") + "18", border: `1px solid ${(t.color || "#4f8ef7")}44`, borderRadius: "6px", color: t.color || "#4f8ef7", fontSize: "12px", fontWeight: "700", cursor: "pointer", opacity: syncing ? 0.5 : 1 }}>
                          +{fmt(amt)}
                        </button>
                      ))}
                    </div>
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
      </div>
    </div>
  );
}
