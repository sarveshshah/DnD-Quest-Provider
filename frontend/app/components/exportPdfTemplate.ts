export type ExportPayload = {
    campaignPlan: any;
    partyDetails: any;
    narrative: any;
    title?: string;
    createdAt?: string;
};

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
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

const text = (value: any) => {
    const cleaned = stripMarkdown(value);
    return cleaned ? escapeHtml(cleaned) : "—";
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

const toList = (value: any) => {
    if (!value) return [] as string[];
    if (Array.isArray(value)) {
        return value
            .map((item) => text(typeof item === "string" ? item : item?.name || item))
            .filter(Boolean);
    }
    return String(text(value))
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
};

export function buildExportPdfHtml(payload: ExportPayload): string {
    const campaignPlan = payload?.campaignPlan || {};
    const partyDetails = payload?.partyDetails || {};
    const narrative = payload?.narrative || {};
    const characters = Array.isArray(partyDetails?.characters) ? partyDetails.characters : [];

    const title = text(narrative?.title || payload?.title || "Quest Chronicle");
    const description = text(narrative?.description || campaignPlan?.core_conflict);
    const generatedAt = text(payload?.createdAt ? new Date(payload.createdAt).toLocaleString() : new Date().toLocaleString());
    const terrain = text(campaignPlan?.terrain || narrative?.terrain || "Unknown");
    const difficulty = text(campaignPlan?.difficulty || narrative?.difficulty || "Medium");

    const coverImage = imageSrcFromBase64(narrative?.cover_image_base64 || campaignPlan?.cover_image_base64);
    const macguffinImage = imageSrcFromBase64(campaignPlan?.macguffin_image_base64);
    const villainImage = imageSrcFromBase64(campaignPlan?.villain_image_base64 || campaignPlan?.villain_statblock?.image_base64);
    const groupImage = imageSrcFromBase64(campaignPlan?.group_image_base64);

    const plotPoints = Array.isArray(campaignPlan?.plot_points) ? campaignPlan.plot_points : [];
    const factions = Array.isArray(campaignPlan?.factions_involved) ? campaignPlan.factions_involved : [];
    const locations = Array.isArray(campaignPlan?.key_locations) ? campaignPlan.key_locations : [];

    const characterSections = characters.map((char: any, index: number) => {
        const portrait = imageSrcFromBase64(char?.image_base64);
        const abilityScores = char?.ability_scores && typeof char.ability_scores === "object"
            ? Object.entries(char.ability_scores)
            : [];

        return `
          <section class="sheet page-break">
            <div class="character-grid">
              <div class="portrait-wrap">
                ${portrait ? `<img class="portrait" src="${portrait}" alt="${text(char?.name || `Character ${index + 1}`)}" />` : `<div class="placeholder">No portrait</div>`}
                <div class="portrait-overlay"></div>
                <div class="portrait-caption">
                  <h3>${text(char?.name || `Character ${index + 1}`)}</h3>
                  ${char?.flavor_quote ? `<p>"${text(char.flavor_quote)}"</p>` : ""}
                </div>
              </div>
              <div class="character-main">
                <p class="kicker">Character ${index + 1}</p>
                <h2>${text(char?.name || `Character ${index + 1}`)}</h2>
                <p class="sub">Level ${text(char?.level || 1)} ${text(char?.race)} ${text(char?.class_name || char?.class)} • ${text(char?.alignment)}</p>

                <div class="stats-grid">
                  <div class="stat"><span>HP</span><strong>${text(char?.hp)}</strong></div>
                  <div class="stat"><span>AC</span><strong>${text(char?.ac)}</strong></div>
                  <div class="stat"><span>Init</span><strong>${text(char?.initiative)}</strong></div>
                  <div class="stat"><span>Speed</span><strong>${text(char?.speed)}</strong></div>
                </div>

                ${abilityScores.length > 0 ? `
                  <div class="ability-grid">
                    ${abilityScores.map(([key, val]) => `<div class="ability"><span>${text(key)}</span><strong>${text(val)}</strong></div>`).join("")}
                  </div>
                ` : ""}

                <div class="notes">
                  <p><strong>Backstory Hook:</strong> ${text(char?.backstory_hook)}</p>
                  <p><strong>Personal Goal:</strong> ${text(char?.ideals)}</p>
                  <p><strong>Skills:</strong> ${toList(char?.skills).join(", ") || "—"}</p>
                  <p><strong>Inventory:</strong> ${toList(char?.inventory).join(", ") || "—"}</p>
                  <p><strong>Traits:</strong> ${toList(char?.personality_traits).join(", ") || "—"}</p>
                </div>
              </div>
            </div>
          </section>
        `;
    }).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --accent: #7311d4;
      --ink: #0f172a;
      --ink-soft: #334155;
      --line: #e2e8f0;
      --surface: #ffffff;
      --surface-muted: #f8fafc;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: #f5f4f8;
      color: var(--ink);
    }

    .doc {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 16px 32px;
    }

    .sheet {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 28px rgba(0,0,0,.08);
      margin-bottom: 18px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .card-surface { background: linear-gradient(180deg, #ffffff 0%, #fbfaff 100%); }

    .sheet-pad,
    .section-title,
    .overview-grid,
    .character-main,
    .villain-main { padding: 20px; }

    .engine-tag {
      display: inline-flex;
      border: 1px solid #ddd6fe;
      background: #f5f3ff;
      color: #5b21b6;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .kicker {
      text-transform: uppercase;
      letter-spacing: .16em;
      font-size: 11px;
      color: var(--accent);
      font-weight: 800;
    }

    h1, h2, h3, h4, p { margin: 0; }
    h1 { margin-top: 4px; font-size: 42px; line-height: 1.06; letter-spacing: -0.02em; }
    h2 { font-size: 30px; line-height: 1.12; letter-spacing: -0.01em; }

    .lead { margin-top: 10px; color: var(--ink-soft); line-height: 1.6; font-size: 16px; }

    .meta-grid {
      margin-top: 14px;
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .meta-card {
      border: 1px solid #ede9fe;
      background: #f5f3ff;
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--ink-soft);
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .cover-image {
      width: 100%;
      height: 280px;
      object-fit: cover;
      border-bottom: 1px solid var(--line);
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .section-title { border-bottom: 1px solid var(--line); background: var(--surface-muted); }

    .overview-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .panel h4 {
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 11px;
      color: var(--accent);
    }

    .panel p { color: var(--ink-soft); line-height: 1.55; }

    .plot-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .plot-list li {
      display: grid;
      grid-template-columns: 26px 1fr;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--ink-soft);
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .plot-list .num { font-weight: 900; color: #c4b5fd; }

    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #e2e8f0;
      padding: 5px 9px;
      border-radius: 999px;
      background: #f8fafc;
      color: #475569;
    }

    .villain-grid,
    .character-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .villain-media,
    .portrait-wrap {
      min-height: 280px;
      background: #e2e8f0;
      position: relative;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .villain-media img,
    .portrait {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .portrait-overlay {
      position: absolute;
      inset: auto 0 0 0;
      height: 46%;
      background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.84) 100%);
    }

    .portrait-caption {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 14px;
      color: #fff;
      z-index: 2;
    }

    .portrait-caption h3 { font-size: 28px; line-height: 1.1; }
    .portrait-caption p { font-size: 12px; opacity: .9; margin-top: 4px; }

    .placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-weight: 600;
    }

    .villain-main { color: var(--ink-soft); line-height: 1.5; }
    .villain-main p + p { margin-top: 8px; }

    .sub { margin-top: 6px; color: #475569; }

    .stats-grid {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .stat {
      border: 1px solid #ddd6fe;
      background: #f5f3ff;
      border-radius: 999px;
      padding: 6px 8px;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .stat span {
      display: block;
      color: var(--accent);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .05em;
    }

    .stat strong { display: block; font-size: 16px; }

    .ability-grid {
      margin-top: 8px;
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .ability {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 6px;
      text-align: center;
      background: #fafaff;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .ability span {
      display: block;
      text-transform: uppercase;
      font-size: 9px;
      color: #64748b;
      font-weight: 700;
    }

    .ability strong { display: block; font-size: 12px; }

    .notes {
      margin-top: 8px;
      color: #334155;
      line-height: 1.4;
      font-size: 11px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .notes p + p { margin-top: 4px; }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    .page-break {
      break-before: page;
      page-break-before: always;
    }

    .sheet:first-of-type,
    .page-break:first-of-type {
      break-before: auto;
      page-break-before: auto;
    }

    p, li { orphans: 3; widows: 3; }

    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm;
      }

      html,
      body {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
        font-size: 11px;
        line-height: 1.42;
      }

      .doc {
        max-width: none;
        width: 100%;
        margin: 0;
        padding: 0;
      }

      h1 { font-size: 30px; }
      h2 { font-size: 22px; }
      .lead { font-size: 12px; line-height: 1.42; }

      .sheet {
        margin: 0 0 6mm 0;
        box-shadow: none;
        border-radius: 10px;
        border-color: #d1d5db;
      }

      .sheet-pad,
      .section-title,
      .overview-grid,
      .character-main,
      .villain-main { padding: 12px; }

      .panel { padding: 10px; border-radius: 10px; }
      .engine-tag { font-size: 9px; padding: 4px 8px; }
      .meta-grid { margin-top: 8px; gap: 6px; }
      .meta-card { font-size: 10px; padding: 6px 8px; }

      .cover-image {
        height: auto;
        max-height: 78mm;
      }

      .villain-grid,
      .character-grid,
      .overview-grid,
      .two-col {
        grid-template-columns: 1fr 1fr;
      }

      .villain-media,
      .portrait-wrap { min-height: 62mm; }

      .portrait-caption { left: 10px; right: 10px; bottom: 8px; }
      .portrait-caption h3 { font-size: 20px; }
      .portrait-caption p { font-size: 10px; }

      .stats-grid { gap: 5px; }
      .stat { padding: 5px 6px; }
      .stat strong { font-size: 14px; }

      .ability-grid { gap: 5px; }
      .ability { padding: 4px; }

      img {
        max-width: 100%;
        height: auto;
      }
    }
  </style>
</head>
<body>
  <main class="doc">
    <section class="sheet card-surface">
      ${coverImage ? `<img class="cover-image" src="${coverImage}" alt="Campaign Cover" />` : ""}
      <div class="sheet-pad">
        <div class="engine-tag">Custom PDF Engine · ${generatedAt}</div>
        <p class="kicker">Campaign Dossier</p>
        <h1>${title}</h1>
        <p class="lead">${description}</p>
        <div class="meta-grid">
          <div class="meta-card"><strong>Party</strong> ${text(partyDetails?.party_name)}</div>
          <div class="meta-card"><strong>Characters</strong> ${characters.length || 0}</div>
          <div class="meta-card"><strong>Terrain</strong> ${terrain}</div>
          <div class="meta-card"><strong>Difficulty</strong> ${difficulty}</div>
        </div>
      </div>
    </section>

    <section class="sheet page-break card-surface">
      <div class="section-title"><h2>Campaign Overview</h2></div>
      <div class="overview-grid">
        <div class="panel">
          <h4>Background Lore</h4>
          <p>${text(narrative?.background)}</p>
        </div>
        <div class="panel">
          <h4>Core Conflict</h4>
          <p>${text(campaignPlan?.core_conflict)}</p>
        </div>

        <div class="panel">
          <h4>Plot Outline</h4>
          ${plotPoints.length
            ? `<ol class="plot-list">${plotPoints.map((point: string, idx: number) => `<li><span class="num">${String(idx + 1).padStart(2, "0")}</span><span>${text(point)}</span></li>`).join("")}</ol>`
            : `<p>—</p>`}
        </div>

        <div class="panel">
          <h4>Rewards & Hooks</h4>
          <p>${text(narrative?.rewards)}</p>
          ${macguffinImage ? `<img src="${macguffinImage}" alt="Artifact" style="margin-top:10px;width:100%;border-radius:10px;border:1px solid var(--line);max-height:220px;object-fit:cover;"/>` : ""}
        </div>

        ${(factions.length || locations.length) ? `
          <div class="panel" style="grid-column: 1 / -1;">
            <div class="two-col">
              <div>
                <h4>Factions</h4>
                <div class="chip-list">
                  ${factions.length ? factions.map((f: string) => `<span class="chip">${text(f.split(":")[0] || f)}</span>`).join("") : `<span class="chip">—</span>`}
                </div>
              </div>
              <div>
                <h4>Key Locations</h4>
                <div class="chip-list">
                  ${locations.length ? locations.map((l: string) => `<span class="chip">${text(l.split(":")[0] || l)}</span>`).join("") : `<span class="chip">—</span>`}
                </div>
              </div>
            </div>
          </div>
        ` : ""}
      </div>
    </section>

    ${campaignPlan?.villain_statblock ? `
      <section class="sheet page-break card-surface">
        <div class="section-title"><p class="kicker">Primary Antagonist</p><h2>${text(campaignPlan?.primary_antagonist)}</h2></div>
        <div class="villain-grid">
          <div class="villain-main">
            <p><strong>HP:</strong> ${text(campaignPlan?.villain_statblock?.hp)}</p>
            <p><strong>AC:</strong> ${text(campaignPlan?.villain_statblock?.ac)}</p>
            <p><strong>Quote:</strong> ${text(campaignPlan?.villain_statblock?.flavor_quote)}</p>
            <p><strong>Attacks:</strong> ${toList(campaignPlan?.villain_statblock?.attacks).join(", ") || "—"}</p>
            <p><strong>Special Abilities:</strong> ${toList(campaignPlan?.villain_statblock?.special_abilities).join(", ") || "—"}</p>
            <p><strong>Appearance:</strong> ${text(campaignPlan?.villain_statblock?.physical_description)}</p>
          </div>
          <div class="villain-media">
            ${villainImage ? `<img src="${villainImage}" alt="Villain Portrait" />` : `<div class="placeholder">No villain image</div>`}
          </div>
        </div>
      </section>
    ` : ""}

    ${groupImage ? `
      <section class="sheet page-break card-surface">
        <div class="section-title"><h2>Adventuring Party</h2></div>
        <img class="cover-image" style="height:auto;max-height:none;border-bottom:none;" src="${groupImage}" alt="Party Portrait" />
      </section>
    ` : ""}

    ${characterSections}
  </main>
</body>
</html>`;
}
