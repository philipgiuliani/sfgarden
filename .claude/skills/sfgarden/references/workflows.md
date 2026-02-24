# SFGarden Workflows

Detailed workflows for the Square Foot Garden Tracker skill. See [SKILL.md](./SKILL.md) for the core reference.

## Recording a Planting

```
User: "Gestern habe ich Karotten in A1, A2 und A3 gepflanzt"
```

1. Query the garden to verify it exists and coordinates are valid
2. Check for existing active plantings in those squares (warn if found)
3. Confirm with user what will be recorded
4. Insert one row per square:

```sql
WITH new_plantings AS (
  INSERT INTO plantings (garden_id, square, plant_name, variety, count, planted_at)
  VALUES
    ('...', 'A1', 'Karotten', 'Nantes', 16, '2026-02-22'),
    ('...', 'A2', 'Karotten', 'Nantes', 16, '2026-02-22'),
    ('...', 'A3', 'Karotten', 'Nantes', 16, '2026-02-22')
  RETURNING *
)
SELECT * FROM new_plantings
```

Ask for variety and count if not provided (optional).

## Seedling Lifecycle

Phases: sown → germinated → true_leaves → hardening → transplanted (or failed from any phase)

### Starting Seeds

```
User: "Ich habe heute 12 Tomaten-Zellen ausgesät, Sorte Tigerella"
```

```sql
WITH new_seedling AS (
  INSERT INTO seedlings (user_id, plant_name, variety, count, sown_at)
  VALUES (auth.uid(), 'Tomaten', 'Tigerella', 12, CURRENT_DATE)
  RETURNING *
)
SELECT * FROM new_seedling
```

### Advancing Phase

```
User: "Die Tomaten sind gekeimt!"
```

1. Find matching seedling by plant name + current phase
2. Update phase and phase_changed_at:

```sql
WITH updated AS (
  UPDATE seedlings
  SET phase = 'germinated', phase_changed_at = CURRENT_DATE
  WHERE id = '...' AND phase = 'sown'
  RETURNING *
)
SELECT * FROM updated
```

### Transplanting

When transplanting, create the planting first, then link the seedling:

```sql
-- Step 1: Create planting
WITH new_planting AS (
  INSERT INTO plantings (garden_id, square, plant_name, variety, count, planted_at)
  VALUES ('...', 'B3', 'Tomaten', 'Tigerella', 1, CURRENT_DATE)
  RETURNING *
)
SELECT * FROM new_planting
```

```sql
-- Step 2: Link seedling
WITH updated AS (
  UPDATE seedlings
  SET phase = 'transplanted', phase_changed_at = CURRENT_DATE, planting_id = '...'
  WHERE id = '...'
  RETURNING *
)
SELECT * FROM updated
```

Offer: "Soll ich auch gleich eine Pflanzung in Hochbeet X eintragen?"

## Recording Harvests

```
User: "Habe heute 200g Salat von B2 geerntet"
```

1. Find the active planting in that square
2. Insert harvest:

```sql
WITH new_harvest AS (
  INSERT INTO harvests (planting_id, harvested_at, amount, weight_grams)
  VALUES ('...', CURRENT_DATE, '200g Salat', 200)
  RETURNING *
)
SELECT * FROM new_harvest
```

3. Ask: "Soll diese Pflanzung als 'geerntet' markiert werden, oder erntest du noch weiter?"
4. If done, update planting status to 'harvested'

## Adding Notes

```
User: "Hochbeet H hat Blattläuse am Salat in B3"
```

Auto-categorize:
- "Schädling", "aphids", "Blattläuse", "pest" → 'issue'
- "Wetter", "weather", "frost" → 'observation'
- "gedüngt", "fertilized" → 'observation'
- "todo", "muss", "should" → 'task'
- Otherwise → 'general'

Link to specific square and planting when identifiable.

## Statistics Queries

### Yield Statistics
```sql
SELECT p.plant_name, p.variety,
       COUNT(h.id) AS harvest_count,
       SUM(h.weight_grams) AS total_grams,
       AVG(h.weight_grams) AS avg_grams
FROM plantings p
JOIN harvests h ON h.planting_id = p.id
GROUP BY p.plant_name, p.variety
ORDER BY total_grams DESC
```

### Growth Duration
```sql
SELECT p.plant_name, p.variety, p.planted_at,
       MIN(h.harvested_at) AS first_harvest,
       MIN(h.harvested_at) - p.planted_at AS days_to_harvest
FROM plantings p
JOIN harvests h ON h.planting_id = p.id
GROUP BY p.id, p.plant_name, p.variety, p.planted_at
ORDER BY days_to_harvest
```

### Current Garden Overview
```sql
SELECT p.garden_id, g.name, p.square, p.plant_name, p.variety,
       p.planted_at, p.status,
       COUNT(h.id) AS harvests_count
FROM plantings p
JOIN gardens g ON g.id = p.garden_id
LEFT JOIN harvests h ON h.planting_id = p.id
WHERE p.status = 'active'
GROUP BY p.id, p.garden_id, g.name, p.square, p.plant_name, p.variety, p.planted_at, p.status
ORDER BY p.garden_id, p.square
```

### Seedling Overview
```sql
SELECT plant_name, variety, count, phase,
       sown_at, phase_changed_at,
       CURRENT_DATE - phase_changed_at AS days_in_phase,
       CURRENT_DATE - sown_at AS total_days
FROM seedlings
WHERE phase NOT IN ('transplanted', 'failed')
ORDER BY sown_at DESC
```

## Example Interactions

### Planting
```
User: "Gestern habe ich Karotten in A1, A2 und A3 von Hochbeet Nord gepflanzt"
Claude: "Ich trage folgendes ein:
         • Karotten in Hochbeet Nord, Felder A1, A2 und A3 — 22.02.2026
         Welche Sorte? (Kann auch leer bleiben)"
User: "Nantes"
Claude: [Inserts 3 rows]
        "Eingetragen! 3 Pflanzungen angelegt."
```

### Harvest with Status Update
```
User: "Habe heute 200g Salat von H-B2 geerntet, hatte etwas Blattlausbefall"
Claude: [Finds planting, inserts harvest + note]
        "Eingetragen:
         🌿 Ernte: 200g Salat von B2
         📝 Notiz: Blattlausbefall

         Soll diese Pflanzung als 'geerntet' markiert werden, oder erntest du noch weiter?"
```

### Garden Layout
```
User: "Zeig mir Hochbeet N"
Claude: [Queries active plantings, renders markdown table]
        "🌱 Hochbeet N (4×7 = 28 Felder)

        |   | A          | B           | C           | D         |
        |---|------------|-------------|-------------|-----------|
        | 1 | 🍅 Tomaten | 🥕 Karotten |             | 🥗 Salat  |
        | … |            |             |             |           |

        📊 8/28 Felder belegt · 6 Kulturen"
```
