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

    return (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div className="flex flex-col lg:flex-row gap-10">
                {/* Left Column (Image & Stats) */}
                <div className="w-full lg:w-80 flex flex-col gap-5 flex-shrink-0">
                    {villain.image_base64 && villain.image_base64 !== "[GENERATED IMAGE STORED]" && (
                        <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800 relative group">
                            <img
                                src={`data:image/jpeg;base64,${villain.image_base64}`}
                                alt={name}
                                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="text-[10px] font-black tracking-[0.15em] text-slate-400 mb-1">HEALTH POINTS</div>
                            <div className="text-3xl font-black text-slate-900 dark:text-white">
                                {villain.hp || "?"}
                                <span className="text-sm font-bold text-violet-500 ml-1">HP</span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="text-[10px] font-black tracking-[0.15em] text-slate-400 mb-1">ARMOR CLASS</div>
                            <div className="text-3xl font-black text-slate-900 dark:text-white">
                                {villain.ac || "?"}
                                <span className="text-sm font-bold text-violet-500 ml-1">AC</span>
                            </div>
                        </div>
                    </div>

                    {villain.physical_description && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-violet-500 !text-lg">visibility</span>
                                <span className="text-xs font-black tracking-widest text-slate-900 dark:text-white">APPEARANCE</span>
                            </div>
                            <div className="italic text-slate-600 dark:text-slate-400 text-sm leading-relaxed prose prose-sm prose-slate dark:prose-invert">
                                <ReactMarkdown>{villain.physical_description}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-500">LEGENDARY THREAT</span>
                        <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                    </div>

                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">{name}</h2>

                    {villain.flavor_quote && (
                        <div className="text-violet-600 dark:text-violet-400 italic font-bold text-lg md:text-xl leading-relaxed mb-10 max-w-3xl">
                            "{villain.flavor_quote}"
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 flex-1">
                        {/* Attacks Column */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
                                <span className="material-symbols-outlined text-violet-500 !text-xl">swords</span>
                                <h3 className="text-sm font-black tracking-widest text-slate-900 dark:text-white uppercase">ATTACKS</h3>
                            </div>
                            <ul className="space-y-6">
                                {villain.attacks?.length ? villain.attacks.map((atk, idx) => (
                                    <li key={idx} className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-b border-slate-100 dark:border-slate-800/50 pb-5 last:border-0">
                                        <ReactMarkdown
                                            components={{
                                                strong: ({ node, ...props }) => <span className="font-bold text-slate-900 dark:text-white block mb-1 text-base" {...props} />
                                            }}
                                        >
                                            {atk}
                                        </ReactMarkdown>
                                    </li>
                                )) : <li className="text-sm text-slate-400 italic">No attacks documented.</li>}
                            </ul>
                        </div>

                        {/* Special Abilities Column */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
                                <span className="material-symbols-outlined text-violet-500 !text-xl">auto_awesome</span>
                                <h3 className="text-sm font-black tracking-widest text-slate-900 dark:text-white uppercase">SPECIAL ABILITIES</h3>
                            </div>
                            <ul className="space-y-4">
                                {villain.special_abilities?.length ? villain.special_abilities.map((ab, idx) => (
                                    <li key={idx} className="bg-white dark:bg-slate-800/50 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex gap-4 items-start">
                                        <div className="mt-1 flex-shrink-0 text-violet-500">
                                            {/* Alternating icons for variety, defaulting to shield/spark */}
                                            <span className="material-symbols-outlined !text-xl">
                                                {idx % 3 === 0 ? 'shield' : idx % 3 === 1 ? 'magic_button' : 'bolt'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    strong: ({ node, ...props }) => <span className="font-bold text-slate-900 dark:text-white block mb-1 text-[15px]" {...props} />
                                                }}
                                            >
                                                {ab}
                                            </ReactMarkdown>
                                        </div>
                                    </li>
                                )) : <li className="text-sm text-slate-400 italic">No special abilities documented.</li>}
                            </ul>
                        </div>
                    </div>

                    {/* Bottom Goals Row */}
                    {(villain.goal || villain.core_conflict) && (
                        <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-8">
                            {villain.goal && (
                                <div className="flex-1 bg-violet-50/50 dark:bg-violet-950/20 p-5 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                                    <h4 className="text-[10px] font-black tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-2">ANTAGONIST GOAL</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{villain.goal}</p>
                                </div>
                            )}
                            {villain.core_conflict && (
                                <div className="flex-1 bg-violet-50/50 dark:bg-violet-950/20 p-5 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                                    <h4 className="text-[10px] font-black tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-2">CORE CONFLICT</h4>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{villain.core_conflict}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
