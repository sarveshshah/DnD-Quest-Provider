import { useState } from 'react';

interface HitlControlsProps {
    hitlData: any;
    onResume: (action: string) => void;
}

export default function HitlControls({ hitlData, onResume }: HitlControlsProps) {
    const [customInput, setCustomInput] = useState('');

    if (!hitlData) return null;

    return (
        <div className="bg-amber-50 dark:bg-zinc-800/80 border border-amber-300 dark:border-amber-600/50 rounded-xl p-6 shadow-lg dark:shadow-2xl mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 mb-6 border-b border-amber-200 dark:border-zinc-700 pb-4">
                <span className="text-3xl">🛑</span>
                <div>
                    <h3 className="text-xl font-bold text-amber-700 dark:text-amber-400">Your DM Requests Approval!</h3>
                    <p className="text-slate-600 dark:text-zinc-400 text-sm">The campaign skeleton is ready. Do you want to proceed, or steer the story in a different direction before we roll characters and write lore?</p>
                </div>
            </div>

            <div className="flex flex-col gap-3 mb-6">
                <button
                    onClick={() => onResume("approve")}
                    className="bg-rose-600 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    ✅ Looks great, continue!
                </button>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <button
                        onClick={() => onResume(hitlData.action_1_payload)}
                        className="bg-white dark:bg-zinc-700 hover:bg-amber-50 dark:hover:bg-zinc-600 text-slate-800 dark:text-amber-100 py-3 px-4 rounded-lg text-sm transition-colors border border-slate-200 dark:border-zinc-600 hover:border-amber-400 dark:hover:border-amber-500/50 flex flex-col items-center text-center gap-1 shadow-sm"
                    >
                        <span className="font-bold">{hitlData.action_1_label}</span>
                    </button>

                    <button
                        onClick={() => onResume(hitlData.action_2_payload)}
                        className="bg-white dark:bg-zinc-700 hover:bg-amber-50 dark:hover:bg-zinc-600 text-slate-800 dark:text-amber-100 py-3 px-4 rounded-lg text-sm transition-colors border border-slate-200 dark:border-zinc-600 hover:border-amber-400 dark:hover:border-amber-500/50 flex flex-col items-center text-center gap-1 shadow-sm"
                    >
                        <span className="font-bold">{hitlData.action_2_label}</span>
                    </button>

                    <button
                        onClick={() => onResume(hitlData.action_3_payload)}
                        className="bg-white dark:bg-zinc-700 hover:bg-amber-50 dark:hover:bg-zinc-600 text-slate-800 dark:text-amber-100 py-3 px-4 rounded-lg text-sm transition-colors border border-slate-200 dark:border-zinc-600 hover:border-amber-400 dark:hover:border-amber-500/50 flex flex-col items-center text-center gap-1 shadow-sm"
                    >
                        <span className="font-bold">{hitlData.action_3_label}</span>
                    </button>
                </div>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Or type a custom change (e.g., 'Make the villain a vampire instead')"
                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && customInput.trim()) {
                            onResume(customInput);
                        }
                    }}
                />
                <button
                    onClick={() => { if (customInput.trim()) onResume(customInput) }}
                    className="bg-slate-100 dark:bg-zinc-700 hover:bg-amber-500 dark:hover:bg-amber-600 text-slate-700 dark:text-white px-6 py-2 rounded-lg transition-colors font-bold border border-slate-200 dark:border-transparent"
                >
                    ✏️ Edit
                </button>
            </div>
        </div>
    );
}
