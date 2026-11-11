import React from "react";
import { createRoot } from "react-dom/client";
import GuidedDemo from "./GuidedDemo";
import "./widget.css";
import "./widget-modern.css";

let root: ReturnType<typeof createRoot> | null = null;

function mount(selector = "#chat-root", opts?: { backendUrl?: string }) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Mount element not found: ${selector}`);

    if (root) root.unmount();
    root = createRoot(el);
    root.render(<GuidedDemo backendUrl={opts?.backendUrl || ""} />);
}

function unmount() {
    if (root) root.unmount();
    root = null;
}

(window as any).ChatWidget = { mount, unmount };
