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
    const [coverLightbox, setCoverLightbox] = useState(false);

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

            {/* Cover lightbox */}
            {coverLightbox && campaignPlan?.cover_image_base64 && (
                <div
                    className="fixed left-0 top-0 w-screen z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
                    style={{ height: '100dvh' }}
                    onClick={() => { setCoverLightbox(false); document.body.style.overflow = ''; }}
                >
                    <img
                        src={`data:image/jpeg;base64,${campaignPlan.cover_image_base64}`}
                        alt="Campaign Cover"
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Card */}
            <div className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.6)] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-colors duration-300">

                {/* Cover image — separate clickable block, title goes below */}
                {campaignPlan?.cover_image_base64 && (
                    <div
                        className="relative w-full overflow-hidden cursor-zoom-in group/cover"
                        style={{ maxHeight: '460px' }}
                        onClick={() => { setCoverLightbox(true); document.body.style.overflow = 'hidden'; }}
                    >
                        <img
                            src={`data:image/jpeg;base64,${campaignPlan.cover_image_base64}`}
                            alt="Campaign Cover"
                            className="w-full object-cover object-center group-hover/cover:scale-105 transition-transform duration-700"
                            style={{ maxHeight: '460px' }}
                        />
                        <div className="absolute top-3 right-3 opacity-0 group-hover/cover:opacity-100 transition-opacity bg-black/50 rounded-full p-1.5 z-10">
                            <span className="material-symbols-outlined !text-[18px] text-white">zoom_in</span>
                        </div>
                    </div>
                )}

                {/* Title / badges / description — always below the image */}
                <div className="p-8 md:p-12">
                    <h1 className="font-serif text-5xl md:text-7xl font-extrabold leading-tight mb-8 tracking-tight text-slate-900 dark:text-white">
                        {narrative?.title || "Drafting Campaign..."}
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 mb-8">
                        <div className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold font-sans bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <span className="material-symbols-outlined !text-lg">landscape</span>
                            {terrain}
                        </div>
                        <div className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold font-sans bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {difficulty === 'Hard' || difficulty === 'Deadly' ? (
                                <span className="material-symbols-outlined !text-lg text-red-400">skull</span>
                            ) : (
                                <span className="material-symbols-outlined !text-lg">signal_cellular_alt</span>
                            )}
                            {difficulty}
                        </div>
                    </div>

                    {narrative?.description && (
                        <div className="relative pl-6 border-l-4 border-[#7311d4]/30 text-xl italic text-slate-600 dark:text-slate-400">
                            "{narrative.description}"
                        </div>
                    )}

                    {/* If no narrative description yet but there's a thought process, show it */}
                    {!narrative?.description && campaignPlan?.thought_process && (
                        <div className="relative pl-6 border-l-4 border-[#7311d4]/30 text-lg italic text-slate-500 dark:text-slate-400">
                            "The DM's quill dances across the parchment: {campaignPlan.thought_process}"
                        </div>
                    )}
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
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
                                </div>
                                <div className="prose prose-slate dark:prose-invert max-w-none text-base leading-relaxed text-slate-800 dark:text-slate-300">
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
                                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
                                    </div>
                                    <p className="text-lg leading-relaxed text-slate-800 dark:text-slate-200 font-medium">{campaignPlan.core_conflict}</p>
                                </section>
                            )}

                            {campaignPlan?.plot_points && campaignPlan.plot_points.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-4 mb-6">
                                        <span className="text-[#7311d4] font-bold text-sm uppercase tracking-[0.25em]">{narrative ? "03." : "02."} Plot Outline</span>
                                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
                                    </div>
                                    <ol className="space-y-5">
                                        {campaignPlan.plot_points.map((point: string, idx: number) => (
                                            <li key={idx} className="flex gap-4 group">
                                                <span className="flex-none text-2xl font-black text-[#7311d4]/20 group-hover:text-[#7311d4] transition-colors">
                                                    {String(idx + 1).padStart(2, '0')}
                                                </span>
                                                <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed pt-1">{point}</p>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            )}
                        </div>
                    </div>

                    {/* Full-width: Factions + Locations */}
                    {(campaignPlan?.factions_involved || campaignPlan?.key_locations) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4 border-t border-slate-100 dark:border-slate-800">
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
                                                    <span className="block font-extrabold text-slate-900 dark:text-slate-100">{faction.split(":")[0] || faction}</span>
                                                    <span className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">{faction.split(":").slice(1).join(":") || "A powerful local organization."}</span>
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
                                                    <span className="block font-extrabold text-slate-900 dark:text-slate-100">{loc.split(":")[0] || loc}</span>
                                                    <span className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">{loc.split(":").slice(1).join(":") || "A critical location in the upcoming quest."}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </div>
                    )}

                    {/* Rewards + Macguffin — Card layout matching party card */}
                    {(narrative?.rewards || (campaignPlan?.macguffin_image_base64 && campaignPlan.macguffin_image_base64 !== '[GENERATED IMAGE STORED]')) && (
                        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">

                            {/* Left: Rewards text */}
                            <div className="flex-1 p-8 md:p-10 flex flex-col justify-center gap-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-[#7311d4] text-xl">redeem</span>
                                    <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">Rewards & Hooks</h3>
                                </div>
                                {narrative?.rewards && (
                                    <div className="text-slate-700 dark:text-slate-300 text-base prose prose-slate dark:prose-invert max-w-none">
                                        <ReactMarkdown>{narrative.rewards}</ReactMarkdown>
                                    </div>
                                )}
                            </div>

                            {/* Right: Tall treasure image panel */}
                            {campaignPlan?.macguffin_image_base64 && campaignPlan.macguffin_image_base64 !== '[GENERATED IMAGE STORED]' && (
                                <div
                                    className="relative w-full md:w-[45%] flex-shrink-0 bg-slate-900 overflow-hidden cursor-zoom-in group/mac"
                                    style={{ minHeight: '360px' }}
                                    onClick={() => { setMacguffinLightbox(true); document.body.style.overflow = 'hidden'; }}
                                >
                                    <img
                                        src={`data:image/jpeg;base64,${campaignPlan.macguffin_image_base64}`}
                                        alt="The Treasure"
                                        className="absolute inset-0 w-full h-full object-cover object-center group-hover/mac:scale-105 transition-transform duration-700"
                                    />
                                    {/* Left-fade removed — replaced with stronger bottom gradient */}
                                    {/* Bottom gradient for text */}
                                    <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />
                                    <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-10 pointer-events-none w-[85%]">
                                        <p className="text-[9px] uppercase tracking-[0.2em] font-black text-violet-300 mb-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,1)' }}>The Loot</p>
                                        <p className="text-sm md:text-base font-bold text-white leading-snug" style={{ textShadow: '0 2px 8px rgba(0,0,0,1)' }}>
                                            {campaignPlan.loot_concept || "Legendary Treasure"}
                                        </p>
                                    </div>
                                    {/* Zoom hint */}
                                    <div className="absolute top-3 right-3 opacity-0 group-hover/mac:opacity-100 transition-opacity bg-black/50 rounded-full p-1.5 z-10">
                                        <span className="material-symbols-outlined !text-[18px] text-white">zoom_in</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-12 py-8 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    <span>Created: {new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                    <span>Lore Block v3.1</span>
                    <span>Ref: WW-{Math.random().toString(36).substring(2, 6).toUpperCase()}-ALPHA</span>
                </div>
            </div>
        </div>
    );
}
