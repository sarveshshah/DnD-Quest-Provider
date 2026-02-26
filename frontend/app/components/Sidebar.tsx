'use client';
import { useEffect, useState } from 'react';

interface Thread {
    id: string;
    name: string;
    createdAt: string;
    isArchived: boolean;
}

interface SidebarProps {
    onSelectThread: (threadId: string) => void;
    currentThreadId: string | null;
    pendingThread?: { id?: string; name: string; createdAt: string } | null;
    isOpen: boolean;
    onClose: () => void;
}

function formatDate(isoString: string): string {
    const raw = isoString?.endsWith('Z') ? isoString : isoString + 'Z';
    const d = new Date(raw);
    const now = new Date();
    const local = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const diffDays = Math.round((local(now).getTime() - local(d).getTime()) / 86400000);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

export default function Sidebar({ onSelectThread, currentThreadId, pendingThread, isOpen, onClose }: SidebarProps) {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);

    const fetchThreads = async () => {
        try {
            const res = await fetch('http://localhost:8001/threads');
            const data = await res.json();
            setThreads(data);
        } catch (err) {
            console.error('Failed to load threads', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchThreads();
    }, [currentThreadId]);

    const toggleArchive = async (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation(); // don't select thread when archiving
        try {
            await fetch(`http://localhost:8001/threads/${threadId}/archive`, { method: 'PATCH' });
            await fetchThreads(); // refresh list
        } catch (err) {
            console.error('Failed to toggle archive', err);
        }
    };

    const active = threads.filter(t => !t.isArchived);
    const archived = threads.filter(t => t.isArchived);
    const showPendingThread = !!pendingThread && !(pendingThread.id && active.some(t => t.id === pendingThread.id));

    const ThreadButton = ({ thread, isArchived }: { thread: Thread; isArchived: boolean }) => (
        <div className="relative group/item">
            <button
                onClick={() => { onSelectThread(thread.id); onClose(); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all group pr-10 ${currentThreadId === thread.id
                    ? 'bg-rose-50 dark:bg-zinc-800/80 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-zinc-700'
                    }`}
            >
                <div className="font-bold truncate group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                    {thread.name || 'Unnamed Campaign'}
                </div>
                <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 flex items-center gap-1.5 opacity-80">
                    <span className="material-symbols-outlined !text-[12px]">schedule</span>
                    {formatDate(thread.createdAt)}
                </div>
            </button>
            {/* Archive / Restore button — visible on hover */}
            <button
                onClick={(e) => toggleArchive(e, thread.id)}
                title={isArchived ? 'Restore' : 'Archive'}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-700"
            >
                <span className="material-symbols-outlined !text-[16px]">
                    {isArchived ? 'unarchive' : 'archive'}
                </span>
            </button>
        </div>
    );

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 z-40 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Panel */}
            <div className={`fixed inset-y-0 left-0 z-50 w-72 h-full bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col pt-6 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>

                {/* Header */}
                <div className="px-5 mb-6 flex justify-between items-center">
                    <button
                        onClick={() => { onSelectThread(''); onClose(); }}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-rose-500/20 flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined !text-[18px]">add</span>
                        New Campaign
                    </button>
                    <button onClick={onClose} className="ml-3 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined !text-xl">close</span>
                    </button>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar space-y-6">
                    {loading ? (
                        <div className="space-y-3">
                            {showPendingThread && (
                                <div className="w-full text-left px-4 py-3.5 rounded-xl text-sm pr-10 bg-rose-50/80 dark:bg-zinc-800/80 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 shadow-sm">
                                    <div className="font-bold truncate flex items-center gap-2">
                                        <span className="material-symbols-outlined animate-spin-slow !text-[14px]">hourglass_top</span>
                                        <span>{pendingThread.name || 'New Campaign'}</span>
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 flex items-center gap-1.5 opacity-80">
                                        <span className="material-symbols-outlined !text-[12px]">schedule</span>
                                        {formatDate(pendingThread.createdAt)}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-center py-8">
                                <span className="material-symbols-outlined animate-spin-slow text-rose-500">hourglass_top</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Active Campaigns */}
                            <div>
                                <div className="px-2 text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-2">
                                    Recent Campaigns
                                </div>
                                <div className="space-y-1">
                                    {showPendingThread && (
                                        <div className="w-full text-left px-4 py-3.5 rounded-xl text-sm pr-10 bg-rose-50/80 dark:bg-zinc-800/80 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 shadow-sm">
                                            <div className="font-bold truncate flex items-center gap-2">
                                                <span className="material-symbols-outlined animate-spin-slow !text-[14px]">hourglass_top</span>
                                                <span>{pendingThread.name || 'New Campaign'}</span>
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 flex items-center gap-1.5 opacity-80">
                                                <span className="material-symbols-outlined !text-[12px]">schedule</span>
                                                {formatDate(pendingThread.createdAt)}
                                            </div>
                                        </div>
                                    )}
                                    {active.length === 0 ? (
                                        <p className="text-slate-400 dark:text-zinc-600 text-xs italic px-2 py-3">No active campaigns.</p>
                                    ) : (
                                        active.map(thread => (
                                            <ThreadButton key={thread.id} thread={thread} isArchived={false} />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Archived section — collapsible */}
                            {archived.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setShowArchived(v => !v)}
                                        className="w-full flex items-center justify-between px-2 text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-2 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                                    >
                                        <span>Archived ({archived.length})</span>
                                        <span className="material-symbols-outlined !text-[14px]">
                                            {showArchived ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                    {showArchived && (
                                        <div className="space-y-1 opacity-70">
                                            {archived.map(thread => (
                                                <ThreadButton key={thread.id} thread={thread} isArchived={true} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
