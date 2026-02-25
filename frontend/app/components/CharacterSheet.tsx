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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl transition-colors duration-300 relative overflow-hidden group flex flex-col md:flex-row w-full max-w-6xl mx-auto h-auto md:h-[600px]">

            {/* Left Column: Full height Image Sidebar */}
            <div className="relative w-full md:w-[45%] h-80 md:h-full flex-shrink-0 bg-slate-900 overflow-hidden">
                {char.image_base64 && char.image_base64 !== "[GENERATED IMAGE STORED]" ? (
                    <img
                        src={`data:image/jpeg;base64,${char.image_base64}`}
                        alt={char.name}
                        className="object-cover w-full h-full object-center"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">
                        <span className="material-symbols-outlined !text-6xl">person</span>
                    </div>
                )}

                {/* Horizontal Gradient for Desktop (fade into right content) */}
                <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent to-white dark:to-slate-900 hidden md:block" />
                {/* Vertical Gradient for Mobile (fade into bottom content) */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white dark:to-slate-900 md:hidden" />

                {/* Bottom Text Overlay */}
                <div className="absolute bottom-6 left-8 md:bottom-10 md:left-10 z-10 w-[80%]">
                    <h2 className="text-4xl md:text-5xl font-black text-white drop-shadow-md leading-tight">{char.name}</h2>
                    <p className="text-white/80 font-medium mt-1 truncate drop-shadow-sm">{char.flavor_quote || "The Whispering Shadow of the Vale"}</p>
                </div>
                {/* Extra dark gradient just for text readability at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
            </div>

            {/* Right Column: Character Details Container */}
            <div className="flex-1 p-8 md:p-10 overflow-y-auto custom-scrollbar relative z-10">

                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Character Overview</h3>

                {/* Info Card Header */}
                <div className="mb-8">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{char.name}</h2>
                    <p className="text-violet-600 dark:text-violet-400 font-bold mt-1">Level {level} {race} {charClass} • {char.alignment || "Neutral Good"}</p>

                    <div className="flex flex-wrap gap-3 mt-4">
                        {renderStatPill("favorite", "HP", char.hp || 10, "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/50")}
                        {renderStatPill("shield", "AC", char.ac || 10, "bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-900/50")}
                        {renderStatPill("speed", "SPD", speed, "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50")}
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
                                <div className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">{stat}</div>
                                <div className="text-3xl font-black text-slate-900 dark:text-white leading-none">{score}</div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">{getMod(score)}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Weapons & Active Spells */}
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-4">WEAPONS & ACTIVE SPELLS</h4>

                    <div className="space-y-3">
                        {char.weapons && char.weapons.length > 0 ? (
                            char.weapons.map((w, i) => (
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

                        {/* Example spell/utility row as seen in mockup */}
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-3.5 border border-slate-100 dark:border-slate-700/50">
                            <div className="flex items-center gap-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined !text-lg text-slate-300 dark:text-slate-500">auto_fix_normal</span>
                                Mage Armor (Scroll)
                            </div>
                            <div className="text-[11px] font-black text-violet-600 dark:text-violet-400">
                                Active (8h)
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
