import { useState, useRef } from "react";

const STEP = {
  HOME: "HOME", PEOPLE: "PEOPLE", UPLOAD: "UPLOAD",
  EXTRACTING: "EXTRACTING", ASSIGN: "ASSIGN",
  DECISION: "DECISION", RESULT: "RESULT",
};

// ── API 호출 (Vercel 서버리스 함수 경유) ──────────────────────
async function extractMenu(base64: string, mime: string) {
  const res = await fetch("/api/extract-menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType: mime })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `오류 (${res.status})`);
  }
  const data = await res.json();
  return data.items.map((item: any, i: number) => ({
    ...item,
    id: `item-${i}-${Date.now()}`
  }));
}

// ── 정산 계산 ─────────────────────────────────────────────────
function calcSettlement(entries: any[]) {
  const paid: Record<string, number> = {};
  const consumed: Record<string, number> = {};
  const ppl = new Set<string>();

  for (const e of entries) {
    const total = e.price * e.qty;
    paid[e.payer] = (paid[e.payer] || 0) + total;
    ppl.add(e.payer);
    const share = total / e.sharedBy.length;
    for (const p of e.sharedBy) {
      consumed[p] = (consumed[p] || 0) + share;
      ppl.add(p);
    }
  }

  const bal = [...ppl].map(p => ({ p, v: (paid[p] || 0) - (consumed[p] || 0) }));
  const debtors = bal.filter(b => b.v < -1).sort((a, b) => a.v - b.v);
  const creditors = bal.filter(b => b.v > 1).sort((a, b) => b.v - a.v);
  const txns: { from: string; to: string; amount: number }[] = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(Math.abs(debtors[i].v), creditors[j].v);
    if (amt > 0) txns.push({ from: debtors[i].p, to: creditors[j].p, amount: Math.round(amt) });
    debtors[i].v += amt; creditors[j].v -= amt;
    if (Math.abs(debtors[i].v) < 1) i++;
    if (Math.abs(creditors[j].v) < 1) j++;
  }

  const totalByPerson: Record<string, number> = {};
  for (const p of ppl) totalByPerson[p] = Math.round(consumed[p] || 0);
  return { txns, totalByPerson, ppl: [...ppl] };
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────
function Btn({ children, onClick, disabled, ghost, small }: any) {
  const base: React.CSSProperties = {
    width: "100%", border: "none", borderRadius: "16px",
    padding: small ? "10px 16px" : "16px 20px",
    fontSize: small ? "14px" : "16px", fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    opacity: disabled ? 0.4 : 1, transition: "all .15s",
    ...(ghost
      ? { background: "#fff7ed", color: "#f97316", border: "2px solid #fed7aa" }
      : { background: "linear-gradient(135deg, #fb923c, #f43f5e)", color: "white", boxShadow: "0 6px 20px rgba(249,115,22,.3)" }
    )
  };
  return <button style={base} onClick={disabled ? undefined : onClick}>{children}</button>;
}

function Chip({ label, active, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: "20px", border: "none",
      cursor: "pointer", fontSize: "12px", fontWeight: 700, transition: "all .15s",
      background: active ? "#f97316" : "#f1f5f9", color: active ? "white" : "#64748b"
    }}>{label}</button>
  );
}

// ── HOME ──────────────────────────────────────────────────────
function HomeScreen({ onStart }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", gap: "28px", textAlign: "center" }}>
      <div style={{ position: "relative" }}>
        <div style={{ width: 128, height: 128, background: "linear-gradient(135deg, #fb923c, #f43f5e)", borderRadius: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, boxShadow: "0 20px 50px rgba(249,115,22,.35)", transform: "rotate(-5deg)" }}>💸</div>
        <div style={{ position: "absolute", bottom: -6, right: -6, width: 36, height: 36, background: "#fde047", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>🤖</div>
      </div>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#1e293b", margin: "0 0 10px", letterSpacing: "-1px" }}>정산이모</h1>
        <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
          메뉴판 사진 한 장으로<br />
          <strong style={{ color: "#f97316" }}>Claude AI</strong>가 더치페이 정산!
        </p>
      </div>
      <div style={{ width: "100%" }}>
        <Btn onClick={onStart}>정산 시작하기 →</Btn>
      </div>
    </div>
  );
}

// ── 인원 입력 ──────────────────────────────────────────────────
function PeopleScreen({ initial, onConfirm }: any) {
  const [names, setNames] = useState<string[]>(initial.length > 0 ? initial : ["", "", ""]);
  const update = (i: number, v: string) => setNames(ns => { const n = [...ns]; n[i] = v; return n; });
  const valid = names.filter((n: string) => n.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#1e293b", margin: "0 0 4px" }}>오늘의 멤버는? 👥</h2>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>함께한 친구들 이름을 입력해요</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
        {names.map((n: string, i: number) => (
          <div key={i} style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#f97316", fontWeight: 900, fontSize: 11 }}>#{i + 1}</span>
            <input value={n} onChange={e => update(i, e.target.value)} placeholder="이름 입력"
              style={{ width: "100%", padding: "14px 12px 14px 36px", borderRadius: 12, border: "2px solid #f1f5f9", fontSize: 14, fontWeight: 600, color: "#1e293b", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
          </div>
        ))}
        <button onClick={() => setNames((ns: string[]) => [...ns, ""])}
          style={{ padding: "14px", borderRadius: 12, border: "2px dashed #e2e8f0", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          + 인원 추가
        </button>
      </div>
      <Btn onClick={() => onConfirm(valid)} disabled={valid.length === 0}>
        {valid.length > 0 ? `${valid.length}명으로 시작하기 →` : "이름을 입력해주세요"}
      </Btn>
    </div>
  );
}

// ── 이미지 업로드 ──────────────────────────────────────────────
function UploadScreen({ onFile }: any) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = (file: File) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setTimeout(() => onFile(file), 400);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "20px", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#1e293b", margin: "0 0 4px" }}>메뉴판 사진 📸</h2>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>찍거나 갤러리에서 선택해요</p>
      </div>
      <div onClick={() => ref.current?.click()} style={{
        width: "100%", aspectRatio: "4/3", borderRadius: 20,
        border: "3px dashed #fed7aa", background: "#fff7ed",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        cursor: "pointer", overflow: "hidden"
      }}>
        {preview
          ? <img src={preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="preview" />
          : <>
              <span style={{ fontSize: 48, marginBottom: 12 }}>🍽️</span>
              <p style={{ color: "#f97316", fontWeight: 700, fontSize: 14, margin: 0 }}>눌러서 사진 선택</p>
              <p style={{ color: "#cbd5e1", fontSize: 12, margin: "4px 0 0" }}>카메라 또는 갤러리</p>
            </>
        }
      </div>
      <input ref={ref} type="file" accept="image/*"
        onChange={e => { if (e.target.files?.[0]) handle(e.target.files[0]); }}
        style={{ display: "none" }} />
    </div>
  );
}

// ── 분석 중 ───────────────────────────────────────────────────
function ExtractingScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 60, animation: "spin 1.5s linear infinite" }}>🤖</div>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 900, color: "#1e293b", margin: "0 0 8px" }}>메뉴 분석 중...</h3>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>Claude가 메뉴판을 꼼꼼히 읽고 있어요</p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, background: "#f97316", borderRadius: "50%", animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
        ))}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ── 메뉴 배정 ─────────────────────────────────────────────────
function AssignScreen({ items, people, onConfirm }: any) {
  const [asgn, setAsgn] = useState(() => items.map((item: any) => ({ id: item.id, on: true, qty: 1, sharedBy: [...people] })));
  const [payer, setPayer] = useState(people[0] || "");

  const togglePerson = (idx: number, p: string) => setAsgn((prev: any[]) => prev.map((a, i) => {
    if (i !== idx) return a;
    const has = a.sharedBy.includes(p);
    const next = has ? a.sharedBy.filter((x: string) => x !== p) : [...a.sharedBy, p];
    return { ...a, sharedBy: next.length > 0 ? next : a.sharedBy };
  }));

  const setQty = (idx: number, q: number) => setAsgn((prev: any[]) => prev.map((a, i) => i === idx ? { ...a, qty: q } : a));
  const toggleOn = (idx: number) => setAsgn((prev: any[]) => prev.map((a, i) => i === idx ? { ...a, on: !a.on } : a));

  const included = asgn.filter((a: any) => a.on && a.sharedBy.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#1e293b", margin: "0 0 2px" }}>누가 뭘 먹었나요? 🍴</h2>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>각 메뉴에 먹은 사람을 선택하세요</p>
      </div>

      <div style={{ marginBottom: 12, padding: 12, background: "#fff7ed", borderRadius: 12, border: "2px solid #fed7aa" }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#f97316" }}>💳 계산한 사람</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {people.map((p: string) => <Chip key={p} label={p} active={payer === p} onClick={() => setPayer(p)} />)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
        {items.map((item: any, idx: number) => {
          const a = asgn[idx];
          return (
            <div key={item.id} style={{ padding: 12, borderRadius: 12, border: `2px solid ${a.on ? "#fed7aa" : "#f1f5f9"}`, background: a.on ? "#fffbf5" : "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: a.on ? 10 : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: a.on ? "#1e293b" : "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: a.on ? "#f97316" : "#cbd5e1" }}>{item.price.toLocaleString()}원</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                  {a.on && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => setQty(idx, Math.max(1, a.qty - 1))} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>−</button>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{a.qty}</span>
                      <button onClick={() => setQty(idx, a.qty + 1)} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>+</button>
                    </div>
                  )}
                  <button onClick={() => toggleOn(idx)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: a.on ? "#f97316" : "#e2e8f0", color: a.on ? "white" : "#94a3b8", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                    {a.on ? "✓" : "○"}
                  </button>
                </div>
              </div>
              {a.on && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {people.map((p: string) => <Chip key={p} label={p} active={a.sharedBy.includes(p)} onClick={() => togglePerson(idx, p)} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Btn onClick={() => onConfirm(included.map((a: any) => ({ itemId: a.id, sharedBy: a.sharedBy, quantity: a.qty })), payer)} disabled={included.length === 0 || !payer}>
        {payer ? `확인 (${included.length}개 항목)` : "계산한 사람을 선택해주세요"}
      </Btn>
    </div>
  );
}

// ── 추가 여부 ─────────────────────────────────────────────────
function DecisionScreen({ count, onAddMore, onFinish }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, gap: 24, textAlign: "center" }}>
      <span style={{ fontSize: 56 }}>🧾</span>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: "#1e293b", margin: "0 0 8px" }}>영수증 추가할까요?</h3>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0, lineHeight: 1.6 }}>현재 {count}개 항목 등록됨<br />다른 자리 비용도 함께 정산할 수 있어요</p>
      </div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={onAddMore} ghost>+ 영수증 추가하기</Btn>
        <Btn onClick={onFinish}>정산 완료 🎉</Btn>
      </div>
    </div>
  );
}

// ── 결과 화면 ─────────────────────────────────────────────────
function ResultScreen({ entries, onReset }: any) {
  const { txns, totalByPerson, ppl } = calcSettlement(entries);
  const grandTotal = Object.values(totalByPerson).reduce((a: number, b: any) => a + b, 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("https://esm.sh/html2canvas@1.4.1")).default;
      const canvas = await html2canvas(cardRef.current, { backgroundColor: "#fff7ed", scale: 2 });
      const link = document.createElement("a");
      link.download = "정산결과.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("저장 실패. 다시 시도해주세요.");
    }
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px" }}>

      <div ref={cardRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingBottom: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#1e293b", margin: "0 0 2px" }}>정산 결과 🎉</h2>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>총 {(grandTotal as number).toLocaleString()}원</p>
        </div>

        <div style={{ padding: 16, background: "#fff7ed", borderRadius: 16 }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#f97316" }}>🍽 각자 먹은 금액</p>
          {ppl.map((p: string) => (
            <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #fed7aa" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f97316", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{p[0]}</div>
                <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{p}</span>
              </div>
              <span style={{ fontWeight: 700, color: "#f97316", fontSize: 14 }}>{totalByPerson[p]?.toLocaleString()}원</span>
            </div>
          ))}
        </div>

        <div>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#475569" }}>💸 이렇게 보내요</p>
          {txns.length === 0
            ? <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>🥳 이미 공평하게 냈어요!</div>
            : txns.map((t: any, i: number) => (
              <div key={i} style={{ padding: "12px 14px", background: "white", borderRadius: 12, marginBottom: 8, border: "2px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{t.from[0]}</div>
                  <span style={{ fontWeight: 700 }}>{t.from}</span>
                  <span style={{ color: "#cbd5e1" }}>→</span>
                  <span style={{ fontWeight: 700 }}>{t.to}</span>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, color: "#f97316" }}>{t.to[0]}</div>
                </div>
                <span style={{ fontWeight: 900, color: "#f97316", fontSize: 14 }}>{t.amount.toLocaleString()}원</span>
              </div>
            ))
          }
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <Btn onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "이미지로 저장 📷"}
        </Btn>
        <Btn onClick={onReset} ghost>처음으로 돌아가기</Btn>
      </div>

    </div>
  );
}

// ── 메인 앱 ───────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(STEP.HOME);
  const [people, setPeople] = useState<string[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [currentItems, setCurrentItems] = useState<any[]>([]);

  const reset = () => { setPeople([]); setEntries([]); setCurrentItems([]); setStep(STEP.HOME); };

  const handleFile = async (file: File) => {
    setStep(STEP.EXTRACTING);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res((r.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const items = await extractMenu(b64, file.type || "image/jpeg");
      if (!items.length) { alert("메뉴를 찾지 못했어요. 다시 시도해주세요."); setStep(STEP.UPLOAD); return; }
      setCurrentItems(items);
      setStep(STEP.ASSIGN);
    } catch (e: any) {
      alert("오류: " + e.message);
      setStep(STEP.UPLOAD);
    }
  };

  const handleAssign = (asgns: any[], payer: string) => {
    const newEntries = asgns.map(a => {
      const item = currentItems.find(i => i.id === a.itemId);
      return { id: crypto.randomUUID(), price: item.price, qty: a.quantity, sharedBy: a.sharedBy, payer, itemName: item.name };
    });
    setEntries(prev => [...prev, ...newEntries]);
    setCurrentItems([]);
    setStep(STEP.DECISION);
  };

  const back =
    step === STEP.PEOPLE ? () => setStep(STEP.HOME) :
    step === STEP.UPLOAD ? () => setStep(entries.length > 0 ? STEP.DECISION : STEP.PEOPLE) :
    step === STEP.ASSIGN ? () => { setCurrentItems([]); setStep(STEP.UPLOAD); } : null;

  const stepLabel: Record<string, string> = {
    PEOPLE: "인원 설정", UPLOAD: "사진 업로드",
    EXTRACTING: "메뉴 분석", ASSIGN: "메뉴 배정",
    DECISION: "추가 여부", RESULT: "정산 결과",
  };

  const cardH = step === STEP.HOME ? 520 : 600;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fff7ed, #fce7f3)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "white", borderRadius: 28, boxShadow: "0 20px 60px rgba(249,115,22,.15)", overflow: "hidden" }}>
        {step !== STEP.HOME && (
          <div style={{ padding: "14px 18px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f1f5f9" }}>
            {back && <button onClick={back as any} style={{ width: 32, height: 32, border: "none", background: "#f8fafc", borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>}
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", flex: 1 }}>{stepLabel[step] || ""}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316" }}>정산이모</span>
          </div>
        )}
        <div style={{ height: cardH }}>
          {step === STEP.HOME && <HomeScreen onStart={() => setStep(STEP.PEOPLE)} />}
          {step === STEP.PEOPLE && <PeopleScreen initial={people} onConfirm={(ns: string[]) => { setPeople(ns); setStep(STEP.UPLOAD); }} />}
          {step === STEP.UPLOAD && <UploadScreen onFile={handleFile} />}
          {step === STEP.EXTRACTING && <ExtractingScreen />}
          {step === STEP.ASSIGN && <AssignScreen items={currentItems} people={people} onConfirm={handleAssign} />}
          {step === STEP.DECISION && <DecisionScreen count={entries.length} onAddMore={() => setStep(STEP.UPLOAD)} onFinish={() => setStep(STEP.RESULT)} />}
          {step === STEP.RESULT && <ResultScreen entries={entries} onReset={reset} />}
        </div>
      </div>
    </div>
  );
}
