import React, { useEffect, useRef, useState } from "react";
import "./current-affairs.css";

const REGIONS = { world: "World", us: "United States", kr: "South Korea" };
type Region = keyof typeof REGIONS;

const NEWS_SEARCH = {
    world: "https://news.google.com/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US%3Aen",
    us: "https://news.google.com/search?q=United%20States%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen",
    kr: "https://news.google.com/search?q=%22South%20Korea%22%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen",
};

type Article = {
    title: string;
    url: string;
    source: string;
    published_at: string;
    description: string;
    summary: string;
};

type Edition = { region: Region; generated_at: string; stale: boolean; articles: Article[] };

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CurrentAffairs({ backendUrl }: { backendUrl: string }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const request = useRef<AbortController | null>(null);
    const [region, setRegion] = useState<Region>("world");
    const [edition, setEdition] = useState<Edition | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => () => request.current?.abort(), []);

    async function load(nextRegion: Region, refresh = false) {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 70_000);
        setRegion(nextRegion);
        setEdition((previous) => previous?.region === nextRegion ? previous : null);
        setLoading(true);
        setError("");
        const unavailable = "Couldn’t load headlines. Try refreshing in a moment.";
        try {
            if (!backendUrl) throw new Error("News service unavailable");
            const url = new URL("/api/current-affairs", new URL(backendUrl, window.location.href));
            url.searchParams.set("region", nextRegion);
            if (refresh) url.searchParams.set("refresh", "1");
            const response = await fetch(url, { signal: controller.signal });
            const data = await response.json();
            if (!response.ok) {
                if (request.current === controller) {
                    setError(data.code === "news_not_configured" ? "The in-page headline feed is awaiting setup." : unavailable);
                }
                return;
            }
            if (request.current === controller) setEdition(data);
        } catch {
            if (request.current === controller) setError(unavailable);
        } finally {
            window.clearTimeout(timeout);
            if (request.current === controller) setLoading(false);
        }
    }

    function open() {
        dialog.current?.showModal();
        void load(region);
    }

    function onClose() {
        request.current?.abort();
        request.current = null;
    }

    return <>
        <button type="button" className="current-affairs-trigger" onClick={open} aria-haspopup="dialog">
            Current Affairs
        </button>
        <dialog ref={dialog} className="current-affairs-dialog" aria-labelledby="current-affairs-title" onClose={onClose}>
            <div className="current-affairs-header">
                <h2 id="current-affairs-title">Current Affairs</h2>
                <button type="button" className="current-affairs-close" aria-label="Close Current Affairs"
                    onClick={() => dialog.current?.close()}>×</button>
            </div>
            <div className="current-affairs-controls">
                <div className="current-affairs-regions" role="group" aria-label="Headline region">
                    {(Object.keys(REGIONS) as Region[]).map((key) => (
                        <button type="button" key={key} aria-pressed={region === key}
                            onClick={() => { if (region !== key) void load(key); }}>
                            {REGIONS[key]}
                        </button>
                    ))}
                </div>
                <button type="button" className="current-affairs-refresh" disabled={loading}
                    onClick={() => void load(region, true)}>Refresh</button>
            </div>
            <div className="current-affairs-status" role="status">
                {loading && `Searching ${REGIONS[region]} headlines…`}
                {!loading && error}
                {!loading && !error && edition && (
                    edition.articles.length ? <>
                        {edition.stale ? "Showing the last available edition · " : "Feed checked "}
                        <time dateTime={edition.generated_at}>{formatDate(edition.generated_at)}</time>
                    </> : "No recent English-language headlines found for this region."
                )}
            </div>
            {!loading && (error || !edition?.articles.length) && <a className="current-affairs-external"
                href={NEWS_SEARCH[region]} target="_blank" rel="noopener noreferrer">
                Browse {REGIONS[region]} headlines on Google News ↗
            </a>}
            <ul className="current-affairs-stories" aria-label={`${REGIONS[region]} headlines`}>
                {edition?.articles.map((article) => (
                    <li key={article.url}>
                        <div className="current-affairs-story-meta">
                            <span>{article.source}</span>
                            <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
                        </div>
                        <h3><a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a></h3>
                        {(article.summary || article.description) && <p>{article.summary || article.description}</p>}
                    </li>
                ))}
            </ul>
        </dialog>
    </>;
}
