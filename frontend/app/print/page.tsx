"use client";

import { useEffect, useMemo, useState } from "react";
import { buildExportPdfHtml } from "../components/exportPdfTemplate";

type PrintPayload = {
    campaignPlan: any;
    partyDetails: any;
    narrative: any;
    title?: string;
    createdAt?: string;
};

export default function PrintPage() {
    const [payload, setPayload] = useState<PrintPayload | null>(null);
    const [exportMode, setExportMode] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("dnd_print_payload");
            if (!raw) return;
            setPayload(JSON.parse(raw));
        } catch (err) {
            console.error("Failed to read print payload:", err);
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setExportMode(params.get("mode") === "export");
    }, []);

    const html = useMemo(() => {
        if (!payload) return "";
        const full = buildExportPdfHtml(payload);
        const bodyMatch = full.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        return bodyMatch?.[1] || "";
    }, [payload]);

    const css = useMemo(() => {
        if (!payload) return "";
        const full = buildExportPdfHtml(payload);
        const styleMatch = full.match(/<style>([\s\S]*)<\/style>/i);
        return styleMatch?.[1] || "";
    }, [payload]);

    if (!payload) {
        return <div className="p-8 text-slate-600">No print payload found.</div>;
    }

    return (
        <div className="min-h-screen bg-white text-slate-900">
            <style jsx global>{css}</style>

            {!exportMode && (
                <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between print:hidden">
                    <div className="text-sm text-slate-600">Custom PDF preview</div>
                    <button
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500"
                    >
                        Print Preview
                    </button>
                </div>
            )}

            <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
    );
}
