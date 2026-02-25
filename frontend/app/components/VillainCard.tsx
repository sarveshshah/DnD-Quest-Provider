import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

interface VillainProps {
    villain: {
        hp?: number;
        ac?: number;
        flavor_quote?: string;
        physical_description?: string;
        attacks?: string[];
        special_abilities?: string[];
        image_base64?: string | null;
        goal?: string;
        core_conflict?: string;
    };
    name: string;
}

export default function VillainCard({ villain, name }: VillainProps) {
    if (!villain) return null;

    const hasImage = villain.image_base64 && villain.image_base64 !== "[GENERATED IMAGE STORED]";

    const [lightboxOpen, setLightboxOpen] = useState(false);

    // Escape key close + body scroll lock
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        document.body.style.overflow = lightboxOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [lightboxOpen]);

    // Split "Alistair Finch, a charismatic merchant..." into name + descriptor
    const commaIdx = name.indexOf(',');
    const shortName = commaIdx > 0 ? name.slice(0, commaIdx).trim() : name;
    const descriptor = commaIdx > 0 ? name.slice(commaIdx + 1).trim() : '';

    return (
        <>
            {/* ── LIGHTBOX ────────────────────────────────────────────── */}
            {lightboxOpen && hasImage && (
                <div
                    className="fixed left-0 top-0 w-screen z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
                    style={{ height: '100dvh' }}
                    onClick={() => setLightboxOpen(false)}
                >
                    <div className="absolute top-4 right-4 text-white/60 text-sm flex items-center gap-2 pointer-events-none">
                        <span className="material-symbols-outlined !text-lg">close</span>
                        <span>Click anywhere or press Esc to close</span>
                    </div>
                    <img
                        src={`data:image/jpeg;base64,${villain.image_base64}`}
                        alt={shortName}
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* ── CARD ────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl overflow-hidden flex flex-col md:flex-row w-full transition-colors duration-300">

                {/* Left Column: Portrait */}
                <div className="relative w-full md:w-[40%] self-stretch flex-shrink-0 bg-slate-900 overflow-hidden" style={{ minHeight: '480px' }}>
                    {hasImage ? (
                        <div
                            className="absolute inset-0 cursor-zoom-in group/img"
                            onClick={() => setLightboxOpen(true)}
                        >
                            <img
                                src={`data:image/jpeg;base64,${villain.image_base64}`}
                                alt={shortName}
                                className="object-cover w-full h-full object-center group-hover/img:scale-105 transition-transform duration-700"
                            />
                            {/* Zoom hint on hover */}
                            <div className="absolute top-3 right-3 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/50 rounded-full p-1.5">
                                <span className="material-symbols-outlined !text-[18px] text-white">zoom_in</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">
                            <span className="material-symbols-outlined !text-6xl">person</span>
                        </div>
                    )}

                    {/* Right-fade gradient for desktop */}
                    <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent to-white dark:to-slate-900 hidden md:block pointer-events-none" />
                    {/* Bottom-fade gradient for mobile */}
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white dark:to-slate-900 md:hidden pointer-events-none" />

                    {/* Name + descriptor overlay */}
                    <div className="absolute bottom-6 left-8 md:bottom-10 md:left-10 z-10 w-[80%] pointer-events-none">
                        <div className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-400 mb-1">Legendary Threat</div>
                        <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-md leading-tight">{shortName}</h2>
                        {descriptor && (
                            <p className="text-white/70 font-medium mt-1 text-sm drop-shadow-sm leading-snug capitalize">{descriptor}</p>
                        )}
                    </div>
                    {/* Dark gradient for text readability */}
                    <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                </div>

                {/* Right Column: Villain Details */}
                <div className="flex-1 p-8 md:p-10 overflow-y-auto custom-scrollbar relative z-10 flex flex-col gap-8">

                    {/* Header: HP/AC + quote */}
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">{shortName}</h3>
                        {descriptor && <p className="text-sm text-slate-500 dark:text-slate-400 capitalize mb-4">{descriptor}</p>}

                        {/* HP / AC */}
                        <div className="flex gap-3 mb-4">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2 text-center border border-slate-100 dark:border-slate-700 shadow-sm">
                                <div className="text-[9px] font-black tracking-widest text-slate-400 mb-0.5">HP</div>
                                <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{villain.hp ?? "?"}</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2 text-center border border-slate-100 dark:border-slate-700 shadow-sm">
                                <div className="text-[9px] font-black tracking-widest text-slate-400 mb-0.5">AC</div>
                                <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{villain.ac ?? "?"}</div>
                            </div>
                        </div>

                        {/* Flavor quote */}
                        {villain.flavor_quote && (
                            <p className="text-slate-500 dark:text-slate-400 italic text-sm leading-relaxed border-l-2 border-violet-400 pl-3">
                                "{villain.flavor_quote.replace(/\*/g, '')}"
                            </p>
                        )}
                    </div>

                    {/* Attacks | Special Abilities */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-violet-500 !text-lg">swords</span>
                                <h3 className="text-xs font-black tracking-widest text-slate-900 dark:text-white uppercase">Attacks</h3>
                            </div>
                            <ul className="space-y-3">
                                {villain.attacks?.length ? villain.attacks.map((atk, idx) => (
                                    <li key={idx} className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-b border-slate-100 dark:border-slate-800/50 pb-3 last:border-0">
                                        <ReactMarkdown components={{ strong: ({ node, ...props }) => <span className="font-bold text-slate-800 dark:text-slate-200" {...props} /> }}>
                                            {atk}
                                        </ReactMarkdown>
                                    </li>
                                )) : <li className="text-sm text-slate-400 italic">No attacks documented.</li>}
                            </ul>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-violet-500 !text-lg">auto_awesome</span>
                                <h3 className="text-xs font-black tracking-widest text-slate-900 dark:text-white uppercase">Special Abilities</h3>
                            </div>
                            <ul className="space-y-3">
                                {villain.special_abilities?.length ? villain.special_abilities.map((ab, idx) => (
                                    <li key={idx} className="flex gap-2 items-start pb-3 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                                        <span className="mt-0.5 flex-shrink-0 material-symbols-outlined !text-[15px] text-violet-400">
                                            {idx % 3 === 0 ? 'shield' : idx % 3 === 1 ? 'magic_button' : 'bolt'}
                                        </span>
                                        <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            <ReactMarkdown components={{ strong: ({ node, ...props }) => <span className="font-bold text-slate-800 dark:text-slate-200" {...props} /> }}>
                                                {ab}
                                            </ReactMarkdown>
                                        </div>
                                    </li>
                                )) : <li className="text-sm text-slate-400 italic">No special abilities documented.</li>}
                            </ul>
                        </div>
                    </div>

                    {/* Appearance */}
                    {villain.physical_description && (
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-violet-500 !text-lg">visibility</span>
                                <h3 className="text-xs font-black tracking-widest text-slate-900 dark:text-white uppercase">Appearance</h3>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed prose prose-sm prose-slate dark:prose-invert max-w-none">
                                <ReactMarkdown>{villain.physical_description}</ReactMarkdown>
                            </div>
                        </div>
                    )}

                    {/* Goal / Core Conflict */}
                    {(villain.goal || villain.core_conflict) && (
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {villain.goal && (
                                <div className="bg-violet-50 dark:bg-violet-950/20 p-4 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                                    <h4 className="text-[10px] font-black tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-2">Antagonist Goal</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{villain.goal}</p>
                                </div>
                            )}
                            {villain.core_conflict && (
                                <div className="bg-violet-50 dark:bg-violet-950/20 p-4 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                                    <h4 className="text-[10px] font-black tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-2">Core Conflict</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{villain.core_conflict}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
