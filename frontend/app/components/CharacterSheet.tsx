import { useEffect, useState } from 'react';
import ReactMarkdown from "react-markdown";

interface CharacterProps {
    char: {
        name: string;
        race?: string;
        class_name?: string;
        class?: string;
        level?: number;
        alignment?: string;
        hp?: number;
        ac?: number;
        flavor_quote?: string;
        physical_description?: string;
        backstory_hook?: string;
        personality_traits?: string | string[];
        ideals?: string;
        bonds?: string;
        flaws?: string;
        ability_scores?: Record<string, number>;
        skills?: string | string[];
        weapons?: any[];
        spells?: any[];
        inventory?: string | string[];
        image_base64?: string | null;
        speed?: string;
        initiative?: string;
    };
}

export default function CharacterSheet({ char }: CharacterProps) {
    if (!char) return null;

    const charClass = char.class_name || char.class || "Adventurer";
    const race = char.race || "Unknown";
    const level = char.level || 1;

    const [lightboxOpen, setLightboxOpen] = useState(false);
    const hasImage = char.image_base64 && char.image_base64 !== "[GENERATED IMAGE STORED]";

    // Close lightbox on Escape key + lock body scroll
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (lightboxOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [lightboxOpen]);

    // Calculate simple defaults if missing to match mockup aesthetics
    const getMod = (score: number) => {
        const mod = Math.floor((score - 10) / 2);
        return mod >= 0 ? `+${mod}` : `${mod}`;
    };
    const dexMod = getMod(char.ability_scores?.DEX || 10);
    const speed = char.speed || "30ft";
    const init = char.initiative || dexMod;

    // Helper to render stat pills (HP, AC, Speed)
    const renderStatPill = (icon: string, label: string, value: string | number, colorClass: string) => (
        <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 border font-bold text-sm shadow-sm ${colorClass}`}>
            <span className="material-symbols-outlined !text-base">{icon}</span>
            <span className="opacity-90">{label}:</span>
            <span>{value}</span>
        </div>
    );

    return (
        <>
            {/* ── LIGHTBOX MODAL ──────────────────────────────────────── */}
            {lightboxOpen && hasImage && (
                <div
                    className="fixed left-0 top-0 w-screen z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
                    style={{ height: '100dvh' }}
                    onClick={() => setLightboxOpen(false)}
                >
                    {/* Close hint */}
                    <div className="absolute top-4 right-4 text-white/60 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined !text-lg">close</span>
                        <span>Click anywhere or press Esc to close</span>
                    </div>
                    {/* Portrait at full size */}
                    <img
                        src={`data:image/jpeg;base64,${char.image_base64}`}
                        alt={char.name}
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* ── CARD ────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl transition-colors duration-300 relative overflow-hidden group flex flex-col md:flex-row w-full max-w-6xl mx-auto">

                {/* Left Column: Full height Image Sidebar */}
                <div className="relative w-full md:w-[40%] h-80 md:h-auto md:min-h-[500px] flex-shrink-0 bg-slate-900 overflow-hidden">
                    {hasImage ? (
                        <div
                            className="relative w-full h-full cursor-zoom-in group/img"
                            onClick={() => setLightboxOpen(true)}
                        >
                            <img
                                src={`data:image/jpeg;base64,${char.image_base64}`}
                                alt={char.name}
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

                    {/* Horizontal Gradient for Desktop (fade into right content) */}
                    <div className="absolute inset-y-0 right-0 w-0 bg-gradient-to-r from-transparent to-white dark:to-slate-900 hidden md:block pointer-events-none" />
                    {/* Vertical Gradient for Mobile (fade into bottom content) */}
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white dark:to-slate-900 md:hidden pointer-events-none" />

                    {/* Bottom Text Overlay */}
                    <div className="absolute bottom-6 left-8 md:bottom-10 md:left-10 z-10 w-[80%] pointer-events-none">
                        <h2 className="text-4xl md:text-5xl font-black text-white drop-shadow-md leading-tight">{char.name}</h2>
                        <p className="text-white/80 font-medium mt-1 drop-shadow-sm leading-snug italic">"{char.flavor_quote || "The Whispering Shadow of the Vale"}"</p>
                    </div>
                    {/* Extra dark gradient for text readability */}
                    <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                </div>

                {/* Right Column: Character Details Container */}
                <div className="flex-1 p-8 md:p-10 overflow-y-auto custom-scrollbar relative z-10">

                    {/* <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Character Overview</h3> */}

                    {/* Info Card Header */}
                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{char.name}</h2>
                        <p className="text-violet-600 dark:text-violet-400 font-bold mt-1">Level {level} {race} {charClass} • {char.alignment || "Neutral Good"}</p>

                        <div className="flex flex-wrap gap-3 mt-4">
                            {renderStatPill("favorite", "HP", char.hp || 10, "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/50")}
                            {renderStatPill("shield", "AC", char.ac || 10, "bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-900/50")}
                        </div>
                    </div>

                    {/* Narrative Hooks (2 columns) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-2">CHARACTER HOOK</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                {char.backstory_hook || "Searching for his brother's lost journal in the ruins of the Old Citadel."}
                            </p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-2">PERSONAL GOAL</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                {char.ideals || "To clear the family name from the archives of the Merchant's Guild."}
                            </p>
                        </div>
                    </div>

                    {/* Ability Scores Grid (3 columns) */}
                    {char.ability_scores && Object.keys(char.ability_scores).length > 0 && (
                        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-10">
                            {Object.entries(char.ability_scores).map(([stat, score]) => (
                                <div key={stat} className="bg-violet-50/50 dark:bg-violet-900/5 border border-violet-100 dark:border-violet-900/20 rounded-2xl p-4 text-center">
                                    <div className="text-[14px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">{stat}</div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{score}</div>
                                    <div className="text-s font-bold text-slate-400 dark:text-slate-500 mt-1">{getMod(score as number)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Weapons & Active Spells */}
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-4">WEAPONS & ACTIVE SPELLS</h4>

                        <div className="space-y-3">
                            {char.weapons && char.weapons.length > 0 ? (
                                char.weapons.map((w: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-3.5 border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex items-center gap-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                                            <span className="material-symbols-outlined !text-lg text-slate-300 dark:text-slate-500">swords</span>
                                            {w.name || w}
                                        </div>
                                        <div className="text-[11px] font-black text-violet-600 dark:text-violet-400">
                                            {w.damage || "1d8 + 4 Piercing"}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-3.5 border border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center gap-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                                        <span className="material-symbols-outlined !text-lg text-slate-300 dark:text-slate-500">swords</span>
                                        Fine Steel Rapier
                                    </div>
                                    <div className="text-[11px] font-black text-violet-600 dark:text-violet-400">
                                        1d8 + 4 Piercing
                                    </div>
                                </div>
                            )}

                            {/* Spell/utility row */}
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-3.5 border border-slate-100 dark:border-slate-700/50">
                                <div className="flex items-center gap-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                                    <span className="material-symbols-outlined !text-lg text-slate-300 dark:text-slate-500">auto_fix_normal</span>
                                    Mage Armor (Scroll)
                                </div>
                                <div className="text-[11px] font-black text-violet-600 dark:text-violet-400">
                                    Active (8h)
                                </div>
                            </div>

                            {/* Appearance */}
                            {char.physical_description && (
                                <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-violet-500 !text-lg">visibility</span>
                                        <h3 className="text-xs font-black tracking-widest text-slate-900 dark:text-white uppercase">Appearance</h3>
                                    </div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed prose prose-sm prose-slate dark:prose-invert max-w-none">
                                        <ReactMarkdown>{char.physical_description}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
