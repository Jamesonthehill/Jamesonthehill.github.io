import { Fragment, useEffect, useRef, useState } from "react";
import { AtomLoader, ChatTutorial } from "./LocalChatDesign";
import "./guided-demo.css";

type TutorMode = "jarvis" | "socrates";
type Message = { role: "user" | "assistant"; content: string; lead_in?: string; next_thinking_step?: string; created_at?: string; response_seconds?: number; sources?: string[]; tutor_mode?: TutorMode };
type Step = { title: string; goal: string };
type State = {
    tutor_mode?: TutorMode;
    learning_step_index?: number;
    phase?: string;
    step_readiness?: { ready?: boolean };
    learning_detour?: { question?: string };
};
type Session = { messages: Message[]; socratic: State; steps: Step[]; material: string; conversation_id: string; document_token?: string; document_title?: string; tutor_mode?: TutorMode };
const STORAGE = "braintutor_portfolio_guided_v1";

function load(): Session | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE) || "null");
        if (!saved || !saved.document_token || !Array.isArray(saved.messages) || !Array.isArray(saved.steps)) return null;
        // Keep sessions from before the spelling correction usable.
        if (saved.tutor_mode === "javis") saved.tutor_mode = "jarvis";
        if (saved.socratic?.tutor_mode === "javis") saved.socratic.tutor_mode = "jarvis";
        saved.messages = saved.messages.map((message: Omit<Message, "tutor_mode"> & {tutor_mode?: string}) => ({...message,
            tutor_mode: message.tutor_mode === "javis" ? "jarvis" : message.tutor_mode}));
        return saved;
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
    lead = lead?.replace(/^Step \d+: [^\n]+\n\n/, "");
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
    const [mode, setMode] = useState<TutorMode>(() => load()?.tutor_mode || "jarvis");
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [popup, setPopup] = useState("");
    const [uploading, setUploading] = useState(false);
    const [materials, setMaterials] = useState(false);
    const [tutorial, setTutorial] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [original, setOriginal] = useState<{url: string; file: File} | null>(null);
    const [pending, setPending] = useState("");
    const [summarizing, setSummarizing] = useState(false);
    const originalRef = useRef<string | null>(null);
    const reply = useRef<HTMLTextAreaElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const messagesPanel = useRef<HTMLDivElement>(null);
    const end = useRef<HTMLDivElement>(null);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => {
        try { if (session) sessionStorage.setItem(STORAGE, JSON.stringify(session)); } catch { /* Storage can be unavailable in private browsing. */ }
        const panel = messagesPanel.current;
        if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, [session, busy]);
    useEffect(() => () => { controller.current?.abort(); if (originalRef.current) URL.revokeObjectURL(originalRef.current); }, []);
    useEffect(() => {
        if (!fullscreen) return;
        const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
        window.addEventListener("keydown", escape);
        return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); };
    }, [fullscreen]);
    function stamp(result: Session, elapsed?: number) {
        const now = new Date().toISOString();
        result.messages = result.messages.map((message, i) => ({ ...message,
            created_at: message.created_at || session?.messages[i]?.created_at || now,
            response_seconds: i === result.messages.length - 1 && elapsed !== undefined ? elapsed : session?.messages[i]?.response_seconds,
        }));
        return result;
    }
    function downloadMaterial() {
        const url = original?.url || URL.createObjectURL(new Blob([session?.material || ""], {type: "text/plain"}));
        const link = document.createElement("a"); link.href = url;
        link.download = original?.file.name || `${session?.document_title || "Course material"}.txt`;
        link.click(); if (!original) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const index = session?.socratic.learning_step_index || 0;
    const finished = session?.socratic.phase === "completed";
    const ready = session?.socratic.step_readiness?.ready && !session?.socratic.learning_detour;
    const last = index === (session?.steps.length || 0) - 1;
    async function send(action: string, nextMode: TutorMode = mode) {
        if (busy) return;
        if (!session?.document_token) {setPopup("Upload a document before starting the chat."); return;}
        setBusy(true);
        setPending(["message", "finish"].includes(action) ? draft : "");
        const startedAt = Date.now();
        setError("");
        const abort = new AbortController();
        controller.current = abort;
        const timeout = window.setTimeout(() => abort.abort(), 180000);
        try {
            let active = session;
            const response = await fetch(backendUrl, {
                method: "POST", headers: { "Content-Type": "application/json" },
                signal: abort.signal,
                body: JSON.stringify({
                    action, tutor_mode: nextMode, message: draft, history: active?.messages || [],
                    engine_state: active?.socratic || {},
                    document_token: active?.document_token,
                    conversation_id: active?.conversation_id || crypto.randomUUID(),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "The demo could not complete this request. Please retry.");
            if (!Array.isArray(result.messages) || !Array.isArray(result.steps)) throw new Error("The demo returned an unexpected response.");
            setSession(stamp(result, ["message", "finish"].includes(action) ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : undefined));
            setMode(nextMode);
            if (["start", "continue", "finish"].includes(action)) setSummarizing(false);
            if (action !== "set_mode") setDraft("");
        } catch (cause) {
            setError(cause instanceof Error && cause.name === "AbortError"
                ? "The server is taking longer than expected. Please retry in a moment."
                : cause instanceof Error ? cause.message : "Unable to connect. Please retry.");
        } finally {
            window.clearTimeout(timeout);
            setBusy(false); setPending("");
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
                body: JSON.stringify({ action: "start", tutor_mode: mode, document_token: data.document_token }) });
            const result = await started.json();
            if (!started.ok) throw new Error(result.detail || "Could not open the activity.");
            if (originalRef.current) URL.revokeObjectURL(originalRef.current);
            const url = URL.createObjectURL(file); originalRef.current = url; setOriginal({url,file});
            setSession(stamp(result)); setDraft(""); setMaterials(false); setSummarizing(false); setZoom(100);
        } catch (cause) { setPopup(cause instanceof Error ? cause.message : "Could not upload this file."); }
        finally { window.clearTimeout(timeout); setBusy(false); setUploading(false); }
    }
    function switchMode(nextMode: TutorMode) {
        if (busy || nextMode === mode) return;
        if (!session) {setMode(nextMode); return;}
        void send("set_mode", nextMode);
    }
    const latestAssistant = session?.messages.reduce((latest, message, i) => message.role === "assistant" ? i : latest, -1) ?? -1;
    return <div className={`guided-demo${fullscreen ? " is-fullscreen" : ""}`}>
        <aside className={`guided-sidebar${materials ? " is-viewing-document" : ""}`}>
            <div className="guided-brand"><span>SQ</span><div><h2>Socratic Lab</h2><p>GUIDE, LEARN, THINK!</p></div></div>
            {materials && session ? <section className="guided-document-viewer">
                <div className="guided-document-toolbar"><h3>Course material</h3><button className="guided-close" onClick={() => setMaterials(false)}>× Close</button></div>
                <strong className="guided-document-name">{session.document_title || "Uploaded document"}</strong>
                <div className="guided-zoom-controls"><button onClick={() => setZoom(Math.max(75,zoom-25))} disabled={zoom <= 75} aria-label="Zoom out">−</button><output>{zoom}%</output><button onClick={() => setZoom(Math.min(200,zoom+25))} disabled={zoom >= 200} aria-label="Zoom in">+</button><button onClick={() => setZoom(100)}>Reset</button></div>
                {original?.file.type === "application/pdf" || original?.file.name.toLowerCase().endsWith(".pdf")
                    ? <div className="guided-pdf-scroll"><div style={{width: `${zoom}%`, height: `${650*zoom/100}px`}}><iframe title="Original course document" src={original.url} style={{width:`${10000/zoom}%`,height:650,transform:`scale(${zoom/100})`,transformOrigin:"top left"}} /></div></div>
                    : <div className="guided-material" style={{fontSize:`${14*zoom/100}px`}}>{session.material}</div>}
                <button className="guided-download" onClick={downloadMaterial}>↓ Download {original ? "original file" : "document text"}</button>
            </section> : <>
                <section className="guided-upload" data-guided-tour="materials">
                    <div className="guided-section-heading"><span className="guided-section-icon" aria-hidden="true">▤</span><h3>Course materials</h3></div>
                    <span className="guided-recommended">Highly recommended before chatting</span>
                    <p>Read your material, then explore it with your tutor.</p>
                    <label className={`guided-file-button${busy ? " is-disabled" : ""}`}><span aria-hidden="true">＋</span> Upload document
                        <input ref={fileInput} type="file" disabled={busy} onChange={event => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />
                    </label>
                    <p className="guided-file-limits">PDF · DOCX · PPTX · LaTeX (.tex)<br />Up to 2 MB · 12,000 text characters<br />Up to 30 PDF pages or slides</p>
                    {session && <div className="guided-document-row" data-guided-tour="document">
                        <span className="guided-file-icon" aria-hidden="true">▤</span><strong>{session?.document_title || "Uploaded document"}</strong>
                        {session ? <div className="guided-document-actions"><button onClick={() => {setMaterials(true);setZoom(100);}}>View</button><button onClick={downloadMaterial}>↓ Download</button></div>
                            : null}
                    </div>}
                    {session && <button className="guided-outline guided-restart" disabled={busy} onClick={() => send("start")}>↻ Restart activity</button>}
                </section>
                <div className="guided-sidebar-note"><span aria-hidden="true">✦</span><p>Ask about a word or idea whenever you get stuck. You can return to your original question.</p></div>
                <details className="guided-usage"><summary>Demo limits & privacy</summary><p>3 uploads per day and 30 replies per hour per visitor. Shared daily allowances also apply. Document text is sent to OpenAI. Your session is saved in this browser tab.</p></details>
            </>}
        </aside>
        <section className="guided-chat" aria-label="Guided Socratic conversation">
            <header className="guided-chat-heading"><span className="guided-tool-icon" aria-hidden="true"><img src={`/assets/chat-widget/avatars/${mode}.jpg`} alt="" width={43} height={43} /></span><div><h2>{mode === "jarvis" ? "Jarvis" : "Socrates"}</h2><p>{mode === "jarvis" ? "Friendly questions grounded in your documents." : "Guided questions grounded in your documents."}</p></div><div className="guided-header-actions"><div className="guided-mode-switch" role="group" aria-label="Tutor mode"><button disabled={busy} aria-pressed={mode === "jarvis"} onClick={() => switchMode("jarvis")}>Jarvis</button><button disabled={busy} aria-pressed={mode === "socrates"} onClick={() => switchMode("socrates")}>Socrates</button></div><button data-guided-tour="tutorial" onClick={() => {setMaterials(false);setTutorial(true);}}>Tutorial</button><button className="guided-expand" aria-label={fullscreen ? "Exit fullscreen" : "Expand chat"} aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? "⤢" : "⛶"}</button></div></header>
            <div className="guided-messages" ref={messagesPanel} data-guided-tour="conversation" aria-live="polite">
                {!session && <div className="guided-intro"><span className="guided-intro-mark"><img src={`/assets/chat-widget/avatars/${mode}.jpg`} alt="" width={52} height={52} /></span><span className="guided-eyebrow">YOUR DOCUMENT. YOUR LEARNING.</span><h1>Start with your document.</h1><p>Upload a document you want to understand. {mode === "jarvis" ? "Jarvis" : "Socrates"} will build a short learning activity from it, explain ideas, and guide you with questions.</p><ol className="guided-start-steps"><li><strong>Upload</strong> a PDF, Word, PowerPoint, or LaTeX file.</li><li><strong>Explore</strong> its ideas through a scenario and questions.</li><li><strong>Ask for help</strong> whenever something is unclear.</li></ol><div className="guided-start-actions"><button disabled={busy} onClick={() => fileInput.current?.click()}>＋ Upload document</button><button className="guided-outline" onClick={() => setTutorial(true)}>Tutorial</button></div><span className="guided-intro-note">Choose Jarvis for a friendly tone or Socrates for a formal tone. Both use your document.</span></div>}
                {session?.messages.map((message, i) => {
                    const stepMatch = message.role === "assistant" ? message.content.match(/^Step (\d+): ([^\n]+)/) : null;
                    const isLatest = i === latestAssistant;
                    return <Fragment key={i}>
                        {stepMatch && <div className="guided-step-divider" role="separator"><span>Step {stepMatch[1]} of {session.steps.length}</span><strong>{stepMatch[2]}</strong></div>}
                        <article className={`${message.role}${isLatest ? " is-current-reply" : ""}`}>
                            <header className="guided-message-header"><div><span className="guided-avatar" aria-hidden="true">{message.role === "assistant" ? <img src={`/assets/chat-widget/avatars/${message.tutor_mode === "jarvis" ? "jarvis" : "socrates"}.jpg`} alt="" width={27} height={27} /> : "Y"}</span><strong>{message.role === "assistant" ? (message.tutor_mode === "jarvis" ? "Jarvis" : "Socrates") : "You"}</strong></div><div className="guided-message-meta">{message.created_at && <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time>}{isLatest && message.response_seconds && <span>Generated in {message.response_seconds}s</span>}</div></header>
                            <div className="guided-message-body">{message.role === "assistant" ? <TutorContent message={message} /> : <Text value={message.content} />}
                                {message.sources?.length ? <details className="guided-source-details"><summary>View supporting sources</summary>{message.sources.map((source,n) => <blockquote key={n}><strong>{session.document_title}</strong><p>{source}</p></blockquote>)}<button onClick={() => setMaterials(true)}>View course material</button></details> : null}
                            </div>
                        </article>
                        {isLatest && !finished && !summarizing && <div className="guided-inline-actions" data-guided-tour="actions">
                            {session.socratic.learning_detour && <button disabled={busy} onClick={() => send("resume")}>Back to the original question</button>}
                            {ready && <button className="guided-continue" disabled={busy} onClick={() => { if (last) {setSummarizing(true);window.setTimeout(() => reply.current?.focus(),0);} else void send("continue"); }}>{last ? "Finish conversation and summarize" : "Continue to next step"} <span aria-hidden="true">→</span></button>}
                        </div>}
                    </Fragment>;
                })}
                {busy && pending && <article className="user is-pending"><header className="guided-message-header"><div><span className="guided-avatar">Y</span><strong>You</strong></div><span className="guided-message-meta">Sending…</span></header><div className="guided-message-body"><Text value={pending} /></div></article>}
                {busy && !uploading && <AtomLoader title={mode === "jarvis" ? "Jarvis" : "Socrates"} message={"I’m preparing your reply using the course materials and our conversation."} />}
                {finished && <div className="guided-complete" role="status"><span aria-hidden="true">✦</span><div><strong>Practice complete</strong><p>Your summary and final feedback are ready to review.</p></div></div>}
                {error && <p className="guided-error" role="alert">{error}</p>}
                <div ref={end} />
            </div>
            {session && !finished && <footer data-guided-tour="composer" className={summarizing ? "is-summarizing" : ""}>
                <form onSubmit={event => { event.preventDefault(); void send(summarizing ? "finish" : "message"); }}>
                    <label htmlFor="guided-reply">{summarizing ? "Summarize what you learned" : "Share your thinking"}</label>
                    <textarea ref={reply} id="guided-reply" rows={2} maxLength={4000} placeholder={summarizing ? "In my own words, I learned…" : "Write your answer or ask a question…"} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} onKeyDown={event => {if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); if (draft.trim() && !busy) event.currentTarget.form?.requestSubmit();}}} />
                    <div className="guided-composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button disabled={busy || !draft.trim()}>{summarizing ? "Get final feedback" : "Send message"}</button></div>
                </form>
            </footer>}
            {finished && <footer><button onClick={() => send("start")} disabled={busy}>Try again</button></footer>}
        </section>
        {uploading && <div className="guided-upload-overlay"><AtomLoader title={mode === "jarvis" ? "Jarvis" : "Socrates"} message="Generating setup from your selected document. Please keep this page open." /></div>}
        {tutorial && <ChatTutorial onClose={() => setTutorial(false)} />}
        {popup && <div className="guided-modal-backdrop" onClick={() => setPopup("")}>
            <section className="guided-upload-modal" role="alertdialog" aria-modal="true" aria-labelledby="upload-modal-title" onClick={event => event.stopPropagation()} onKeyDown={event => {if (event.key === "Escape") setPopup("");}}>
                <h2 id="upload-modal-title">Check your document</h2><p>{popup}</p>
                <button autoFocus onClick={() => setPopup("")}>Got it</button>
            </section>
        </div>}
    </div>;
}
