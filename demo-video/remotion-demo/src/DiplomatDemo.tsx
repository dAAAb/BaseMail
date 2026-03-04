import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";

const FONT = "'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji', system-ui, -apple-system, sans-serif";
const MONO = "'Courier New', 'Noto Color Emoji', monospace";

// ── Fade In ──
const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, duration = 15, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame - delay, [0, duration], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>{children}</div>;
};

// ── Section Title ──
const Title: React.FC<{ title: string; sub?: string; delay?: number }> = ({ title, sub, delay = 0 }) => (
  <FadeIn delay={delay} style={{ textAlign: "center", marginBottom: 40 }}>
    <div style={{ fontSize: 52, fontWeight: 700, color: "#fff", fontFamily: FONT, lineHeight: 1.3 }}>{title}</div>
    {sub && <div style={{ fontSize: 24, color: "#9ca3af", marginTop: 12, fontFamily: FONT }}>{sub}</div>}
  </FadeIn>
);

// ── Mockup UI: Compose Screen ──
const ComposeScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;

  // Typing animation
  const toText = "investor@basemail.ai";
  const subjectText = "Partnership Proposal — AI Agent Infrastructure";
  const bodyText = "Hi, I'm reaching out about a potential collaboration on decentralized AI agent communication infrastructure...";

  const toChars = Math.min(Math.floor(f / 2), toText.length);
  const subjectChars = Math.min(Math.max(0, Math.floor((f - 45) / 1.5)), subjectText.length);
  const bodyChars = Math.min(Math.max(0, Math.floor((f - 90) / 1)), bodyText.length);

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      border: "1px solid #374151",
      width: 900,
      padding: 0,
      overflow: "hidden",
      boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
    }}>
      {/* Header */}
      <div style={{ background: "#1f2937", padding: "16px 24px", borderBottom: "1px solid #374151", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ marginLeft: 20, color: "#fff", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Compose — BaseMail</span>
      </div>

      <div style={{ padding: 24 }}>
        {/* From */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 14, width: 70, fontFamily: FONT }}>From</span>
          <div style={{ background: "#1f2937", borderRadius: 8, padding: "8px 16px", flex: 1, color: "#3b82f6", fontSize: 14, fontFamily: MONO }}>
            myagent@basemail.ai
          </div>
        </div>

        {/* To */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 14, width: 70, fontFamily: FONT }}>To</span>
          <div style={{ background: "#1f2937", borderRadius: 8, padding: "8px 16px", flex: 1, fontFamily: MONO, fontSize: 14 }}>
            <span style={{ color: "#fff" }}>{toText.slice(0, toChars)}</span>
            <span style={{ color: "#3b82f6", opacity: f % 20 < 10 ? 1 : 0 }}>|</span>
          </div>
        </div>

        {/* Subject */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 14, width: 70, fontFamily: FONT }}>Subject</span>
          <div style={{ background: "#1f2937", borderRadius: 8, padding: "8px 16px", flex: 1, fontFamily: FONT, fontSize: 14 }}>
            <span style={{ color: "#fff" }}>{subjectText.slice(0, subjectChars)}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "#1f2937", borderRadius: 8, padding: 16, minHeight: 80, fontFamily: FONT, fontSize: 14, color: "#d1d5db", lineHeight: 1.6 }}>
          {bodyText.slice(0, bodyChars)}
        </div>

        {/* Diplomat Pricing Card */}
        {f > 120 && (
          <FadeIn delay={startFrame + 120} style={{ marginTop: 16 }}>
            <div style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.1))",
              border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ color: "#a78bfa", fontSize: 14, fontFamily: FONT }}>The Diplomat</div>
                <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, fontFamily: MONO, marginTop: 4 }}>3 ATTN</div>
                <div style={{ color: "#6b7280", fontSize: 12, fontFamily: MONO }}>QAF n=0 × cold (×1.0)</div>
              </div>
              <div style={{
                background: "#3b82f6",
                color: "#fff",
                borderRadius: 8,
                padding: "12px 24px",
                fontSize: 16,
                fontWeight: 600,
                fontFamily: FONT,
              }}>
                Send
              </div>
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
};

// ── Mockup UI: Inbox with ATTN Badges ──
const InboxScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const emails = [
    { from: "alice@basemail.ai", subject: "Re: AI Conference Invite", badge: "🔙", amount: 3, color: "#22c55e", status: "returned" },
    { from: "bob@basemail.ai", subject: "Partnership Inquiry", badge: "⚡", amount: 9, color: "#a78bfa", status: "pending" },
    { from: "spam@bulk.ai", subject: "BUY TOKENS NOW!!!", badge: "🤑", amount: 27, color: "#f59e0b", status: "expired" },
    { from: "carol@basemail.ai", subject: "Research Collaboration", badge: "⚡", amount: 3, color: "#a78bfa", status: "pending" },
    { from: "dave@basemail.ai", subject: "Follow-up: Proposal Review", badge: "💰", amount: 4, color: "#ef4444", status: "rejected" },
  ];

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      border: "1px solid #374151",
      width: 900,
      overflow: "hidden",
      boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
    }}>
      <div style={{ background: "#1f2937", padding: "16px 24px", borderBottom: "1px solid #374151", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Inbox — BaseMail</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["All", "⚡ Pending", "🔙 Returned", "🔥 Bonded"].map((f, i) => (
            <div key={i} style={{
              background: i === 0 ? "#3b82f6" : "#374151",
              color: "#fff",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              fontFamily: FONT,
            }}>{f}</div>
          ))}
        </div>
      </div>

      {emails.map((email, i) => {
        const delay = startFrame + i * 12;
        const opacity = interpolate(frame - delay, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div key={i} style={{
            opacity,
            padding: "14px 24px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{
              background: `${email.color}22`,
              border: `1px solid ${email.color}44`,
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 13,
              fontFamily: FONT,
              color: email.color,
              whiteSpace: "nowrap",
              minWidth: 85,
              textAlign: "center",
            }}>
              {email.badge} {email.amount} ATTN
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#d1d5db", fontSize: 14, fontWeight: 600, fontFamily: FONT }}>{email.from}</div>
              <div style={{ color: "#9ca3af", fontSize: 13, fontFamily: FONT }}>{email.subject}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Arbitration Result ──
const ArbitrationResult: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;

  const showResult = f > 30;
  const showConfetti = f > 45;

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      border: "1px solid #374151",
      width: 600,
      overflow: "hidden",
      boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
    }}>
      <div style={{ background: "#1f2937", padding: "16px 24px" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Sending...</span>
      </div>
      <div style={{ padding: 32, textAlign: "center" }}>
        {!showResult ? (
          <FadeIn delay={startFrame}>
            <div style={{ fontSize: 48, fontFamily: FONT }}>🦞</div>
            <div style={{ color: "#a78bfa", fontSize: 18, marginTop: 12, fontFamily: FONT }}>Arbitrating...</div>
          </FadeIn>
        ) : (
          <FadeIn delay={startFrame + 30}>
            <div style={{ fontSize: 48, fontFamily: FONT }}>🎉🦞🎉</div>
            <div style={{ color: "#22c55e", fontSize: 22, fontWeight: 700, marginTop: 12, fontFamily: FONT }}>Good Email Reward!</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16, alignItems: "center" }}>
              <span style={{ fontSize: 36, color: "#6b7280", textDecoration: "line-through", fontFamily: MONO }}>3</span>
              <span style={{ fontSize: 28, color: "#4b5563", fontFamily: FONT }}>→</span>
              <span style={{ fontSize: 36, color: "#22c55e", fontWeight: 700, fontFamily: MONO }}>2 ATTN</span>
            </div>
            <div style={{ color: "#22c55e", fontSize: 16, marginTop: 8, fontFamily: FONT }}>Saved 1 ATTN!</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 16, fontFamily: FONT }}>
              Gemini verdict: high_value (8/10)
            </div>
            <div style={{ color: "#4b5563", fontSize: 12, fontStyle: "italic", marginTop: 4, fontFamily: FONT }}>
              "Legitimate collaboration proposal with clear value"
            </div>
          </FadeIn>
        )}
      </div>

      {/* Confetti */}
      {showConfetti && Array.from({ length: 20 }).map((_, i) => {
        const progress = interpolate(f - 45, [0, 90], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const emojis = ["🎉", "✨", "🦞", "💰", "⭐"];
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${(i * 31 + 7) % 100}%`,
            top: -20 + progress * 700,
            fontSize: 20 + (i % 3) * 6,
            opacity: 1 - progress,
            transform: `rotate(${progress * 720}deg)`,
            fontFamily: FONT,
          }}>
            {emojis[i % emojis.length]}
          </div>
        );
      })}
    </div>
  );
};

// ── Main Composition ──
export const DiplomatDemo: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0a0a1a 0%, #111827 50%, #0a0a1a 100%)", fontFamily: FONT }}>

      {/* Scene 1: BaseMail Landing (0-5s) */}
      <Sequence from={0} durationInFrames={4 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <FadeIn delay={0}>
            <Img src={staticFile("landing.png")} style={{ width: 1200, borderRadius: 16, boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }} />
          </FadeIn>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 2: Web2 + Web3 + Web4 (5-12s) */}
      <Sequence from={4 * 30} durationInFrames={5 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
          <Title title="Email Bridges Everything" delay={0} />
          <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
            {[
              { era: "Web2", desc: "Gmail, Outlook", icon: "📧", color: "#60a5fa" },
              { era: "Web3", desc: "Basename Email", icon: "⛓️", color: "#a78bfa" },
              { era: "Web4", desc: "AI Agent Mail", icon: "🤖", color: "#22c55e" },
            ].map((item, i) => (
              <FadeIn key={i} delay={15 + i * 20} style={{
                background: `${item.color}11`,
                border: `2px solid ${item.color}44`,
                borderRadius: 20,
                padding: "32px 40px",
                textAlign: "center",
                width: 250,
              }}>
                <div style={{ fontSize: 56, fontFamily: FONT }}>{item.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: item.color, marginTop: 12, fontFamily: FONT }}>{item.era}</div>
                <div style={{ fontSize: 18, color: "#9ca3af", marginTop: 8, fontFamily: FONT }}>{item.desc}</div>
              </FadeIn>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: CRE Architecture (12-20s) */}
      <Sequence from={9 * 30} durationInFrames={7 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 60 }}>
          <Title title="5-Step CRE Workflow" sub="Chainlink CRE orchestrates every email" delay={0} />
          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            {[
              { step: "1", label: "QAF History", icon: "📊", desc: "Unread streak" },
              { step: "2", label: "Gemini LLM", icon: "🤖", desc: "Classify quality" },
              { step: "3", label: "QAF Pricing", icon: "💰", desc: "n² × coefficient" },
              { step: "4", label: "Send Email", icon: "📧", desc: "Via BaseMail API" },
              { step: "5", label: "Attestation", icon: "⛓️", desc: "On-chain proof" },
            ].map((item, i) => (
              <FadeIn key={i} delay={15 + i * 15} style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 16,
                padding: "20px 24px",
                textAlign: "center",
                width: 180,
              }}>
                <div style={{ fontSize: 36, fontFamily: FONT }}>{item.icon}</div>
                <div style={{ fontSize: 13, color: "#60a5fa", fontFamily: MONO }}>Step {item.step}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 4, fontFamily: FONT }}>{item.label}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontFamily: FONT }}>{item.desc}</div>
              </FadeIn>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 4: Compose + Typing (20-30s) */}
      <Sequence from={16 * 30} durationInFrames={8 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <ComposeScreen startFrame={16 * 30} />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 5: QAF Pricing Chart (30-42s) */}
      <Sequence from={24 * 30} durationInFrames={9 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
          <Title title="Quadratic Voting Pricing" sub="Cost = n² — Spammers go bankrupt" delay={0} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 40, height: 350, justifyContent: "center", marginTop: 20 }}>
            {[3, 4, 9, 16, 25].map((cost, i) => {
              const delay = 20 + i * 15;
              const progress = interpolate(frame - 24 * 30 - delay, [0, 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const isHigh = i >= 2;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: MONO, color: isHigh ? "#ef4444" : "#3b82f6", opacity: progress }}>
                    {cost}
                  </div>
                  <div style={{
                    width: 80,
                    height: (cost / 25) * 300 * progress,
                    background: isHigh ? "linear-gradient(180deg, #ef4444, #7f1d1d)" : "linear-gradient(180deg, #3b82f6, #1e3a8a)",
                    borderRadius: "8px 8px 0 0",
                  }} />
                  <div style={{ fontSize: 16, color: "#6b7280", fontFamily: FONT }}>Email #{i + 1}</div>
                </div>
              );
            })}
          </div>
          <FadeIn delay={100} style={{ fontSize: 22, color: "#ef4444", fontWeight: 700, marginTop: 24, fontFamily: FONT }}>
            × 3 Spam Surcharge = 75 ATTN for the 5th email 💀
          </FadeIn>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 6: LLM Categories (42-54s) */}
      <Sequence from={33 * 30} durationInFrames={9 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
          <Title title="AI Arbitration Categories" sub="Gemini classifies in real-time" delay={0} />
          <div style={{ display: "flex", gap: 24, marginTop: 20 }}>
            {[
              { cat: "high_value", coeff: "×0.3", desc: "70% discount", color: "#22c55e", icon: "💎" },
              { cat: "legit", coeff: "×0.5", desc: "50% discount", color: "#60a5fa", icon: "✅" },
              { cat: "cold", coeff: "×1.0", desc: "Standard", color: "#f59e0b", icon: "❄️" },
              { cat: "spam", coeff: "×3.0", desc: "Triple!", color: "#ef4444", icon: "🚫" },
              { cat: "reply", coeff: "FREE", desc: "Always free", color: "#a78bfa", icon: "💬" },
            ].map((item, i) => (
              <FadeIn key={i} delay={15 + i * 18} style={{
                background: `${item.color}11`,
                border: `2px solid ${item.color}33`,
                borderRadius: 16,
                padding: "24px 20px",
                textAlign: "center",
                width: 175,
              }}>
                <div style={{ fontSize: 40, fontFamily: FONT }}>{item.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color, marginTop: 8, fontFamily: FONT }}>{item.cat}</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginTop: 4, fontFamily: MONO }}>{item.coeff}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontFamily: FONT }}>{item.desc}</div>
              </FadeIn>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 7: Escrow Flow (54-66s) */}
      <Sequence from={42 * 30} durationInFrames={8 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
          <Title title="48-Hour Attention Escrow" sub="Good communication is literally free" delay={0} />
          <div style={{ display: "flex", gap: 30, marginTop: 30, alignItems: "center" }}>
            <FadeIn delay={15} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, fontFamily: FONT }}>📧</div>
              <div style={{ color: "#60a5fa", fontSize: 18, fontWeight: 600, marginTop: 8, fontFamily: FONT }}>Email Sent</div>
              <div style={{ color: "#6b7280", fontSize: 14, fontFamily: MONO }}>3 ATTN locked</div>
            </FadeIn>
            <FadeIn delay={30} style={{ fontSize: 36, color: "#374151", fontFamily: FONT }}>→</FadeIn>
            <FadeIn delay={35} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 42, color: "#f59e0b", fontWeight: 700, fontFamily: MONO }}>48h</div>
              <div style={{ color: "#6b7280", fontSize: 14, fontFamily: FONT }}>Escrow</div>
            </FadeIn>
            <FadeIn delay={45} style={{ fontSize: 36, color: "#374151", fontFamily: FONT }}>→</FadeIn>
            <div>
              <FadeIn delay={55} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 28, fontFamily: FONT }}>✅</span>
                <span style={{ color: "#22c55e", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Read → Refund sender</span>
              </FadeIn>
              <FadeIn delay={70} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                <span style={{ fontSize: 28, fontFamily: FONT }}>🥀</span>
                <span style={{ color: "#f59e0b", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Ignored → Pay recipient</span>
              </FadeIn>
              <FadeIn delay={85} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                <span style={{ fontSize: 28, fontFamily: FONT }}>❌</span>
                <span style={{ color: "#ef4444", fontSize: 18, fontWeight: 600, fontFamily: FONT }}>Rejected → Compensate</span>
              </FadeIn>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Scene 8: Inbox with Badges (66-76s) */}
      <Sequence from={50 * 30} durationInFrames={7 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <InboxScreen startFrame={50 * 30} />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 9: Arbitration + Confetti (76-88s) */}
      <Sequence from={57 * 30} durationInFrames={9 * 30}>
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <ArbitrationResult startFrame={57 * 30} />
        </AbsoluteFill>
      </Sequence>

      

      {/* Watermark */}
      <div style={{
        position: "absolute",
        bottom: 20,
        right: 30,
        fontSize: 14,
        color: "rgba(255,255,255,0.2)",
        fontFamily: MONO,
      }}>
        basemail.ai
      </div>
    </AbsoluteFill>
  );
};
