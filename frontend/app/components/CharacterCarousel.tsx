import { useState } from 'react';
import CharacterSheet from './CharacterSheet';

interface CharacterCarouselProps {
    characters: any[];
}

export default function CharacterCarousel({ characters }: CharacterCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!characters || characters.length === 0) return null;

    const next = () => setCurrentIndex((prev) => (prev + 1) % characters.length);
    const prev = () => setCurrentIndex((prev) => (prev - 1 + characters.length) % characters.length);

    return (
        <div className="relative w-full group mb-12">
            <CharacterSheet char={characters[currentIndex]} />

            {/* Navigation Arrows */}
            {characters.length > 1 && (
                <>
                    <button
                        onClick={prev}
                        type="button"
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-6 z-20 bg-white dark:bg-slate-800 rounded-full p-3 shadow-xl border border-slate-200 dark:border-slate-700 text-violet-500 hover:scale-110 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hidden md:flex opacity-0 group-hover:opacity-100"
                    >
                        <span className="material-symbols-outlined !text-3xl">chevron_left</span>
                    </button>
                    <button
                        onClick={next}
                        type="button"
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-6 z-20 bg-white dark:bg-slate-800 rounded-full p-3 shadow-xl border border-slate-200 dark:border-slate-700 text-violet-500 hover:scale-110 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hidden md:flex opacity-0 group-hover:opacity-100"
                    >
                        <span className="material-symbols-outlined !text-3xl">chevron_right</span>
                    </button>

                    {/* Mobile optimized buttons (always visible on small screens) */}
                    <div className="flex md:hidden justify-between w-full absolute top-1/2 -translate-y-1/2 px-2 pointer-events-none z-20">
                        <button onClick={prev} type="button" className="pointer-events-auto bg-black/40 text-white rounded-full p-2 backdrop-blur-sm">
                            <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <button onClick={next} type="button" className="pointer-events-auto bg-black/40 text-white rounded-full p-2 backdrop-blur-sm">
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>

                    {/* Dots indicator */}
                    <div className="absolute -bottom-8 left-0 right-0 flex justify-center gap-2">
                        {characters.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                className={`h-2 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-violet-500 w-8 shadow-sm' : 'bg-slate-300 dark:bg-slate-700 w-2 hover:bg-slate-400 dark:hover:bg-slate-600'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
