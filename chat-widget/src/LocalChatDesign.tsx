import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function AtomLoader({ message, title = "Socratic tutor" }: { message: string; title?: string }) {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const start = Date.now();
        const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, []);
    return <div className="guided-processing-card" role="status">
        <div className="guided-processing-content">
            <span className="guided-atom-mark" aria-hidden="true"><svg viewBox="0 0 44 44">
                <g className="guided-orbit orbit-one"><ellipse cx="22" cy="22" rx="19" ry="8" /><circle cx="41" cy="22" r="2.6" /></g>
                <g transform="rotate(60 22 22)"><g className="guided-orbit orbit-two"><ellipse cx="22" cy="22" rx="19" ry="8" /><circle cx="41" cy="22" r="2.6" /></g></g>
                <g transform="rotate(120 22 22)"><g className="guided-orbit orbit-three"><ellipse cx="22" cy="22" rx="19" ry="8" /><circle cx="41" cy="22" r="2.6" /></g></g>
                <circle cx="22" cy="22" r="8" fill="#6350d933" /><circle cx="22" cy="22" r="5.4" fill="#202841" /><circle cx="20" cy="20" r="1.8" fill="white" />
            </svg></span>
            <div><strong>{title}</strong><p>{message}</p><span className="guided-elapsed">{seconds}s elapsed</span></div>
        </div>
        <div className="guided-processing-track" aria-hidden="true"><span /></div>
    </div>;
}

const TOUR = [
    { target: "materials", title: "Choose your course material", detail: "Upload your own PDF, Word, PowerPoint, or LaTeX document. The tutor starts from that document; no sample material is included.", preview: "Your document → a short guided activity" },
    { target: "document", title: "Read before you begin", detail: "Use View to read the material beside the chat, or Download to keep a copy. You can return to it at any time.", preview: "View document · Zoom in · Download" },
    { target: "conversation", title: "Choose how to chat", detail: "Both modes guide you with scenarios and Socratic questions. Jarvis uses friendly, casual wording; Socrates uses formal wording. Switching keeps your conversation and progress.", preview: "Your document → a relevant scenario → one question at a time." },
    { target: "composer", title: "Ask for help whenever you need it", detail: "Ask about an unfamiliar term or explain what is confusing. During a subtopic discussion, Back to the original question restores the question you paused.", preview: "You: Could you explain this term from my document?" },
    { target: "actions", title: "Continue through the learning steps", detail: "In either mode, Continue to next step appears below the reply when the step is ready. After the final step, summarize your learning and review the feedback.", preview: "Discuss → Continue → Summarize → Final feedback" },
];
export function ChatTutorial({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const close = useRef<HTMLButtonElement>(null);
    const current = TOUR[step];
    useEffect(() => { close.current?.focus(); }, []);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
    }, [onClose]);
    useLayoutEffect(() => {
        const target = document.querySelector(`[data-guided-tour="${current.target}"]`) || document.querySelector('[data-guided-tour="conversation"]');
        target?.scrollIntoView({ block: "nearest" });
        const update = () => setRect(target?.getBoundingClientRect() || null);
        update();
        window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
        return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
    }, [current]);
    const width = Math.min(370, window.innerWidth - 32);
    const height = 360;
    const left = Math.max(16, Math.min((rect?.left || 16), window.innerWidth - width - 16));
    const below = (rect?.bottom || 0) + 20;
    const top = below + height < window.innerHeight ? below : Math.max(16, (rect?.top || 0) - height - 20);
    return <div className="guided-tour" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
        {rect ? <>
            <div className="guided-tour-shade" style={{left:0, top:0, right:0, height:Math.max(0,rect.top-5)}} onClick={onClose} />
            <div className="guided-tour-shade" style={{left:0, top:rect.bottom+5, right:0, bottom:0}} onClick={onClose} />
            <div className="guided-tour-shade" style={{left:0, top:Math.max(0,rect.top-5), width:Math.max(0,rect.left-5), height:rect.height+10}} onClick={onClose} />
            <div className="guided-tour-shade" style={{left:rect.right+5, top:Math.max(0,rect.top-5), right:0, height:rect.height+10}} onClick={onClose} />
        </> : <div className="guided-tour-shade" style={{inset:0}} onClick={onClose} />}
        {rect && <div className="guided-tour-highlight" aria-hidden="true" style={{ left: Math.max(0, rect.left - 5), top: Math.max(0, rect.top - 5), width: rect.width + 10, height: rect.height + 10 }} />}
        <section className="guided-tour-card" style={{ top, left, width }} onKeyDown={event => {
            if (event.key === "Tab") {
                const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        }}>
            <div className="guided-tour-meta"><span>Tutorial · {step + 1} of {TOUR.length}</span><button ref={close} className="guided-close" onClick={onClose} aria-label="Close tutorial">×</button></div>
            <h2 id="guided-tour-title">{current.title}</h2><p>{current.detail}</p>
            <div className="guided-tour-example">{current.preview}</div>
            <div className="guided-tour-buttons"><button className="guided-outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button onClick={() => step === TOUR.length - 1 ? onClose() : setStep(step + 1)}>{step === TOUR.length - 1 ? "Got it" : "Next"}</button></div>
        </section>
    </div>;
}
