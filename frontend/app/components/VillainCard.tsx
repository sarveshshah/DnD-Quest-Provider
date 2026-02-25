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

    // Split "Alistair Finch, a charismatic merchant..." into name + descriptor
    const commaIdx = name.indexOf(',');
    const shortName = commaIdx > 0 ? name.slice(0, commaIdx).trim() : name;
    const descriptor = commaIdx > 0 ? name.slice(commaIdx + 1).trim() : '';

    return (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">

            {/* ── HEADER: Image (tall) + Name block ───────────────────── */}
            <div className="flex flex-col sm:flex-row gap-0">
                {hasImage && (
                    <div className="w-full sm:w-64 md:w-72 flex-shrink-0 self-stretch">
                        <img
                            src={`data:image/jpeg;base64,${villain.image_base64}`}
                            alt={shortName}
                            className="w-full h-full object-cover object-top"
                            style={{ minHeight: '320px', maxHeight: '420px' }}
                        />
                    </div>
                )}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-between min-w-0">
                    {/* Label */}
                    <div className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-500 mb-3">
                        Legendary Threat
                    </div>

                    {/* Short name — large and bold */}
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight break-words leading-tight mb-2">
                        {shortName}
                    </h2>

                    {/* Descriptor — normal weight, muted */}
                    {descriptor && (
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 capitalize">
                            {descriptor}
                        </p>
                    )}

                    {/* Flavor quote — italic pull-quote */}
                    {villain.flavor_quote && (
                        <p className="text-slate-500 dark:text-slate-400 italic text-sm leading-relaxed mb-5 border-l-2 border-violet-400 pl-3">
                            "{villain.flavor_quote.replace(/\*/g, '')}"
                        </p>
                    )}

                    {/* HP / AC chips */}
                    <div className="flex gap-3 mt-auto">
                        <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-2 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="text-[9px] font-black tracking-widest text-slate-400 mb-0.5">HP</div>
                            <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{villain.hp ?? "?"}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-2 text-center shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="text-[9px] font-black tracking-widest text-slate-400 mb-0.5">AC</div>
                            <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{villain.ac ?? "?"}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── BODY ─────────────────────────────────────────────────── */}
            <div className="p-6 md:p-8 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-8">

                {/* Row 1: Attacks | Special Abilities */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Attacks */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
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

                    {/* Special Abilities */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
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

                {/* Row 2: Appearance — full width */}
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

                {/* Row 3: Goal / Core Conflict */}
                {(villain.goal || villain.core_conflict) && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
    );
}
