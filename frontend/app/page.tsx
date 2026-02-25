"use client";

import { useEffect, useState } from "react";
import CampaignLore from "./components/CampaignLore";
import CharacterSheet from "./components/CharacterSheet";
import ExportPanel from "./components/ExportPanel";
import HitlControls from "./components/HitlControls";
import Sidebar from "./components/Sidebar";
import ThemeToggle from "./components/ThemeToggle";
import VillainCard from "./components/VillainCard";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [campaignPlan, setCampaignPlan] = useState<any>(null);
  const [partyDetails, setPartyDetails] = useState<any>(null);
  const [narrative, setNarrative] = useState<any>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [charIndex, setCharIndex] = useState(0);
  const [groupLightbox, setGroupLightbox] = useState(false);
  const [hitlData, setHitlData] = useState<any>(null);
  const [difficulty, setDifficulty] = useState("Medium");
  const [terrain, setTerrain] = useState("Forest");
  const [partyName, setPartyName] = useState("");
  const [partySize, setPartySize] = useState("4");
  const [requirements, setRequirements] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load active thread from LocalStorage on mount to preserve state across refreshes
  useEffect(() => {
    const savedThreadId = localStorage.getItem('dnd_active_thread_id');
    if (savedThreadId) {
      // Auto-restore the last campaign the user was viewing
      handleSelectThread(savedThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectThread = async (id: string) => {
    // setIsSidebarOpen is handled inside the Sidebar's onSelectThread wrapper

    if (!id) {
      setThreadId(null);
      setCampaignPlan(null);
      setPartyDetails(null);
      setNarrative(null);
      setHitlData(null);
      setPrompt("");
      setStatus("");
      localStorage.removeItem('dnd_active_thread_id');
      return;
    }

    setThreadId(id);
    localStorage.setItem('dnd_active_thread_id', id);
    setIsLoadingHistory(true);
    setStatus("Loading historical data...");

    try {
      const res = await fetch(`http://localhost:8001/threads/${id}`);
      const data = await res.json();

      // Attempt to deserialize legacy chainlit data back into React State
      if (data && data.messages) {
        let loadedPlan = null;
        let loadedParty = null;
        let loadedNarrative = null;
        let legacyText = "";

        for (const msg of data.messages) {
          if (!msg.output || typeof msg.output !== 'string') continue;

          try {
            if (msg.output.trim().startsWith('{')) {
              const parsed = JSON.parse(msg.output);
              if (parsed.campaign_plan || parsed.core_conflict) {
                loadedPlan = parsed.campaign_plan || parsed;
              } else if (parsed.party_details || parsed.characters) {
                loadedParty = parsed.party_details || parsed;
              } else if (parsed.title && parsed.description && parsed.background) {
                loadedNarrative = parsed;
              }
            } else if (msg.type === "run" || msg.type === "assistant_message" || msg.type === "llm" || msg.type === "message" || msg.type === "tool") {
              // This is a legacy standard Chainlit text output!
              if (msg.output.length > 20) {
                legacyText += msg.output + "\n\n---\n\n";
              }
            }
          } catch (e) {
            // Ignore format errors
          }
        }

        // If we found legacy text but no structured narrative, build a fallback display!
        if (!loadedNarrative && legacyText) {
          loadedNarrative = {
            title: "Archived Campaign",
            description: "Recovered from the ancient Chainlit vaults.",
            background: legacyText,
            rewards: ""
          };
        }

        setCampaignPlan(loadedPlan);
        setPartyDetails(loadedParty);
        setNarrative(loadedNarrative);
        setStatus((loadedNarrative || loadedPlan || legacyText) ? "Generation Complete!" : "Waiting for your approval...");
      }
    } catch (err) {
      console.error("Failed to load history:", err);
      setStatus("Error loading history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const processStream = async (response: Response) => {
    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = "";

    try {
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const rawChunk = decoder.decode(value, { stream: true });
          buffer += rawChunk;

          let match = buffer.match(/\r?\n\r?\n/);
          while (match && match.index !== undefined) {
            const boundaryIndex = match.index;
            const boundaryLength = match[0].length;
            const ev = buffer.slice(0, boundaryIndex);

            buffer = buffer.slice(boundaryIndex + boundaryLength);
            match = buffer.match(/\r?\n\r?\n/);

            if (!ev.trim() || !ev.startsWith("event: ")) continue;

            const eventMatch = ev.match(/event: (.*)\r?\n/);
            const dataIndex = ev.indexOf("data: ");

            if (eventMatch && dataIndex !== -1) {
              const eventType = eventMatch[1].trim();
              const eventData = ev.substring(dataIndex + 6).trim();

              try {
                if (eventType === "thread_id") {
                  const parsed = JSON.parse(eventData);
                  setThreadId(parsed.thread_id);
                  localStorage.setItem('dnd_active_thread_id', parsed.thread_id);
                }
                else if (eventType === "hitl") {
                  const hitl = JSON.parse(eventData);
                  setHitlData(hitl);
                  setStatus("Waiting for your approval...");
                  done = true; // Stream paused
                }
                else if (eventType === "status") {
                  const parsed = JSON.parse(eventData);
                  setStatus(parsed.status);
                }
                else if (eventType === "plan") {
                  const plan = JSON.parse(eventData);
                  setCampaignPlan(plan);
                }
                else if (eventType === "party") {
                  const party = JSON.parse(eventData);
                  setPartyDetails(party);
                }
                else if (eventType === "narrative") {
                  const nar = JSON.parse(eventData);
                  setNarrative(nar);
                }
                else if (eventType === "error") {
                  const errData = JSON.parse(eventData);
                  setStatus(`Error: ${errData.error}`);
                  done = true;
                }
                else if (eventType === "done") {
                  setStatus("Generation Complete!");
                  done = true;
                }
              } catch (parseError) {
                console.error("JSON parsing error on payload:", eventData);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream failed:", err);
      setStatus("Error: Connection Failed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setStatus("Connecting to AI...");
    setCampaignPlan(null);
    setPartyDetails(null);
    setNarrative(null);
    setThreadId(null);
    setHitlData(null);
    setIsLoadingHistory(false);

    try {
      // 1. Send the POST Request to our FastAPI server
      const response = await fetch("http://localhost:8001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          difficulty: difficulty,
          terrain: terrain,
          requirements: requirements,
          party_name: partyName || undefined,
          party_size: parseInt(partySize) || 4
        }),
      });

      // 2. Process the SSE Stream
      await processStream(response);
    } catch (error) {
      console.error("Failed to start generation:", error);
      setStatus("Error: Could not connect to API");
    }
  };

  const handleResume = async (action: string) => {
    setHitlData(null);
    setStatus("Resuming generation...");

    try {
      const response = await fetch("http://localhost:8001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "",
          difficulty: difficulty,
          terrain: terrain,
          requirements: action,
          thread_id: threadId,
          resume_action: action
        }),
      });
      await processStream(response);
    } catch (error) {
      console.error("Failed to resume generation:", error);
      setStatus("Error: Could not connect to API");
    }
  };

  return (
    <div className="flex min-h-screen">
      <ThemeToggle />

      {/* Fixed left-side icon buttons: New Campaign + Hamburger stacked */}
      <div className="fixed top-6 left-6 z-40 flex flex-col gap-2">
        {/* New Campaign icon */}
        <button
          onClick={() => handleSelectThread("")}
          title="New Campaign"
          className="p-3 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-700 shadow-md text-white transition-colors"
        >
          <span className="material-symbols-outlined !text-xl flex items-center justify-center">add</span>
        </button>
        {/* Hamburger / Sidebar toggle */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          title="Campaign History"
          className="p-3 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-md text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <span className="material-symbols-outlined !text-xl flex items-center justify-center">menu</span>
        </button>
      </div>

      {/* Sidebar Overlay and Component */}
      <Sidebar
        onSelectThread={(id) => {
          handleSelectThread(id);
        }}
        currentThreadId={threadId}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center py-24 px-4 w-full transition-all">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-12 text-slate-900 dark:text-white tracking-tight text-center">
          D&D Quest Generator
        </h1>

        {/* Generate Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-6xl flex flex-col gap-6 mb-16">

          {/* 1. Primary Prompt Input */}
          <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-lg dark:shadow-[0_4px_30px_rgba(0,0,0,0.4)] flex items-center focus-within:ring-2 focus-within:ring-rose-500/50 focus-within:border-rose-500/50 transition-all">
            <span className="text-3xl ml-4">🐉</span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What kind of adventure are you looking for? (e.g. A mystery involving a mimic tavern...)"
              className="flex-1 bg-transparent px-4 py-4 text-lg focus:outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500"
            />
            <button type="submit" disabled={isLoadingHistory} title="Generate Campaign" className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white p-4 rounded-xl transition-all shadow-md shadow-rose-600/20 mr-1 flex items-center justify-center">
              <span className="material-symbols-outlined !text-xl">auto_awesome</span>
            </button>
          </div>

          {/* 2. Secondary Campaign Parameters (Only show for fresh campaigns!) */}
          {!threadId && (
            <div className="bg-white dark:bg-zinc-900/50 p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-4 mb-8">
                <span className="text-slate-500 dark:text-zinc-500 font-extrabold uppercase tracking-[0.2em] text-xs">Campaign Parameters</span>
                <div className="h-px border-t border-slate-200 dark:border-zinc-800 flex-1 border-dashed"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Row 1: Party Name, Size, Diff, Terrain */}
                <div className="md:col-span-4">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-3 block">Party Name</label>
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="e.g. The Mighty Nein"
                    className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 font-medium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-3 block">Size</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-3 block">Difficulty</label>
                  <div className="relative">
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-slate-900 dark:text-white font-medium pr-10"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                      <option value="Deadly">Deadly</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400 pointer-events-none">expand_more</span>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-3 block">Terrain</label>
                  <div className="relative">
                    <select
                      value={terrain}
                      onChange={(e) => setTerrain(e.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-slate-900 dark:text-white font-medium pr-10"
                    >
                      <option value="Arctic">Arctic</option>
                      <option value="Coast">Coast</option>
                      <option value="Desert">Desert</option>
                      <option value="Forest">Forest</option>
                      <option value="Grassland">Grassland</option>
                      <option value="Mountain">Mountain</option>
                      <option value="Swamp">Swamp</option>
                      <option value="Underdark">Underdark</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400 pointer-events-none">expand_more</span>
                  </div>
                </div>

                {/* Row 2: Custom Requirements */}
                <div className="md:col-span-12">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-3 block">Custom Requirements (Optional)</label>
                  <textarea
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    placeholder="Any specific must-haves? (e.g. 'Must include a sentient magic sword that tells bad jokes')"
                    rows={2}
                    className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 font-medium resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Output Content Area */}
        {/* Only show the container if there is actually output or a loading status */}
        {(status || narrative || campaignPlan || partyDetails || hitlData) && (
          <div className="w-full max-w-6xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-10 shadow-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] min-h-[400px]">
            {/* Status Tracker */}
            {status && status !== "Generation Complete!" && (
              <div className="text-slate-400 dark:text-zinc-500 text-xs mb-6 pb-6 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-2">
                <span className="material-symbols-outlined animate-spin-slow !text-sm">hourglass_top</span>
                <span>{status}</span>
              </div>
            )}

            {/* Dynamic UI Components */}
            <div className="flex flex-col gap-16">

              {/* 1. Primary Campaign Document Layout */}
              {(narrative || campaignPlan) && (
                <CampaignLore
                  narrative={narrative}
                  campaignPlan={campaignPlan}
                  terrain={terrain}
                  difficulty={difficulty}
                />
              )}

              {/* 2. Villain Card */}
              {campaignPlan?.villain_statblock && (
                <div>
                  <h2 className="text-2xl font-extrabold text-red-500 mb-6 border-b border-slate-200 dark:border-zinc-800 pb-4 flex items-center gap-3">
                    <span className="material-symbols-outlined !text-3xl">swords</span>
                    The Primary Antagonist
                  </h2>
                  <VillainCard
                    name={campaignPlan.primary_antagonist}
                    villain={campaignPlan.villain_statblock}
                  />
                </div>
              )}

              {/* 2b. Party Group Image Card */}
              {campaignPlan?.group_image_base64 && campaignPlan.group_image_base64 !== '[GENERATED IMAGE STORED]' && (
                <>
                  {/* Lightbox */}
                  {groupLightbox && (
                    <div
                      className="fixed left-0 top-0 w-screen z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
                      style={{ height: '100dvh' }}
                      onClick={() => { setGroupLightbox(false); document.body.style.overflow = ''; }}
                    >
                      <img
                        src={`data:image/jpeg;base64,${campaignPlan.group_image_base64}`}
                        alt="The Party"
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Card: info left, image right */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl transition-colors duration-300">

                    {/* Left: Party metadata */}
                    <div className="flex-1 p-8 md:p-10 flex flex-col justify-center gap-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-500">Adventuring Party</div>
                      <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                        {partyDetails?.party_name || campaignPlan?.party_name || "The Heroes"}
                      </h2>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {terrain && (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                            <span className="material-symbols-outlined !text-sm">landscape</span>
                            {terrain}
                          </span>
                        )}
                        {partyDetails?.characters && (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                            <span className="material-symbols-outlined !text-sm">group</span>
                            {partyDetails.characters.length} Heroes
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
                        Click the portrait to view the full group shot.
                      </p>
                    </div>

                    {/* Right: Tall image panel */}
                    <div
                      className="relative w-full md:w-[55%] flex-shrink-0 bg-slate-900 overflow-hidden cursor-zoom-in group/party"
                      style={{ minHeight: '400px' }}
                      onClick={() => { setGroupLightbox(true); document.body.style.overflow = 'hidden'; }}
                    >
                      <img
                        src={`data:image/jpeg;base64,${campaignPlan.group_image_base64}`}
                        alt="The Party"
                        className="absolute inset-0 w-full h-full object-cover object-center group-hover/party:scale-105 transition-transform duration-700"
                      />
                      {/* Left-fade gradient (blends into info column on desktop) */}
                      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-l from-transparent to-white dark:to-slate-900 hidden md:block pointer-events-none" />
                      {/* Bottom gradient for text readability */}
                      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                      {/* Text overlay */}
                      <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-10 pointer-events-none">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-300 mb-1">Group Portrait</p>
                        <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow-md leading-tight">
                          {partyDetails?.party_name || "The Heroes"}
                        </h3>
                      </div>
                      {/* Zoom hint */}
                      <div className="absolute top-3 right-3 opacity-0 group-hover/party:opacity-100 transition-opacity bg-black/50 rounded-full p-1.5 z-10">
                        <span className="material-symbols-outlined !text-[18px] text-white">zoom_in</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 3. The Party Sheet (Or Initial Suggestions) */}
              {partyDetails?.characters ? (
                <div>
                  <h2 className="text-2xl font-extrabold text-rose-500 mb-6 border-b border-slate-200 dark:border-zinc-800 pb-4 flex items-center gap-3">
                    <span className="material-symbols-outlined !text-3xl">group</span>
                    {partyDetails.party_name || campaignPlan?.party_name || "The Heroes"}
                  </h2>
                  {/* Character Carousel */}
                  {(() => {
                    const chars = partyDetails.characters;
                    const total = chars.length;
                    const idx = Math.min(charIndex, total - 1);
                    const prev = () => setCharIndex(i => (i - 1 + total) % total);
                    const next = () => setCharIndex(i => (i + 1) % total);
                    return (
                      <div className="relative">
                        {/* Navigation arrows */}
                        {total > 1 && (
                          <>
                            <button
                              onClick={prev}
                              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-10 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-md rounded-full p-2 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all"
                            >
                              <span className="material-symbols-outlined !text-xl">chevron_left</span>
                            </button>
                            <button
                              onClick={next}
                              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-10 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-md rounded-full p-2 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all"
                            >
                              <span className="material-symbols-outlined !text-xl">chevron_right</span>
                            </button>
                          </>
                        )}

                        {/* Active character */}
                        <CharacterSheet key={idx} char={chars[idx]} />

                        {/* Dot indicators */}
                        {total > 1 && (
                          <div className="flex justify-center gap-2 mt-6">
                            {chars.map((_: any, i: number) => (
                              <button
                                key={i}
                                onClick={() => setCharIndex(i)}
                                className={`rounded-full transition-all ${i === idx
                                  ? 'w-6 h-2 bg-rose-500'
                                  : 'w-2 h-2 bg-slate-300 dark:bg-zinc-600 hover:bg-rose-300'
                                  }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : campaignPlan?.suggested_party ? (
                <div>
                  <h2 className="text-2xl font-extrabold text-rose-500 mb-6 border-b border-slate-200 dark:border-zinc-800 pb-4 flex items-center gap-3">
                    <span className="material-symbols-outlined !text-3xl">lightbulb</span>
                    {campaignPlan?.party_name || partyDetails?.party_name || "Suggested Heroes"}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {campaignPlan.suggested_party.map((hero: any, i: number) => (
                      <div key={i} className="bg-slate-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-sm">
                        <h3 className="font-extrabold text-xl text-rose-500 mb-1">{hero.name}</h3>
                        <p className="text-slate-600 dark:text-zinc-400 font-medium">{hero.race} {hero.class || hero.class_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 4. HITL Mid-Stream Breakpoint Controls */}
              {hitlData && (
                <HitlControls
                  hitlData={hitlData}
                  onResume={handleResume}
                />
              )}

              {/* 5. Export Panel */}
              {(narrative || campaignPlan || partyDetails) && (
                <ExportPanel
                  campaignPlan={campaignPlan}
                  partyDetails={partyDetails}
                  narrative={narrative}
                />
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
