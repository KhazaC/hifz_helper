"""
Generate test data for the Quran Memorization Tracker.

Simulates someone memorizing 1/3 page per day for 1 year (365 days),
and revising as suggested every day with random quality ratings.

Rules:
- New memorization (< 21 days): revise daily
- Old memorization (>= 21 days): merged by page, revise every 14 days max
"""

import json
import random
from datetime import datetime, timedelta

random.seed(42)  # reproducible

# Load verse data
with open("public/data/verse_data.json") as f:
    verse_data = json.load(f)

# Build ordered list of pages with their verse boundaries
pages = []
for page_num in sorted(verse_data["pages"].keys(), key=int):
    pg = verse_data["pages"][page_num]
    verses = pg["verses"]
    if not verses:
        continue
    pages.append({
        "pageNum": int(page_num),
        "verses": verses,
        "first": verses[0],
        "last": verses[-1],
    })

# Split each page into 3 roughly equal chunks of verses
def split_page_into_thirds(page):
    verses = page["verses"]
    n = len(verses)
    if n == 0:
        return []
    # Split into 3 chunks
    chunks = []
    chunk_size = max(1, n // 3)
    for i in range(3):
        start_idx = i * chunk_size
        if i == 2:
            end_idx = n - 1  # last chunk gets remainder
        else:
            end_idx = min((i + 1) * chunk_size - 1, n - 1)
        if start_idx > n - 1:
            break
        first_v = verses[start_idx]
        last_v = verses[end_idx]
        chunks.append({
            "pageNum": page["pageNum"],
            "startSurah": first_v["surahNum"],
            "startVerse": str(first_v["verseNum"]),
            "endSurah": last_v["surahNum"],
            "endVerse": str(last_v["verseNum"]),
        })
    return chunks

# Build all thirds across all pages
all_thirds = []
for page in pages:
    thirds = split_page_into_thirds(page)
    all_thirds.extend(thirds)

print(f"Total page thirds available: {len(all_thirds)}")
print(f"Will use 365 of them (365 days)")

# Simulation parameters
START_DATE = datetime(2025, 3, 8)  # one year ago from March 8, 2026
NUM_DAYS = 365
NEW_PERIOD_DAYS = 21
MAX_INTERVAL_DAYS = 14

memorization_entries = []
revision_entries = []

# Track what's been memorized and when
memorized = []  # list of { entry, day_added }

# Track old-page revision schedule: page_num -> next_due_day
old_page_schedule = {}

def section_key(entry):
    return f"{entry['startSurah']}:{entry['startVerse']}-{entry['endSurah']}:{entry['endVerse']}"

def page_key_for_entry(entry):
    """For merged old entries, the page number is what matters."""
    return entry.get("pageNum")

for day in range(NUM_DAYS):
    current_date = START_DATE + timedelta(days=day)
    date_str = current_date.isoformat()
    ts = int(current_date.timestamp() * 1000)

    # 1) Add new memorization for the day
    if day < len(all_thirds):
        third = all_thirds[day]
        mem_entry = {
            "id": ts,
            "startSurah": third["startSurah"],
            "startVerse": third["startVerse"],
            "endSurah": third["endSurah"],
            "endVerse": third["endVerse"],
            "createdAt": date_str,
            "updatedAt": date_str,
        }
        memorization_entries.append(mem_entry)
        memorized.append({"entry": mem_entry, "day_added": day, "pageNum": third["pageNum"]})

    # 2) Revise new memorization (< 21 days old) — every day
    for m in memorized:
        age = day - m["day_added"]
        if 0 < age < NEW_PERIOD_DAYS:
            # Revise this new entry today
            quality = random.randint(1, 5)
            rev_entry = {
                "id": ts + random.randint(1, 99999),
                "startSurah": m["entry"]["startSurah"],
                "startVerse": m["entry"]["startVerse"],
                "endSurah": m["entry"]["endSurah"],
                "endVerse": m["entry"]["endVerse"],
                "quality": quality,
                "createdAt": date_str,
                "updatedAt": date_str,
            }
            revision_entries.append(rev_entry)

    # 3) Revise old memorization (>= 21 days old) — by page, every 14 days
    # Collect pages that have become "old"
    old_pages = {}  # pageNum -> page info (full page bounds)
    for m in memorized:
        age = day - m["day_added"]
        if age >= NEW_PERIOD_DAYS:
            pn = m["pageNum"]
            if pn not in old_pages:
                # Find full page bounds
                page = next((p for p in pages if p["pageNum"] == pn), None)
                if page:
                    old_pages[pn] = {
                        "pageNum": pn,
                        "startSurah": page["first"]["surahNum"],
                        "startVerse": str(page["first"]["verseNum"]),
                        "endSurah": page["last"]["surahNum"],
                        "endVerse": str(page["last"]["verseNum"]),
                    }

    for pn, page_info in old_pages.items():
        # Check if this page is due for revision
        if pn not in old_page_schedule:
            # First time old — due immediately
            old_page_schedule[pn] = day

        if day >= old_page_schedule[pn]:
            # Revise this page today
            quality = random.randint(1, 5)
            rev_entry = {
                "id": ts + pn * 1000 + random.randint(1, 999),
                "startSurah": page_info["startSurah"],
                "startVerse": page_info["startVerse"],
                "endSurah": page_info["endSurah"],
                "endVerse": page_info["endVerse"],
                "quality": quality,
                "createdAt": date_str,
                "updatedAt": date_str,
            }
            revision_entries.append(rev_entry)
            # Schedule next revision in 14 days
            old_page_schedule[pn] = day + MAX_INTERVAL_DAYS

# Summary
print(f"Memorization entries: {len(memorization_entries)}")
print(f"Revision entries: {len(revision_entries)}")
print(f"Date range: {START_DATE.strftime('%Y-%m-%d')} to {(START_DATE + timedelta(days=NUM_DAYS-1)).strftime('%Y-%m-%d')}")
print(f"Pages covered: {len(set(m['pageNum'] for m in memorized))}")

# Pages memorized (365 thirds ≈ 121-122 pages)
page_nums = sorted(set(m["pageNum"] for m in memorized))
print(f"Page range: {page_nums[0]} to {page_nums[-1]}")

# Write output
output = {
    "quran-memorization-entries": memorization_entries,
    "quran-revision-entries": revision_entries,
}

with open("public/data/test_data.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"\nWrote test_data.json ({len(memorization_entries)} memorization + {len(revision_entries)} revision entries)")
