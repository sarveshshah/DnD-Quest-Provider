import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface CampaignLoreProps {
    narrative: any;
    campaignPlan: any;
    terrain?: string;
    difficulty?: string;
}

export default function CampaignLore({ narrative, campaignPlan, terrain = "Forest", difficulty = "Medium" }: CampaignLoreProps) {
    if (!narrative && !campaignPlan) return null;

    const [macguffinLightbox, setMacguffinLightbox] = useState(false);

    return (
        <div className="w-full flex justify-center py-8">
            {/* Macguffin lightbox */}
            {macguffinLightbox && campaignPlan?.macguffin_image_base64 && campaignPlan.macguffin_image_base64 !== '[GENERATED IMAGE STORED]' && (
                <div
                    className="fixed left-0 top-0 w-screen z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
                    style={{ height: '100dvh' }}
                    onClick={() => { setMacguffinLightbox(false); document.body.style.overflow = ''; }}
                >
                    <img
                        src={`data:image/jpeg;base64,${campaignPlan.macguffin_image_base64}`}
                        alt="The Treasure"
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
            {/* Force light mode styles by avoiding dark: classes entirely */}
            <div className="w-full bg-white text-slate-900 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] border border-slate-200 rounded-2xl overflow-hidden">

                {/* Header Section with Dynamic Image Background */}
                <div
                    className="relative overflow-hidden flex flex-col justify-end p-8 md:p-12"
                    style={{ minHeight: campaignPlan?.cover_image_base64 ? '450px' : 'auto' }}
                >
                    {/* Base64 Background Image */}
                    {campaignPlan?.cover_image_base64 && (
                        <>
                            <div
                                className="absolute inset-0 z-0 bg-cover bg-center"
                                style={{ backgroundImage: `url(data:image/jpeg;base64,${campaignPlan.cover_image_base64})` }}
                            />
                            {/* Darker gradient for text readability */}
                            <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#0f0914]/90 via-[#0f0914]/40 to-transparent" />
                        </>
                    )}

                    <div className="relative z-10 w-full">
                        <h1
                            className={`font-serif text-5xl md:text-7xl font-extrabold leading-tight mb-8 tracking-tight ${campaignPlan?.cover_image_base64 ? 'text-white drop-shadow-md' : 'text-slate-900'}`}
                        >
                            {narrative?.title || "Drafting Campaign..."}
                        </h1>

                        <div className="flex flex-wrap items-center gap-4 mb-8">
                            <div className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold font-sans ${campaignPlan?.cover_image_base64 ? 'bg-[#4c1d95]/90 text-white backdrop-blur-md border border-[#7c3aed]/30 shadow-lg' : 'bg-slate-100 text-slate-700'}`}>
                                <span className="material-symbols-outlined !text-lg">landscape</span>
                                {terrain}
                            </div>
                            <div className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold font-sans ${campaignPlan?.cover_image_base64 ? 'bg-[#4c1d95]/90 text-white backdrop-blur-md border border-[#7c3aed]/30 shadow-lg' : 'bg-slate-100 text-slate-700'}`}>
                                {difficulty === 'Hard' || difficulty === 'Deadly' ? (
                                    <span className="material-symbols-outlined !text-lg text-red-400">skull</span>
                                ) : (
                                    <span className="material-symbols-outlined !text-lg">signal_cellular_alt</span>
                                )}
                                {difficulty}
                            </div>
                        </div>

                        {narrative?.description && (
                            <div
                                className={`relative pl-6 border-l-4 text-xl italic ${campaignPlan?.cover_image_base64 ? 'border-white/40 text-white/90 font-medium' : 'border-[#7311d4]/30 text-slate-600'}`}
                            >
                                "{narrative.description}"
                            </div>
                        )}

                        {/* If no narrative description yet but there's a thought process, show it */}
                        {!narrative?.description && campaignPlan?.thought_process && (
                            <div
                                className={`relative pl-6 border-l-4 text-lg italic ${campaignPlan?.cover_image_base64 ? 'border-white/40 text-white/80' : 'border-[#7311d4]/30 text-slate-500'}`}
                            >
                                "The DM's quill dances across the parchment: {campaignPlan.thought_process}"
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Section */}
                <div className="p-8 md:p-12 space-y-16">

                    {/* Two-column body: Background | Conflict + Plot */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

                        {/* Left: Background Lore */}
                        {narrative?.background && (
                            <section>
                                <div className="flex items-center gap-4 mb-6">
                                    <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">01. Background Lore</span>
                                    <div className="h-px flex-1 bg-slate-200"></div>
                                </div>
                                <div className="prose prose-slate max-w-none text-base leading-relaxed text-slate-800">
                                    <ReactMarkdown>{narrative.background}</ReactMarkdown>
                                </div>
                            </section>
                        )}

                        {/* Right: Core Conflict + Plot Outline */}
                        <div className="space-y-10">
                            {campaignPlan?.core_conflict && (
                                <section>
                                    <div className="flex items-center gap-4 mb-6">
                                        <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">{narrative ? "02." : "01."} Core Conflict</span>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                    </div>
                                    <p className="text-lg leading-relaxed text-slate-800 font-medium">{campaignPlan.core_conflict}</p>
                                </section>
                            )}

                            {campaignPlan?.plot_points && campaignPlan.plot_points.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-4 mb-6">
                                        <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">{narrative ? "03." : "02."} Plot Outline</span>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                    </div>
                                    <ol className="space-y-5">
                                        {campaignPlan.plot_points.map((point: string, idx: number) => (
                                            <li key={idx} className="flex gap-4 group">
                                                <span className="flex-none text-2xl font-black text-[#7311d4]/20 group-hover:text-[#7311d4] transition-colors">
                                                    {String(idx + 1).padStart(2, '0')}
                                                </span>
                                                <p className="text-slate-700 text-base leading-relaxed pt-1">{point}</p>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            )}
                        </div>
                    </div>

                    {/* Full-width: Factions + Locations */}
                    {(campaignPlan?.factions_involved || campaignPlan?.key_locations) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4 border-t border-slate-100">
                            {campaignPlan?.factions_involved && (
                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">Factions Involved</span>
                                    </div>
                                    <ul className="space-y-5">
                                        {campaignPlan.factions_involved.map((faction: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-3">
                                                <span className="material-symbols-outlined text-[#7311d4] mt-0.5 !text-xl">shield</span>
                                                <div>
                                                    <span className="block font-extrabold text-slate-900">{faction.split(":")[0] || faction}</span>
                                                    <span className="text-sm text-slate-500 mt-0.5 block leading-relaxed">{faction.split(":").slice(1).join(":") || "A powerful local organization."}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                            {campaignPlan?.key_locations && (
                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">Key Locations</span>
                                    </div>
                                    <ul className="space-y-5">
                                        {campaignPlan.key_locations.map((loc: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-3">
                                                <span className="material-symbols-outlined text-[#7311d4] mt-0.5 !text-xl">location_on</span>
                                                <div>
                                                    <span className="block font-extrabold text-slate-900">{loc.split(":")[0] || loc}</span>
                                                    <span className="text-sm text-slate-500 mt-0.5 block leading-relaxed">{loc.split(":").slice(1).join(":") || "A critical location in the upcoming quest."}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </div>
                    )}

                    {/* Rewards + Macguffin Image */}
                    {(narrative?.rewards || (campaignPlan?.macguffin_image_base64 && campaignPlan.macguffin_image_base64 !== '[GENERATED IMAGE STORED]')) && (
                        <section className="bg-slate-50 p-8 rounded-2xl border border-slate-200">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="material-symbols-outlined text-[#7311d4] text-2xl">redeem</span>
                                <h3 className="font-extrabold text-slate-900 text-lg">Rewards & Hooks</h3>
                            </div>
                            <div className="flex flex-col lg:flex-row gap-8 items-start">
                                {narrative?.rewards && (
                                    <div className="flex-1 text-slate-700 text-base prose prose-slate max-w-none">
                                        <ReactMarkdown>{narrative.rewards}</ReactMarkdown>
                                    </div>
                                )}
                                {campaignPlan?.macguffin_image_base64 && campaignPlan.macguffin_image_base64 !== '[GENERATED IMAGE STORED]' && (
                                    <div
                                        className="flex-shrink-0 lg:w-72 cursor-zoom-in group/mac"
                                        onClick={() => { setMacguffinLightbox(true); document.body.style.overflow = 'hidden'; }}
                                    >
                                        <div className="relative">
                                            <img
                                                src={`data:image/jpeg;base64,${campaignPlan.macguffin_image_base64}`}
                                                alt="The Treasure"
                                                className="w-full rounded-xl shadow-md object-cover group-hover/mac:scale-[1.02] transition-transform duration-500"
                                                style={{ maxHeight: '260px' }}
                                            />
                                            <div className="absolute top-2 right-2 opacity-0 group-hover/mac:opacity-100 transition-opacity bg-black/50 rounded-full p-1">
                                                <span className="material-symbols-outlined !text-[16px] text-white">zoom_in</span>
                                            </div>
                                        </div>
                                        {campaignPlan?.loot_concept && (
                                            <p className="text-xs text-slate-400 text-center mt-2 italic">{campaignPlan.loot_concept}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                </div>

                {/* Footer */}
                <div className="px-12 py-8 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    <span>Created: {new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                    <span>Lore Block v3.1</span>
                    <span>Ref: WW-{Math.random().toString(36).substring(2, 6).toUpperCase()}-ALPHA</span>
                </div>
            </div>
        </div>
    );
}
