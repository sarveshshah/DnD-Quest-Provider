export type ExportPayload = {
  campaignPlan: any;
  partyDetails: any;
  narrative: any;
  terrain?: string;
  difficulty?: string;
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

const toParagraphsHtml = (value: any) => {
  const cleaned = stripMarkdown(value);
  if (!cleaned) return `<p>—</p>`;
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
};

const toBulletListHtml = (value: any) => {
  const list = toList(value);
  if (!list.length) return `<li>—</li>`;
  return list.map((item) => `<li>${item}</li>`).join("");
};

const contentLength = (...values: any[]) => {
  return values.reduce((total, value) => total + stripMarkdown(value).length, 0);
};

const listLength = (items: any[]) => {
  return items.reduce((total, value) => {
    const normalized = typeof value === "string" ? value : value?.name || JSON.stringify(value ?? "");
    return total + stripMarkdown(normalized).length;
  }, 0);
};

const densityFor = (length: number, mediumThreshold: number, highThreshold: number) => {
  if (length > highThreshold) return 2;
  if (length > mediumThreshold) return 1;
  return 0;
};

const densityClass = (prefix: string, level: number) => {
  if (level <= 0) return "";
  return `${prefix}-dense-${level}`;
};

export function buildExportPdfHtml(payload: ExportPayload): string {
  const campaignPlan = payload?.campaignPlan || {};
  const partyDetails = payload?.partyDetails || {};
  const narrative = payload?.narrative || {};
  const characters = Array.isArray(partyDetails?.characters) ? partyDetails.characters : [];

  const title = text(narrative?.title || payload?.title || "Quest Chronicle");
  const description = text(narrative?.description || campaignPlan?.core_conflict);
  const generatedAt = text(payload?.createdAt ? new Date(payload.createdAt).toLocaleString() : new Date().toLocaleString());
  const terrain = text(payload?.terrain || campaignPlan?.terrain || narrative?.terrain || "Unknown");
  const difficulty = text(payload?.difficulty || campaignPlan?.difficulty || narrative?.difficulty || "Medium");

  const coverImage = imageSrcFromBase64(narrative?.cover_image_base64 || campaignPlan?.cover_image_base64);
  const macguffinImage = imageSrcFromBase64(campaignPlan?.macguffin_image_base64);
  const villainImage = imageSrcFromBase64(campaignPlan?.villain_image_base64 || campaignPlan?.villain_statblock?.image_base64);
  const groupImage = imageSrcFromBase64(campaignPlan?.group_image_base64);

  const plotPoints = Array.isArray(campaignPlan?.plot_points) ? campaignPlan.plot_points : [];
  const factions = Array.isArray(campaignPlan?.factions_involved) ? campaignPlan.factions_involved : [];
  const locations = Array.isArray(campaignPlan?.key_locations) ? campaignPlan.key_locations : [];
  const villainRaw = stripMarkdown(campaignPlan?.primary_antagonist || "");
  const villainName = text(villainRaw.includes(":") ? villainRaw.split(":")[0] : villainRaw || "Unknown Antagonist");
  const villainProfile = text(
    villainRaw.includes(":")
      ? villainRaw.split(":").slice(1).join(":")
      : campaignPlan?.villain_statblock?.goal || campaignPlan?.core_conflict,
  );

  const coverDensity = densityClass(
    "cover",
    densityFor(contentLength(narrative?.description || campaignPlan?.core_conflict || description), 950, 1500),
  );
  const overviewDensity = densityClass(
    "overview",
    densityFor(
      contentLength(narrative?.background, campaignPlan?.core_conflict) + listLength(plotPoints),
      2600,
      3600,
    ),
  );
  const factionsDensity = densityClass(
    "factions",
    densityFor(contentLength(narrative?.rewards) + listLength(factions) + listLength(locations), 1400, 2100),
  );
  const villainDensity = densityClass(
    "villain",
    densityFor(
      contentLength(
        villainProfile,
        campaignPlan?.villain_statblock?.flavor_quote,
        campaignPlan?.villain_statblock?.physical_description,
      ) +
      listLength(campaignPlan?.villain_statblock?.attacks || []) +
      listLength(campaignPlan?.villain_statblock?.special_abilities || []),
      1700,
      2500,
    ),
  );
  const partyDensity = densityClass(
    "party",
    densityFor(contentLength(partyDetails?.party_name, terrain, difficulty) + listLength(characters), 700, 1200),
  );
  const partyRoster = characters
    .map((char: any) => {
      const charName = text(char?.name || "Unnamed Hero");
      const charClass = text(char?.class_name || char?.class || "Adventurer");
      const charRace = text(char?.race || "Unknown");
      const charLevel = text(char?.level || 1);
      return `<li><strong>${charName}</strong><span>Lvl ${charLevel} ${charRace} ${charClass}</span></li>`;
    })
    .join("");

  const characterSections = characters.map((char: any, index: number) => {
    const portrait = imageSrcFromBase64(char?.image_base64);
    const abilityScores = char?.ability_scores && typeof char.ability_scores === "object"
      ? Object.entries(char.ability_scores)
      : [];
    const skills = toList(char?.skills);
    const inventory = toList(char?.inventory);
    const traits = toList(char?.personality_traits);
    const weapons = toList(char?.weapons);
    const spells = toList(char?.spells);
    const characterDensity = densityClass(
      "character",
      densityFor(
        contentLength(
          char?.backstory_hook,
          char?.physical_description,
          char?.ideals,
          char?.bonds,
          char?.flaws,
        ) +
        listLength(skills) +
        listLength(inventory) +
        listLength(traits) +
        listLength(weapons) +
        listLength(spells),
        1500,
        2300,
      ),
    );

    return `
          <section class="sheet page-break character-sheet ${characterDensity}">
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

                <div class="character-panels">
                  <div class="panel">
                    <h4>Roleplay Notes</h4>
                    <ul class="panel-list">
                      <li><strong>Traits:</strong> ${traits.join(", ") || "—"}</li>
                      <li><strong>Goal:</strong> ${text(char?.ideals)}</li>
                      <li><strong>Bonds:</strong> ${text(char?.bonds)}</li>
                      <li><strong>Flaws:</strong> ${text(char?.flaws)}</li>
                    </ul>
                  </div>
                  <div class="panel">
                    <h4>Combat & Utility</h4>
                    <ul class="panel-list">
                      <li><strong>Skills:</strong> ${skills.join(", ") || "—"}</li>
                      <li><strong>Inventory:</strong> ${inventory.join(", ") || "—"}</li>
                      <li><strong>Weapons:</strong> ${weapons.join(", ") || "—"}</li>
                      <li><strong>Spells:</strong> ${spells.join(", ") || "—"}</li>
                    </ul>
                  </div>
                </div>

                <div class="panel">
                  <h4>Backstory Hook</h4>
                  <div class="rich-copy">${toParagraphsHtml(char?.backstory_hook || char?.physical_description)}</div>
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

    .lead-plain {
      margin-top: 10px;
      color: var(--ink-soft);
      line-height: 1.58;
      font-size: 14px;
    }

    .dossier-heading {
      margin-top: 2px;
      color: var(--accent);
      font-size: 32px;
      line-height: 1.08;
      letter-spacing: -0.01em;
      font-weight: 900;
    }

    .cover-page .lead-plain p {
      margin-bottom: 14px;
    }

    .cover-page .lead-plain p:last-child {
      margin-bottom: 0;
    }

    .cover-page .sheet-pad {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 24px;
      padding-bottom: 24px;
    }

    .cover-page h1 {
      margin-top: 2px;
    }

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

    .party-image {
      width: 100%;
      height: 280px;
      object-fit: cover;
      object-position: center;
      border-top: 1px solid var(--line);
      display: block;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .party-full {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .party-stage {
      width: 100%;
      height: 540px;
      background: #0f172a;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      overflow: hidden;
      position: relative;
      padding: 0;
    }

    .party-stage .party-image,
    .party-stage img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
      border-top: 0;
      max-width: none;
    }

    .party-stage::after {
      content: "";
      position: absolute;
      inset: auto 0 0 0;
      height: 20%;
      background: linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.28) 100%);
      pointer-events: none;
    }

    .party-footer {
      padding: 18px 20px 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
    }

    .party-attrs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-content: start;
    }

    .party-attr {
      border: 1px solid #e2d9ff;
      background: #f7f2ff;
      border-radius: 12px;
      padding: 12px 14px;
      color: #334155;
    }

    .party-attr strong {
      display: block;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #6d28d9;
      margin-bottom: 4px;
    }

    .party-attr span {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1.2;
    }

    .party-roster {
      border: 1px solid #e2d9ff;
      background: #fff;
      border-radius: 12px;
      padding: 14px 16px;
    }

    .party-roster h4 {
      margin: 0 0 12px;
      font-size: 12px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: #6d28d9;
    }

    .party-roster ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }

    .party-roster li {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding-bottom: 8px;
      border-bottom: 1px dashed #e2e8f0;
    }

    .party-roster li:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .party-roster li strong {
      font-size: 18px;
      color: #0f172a;
      line-height: 1.2;
    }

    .party-roster li span {
      font-size: 14px;
      color: #475569;
      line-height: 1.35;
    }

    .section-title { border-bottom: 1px solid var(--line); background: var(--surface-muted); }

    .section-title.tight {
      padding-top: 12px;
      padding-bottom: 10px;
    }

    .chunk-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .chunk-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chunk-label {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 7px;
    }

    .overview-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .overview-background {
      min-height: 0;
    }

    .overview-bottom {
      margin-top: 2px;
    }

    .overview-grid {
      display: grid;
      grid-template-columns: 1fr;
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

    .rich-copy p {
      color: var(--ink-soft);
      line-height: 1.6;
      margin-bottom: 8px;
    }

    .rich-copy p:last-child { margin-bottom: 0; }

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

    .plot-list.tight li {
      margin-bottom: 5px;
      gap: 6px;
    }

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

    .panel-list {
      margin: 0;
      padding: 0 0 0 18px;
      color: var(--ink-soft);
      line-height: 1.5;
    }

    .panel-list li {
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .panel-list li:last-child { margin-bottom: 0; }

    .character-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .villain-hero {
      display: grid;
      grid-template-columns: 40% 1fr;
      gap: 12px;
      align-items: stretch;
    }

    .villain-banner {
      width: 100%;
      height: 260px;
      background: #0f172a;
      overflow: hidden;
      border-bottom: 1px solid var(--line);
    }

    .villain-banner img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }

    .villain-cover {
      position: relative;
      width: 100%;
      height: 300px;
      overflow: hidden;
      border-bottom: 1px solid var(--line);
      background: #0f172a;
    }

    .villain-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }

    .villain-cover::after {
      content: "";
      position: absolute;
      inset: auto 0 0 0;
      height: 56%;
      background: linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.88) 70%, rgba(15,23,42,0.98) 100%);
      pointer-events: none;
      z-index: 1;
    }

    .villain-overlay {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 14px;
      color: #f8fafc;
      z-index: 2;
      font-size: 12px;
      line-height: 1.45;
      text-shadow: 0 2px 8px rgba(0,0,0,.9);
    }

    .villain-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

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

    .villain-main .panel,
    .villain-main .two-col,
    .villain-main .villain-meta {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    .villain-profile {
      margin-bottom: 10px;
      color: var(--ink-soft);
      line-height: 1.55;
    }

    .villain-one-page {
      font-size: 11px;
      line-height: 1.35;
    }

    .villain-one-page .section-title h2 {
      font-size: 24px;
      line-height: 1.1;
    }

    .villain-one-page .sheet-pad {
      padding-top: 12px;
      padding-bottom: 12px;
    }

    .villain-one-page .villain-hero {
      grid-template-columns: 36% 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }

    .villain-one-page .villain-media {
      min-height: 56mm;
      max-height: 64mm;
    }

    .villain-one-page .meta-card {
      padding: 5px 8px;
      font-size: 10px;
    }

    .villain-one-page .panel {
      padding: 8px;
      border-radius: 10px;
    }

    .villain-one-page .panel h4 {
      margin-bottom: 6px;
      font-size: 11px;
    }

    .villain-one-page .panel-list {
      font-size: 11px;
      line-height: 1.3;
      padding-left: 15px;
    }

    .villain-one-page .panel-list li {
      margin-bottom: 4px;
    }

    .rewards-split {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
    }

    .rewards-copy {
      padding: 12px;
    }

    .rewards-media {
      min-height: 58mm;
      background: #0f172a;
      overflow: hidden;
    }

    .rewards-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }

    .rewards-block {
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      margin-top: 10px;
    }

    .rewards-cover-image {
      width: 100%;
      height: 300px;
      object-fit: cover;
      object-position: center;
      display: block;
      border-bottom: 1px solid var(--line);
    }

    .rewards-text {
      padding: 15px;
    }

    .character-main {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .character-panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .villain-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
      margin-bottom: 10px;
    }

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

    .keep-together {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

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
        margin: 9mm;
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
        font-size: 12.5px;
        line-height: 1.5;
      }

      .cover-page,
      .overview-page,
      .factions-page,
      .villain-page,
      .party-page {
        font-size: 14px;
        line-height: 1.56;
      }

      .overview-page {
        font-size: 16.5px;
        line-height: 1.52;
      }

      .factions-page {
        font-size: 15px;
        line-height: 1.62;
      }

      .doc {
        max-width: none;
        width: 100%;
        margin: 0;
        padding: 0;
      }

      h1 { font-size: 36px; }
      h2 { font-size: 26px; }
      .lead { font-size: 14px; line-height: 1.5; }

      .sheet {
        margin: 0 0 7mm 0;
        box-shadow: none;
        border-radius: 10px;
        border-color: #d1d5db;
      }

      .sheet-pad,
      .section-title,
      .overview-grid,
      .character-main,
      .villain-main { padding: 16px; }

      .panel { padding: 13px; border-radius: 10px; }
      .engine-tag { font-size: 9px; padding: 4px 8px; }
      .meta-grid { margin-top: 11px; gap: 9px; }
      .meta-card { font-size: 12px; padding: 8px 11px; }

      .chunk-label {
        font-size: 12px;
        margin-bottom: 9px;
      }

      .overview-page .chunk-label {
        font-size: 14px;
      }

      .overview-page .rich-copy p,
      .overview-page .plot-list li {
        font-size: 14.5px;
        line-height: 1.46;
      }

      .factions-page .chunk-label,
      .factions-page .panel h4 {
        font-size: 13px;
      }

      .factions-page .rich-copy p,
      .factions-page .panel-list li,
      .factions-page .chip {
        font-size: 15px;
        line-height: 1.6;
      }

      .cover-page .sheet-pad {
        gap: 18px;
        padding-top: 28px;
        padding-bottom: 28px;
      }

      .cover-image {
        height: 104mm;
        max-height: none;
      }

      .party-image {
        height: 100mm;
      }

      .party-full {
        min-height: 268mm;
      }

      .party-stage {
        height: 176mm;
        padding: 0;
      }

      .party-footer {
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        padding: 14px 16px 16px;
      }

      .party-attrs {
        gap: 10px;
      }

      .party-attr {
        padding: 10px 12px;
      }

      .party-attr strong {
        font-size: 11px;
      }

      .party-attr span {
        font-size: 16px;
      }

      .party-roster {
        padding: 12px 14px;
      }

      .party-roster h4 {
        font-size: 11px;
      }

      .party-roster li strong {
        font-size: 16px;
      }

      .party-roster li span {
        font-size: 13px;
      }

      .rewards-media {
        min-height: 76mm;
      }

      .rewards-cover-image {
        height: 86mm;
      }

      .rewards-copy {
        padding: 15px;
      }

      .villain-hero,
      .character-grid,
      .two-col {
        grid-template-columns: 1fr 1fr;
      }

      .chunk-grid,
      .rewards-split {
        grid-template-columns: 1fr 1fr;
      }

      .character-panels {
        grid-template-columns: 1fr 1fr;
      }

      .overview-grid {
        grid-template-columns: 1fr;
      }

      .villain-media,
      .portrait-wrap { min-height: 74mm; }

      .villain-banner {
        height: 60mm;
      }

      .villain-cover {
        height: 74mm;
      }

      .villain-overlay {
        left: 12px;
        right: 12px;
        bottom: 10px;
        font-size: 13px;
        line-height: 1.46;
      }

      .portrait-caption { left: 10px; right: 10px; bottom: 8px; }
      .portrait-caption h3 { font-size: 20px; }
      .portrait-caption p { font-size: 10px; }

      .stats-grid { gap: 7px; }
      .stat { padding: 7px 8px; }
      .stat strong { font-size: 16px; }

      .ability-grid { gap: 7px; }
      .ability { padding: 6px; }

      .villain-meta { grid-template-columns: repeat(3, minmax(0, 1fr)); }

      img {
        max-width: 100%;
        height: auto;
      }

      .villain-one-page {
        font-size: 14.4px;
        line-height: 1.5;
      }

      .villain-one-page .sheet-pad {
        padding-top: 10px;
        padding-bottom: 10px;
      }

      .villain-one-page .panel {
        padding: 8px;
      }

      .villain-one-page .villain-media {
        min-height: 52mm;
        max-height: 58mm;
      }

      .villain-one-page .panel-list {
        font-size: 13.8px;
      }

      .villain-one-page .panel h4 {
        font-size: 13px;
      }

      .lead-plain {
        font-size: 14px;
        line-height: 1.54;
      }

      .cover-page .lead-plain {
        font-size: 15px;
        line-height: 1.62;
      }

      .dossier-heading {
        font-size: 37px;
      }

      .rich-copy p,
      .panel-list li,
      .plot-list li {
        font-size: 12px;
      }

      .character-sheet {
        font-size: 12.5px;
        line-height: 1.46;
      }

      .character-sheet .rich-copy p,
      .character-sheet .panel-list li,
      .character-sheet .plot-list li {
        font-size: 12px;
      }

      .character-sheet h2 {
        font-size: 26px;
      }

      .character-sheet .chunk-label,
      .character-sheet .panel h4 {
        font-size: 11px;
      }

      .cover-page.cover-dense-1 .lead-plain {
        font-size: 13px;
        line-height: 1.48;
      }

      .cover-page.cover-dense-2 .lead-plain {
        font-size: 12px;
        line-height: 1.42;
      }

      .overview-page.overview-dense-1 .chunk-label {
        font-size: 13px;
      }

      .overview-page.overview-dense-1 .rich-copy p,
      .overview-page.overview-dense-1 .plot-list li {
        font-size: 13px;
        line-height: 1.38;
      }

      .overview-page.overview-dense-2 .chunk-label {
        font-size: 12px;
      }

      .overview-page.overview-dense-2 .rich-copy p,
      .overview-page.overview-dense-2 .plot-list li {
        font-size: 12px;
        line-height: 1.32;
      }

      .factions-page.factions-dense-1 .rich-copy p,
      .factions-page.factions-dense-1 .panel-list li,
      .factions-page.factions-dense-1 .chip {
        font-size: 13px;
        line-height: 1.42;
      }

      .factions-page.factions-dense-2 .rich-copy p,
      .factions-page.factions-dense-2 .panel-list li,
      .factions-page.factions-dense-2 .chip {
        font-size: 12px;
        line-height: 1.32;
      }

      .villain-page.villain-dense-1 .villain-one-page {
        font-size: 12.7px;
      }

      .villain-page.villain-dense-1 .villain-one-page .panel-list {
        font-size: 12px;
      }

      .villain-page.villain-dense-2 .villain-one-page {
        font-size: 11.8px;
        line-height: 1.35;
      }

      .villain-page.villain-dense-2 .villain-one-page .panel-list {
        font-size: 11px;
      }

      .party-page.party-dense-1 .party-attr span,
      .party-page.party-dense-1 .party-roster li strong {
        font-size: 14px;
      }

      .party-page.party-dense-1 .party-roster li span {
        font-size: 12px;
      }

      .party-page.party-dense-2 .party-footer {
        padding: 12px 14px 14px;
        gap: 10px;
      }

      .party-page.party-dense-2 .party-attr span,
      .party-page.party-dense-2 .party-roster li strong {
        font-size: 13px;
      }

      .party-page.party-dense-2 .party-roster li span {
        font-size: 11px;
      }

      .character-sheet.character-dense-1 .rich-copy p,
      .character-sheet.character-dense-1 .panel-list li,
      .character-sheet.character-dense-1 .plot-list li {
        font-size: 11.5px;
        line-height: 1.34;
      }

      .character-sheet.character-dense-1 h2 {
        font-size: 24px;
      }

      .character-sheet.character-dense-2 {
        font-size: 11.2px;
        line-height: 1.32;
      }

      .character-sheet.character-dense-2 .rich-copy p,
      .character-sheet.character-dense-2 .panel-list li,
      .character-sheet.character-dense-2 .plot-list li {
        font-size: 10.8px;
      }

      .character-sheet.character-dense-2 h2 {
        font-size: 22px;
      }

      .character-sheet.character-dense-2 .panel {
        padding: 9px;
      }
    }
  </style>
</head>
<body>
  <main class="doc">
    <section class="sheet card-surface cover-page ${coverDensity}">
      ${coverImage ? `<img class="cover-image" src="${coverImage}" alt="Campaign Cover" />` : ""}
      <div class="sheet-pad">
        <h2 class="dossier-heading">Campaign Dossier</h2>
        <h1>${title}</h1>
        <div class="lead-plain">${toParagraphsHtml(narrative?.description || campaignPlan?.core_conflict || description)}</div>
      </div>
    </section>

    <section class="sheet page-break card-surface overview-page ${overviewDensity}">
      <div class="section-title tight"><h2>Campaign Overview</h2></div>
      <div class="sheet-pad overview-rows">
        <div class="panel overview-background">
          <div class="chunk-label">01. Background Lore</div>
          <div class="rich-copy">${toParagraphsHtml(narrative?.background)}</div>
        </div>
        <div class="two-col overview-bottom">
          <div class="panel">
            <div class="chunk-label">02. Core Conflict</div>
            <div class="rich-copy">${toParagraphsHtml(campaignPlan?.core_conflict)}</div>
          </div>
          <div class="panel">
            <div class="chunk-label">03. Plot Outline</div>
            ${plotPoints.length
      ? `<ol class="plot-list tight">${plotPoints.map((point: string, idx: number) => `<li><span class="num">${String(idx + 1).padStart(2, "0")}</span><span>${text(point)}</span></li>`).join("")}</ol>`
      : `<p>—</p>`}
          </div>
        </div>
      </div>
    </section>

    ${(factions.length || locations.length) ? `
      <section class="sheet page-break card-surface keep-together factions-page ${factionsDensity}">
        <div class="section-title tight"><h2>Factions & Key Locations</h2></div>
        <div class="sheet-pad">
          <div class="two-col">
            <div class="panel">
              <h4>Factions</h4>
              <div class="chip-list">
                ${factions.length ? factions.map((f: string) => `<span class="chip">${text(f.split(":")[0] || f)}</span>`).join("") : `<span class="chip">—</span>`}
              </div>
            </div>
            <div class="panel">
              <h4>Key Locations</h4>
              <div class="chip-list">
                ${locations.length ? locations.map((l: string) => `<span class="chip">${text(l.split(":")[0] || l)}</span>`).join("") : `<span class="chip">—</span>`}
              </div>
            </div>
          </div>
          <div class="rewards-block">
            ${macguffinImage ? `<img class="rewards-cover-image" src="${macguffinImage}" alt="Artifact" />` : ""}
            <div class="rewards-text">
              <div class="chunk-label" style="margin-bottom:8px;">Rewards & Hooks</div>
              <div class="rich-copy">${toParagraphsHtml(narrative?.rewards)}</div>
            </div>
          </div>
        </div>
      </section>
    ` : ""}

    ${campaignPlan?.villain_statblock ? `
      <section class="sheet page-break card-surface villain-one-page keep-together villain-page ${villainDensity}">
        <div class="section-title tight"><p class="kicker">Primary Antagonist</p><h2>${villainName}</h2></div>
        <div class="villain-cover">
          ${villainImage ? `<img src="${villainImage}" alt="Villain Portrait" />` : `<div class="placeholder">No villain image</div>`}
          <div class="villain-overlay">${villainProfile}</div>
        </div>
        <div class="sheet-pad">
          <div class="villain-content">
            <div class="villain-main">
              <div class="villain-meta">
                <div class="meta-card"><strong>HP</strong> ${text(campaignPlan?.villain_statblock?.hp)}</div>
                <div class="meta-card"><strong>AC</strong> ${text(campaignPlan?.villain_statblock?.ac)}</div>
                <div class="meta-card"><strong>Threat</strong> ${difficulty}</div>
              </div>
              <div class="panel">
                <h4>Quote</h4>
                <div class="rich-copy">${toParagraphsHtml(campaignPlan?.villain_statblock?.flavor_quote)}</div>
              </div>
            </div>
            <div class="two-col">
              <div class="panel">
                <h4>Appearance</h4>
                <div class="rich-copy">${toParagraphsHtml(campaignPlan?.villain_statblock?.physical_description)}</div>
              </div>
              <div class="panel">
                <h4>Attacks</h4>
                <ul class="panel-list">${toBulletListHtml(campaignPlan?.villain_statblock?.attacks)}</ul>
              </div>
            </div>
            <div class="panel">
              <h4>Special Abilities</h4>
              <ul class="panel-list">${toBulletListHtml(campaignPlan?.villain_statblock?.special_abilities)}</ul>
            </div>
          </div>
        </div>
      </section>
    ` : ""}

    ${groupImage ? `
      <section class="sheet page-break card-surface party-page ${partyDensity}">
        <div class="section-title tight"><h2>Adventuring Party</h2></div>
        <div class="party-full">
          <div class="party-stage">
            <img class="party-image" src="${groupImage}" alt="Party Portrait" />
          </div>
          <div class="party-footer">
            <div class="party-attrs">
              <div class="party-attr"><strong>Party</strong><span>${text(partyDetails?.party_name)}</span></div>
              <div class="party-attr"><strong>Members</strong><span>${characters.length || 0}</span></div>
              <div class="party-attr"><strong>Terrain</strong><span>${terrain}</span></div>
              <div class="party-attr"><strong>Difficulty</strong><span>${difficulty}</span></div>
            </div>
            <div class="party-roster">
              <h4>Party Roster</h4>
              <ul>
                ${partyRoster || "<li><strong>—</strong><span>No members available</span></li>"}
              </ul>
            </div>
          </div>
        </div>
      </section>
    ` : ""}

    ${characterSections}
  </main>
</body>
</html>`;
}
