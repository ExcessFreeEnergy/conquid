# Caesar's *De Bello Gallico* Cumulative Vocabulary Engine

This project builds an incremental, deduplicated dictionary and vocabulary database for reading Julius Caesar's *Commentarii de Bello Gallico* (Books 1–8).

## Learning Strategy

Instead of trying to memorize an arbitrary frequency list, this dataset structures vocabulary by **order of reading progression**:
1. **Book 1**: Memorize the words encountered in Book 1 in order of appearance.
2. **Book 2**: Only memorize the **new unique words** in Book 2 that never appeared in Book 1.
3. **Book 3**: Only memorize the **new unique words** not seen in Books 1 or 2, and so on through Book 8.

All conjugated verbs, declined nouns, adjectives, and pronouns are automatically reduced to their canonical dictionary headword (lemma). Once a headword is introduced, all future inflections of that word across all books are filtered out.

---

## Master 16-Stage Vocabulary Curriculum

To maintain a consistent, manageable cognitive load across the entire work, books with more than 300 new words (Books 1, 2, 5, and 7) have been divided into natural narrative subchunks. As a result, **every single learning stage requires memorizing between 144 and 264 new words** (~205 words on average):

| Stage | Chapters Covered | Episode / Historical Narrative | Text Read | New Words | Cumulative Vocab | % of Entire Work Unlocked |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Book 1 Chunk 1** | Ch 1–4 | Geography of Gaul & The Orgetorix Conspiracy | 595 words | **261** | 261 | 7.9% |
| **Book 1 Chunk 2** | Ch 5–11 | Helvetian Migration & Defense of the Rhone | 887 words | **226** | 487 | 14.8% |
| **Book 1 Chunk 3** | Ch 12–19 | Defeat of the Tigurini & Treason of Dumnorix | 1,283 words | **264** | 751 | 22.8% |
| **Book 1 Chunk 4** | Ch 20–29 | Battle of Bibracte & Helvetian Surrender | 1,263 words | **203** | 954 | 29.0% |
| **Book 1 Chunk 5** | Ch 30–40 | The German Threat & Mutiny at Vesontio | 2,119 words | **220** | 1,174 | 35.7% |
| **Book 1 Chunk 6** | Ch 41–54 | Parley & Decisive Defeat of Ariovistus | 2,093 words | **180** | 1,354 | 41.2% |
| **Book 2 Chunk 1** | Ch 1–15 | The Belgic Confederacy & Submission of Western Belgae | 1,935 words | **144** | 1,498 | 45.5% |
| **Book 2 Chunk 2** | Ch 16–35 | Battle of the Sabis (Nervii) & Siege of the Aduatuci | 2,291 words | **180** | 1,678 | 51.0% |
| **Book 3** | Ch 1–29 | Alpine Campaign, Venetian Naval War & Aquitania | 3,663 words | **254** | 1,932 | 58.7% |
| **Book 4** | Ch 1–38 | German Incursion, First Rhine Bridge & First British Expedition | 4,571 words | **208** | 2,140 | 65.0% |
| **Book 5 Chunk 1** | Ch 1–23 | Second British Expedition & Customs of the Britons | 2,950 words | **152** | 2,292 | 69.7% |
| **Book 5 Chunk 2** | Ch 24–58 | Ambiorix's Revolt, Disaster at Atuatuca & Siege of Cicero | 4,607 words | **197** | 2,489 | 75.7% |
| **Book 6** | Ch 1–44 | Second Rhine Crossing, Customs of the Gauls and Germans (Druids) | 5,603 words | **250** | 2,739 | 83.3% |
| **Book 7 Chunk 1** | Ch 1–40 | Outbreak of the Great Revolt & Siege of Avaricum | 5,291 words | **188** | 2,927 | 89.0% |
| **Book 7 Chunk 2** | Ch 41–90 | Assault on Gergovia & Epic Siege of Alesia | 6,393 words | **181** | 3,108 | 94.5% |
| **Book 8** | Ch 1–70 | Hirtius' Supplement: Final Pacification & Siege of Uxellodunum | 8,132 words | **182** | 3,290 | 100.0% |
| **Total** | **All 8 Books** | **Complete Commentarii de Bello Gallico** | **53,676 words** | **3,290** | **3,290** | **100.0%** |

---

## Output Data Files

All generated datasets are located in [`data/output/`](file:///home/gauss/code/latin/data/output):

* **Stage / Subchunk JSON Packs**:
  * [`book_1_chunk_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_1_chunk_1_vocab.json) ... [`book_1_chunk_6_vocab.json`](file:///home/gauss/code/latin/data/output/book_1_chunk_6_vocab.json)
  * [`book_2_chunk_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_2_chunk_1_vocab.json), [`book_2_chunk_2_vocab.json`](file:///home/gauss/code/latin/data/output/book_2_chunk_2_vocab.json)
  * [`book_5_chunk_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_5_chunk_1_vocab.json), [`book_5_chunk_2_vocab.json`](file:///home/gauss/code/latin/data/output/book_5_chunk_2_vocab.json)
  * [`book_7_chunk_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_7_chunk_1_vocab.json), [`book_7_chunk_2_vocab.json`](file:///home/gauss/code/latin/data/output/book_7_chunk_2_vocab.json)
* **Book-Level Aggregate JSON Files**:
  * [`book_1_vocab.json`](file:///home/gauss/code/latin/data/output/book_1_vocab.json) ... [`book_8_vocab.json`](file:///home/gauss/code/latin/data/output/book_8_vocab.json)
* **Master Cumulative Dictionary**:
  * [`gallic_wars_full_vocab.json`](file:///home/gauss/code/latin/data/output/gallic_wars_full_vocab.json): 3,290 canonical entries with stage tags, frequencies, definitions, and citations.
* **Anki Spaced-Repetition Deck**:
  * [`gallic_wars_anki.csv`](file:///home/gauss/code/latin/data/output/gallic_wars_anki.csv): Direct import into Anki with dedicated tags for all 16 learning stages.



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
