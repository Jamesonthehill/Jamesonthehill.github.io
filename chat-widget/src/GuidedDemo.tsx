import { useEffect, useRef, useState } from "react";
import "./guided-demo.css";

type Message = { role: "user" | "assistant"; content: string; lead_in?: string; next_thinking_step?: string };
type Step = { title: string; goal: string };
type State = {
    learning_step_index?: number;
    phase?: string;
    step_readiness?: { ready?: boolean };
    learning_detour?: { question?: string };
};
type Session = { messages: Message[]; socratic: State; steps: Step[]; material: string; conversation_id: string };
const STORAGE = "braintutor_portfolio_guided_v1";

function load(): Session | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE) || "null");
        return saved && Array.isArray(saved.messages) && Array.isArray(saved.steps) ? saved : null;
    } catch { return null; }
}
function Text({ value }: { value: string }) {
    return <>{value.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}
function TutorContent({ message }: { message: Message }) {
    let lead = message.lead_in;
    let question = message.next_thinking_step;
    if (lead === undefined || question === undefined) {
        const parts = message.content.trim().split(/\n\n+/);
        const last = parts[parts.length - 1] || "";
        question = last.replace(/\*/g, "").trim().endsWith("?") ? last : "";
        lead = question ? parts.slice(0, -1).join("\n\n") : message.content;
    }
    return <>
        {lead && <div className="guided-tutor-explanation"><Text value={lead} /></div>}
        {question && <section className="guided-thinking-step" aria-label="Your next thinking step">
            <h3>Your next thinking step</h3>
            <div><Text value={question} /></div>
        </section>}
    </>;
}
export default function GuidedDemo({ backendUrl }: { backendUrl: string }) {
    const [session, setSession] = useState<Session | null>(load);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [materials, setMaterials] = useState(false);
    const end = useRef<HTMLDivElement>(null);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => {
        if (session) sessionStorage.setItem(STORAGE, JSON.stringify(session));
        end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [session, busy]);
    useEffect(() => () => controller.current?.abort(), []);
    const index = session?.socratic.learning_step_index || 0;
    const finished = session?.socratic.phase === "completed";
    const ready = session?.socratic.step_readiness?.ready && !session?.socratic.learning_detour;
    const last = index === (session?.steps.length || 0) - 1;
    async function send(action: string) {
        if (busy) return;
        setBusy(true);
        setError("");
        const abort = new AbortController();
        controller.current = abort;
        const timeout = window.setTimeout(() => abort.abort(), 180000);
        try {
            const response = await fetch(backendUrl, {
                method: "POST", headers: { "Content-Type": "application/json" },
                signal: abort.signal,
                body: JSON.stringify({
                    action, message: draft, history: session?.messages || [],
                    engine_state: session?.socratic || {},
                    conversation_id: session?.conversation_id || crypto.randomUUID(),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "The demo could not complete this request. Please retry.");
            if (!Array.isArray(result.messages) || !Array.isArray(result.steps)) throw new Error("The demo returned an unexpected response.");
            setSession(result);
            setDraft("");
        } catch (cause) {
            setError(cause instanceof Error && cause.name === "AbortError"
                ? "The server is taking longer than expected. Please retry in a moment."
                : cause instanceof Error ? cause.message : "Unable to connect. Please retry.");
        } finally {
            window.clearTimeout(timeout);
            setBusy(false);
        }
    }
    return <div className="guided-demo">
        <aside className="guided-sidebar">
            <div className="guided-brand"><span>SQ</span><div><h2>Socratic Lab</h2><p>Guided code review practice</p></div></div>
            <button className="guided-outline" disabled={busy} onClick={() => send("start")}>{session ? "Restart demo" : "Start guided demo"}</button>
            <h3>Learning path</h3>
            <ol>{(session?.steps || [{ title: "Understand the feedback", goal: "" }, { title: "Respond constructively", goal: "" }, { title: "Check the fix", goal: "" }]).map((step, i) =>
                <li key={step.title} aria-current={session && i === index && !finished ? "step" : undefined} className={session && (i < index || finished) ? "done" : ""}>
                    <span>{session && (i < index || finished) ? "✓" : i + 1}</span><div><strong>{step.title}</strong>{session && i === index && <p>{step.goal}</p>}</div>
                </li>)}</ol>
            {session && <><label>Progress</label><progress max={session.steps.length} value={finished ? session.steps.length : index} />
                <button className="guided-outline" onClick={() => setMaterials(!materials)}>{materials ? "Hide" : "Read"} course material</button>
                {materials && <div className="guided-material">{session.material}</div>}</>}
        </aside>
        <section className="guided-chat" aria-label="Guided Socratic conversation">
            <header><h2>{finished ? "Practice complete" : session ? session.steps[index]?.title : "Try BrainTutor"}</h2><span>OpenAI demo</span></header>
            <div className="guided-messages" aria-live="polite">
                {!session && <div className="guided-intro"><h1>Learn through a code review</h1><p>Work through three short steps with a Socratic tutor. Ask about unfamiliar terms at any time, then return to the question you paused.</p><p>This sample activity uses a code review practice guide. Your demo conversation stays in this browser tab.</p><button disabled={busy} onClick={() => send("start")}>Start guided demo</button></div>}
                {session?.messages.map((message, i) => <article key={i} className={message.role}>
                    <span>{message.role === "assistant" ? "Socratic tutor" : "You"}</span>
                    <div>{message.role === "assistant" ? <TutorContent message={message} /> : <Text value={message.content} />}</div>
                </article>)}
                {busy && <p className="guided-working" role="status"><span />{session ? "Preparing your reply…" : "Opening the guided activity…"}</p>}
                {error && <p className="guided-error" role="alert">{error}</p>}
                <div ref={end} />
            </div>
            {session && !finished && <footer>
                {session.socratic.learning_detour && <button disabled={busy} onClick={() => send("resume")}>Back to the original question</button>}
                {ready && !last && <button disabled={busy} onClick={() => send("continue")}>Continue to next step</button>}
                <form onSubmit={event => { event.preventDefault(); send(ready && last ? "finish" : "message"); }}>
                    <label htmlFor="guided-reply">{ready && last ? "Summarize what you learned to finish" : "Share your thinking or ask for help"}</label>
                    <textarea id="guided-reply" rows={2} maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} />
                    <button disabled={busy || !draft.trim()}>{ready && last ? "Get final feedback" : "Send"}</button>
                </form>
            </footer>}
            {finished && <footer><button onClick={() => send("start")} disabled={busy}>Try again</button></footer>}
        </section>
    </div>;
}
