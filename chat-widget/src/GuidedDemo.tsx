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
type Session = { messages: Message[]; socratic: State; steps: Step[]; material: string; conversation_id: string; document_token?: string; document_title?: string };
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
    const [popup, setPopup] = useState("");
    const [uploading, setUploading] = useState(false);
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
                    document_token: session?.document_token,
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
    async function uploadFile(file?: File) {
        if (!file || busy) return;
        if (!/\.(pdf|docx|pptx|tex)$/i.test(file.name)) {
            setPopup("Please choose a PDF, Word (.docx), PowerPoint (.pptx), or LaTeX (.tex) file. Save older .doc and .ppt files as .docx or .pptx first.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) { setPopup("This file is too large. Please choose a file under 2 MB."); return; }
        setBusy(true); setUploading(true); setError("");
        const abort = new AbortController(); controller.current = abort;
        const timeout = window.setTimeout(() => abort.abort(), 180000);
        try {
            const form = new FormData(); form.append("document", file);
            const response = await fetch(backendUrl + "/document", { method: "POST", body: form, signal: abort.signal });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Could not read this document.");
            const started = await fetch(backendUrl, { method: "POST", signal: abort.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start", document_token: data.document_token }) });
            const result = await started.json();
            if (!started.ok) throw new Error(result.detail || "Could not open the activity.");
            setSession(result); setDraft(""); setMaterials(false);
        } catch (cause) { setPopup(cause instanceof Error ? cause.message : "Could not upload this file."); }
        finally { window.clearTimeout(timeout); setBusy(false); setUploading(false); }
    }
    return <div className="guided-demo">
        <aside className="guided-sidebar">
            <div className="guided-brand"><span>SQ</span><div><h2>Socratic Lab</h2><p>Chat with your document</p></div></div>
            <button className="guided-outline" disabled={busy} onClick={() => send("start")}>{session ? "Restart demo" : "Start guided demo"}</button>
            <section className="guided-upload">
                <h3>Course materials</h3>
                <p>Upload a document to build a three-step practice session.</p>
                <label className="guided-file-button">Upload document
                    <input type="file" disabled={busy} onChange={event => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />
                </label>
                <p className="guided-file-limits">PDF · DOCX · PPTX · LaTeX (.tex)<br />2 MB maximum · 12,000 text characters<br />Up to 30 PDF pages or slides</p>
                <p className="guided-file-limits">3 uploads per day and 30 replies per hour per visitor. A shared daily allowance also applies.</p>
                {session && <><strong className="guided-document-name">{session.document_title || "Code review practice guide"}</strong>
                    <button className="guided-outline" onClick={() => setMaterials(!materials)}>{materials ? "Hide" : "Read"} document</button>
                    {materials && <div className="guided-material">{session.material}</div>}</>}
            </section>
        </aside>
        <section className="guided-chat" aria-label="Guided Socratic conversation">
            <header><h2>{finished ? "Practice complete" : session ? session.steps[index]?.title : "Try BrainTutor"}</h2><span>OpenAI demo</span></header>
            <div className="guided-messages" aria-live="polite">
                {!session && <div className="guided-intro"><h1>Learn with your document</h1><p>Work through three short steps with a Socratic tutor. Ask about unfamiliar terms at any time, then return to the question you paused.</p><p>Upload course material on the left, or try the sample code review guide. Document text is sent to OpenAI for tutoring. Your session stays in this browser tab.</p><button disabled={busy} onClick={() => send("start")}>Start guided demo</button></div>}
                {session?.messages.map((message, i) => <article key={i} className={message.role}>
                    <span>{message.role === "assistant" ? "Socratic tutor" : "You"}</span>
                    <div>{message.role === "assistant" ? <TutorContent message={message} /> : <Text value={message.content} />}</div>
                </article>)}
                {busy && <p className="guided-working" role="status"><span />{uploading ? "Reading your document and building your practice session…" : session ? "Preparing your reply…" : "Opening the guided activity…"}</p>}
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
        {popup && <div className="guided-modal-backdrop" onClick={() => setPopup("")}>
            <section className="guided-upload-modal" role="alertdialog" aria-modal="true" aria-labelledby="upload-modal-title" onClick={event => event.stopPropagation()}>
                <h2 id="upload-modal-title">Check your document</h2><p>{popup}</p>
                <button autoFocus onClick={() => setPopup("")}>Got it</button>
            </section>
        </div>}
    </div>;
}
