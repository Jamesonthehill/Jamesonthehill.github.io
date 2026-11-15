import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export default function GuidedPdfPreview({ file, page, zoom, onPage }: {
    file: File;
    page: number;
    zoom: number;
    onPage: (page: number) => void;
}) {
    const [pdf, setPdf] = useState<PDFDocumentProxy>();
    const [error, setError] = useState("");
    const [width, setWidth] = useState(0);
    const scrollport = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const pageCount = pdf?.numPages ?? 0;
    const shownPage = Math.min(page, pageCount || page);

    useEffect(() => {
        let cancelled = false;
        let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
        async function open() {
            try {
                const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
                const data = new Uint8Array(await file.arrayBuffer());
                if (cancelled) return;
                GlobalWorkerOptions.workerSrc = workerUrl;
                task = getDocument({ data });
                const doc = await task.promise;
                if (!cancelled) setPdf(doc);
            } catch {
                if (!cancelled) setError("Could not open this PDF. Use Download to open the original file.");
            }
        }
        void open();
        return () => {
            cancelled = true;
            void task?.destroy().catch(() => {});
        };
    }, [file]);

    useEffect(() => {
        const element = scrollport.current;
        if (!element) return;
        const resize = () => setWidth(element.clientWidth);
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        scrollport.current?.scrollTo(0, 0);
    }, [shownPage]);

    useEffect(() => {
        if (!pdf || width <= 16) return;
        let cancelled = false;
        let task: RenderTask | undefined;
        setError("");
        async function draw() {
            try {
                const pdfPage = await pdf!.getPage(shownPage);
                const surface = canvas.current;
                if (cancelled || !surface) return;
                const naturalWidth = pdfPage.getViewport({ scale: 1 }).width;
                const viewport = pdfPage.getViewport({ scale: (width - 16) / naturalWidth * zoom / 100 });
                const density = Math.min(window.devicePixelRatio || 1, 2);
                surface.width = Math.ceil(viewport.width * density);
                surface.height = Math.ceil(viewport.height * density);
                surface.style.width = `${viewport.width}px`;
                surface.style.height = `${viewport.height}px`;
                task = pdfPage.render({ canvas: surface, viewport, transform: [density, 0, 0, density, 0, 0] });
                await task.promise;
            } catch {
                if (!cancelled) setError("Could not display this page. Use Download to open the original file.");
            }
        }
        void draw();
        return () => {
            cancelled = true;
            task?.cancel();
        };
    }, [pdf, shownPage, zoom, width]);

    return <div className="guided-pdf-viewport" ref={scrollport}>
        {pageCount > 0 && <div className="guided-pdf-pages" role="group" aria-label="PDF pages">
            <button type="button" disabled={shownPage <= 1} onClick={() => onPage(shownPage - 1)}>Previous page</button>
            <span>Page {shownPage} of {pageCount}</span>
            <button type="button" disabled={shownPage >= pageCount} onClick={() => onPage(shownPage + 1)}>Next page</button>
        </div>}
        {error && <p role="alert">{error}</p>}
        {!pdf && !error && <p role="status">Opening PDF…</p>}
        <div className="guided-pdf-sheet" hidden={!pdf || !!error}>
            <canvas ref={canvas} aria-label={`${file.name}, page ${shownPage}`} />
        </div>
    </div>;
}
