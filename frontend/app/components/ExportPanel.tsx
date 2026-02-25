
interface ExportPanelProps {
    campaignPlan: any;
    partyDetails: any;
    narrative: any;
}

export default function ExportPanel({ campaignPlan, partyDetails, narrative }: ExportPanelProps) {

    const generateMarkdown = () => {
        let md = "";

        if (narrative) {
            md += `# ${narrative.title || "Epic Adventure"}\n\n`;
            md += `> *"${narrative.description}"*\n\n`;
            md += `## Background Lore\n${narrative.background}\n\n`;
            md += `## Rewards\n${narrative.rewards}\n\n`;
            md += `---\n\n`;
        }

        if (campaignPlan) {
            md += `## 🗺️ Campaign Details\n\n`;
            md += `**Primary Antagonist:** ${campaignPlan.primary_antagonist}\n\n`;
            md += `**Core Conflict:** ${campaignPlan.core_conflict}\n\n`;
            md += `### Key Locations\n`;
            campaignPlan.key_locations?.forEach((loc: string) => {
                md += `- ${loc}\n`;
            });
            md += `\n---\n\n`;

            if (campaignPlan.villain_statblock) {
                const v = campaignPlan.villain_statblock;
                md += `## 👹 The Villain: ${campaignPlan.primary_antagonist}\n\n`;
                md += `**HP:** ${v.hp || "?"} | **AC:** ${v.ac || "?"}\n\n`;
                if (v.flavor_quote) md += `> *"${v.flavor_quote}"*\n\n`;
                md += `${v.physical_description || ""}\n\n`;

                md += `### Attacks\n`;
                v.attacks?.forEach((atk: string) => md += `- ⚔️ ${atk}\n`);
                md += `### Special Abilities\n`;
                v.special_abilities?.forEach((ab: string) => md += `- ✨ ${ab}\n`);
                md += `\n---\n\n`;
            }
        }

        if (partyDetails && partyDetails.characters) {
            md += `## 🛡️ The Party: ${partyDetails.party_name || "The Heroes"}\n\n`;

            partyDetails.characters.forEach((char: any) => {
                const charClass = char.class_name || char.class || "Adventurer";
                md += `### ${char.name}\n`;
                md += `*Level ${char.level || 1} ${char.race || "Unknown"} ${charClass}*\n\n`;
                md += `**Align:** ${char.alignment || "N"} | **HP:** ${char.hp || 10} | **AC:** ${char.ac || 10}\n\n`;

                if (char.flavor_quote) md += `> *"${char.flavor_quote}"*\n\n`;
                if (char.physical_description) md += `**Looks:** ${char.physical_description}\n\n`;
                if (char.backstory_hook) md += `**Hook:** ${char.backstory_hook}\n\n`;

                md += `#### Roleplay\n`;
                if (char.ideals) md += `- **Ideals:** ${char.ideals}\n`;
                if (char.bonds) md += `- **Bonds:** ${char.bonds}\n`;
                if (char.flaws) md += `- **Flaws:** ${char.flaws}\n`;
                if (char.personality_traits) {
                    const t = Array.isArray(char.personality_traits) ? char.personality_traits.join(", ") : char.personality_traits;
                    md += `- **Traits:** ${t}\n`;
                }

                md += `\n#### Mechanics\n`;
                if (char.skills) {
                    const s = Array.isArray(char.skills) ? char.skills.join(", ") : char.skills;
                    md += `- **Skills:** ${s}\n`;
                }
                if (char.inventory) {
                    const i = Array.isArray(char.inventory) ? char.inventory.join(", ") : char.inventory;
                    md += `- **Gear:** ${i}\n`;
                }
                md += `\n\n`;
            });
        }

        return md;
    };

    const handleExportMarkdown = () => {
        const markdownContent = generateMarkdown();
        const blob = new Blob([markdownContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${narrative?.title?.replace(/\s+/g, '_') || 'campaign'}_export.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        window.print();
    };

    if (!campaignPlan && !partyDetails && !narrative) return null;

    return (
        <div className="flex gap-4 p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl justify-center mt-8 print:hidden">
            <h3 className="text-slate-500 dark:text-zinc-400 font-bold self-center mr-4">Take It To The Table:</h3>
            <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-2 bg-rose-50 dark:bg-red-900/40 hover:bg-rose-100 dark:hover:bg-red-800 text-rose-600 dark:text-red-400 font-bold py-2 px-6 rounded-lg border border-rose-200 dark:border-red-800/50 transition-colors"
            >
                <span>💾</span> Download Markdown
            </button>

            <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-sky-50 dark:bg-sky-900/40 hover:bg-sky-100 dark:hover:bg-sky-800 text-sky-600 dark:text-sky-400 font-bold py-2 px-6 rounded-lg border border-sky-200 dark:border-sky-800/50 transition-colors"
            >
                <span>🖨️</span> Print to PDF
            </button>
        </div>
    );
}
