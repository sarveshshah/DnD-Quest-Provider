import { buildExportPdfHtml } from "./exportPdfTemplate";

interface ExportPanelProps {
    campaignPlan: any;
    partyDetails: any;
    narrative: any;
    terrain?: string;
    difficulty?: string;
}

export default function ExportPanel({ campaignPlan, partyDetails, narrative, terrain, difficulty }: ExportPanelProps) {
    const stripMarkdown = (value: any) => {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ""))
            .replace(/`([^`]+)`/g, "$1")
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/^\s{0,3}#{1,6}\s+/gm, "")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/^\s*\d+\.\s+/gm, "")
            .replace(/^\s*>\s?/gm, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/__([^_]+)__/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/~~([^~]+)~~/g, "$1")
            .replace(/\|/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    const escapeHtml = (value: any) => {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    const toParagraphs = (value: any) => {
        if (!value) return "<p>—</p>";
        const text = stripMarkdown(value);
        if (!text) return "<p>—</p>";
        return text
            .split(/\n{2,}/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
            .join("");
    };

    const toListHtml = (items: any) => {
        if (!items) return "<li>—</li>";
        const list = Array.isArray(items)
            ? items
            : stripMarkdown(items)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

        if (!list.length) return "<li>—</li>";
        return list.map((item: any) => `<li>${escapeHtml(stripMarkdown(item))}</li>`).join("");
    };

    const sanitizeBase64 = (b64?: string | null) => (b64 || "").replace(/\s+/g, "").trim();

    const imageMimeFromBase64 = (b64?: string | null) => {
        const cleaned = sanitizeBase64(b64);
        if (!cleaned) return "image/jpeg";
        if (cleaned.startsWith("iVBOR")) return "image/png";
        if (cleaned.startsWith("R0lGOD")) return "image/gif";
        if (cleaned.startsWith("UklGR")) return "image/webp";
        return "image/jpeg";
    };

    const imageSrcFromBase64 = (b64?: string | null) => {
        const cleaned = sanitizeBase64(b64);
        if (!cleaned || cleaned === "[GENERATED IMAGE STORED]") return null;
        return `data:${imageMimeFromBase64(cleaned)};base64,${cleaned}`;
    };

    const hasImage = (b64?: string | null) => !!imageSrcFromBase64(b64);

    const renderCharacterPage = (char: any, index: number) => {
        const charClass = char.class_name || char.class || "Adventurer";
        const traits = Array.isArray(char.personality_traits) ? char.personality_traits.join(", ") : char.personality_traits;
        const skills = Array.isArray(char.skills) ? char.skills.join(", ") : char.skills;
        const inventory = Array.isArray(char.inventory) ? char.inventory.join(", ") : char.inventory;
        const weapons = Array.isArray(char.weapons) ? char.weapons : [];
        const spells = Array.isArray(char.spells) ? char.spells : [];
        const stats = char.ability_scores && typeof char.ability_scores === "object"
            ? Object.entries(char.ability_scores as Record<string, number>)
            : [];

        return `
            <section class="page page-break char-page">
                <header class="section-header">
                    <div class="kicker">Character ${index + 1}</div>
                    <h1>${escapeHtml(stripMarkdown(char.name || `Character ${index + 1}`))}</h1>
                    <p>Level ${escapeHtml(char.level || 1)} ${escapeHtml(stripMarkdown(char.race || "Unknown"))} ${escapeHtml(stripMarkdown(charClass))} • ${escapeHtml(stripMarkdown(char.alignment || "Neutral"))}</p>
                </header>

                <div class="char-top avoid-break">
                    ${hasImage(char.image_base64) ? `
                        <div class="hero-image-wrap">
                            <img class="hero-image" src="${imageSrcFromBase64(char.image_base64)}" alt="${escapeHtml(char.name || "Character")}" />
                        </div>
                    ` : `<div class="hero-image-wrap hero-image-placeholder"><span>No portrait available</span></div>`}

                    <div class="stats-grid">
                        <div class="stat-card"><strong>HP</strong><span>${escapeHtml(char.hp || 10)}</span></div>
                        <div class="stat-card"><strong>AC</strong><span>${escapeHtml(char.ac || 10)}</span></div>
                        <div class="stat-card"><strong>Initiative</strong><span>${escapeHtml(char.initiative || "—")}</span></div>
                        <div class="stat-card"><strong>Speed</strong><span>${escapeHtml(char.speed || "30ft")}</span></div>
                    </div>
                </div>

                ${stats.length ? `
                    <section class="block avoid-break">
                        <h2>Ability Scores</h2>
                        <div class="ability-grid">
                            ${stats.map(([key, val]) => `<div class="ability-item"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(val)}</span></div>`).join("")}
                        </div>
                    </section>
                ` : ""}

                ${(char.flavor_quote || char.backstory_hook || char.physical_description || char.ideals || char.bonds || char.flaws || traits) ? `
                    <section class="block avoid-break">
                        <h2>Roleplay Notes</h2>
                        ${char.flavor_quote ? `<blockquote>${escapeHtml(char.flavor_quote)}</blockquote>` : ""}
                        ${char.backstory_hook ? `<p><strong>Hook:</strong> ${escapeHtml(char.backstory_hook)}</p>` : ""}
                        ${char.ideals ? `<p><strong>Ideals:</strong> ${escapeHtml(char.ideals)}</p>` : ""}
                        ${char.bonds ? `<p><strong>Bonds:</strong> ${escapeHtml(char.bonds)}</p>` : ""}
                        ${char.flaws ? `<p><strong>Flaws:</strong> ${escapeHtml(char.flaws)}</p>` : ""}
                        ${traits ? `<p><strong>Traits:</strong> ${escapeHtml(traits)}</p>` : ""}
                        ${char.physical_description ? `<div><strong>Appearance:</strong>${toParagraphs(char.physical_description)}</div>` : ""}
                    </section>
                ` : ""}

                <section class="block avoid-break">
                    <h2>Mechanics</h2>
                    ${skills ? `<p><strong>Skills:</strong> ${escapeHtml(stripMarkdown(skills))}</p>` : ""}
                    ${inventory ? `<p><strong>Inventory:</strong> ${escapeHtml(stripMarkdown(inventory))}</p>` : ""}

                    ${weapons.length ? `
                        <h3>Weapons</h3>
                        <ul>${weapons.map((w: any) => `<li>${escapeHtml(stripMarkdown(typeof w === "string" ? w : w?.name || "Weapon"))}${w?.damage ? ` — ${escapeHtml(stripMarkdown(w.damage))}` : ""}</li>`).join("")}</ul>
                    ` : ""}

                    ${spells.length ? `
                        <h3>Spells</h3>
                        <ul>${spells.map((s: any) => `<li>${escapeHtml(stripMarkdown(typeof s === "string" ? s : s?.name || "Spell"))}</li>`).join("")}</ul>
                    ` : ""}
                </section>
            </section>
        `;
    };

    const renderCoverBlock = (title: string, description: string, partyName: string, characterCount: number) => `
        <section class="page cover">
            <div class="kicker">D&D Quest Provider</div>
            <h1 class="cover-title">${title}</h1>
            <p class="cover-quote">${description}</p>
            <div class="cover-meta">
                <p><strong>Party:</strong> ${partyName}</p>
                <p><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</p>
                <p><strong>Included Character Sheets:</strong> ${characterCount}</p>
            </div>
        </section>
    `;

    const renderOverviewBlock = (
        narrativeData: any,
        campaignData: any,
        coverImageSrc: string | null,
        macguffinImageSrc: string | null,
        keyLocationsHtml: string,
    ) => `
        <section class="page page-break">
            <header class="section-header">
                <p class="section-kicker">Campaign Dossier</p>
                <h1>Campaign Overview</h1>
                <p class="muted">Structured export optimized for PDF.</p>
            </header>

            <div class="overview-grid">
                ${coverImageSrc ? `
                    <section class="media-block">
                        <img src="${coverImageSrc}" alt="Campaign Cover" />
                        <div class="media-caption">Campaign Cover</div>
                    </section>
                ` : ""}

                ${narrativeData ? `
                    <section class="block">
                        <h2>Background Lore</h2>
                        ${toParagraphs(narrativeData.background)}
                    </section>
                ` : ""}

                ${campaignData ? `
                    <section class="block">
                        <h2>Campaign Details</h2>
                        <p><strong>Primary Antagonist:</strong> ${escapeHtml(stripMarkdown(campaignData.primary_antagonist || "—"))}</p>
                        <p><strong>Core Conflict:</strong> ${escapeHtml(stripMarkdown(campaignData.core_conflict || "—"))}</p>
                    </section>
                    <section class="block">
                        <h2>Key Locations</h2>
                        ${keyLocationsHtml}
                    </section>
                ` : ""}

                ${(narrativeData?.rewards || macguffinImageSrc) ? `
                    <section class="split-card">
                        <div class="split-content">
                            <p class="split-title">Rewards & Hooks</p>
                            ${toParagraphs(narrativeData?.rewards)}
                        </div>
                        <div class="split-media">
                            ${macguffinImageSrc
                ? `<img src="${macguffinImageSrc}" alt="Artifact / Reward Image" />`
                : `<div class="muted">No artifact image available</div>`}
                        </div>
                    </section>
                ` : ""}
            </div>

            <div class="footer">Page prepared for print-safe PDF generation</div>
        </section>
    `;

    const renderVillainBlock = (villain: any, villainImageSrc: string | null, villainName: string) => {
        if (!villain) return "";
        return `
            <section class="page page-break">
                <header class="section-header">
                    <p class="section-kicker">Encounter Profile</p>
                    <h1>Primary Antagonist</h1>
                    <p class="muted">Rendered to match the villain card flow in-app.</p>
                </header>

                <section class="split-card reverse" style="margin-bottom: 10px;">
                    <div class="split-media">
                        ${villainImageSrc
                ? `<img src="${villainImageSrc}" alt="Villain Portrait" />`
                : `<div class="muted">No villain portrait available</div>`}
                    </div>
                    <div class="split-content">
                        <p class="split-title">Villain Statblock</p>
                        <p><strong>Name:</strong> ${villainName}</p>
                        <p><strong>HP:</strong> ${escapeHtml(villain.hp || "?")} &nbsp; <strong>AC:</strong> ${escapeHtml(villain.ac || "?")}</p>
                        ${villain.flavor_quote ? `<blockquote>${escapeHtml(stripMarkdown(villain.flavor_quote))}</blockquote>` : ""}
                        ${villain.physical_description ? toParagraphs(villain.physical_description) : ""}
                    </div>
                </section>

                <section class="block">
                    <div class="two-col">
                        <div>
                            <h3>Attacks</h3>
                            <ul>${toListHtml(villain.attacks)}</ul>
                        </div>
                        <div>
                            <h3>Special Abilities</h3>
                            <ul>${toListHtml(villain.special_abilities)}</ul>
                        </div>
                    </div>
                </section>
            </section>
        `;
    };

    const renderPartyBlock = (groupImageSrc: string | null, partyName: string, characterCount: number) => {
        if (!groupImageSrc) return "";
        return `
            <section class="page page-break">
                <header class="section-header">
                    <p class="section-kicker">Party Ledger</p>
                    <h1>Adventuring Party</h1>
                    <p class="muted">Group portrait section follows villain section, matching the React page flow.</p>
                </header>

                <section class="split-card">
                    <div class="split-content">
                        <p class="split-title">Party Portrait</p>
                        <p><strong>Party Name:</strong> ${partyName}</p>
                        <p><strong>Members:</strong> ${characterCount}</p>
                        <p class="muted">This section corresponds to the dedicated group portrait card in the UI.</p>
                    </div>
                    <div class="split-media">
                        <img src="${groupImageSrc}" alt="Party Portrait" />
                    </div>
                </section>
            </section>
        `;
    };

    const renderPrintShell = (title: string, styles: string, blocks: string[]) => `
<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - PDF Export</title>
    <style>${styles}</style>
</head>
<body>
    ${blocks.filter(Boolean).join("\n")}
</body>
</html>
    `;

    const generateSmartPrintHtml = () => {
        const title = escapeHtml(stripMarkdown(narrative?.title || "Epic Adventure"));
        const description = escapeHtml(stripMarkdown(narrative?.description || "A custom D&D campaign export."));
        const partyName = escapeHtml(stripMarkdown(partyDetails?.party_name || "The Heroes"));
        const characters = Array.isArray(partyDetails?.characters) ? partyDetails.characters : [];

        const keyLocationsHtml = campaignPlan?.key_locations?.length
            ? `<ul>${campaignPlan.key_locations.map((loc: string) => `<li>${escapeHtml(stripMarkdown(loc))}</li>`).join("")}</ul>`
            : "<p>—</p>";

        const villain = campaignPlan?.villain_statblock;
        const coverImageSrc = imageSrcFromBase64(campaignPlan?.cover_image_base64);
        const groupImageSrc = imageSrcFromBase64(campaignPlan?.group_image_base64);
        const macguffinImageSrc = imageSrcFromBase64(campaignPlan?.macguffin_image_base64);
        const villainImageSrc = imageSrcFromBase64(villain?.image_base64 || campaignPlan?.villain_image_base64);

        const printStyles = `
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
            font-family: "Inter", "Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            background: #fcfcff;
            line-height: 1.52;
            font-size: 13px;
        }
        h1, h2, h3, p { margin: 0 0 10px; }
        h1 { font-size: 32px; line-height: 1.12; letter-spacing: -0.025em; }
        h2 { font-size: 17px; margin-top: 0; letter-spacing: -0.01em; }
        h3 { font-size: 14px; margin-top: 8px; }
        ul { margin: 0 0 10px 18px; padding: 0; }
        li { margin: 0 0 4px; }
        .page { margin-bottom: 3mm; }
        .page-break {
            page-break-before: always;
            break-before: page;
        }
        .cover {
            min-height: 0;
            padding: 14mm;
            border: 1px solid #edd5fb;
            border-radius: 20px;
            background: radial-gradient(circle at top right, #f5e8ff 0%, #fff7fb 35%, #fffdf7 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 12px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(76, 29, 149, 0.08);
        }
        .cover::after {
            content: "";
            position: absolute;
            right: -30mm;
            top: -30mm;
            width: 90mm;
            height: 90mm;
            border-radius: 999px;
            border: 2px solid #e9d5ff;
            opacity: 0.6;
        }
        .kicker {
            font-size: 10px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: #6d28d9;
            font-weight: 800;
        }
        .cover-title {
            margin: 0;
            color: #1e1b4b;
        }
        .cover-quote {
            margin-top: 6px;
            border-left: 4px solid #c4b5fd;
            padding: 2px 0 2px 12px;
            color: #334155;
            font-style: italic;
            font-size: 14px;
        }
        .muted { color: #475569; }
        .cover-meta {
            margin-top: 8px;
            display: grid;
            gap: 4px;
            color: #334155;
            font-size: 12px;
        }
        .section-header {
            border-bottom: 2px solid #ddd6fe;
            padding-bottom: 8px;
            margin-bottom: 10px;
        }
        .section-kicker {
            margin: 0 0 6px;
            font-size: 10px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #7c3aed;
            font-weight: 800;
        }
        .overview-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
        }
        .block {
            border: 1px solid #e9e2ff;
            border-radius: 14px;
            padding: 12px 14px;
            margin-bottom: 0;
            background: linear-gradient(180deg, #ffffff 0%, #fcfaff 100%);
            box-shadow: 0 6px 16px rgba(30, 41, 59, 0.06);
            page-break-inside: avoid;
            break-inside: avoid-page;
        }
        .media-block {
            border: 1px solid #e9e2ff;
            border-radius: 14px;
            overflow: hidden;
            background: #f8fafc;
            page-break-inside: avoid;
            break-inside: avoid-page;
            box-shadow: 0 6px 16px rgba(30, 41, 59, 0.06);
        }
        .media-block img {
            width: 100%;
            max-height: 95mm;
            object-fit: contain;
            display: block;
            background: #f8fafc;
        }
        .media-caption {
            font-size: 11px;
            color: #5b21b6;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            padding: 8px 10px;
            border-top: 1px solid #e9e2ff;
            background: #ffffff;
        }
        .split-card {
            display: grid;
            grid-template-columns: 1fr 44%;
            border: 1px solid #e9e2ff;
            border-radius: 16px;
            overflow: hidden;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid-page;
            box-shadow: 0 8px 22px rgba(30, 41, 59, 0.08);
        }
        .split-card.reverse {
            grid-template-columns: 44% 1fr;
        }
        .split-content {
            padding: 14px;
            background: linear-gradient(180deg, #ffffff 0%, #fcfaff 100%);
        }
        .split-media {
            min-height: 90mm;
            background: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .split-media img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .split-title {
            margin: 0 0 8px;
            font-size: 12px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #7c3aed;
            font-weight: 800;
        }
        .block p:last-child,
        .block ul:last-child { margin-bottom: 0; }
        .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid-page;
        }
        blockquote {
            border-left: 3px solid #8b5cf6;
            margin: 8px 0;
            padding: 0 0 0 10px;
            color: #334155;
            font-style: italic;
        }
        .char-page { position: relative; }
        .char-top {
            display: grid;
            grid-template-columns: 42% 1fr;
            gap: 10px;
            margin-bottom: 8px;
            align-items: stretch;
        }
        .hero-image-wrap {
            border: 1px solid #ddd6fe;
            border-radius: 14px;
            overflow: hidden;
            min-height: 66mm;
            max-height: 80mm;
            background: #f8fafc;
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        }
        .hero-image-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #64748b;
            font-weight: 600;
            font-size: 12px;
        }
        .hero-image {
            width: 100%;
            height: 100%;
            min-height: 66mm;
            max-height: 80mm;
            object-fit: contain;
            display: block;
            background: #0f172a;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .stat-card {
            border: 1px solid #ddd6fe;
            border-radius: 10px;
            padding: 9px;
            text-align: center;
            background: linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%);
        }
        .stat-card strong {
            display: block;
            color: #64748b;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 3px;
        }
        .stat-card span { font-weight: 800; font-size: 17px; }
        .ability-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .ability-item {
            border: 1px solid #ede9fe;
            border-radius: 10px;
            padding: 8px;
            text-align: center;
            background: #f5f3ff;
        }
        .ability-item strong {
            display: block;
            color: #6d28d9;
            margin-bottom: 4px;
            font-size: 11px;
            letter-spacing: 0.06em;
        }
        .ability-item span { font-weight: 700; font-size: 16px; }
        .two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .footer {
            margin-top: 8px;
            font-size: 10px;
            color: #64748b;
            text-align: right;
        }
        `;

        const villainName = escapeHtml(stripMarkdown(campaignPlan?.primary_antagonist || "Unknown"));
        const blocks = [
            renderCoverBlock(title, description, partyName, characters.length),
            renderOverviewBlock(narrative, campaignPlan, coverImageSrc, macguffinImageSrc, keyLocationsHtml),
            renderVillainBlock(villain, villainImageSrc, villainName),
            renderPartyBlock(groupImageSrc, partyName, characters.length),
            ...characters.map((char: any, index: number) => renderCharacterPage(char, index)),
        ];

        return renderPrintShell(title, printStyles, blocks);
    };

    const handleSmartPdf = async () => {
        const payload = {
            campaignPlan,
            partyDetails,
            narrative,
            terrain,
            difficulty,
            title: stripMarkdown(narrative?.title || "campaign_export"),
            createdAt: new Date().toISOString(),
        };
        const fileName = (payload.title || "campaign_export")
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9_-]/g, "")
            .slice(0, 72) || "campaign_export";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const exportFileName = `${fileName}_custompdf_${stamp}`;

        try {
            const html = buildExportPdfHtml(payload);

            const res = await fetch("http://localhost:8001/export/pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ html, file_name: exportFileName }),
            });

            if (!res.ok) {
                let details = "";
                try {
                    const parsed = await res.json();
                    details = parsed?.detail || "";
                } catch {
                    details = await res.text();
                }
                throw new Error(`PDF export failed (${res.status})${details ? `: ${details}` : ""}`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${exportFileName}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Backend visual PDF export failed:", err);
            alert(`Smart PDF export failed: ${message}`);
        }
    };

    if (!campaignPlan && !partyDetails && !narrative) return null;

    return (
        <div className="p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl mt-8 print:hidden">
            <div className="flex flex-col items-center gap-3 text-center">
                <h3 className="text-slate-600 dark:text-zinc-300 font-bold">Export Campaign</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Best quality layout for sharing and printing.</p>
                <button
                    onClick={handleSmartPdf}
                    className="flex items-center gap-2 bg-sky-50 dark:bg-sky-900/40 hover:bg-sky-100 dark:hover:bg-sky-800 text-sky-700 dark:text-sky-300 font-bold py-2.5 px-7 rounded-lg border border-sky-200 dark:border-sky-800/50 transition-colors"
                >
                    <span>🖨️</span> Download PDF
                </button>
            </div>
        </div>
    );
}
