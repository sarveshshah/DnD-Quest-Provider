import { useEffect, useState } from 'react';

interface Thread {
    id: string;
    name: string;
    createdAt: string;
}

interface SidebarProps {
    onSelectThread: (threadId: string) => void;
    currentThreadId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ onSelectThread, currentThreadId, isOpen, onClose }: SidebarProps) {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchThreads = async () => {
            try {
                const res = await fetch('http://localhost:8001/threads');
                const data = await res.json();
                setThreads(data);
            } catch (err) {
                console.error("Failed to load threads", err);
            } finally {
                setLoading(false);
            }
        };
        fetchThreads();
    }, [currentThreadId]);

    return (
        <>
            {/* Mobile Backdrop Overlay - closes sidebar when clicking outside */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 z-40 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Panel */}
            <div className={`fixed inset-y-0 left-0 z-50 w-72 h-full bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col pt-6 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>

                <div className="px-5 mb-8 flex justify-between items-center">
                    <button
                        onClick={() => {
                            onSelectThread("");
                            onClose();
                        }}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-rose-500/20 flex items-center justify-center gap-2"
                    >
                        New Campaign
                    </button>
                    {/* Close button for mobile inside the sidebar */}
                    <button onClick={onClose} className="ml-3 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined !text-xl">close</span>
                    </button>
                </div>

                <div className="px-6 text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">
                    Recent Campaigns
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-1 pb-6 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <span className="material-symbols-outlined animate-spin-slow text-rose-500">hourglass_top</span>
                        </div>
                    ) : threads.length === 0 ? (
                        <p className="text-slate-500 dark:text-zinc-500 text-sm px-2 italic text-center py-4 bg-slate-50 dark:bg-zinc-800/30 rounded-lg border border-dashed border-slate-200 dark:border-zinc-700">No history yet.</p>
                    ) : (
                        threads.map(thread => (
                            <button
                                key={thread.id}
                                onClick={() => {
                                    onSelectThread(thread.id);
                                    onClose();
                                }}
                                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all group ${currentThreadId === thread.id
                                    ? 'bg-rose-50 dark:bg-zinc-800/80 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 shadow-sm'
                                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-zinc-700'
                                    }`}
                            >
                                <div className="font-bold truncate group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                                    {thread.name || "Unnamed Campaign"}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 flex items-center gap-1.5 opacity-80">
                                    <span className="material-symbols-outlined !text-[12px]">schedule</span>
                                    {(() => {
                                        const raw = thread.createdAt?.endsWith('Z') ? thread.createdAt : thread.createdAt + 'Z';
                                        const d = new Date(raw);
                                        const now = new Date();
                                        const local = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
                                        const diffDays = Math.round((local(now).getTime() - local(d).getTime()) / 86400000);
                                        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                                        if (diffDays === 0) return `Today, ${time}`;
                                        if (diffDays === 1) return 'Yesterday';
                                        if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
                                        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                    })()}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
