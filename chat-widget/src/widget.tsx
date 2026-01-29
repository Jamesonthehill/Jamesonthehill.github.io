import React from "react";
import { createRoot, Root } from "react-dom/client";
import ChatGPTWidget from "./ChatGPTWidget";
import "./widget.css";

const roots = new Map<Element, Root>();

function mount(selector = "#chat-root") {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Mount element not found: ${selector}`);

    if (roots.has(el)) {
        roots.get(el)!.unmount();
        roots.delete(el);
    }

    const root = createRoot(el);
    roots.set(el, root);
    root.render(<ChatGPTWidget />);
}

(window as any).ChatWidget = { mount };
