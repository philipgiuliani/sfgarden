---
name: sfgarden
description: Track and manage Square Foot Garden activities — planting, harvesting, seed starting, notes, and statistics. Uses the SFGarden MCP server's execute_sql tool to run SQL queries against a Supabase database with RLS. Visualizes gardens as emoji grids, provides proactive seedling nudges, and generates yield statistics.
---

# Square Foot Garden Tracker

Use the **SFGarden MCP server's `execute_sql` tool** for all database operations. The MCP server's instructions contain the full database schema, coordinate system, CTE write patterns, and key rules.

## Language

Respond in the same language the user writes in. The user typically writes in German. Use German plant names when the user provides them. Example: "Tomaten", "Karotten", "Salat".

## Emoji Grid Visualization

When asked to show a garden, query active plantings and render an emoji grid:

**Plant → Emoji mapping** (fallback: 🌱):

| Plant (DE/EN) | Emoji |
|---|---|
| Tomaten / Tomatoes | 🍅 |
| Karotten / Möhren / Carrots | 🥕 |
| Salat / Lettuce | 🥗 |
| Gurken / Cucumbers | 🥒 |
| Paprika / Bell pepper | 🫑 |
| Zucchini | 🟢 |
| Basilikum / Basil | 🌿 |
| Bohnen / Beans | 🫘 |
| Erbsen / Peas | 🟡 |
| Kohl / Cabbage | 🥦 |
| Zwiebeln / Onions | 🧅 |
| Knoblauch / Garlic | 🧄 |
| Kürbis / Pumpkin | 🎃 |
| Erdbeeren / Strawberries | 🍓 |
| Spinat / Spinach | 🍃 |
| Radieschen / Radish | 🌸 |
| Sellerie / Celery | 🌾 |

Format (Markdown-Tabelle mit Koordinaten):
```
🌱 Hochbeet N (4×7 = 28 Felder)

|   | A            | B            | C            | D          |
|---|--------------|--------------|--------------|------------|
| 1 | 🍅 Tomaten   | 🥕 Karotten  |              | 🥗 Salat   |
| 2 | 🍅 Tomaten   | 🥕 Karotten  | 🟢 Zucchini  | 🥗 Salat   |
| 3 |              |              |              |            |
| … |              |              |              |            |

📊 8/28 Felder belegt · 6 Kulturen · letzte Pflanzung vor 2 Tagen
```

Leere Felder bleiben leer (kein Platzhaltertext).

## Proactive Overview

At the start of garden-related chats, query active plantings and seedlings to present a structured overview:

```sql
SELECT s.*, CURRENT_DATE - s.phase_changed_at AS days_in_phase
FROM seedlings s
WHERE s.phase NOT IN ('transplanted', 'failed')
ORDER BY s.sown_at DESC
```

Flag overdue seedlings using expected phase durations:
| Phase transition | Typical | Warn after |
|---|---|---|
| sown → germinated | 5–14 days | 10 days |
| germinated → true_leaves | 14–28 days | 21 days |
| true_leaves → hardening | 14–35 days | 30 days |
| hardening → transplanted | 7–14 days | 14 days |

Only show the ⚠️ section if something is actually overdue.

## Best Practices

1. **Be conversational**: Accept natural language, including German
2. **Confirm before writing**: Show what will be recorded, then insert
3. **Smart defaults**: Today's date if not specified, 'active' for new plantings
4. **Validate inputs**: Check garden IDs exist, coordinates are in valid range
5. **Warn on conflicts**: Alert if a square already has an active planting
6. **Suggest follow-ups**: After recording a pest note, ask about remediation measures

For detailed workflows (seedling lifecycle, harvesting, notes, statistics), see [workflows.md](./references/workflows.md).
