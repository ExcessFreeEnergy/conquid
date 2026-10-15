# Caesar's *De Bello Gallico* Cumulative Vocabulary Engine

This project builds an incremental, deduplicated dictionary and vocabulary database for reading Julius Caesar's *Commentarii de Bello Gallico* (Books 1–8).

## Learning Strategy

Instead of trying to memorize an arbitrary frequency list, this dataset structures vocabulary by **order of reading progression**:
1. **Book 1**: Memorize the words encountered in Book 1 in order of appearance.
2. **Book 2**: Only memorize the **new unique words** in Book 2 that never appeared in Book 1.
3. **Book 3**: Only memorize the **new unique words** not seen in Books 1 or 2, and so on through Book 8.

All conjugated verbs, declined nouns, adjectives, and pronouns are automatically reduced to their canonical dictionary headword (lemma). Once a headword is introduced, all future inflections of that word across all books are filtered out.

---

## Vocabulary Progression Summary

Across all 8 books (**53,676 total words**), there are **3,290 unique dictionary headwords**.

| Book | Running Words (Tokens) | New Unique Headwords to Memorize | Cumulative Vocabulary | % of Total Lexicon |
| :--- | :---: | :---: | :---: | :---: |
| **Book 1** | 8,240 | **1,354** | 1,354 | 41.2% |
| **Book 2** | 4,226 | **324** | 1,678 | 51.0% |
| **Book 3** | 3,663 | **254** | 1,932 | 58.7% |
| **Book 4** | 4,571 | **208** | 2,140 | 65.0% |
| **Book 5** | 7,557 | **349** | 2,489 | 75.7% |
| **Book 6** | 5,603 | **250** | 2,739 | 83.3% |
| **Book 7** | 11,684 | **369** | 3,108 | 94.5% |
| **Book 8** | 8,132 | **182** | 3,290 | 100.0% |
| **Total** | **53,676** | **3,290** | **3,290** | **100.0%** |

*Key takeaway: Mastering Book 1 gives you immediate mastery of over 41% of Caesar's entire vocabulary. Each subsequent book requires only ~180 to 370 new words.*

---

## Output Data Files

All generated datasets are located in [`data/output/`](file:///home/gauss/code/latin/data/output):

* **[`book_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_1_vocab.json) ... [`book_8_vocab.json`](file:///home/gauss/code/latin/data/output/book_8_vocab.json)**:
  Per-book lists of new unique words in exact reading order.
* **[`gallic_wars_full_vocab.json`](file:///home/gauss/code/latin/data/output/gallic_wars_full_vocab.json)**:
  Master cumulative vocabulary list (3,290 entries) with full metadata.
* **[`gallic_wars_anki.csv`](file:///home/gauss/code/latin/data/output/gallic_wars_anki.csv)**:
  Spaced-repetition deck ready to import into Anki or any flashcard app.

### Entry Schema

Each dictionary entry includes:
```json
{
  "rank": 4,
  "book_rank": 4,
  "lemma": "divido",
  "headword": "dīvidō, -ere, dīvīsī, dīvīsum",
  "pos": "Verb (3rd)",
  "definition": "divide, separate, distribute, distinguish",
  "first_appearance": {
    "book": 1,
    "chapter": 1,
    "surface_form": "divisa"
  },
  "book_frequency": 6,
  "total_frequency": 24
}
```

---

## Project Structure

```
latin/
├── .gitignore
├── requirements.txt
├── README.md
├── data/
│   ├── raw/                 # Downloaded raw HTML pages (The Latin Library)
│   ├── texts/               # Cleaned JSON chapters per book
│   └── output/              # Cumulative vocabulary JSONs, CSVs, summary report
└── src/
    ├── __init__.py
    ├── scraper.py           # Scrapes Books 1-8 from thelatinlibrary.com
    ├── tokenizer.py         # Normalization, Latin enclitic splitting (-que, -ve, -cum)
    ├── lemmatizer.py        # PyCollatinus wrapper + disambiguation + proper nouns
    ├── dictionary.py        # Morphology & English definitions (Whitaker's Words + Collatinus)
    └── pipeline.py          # Runs the 2-pass cumulative vocabulary extraction
```

---

## Reproducing the Extraction

```bash
# Set up virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Download texts from The Latin Library
python3 src/scraper.py

# Run the extraction pipeline
python3 src/pipeline.py
```
