# Conquid Latin vocabulary trainer

You can open the [Conquid web application](https://excessfreeenergy.github.io/conquid/) in your browser.

Conquid is a vocabulary trainer for Julius Caesar's *Commentarii de Bello Gallico*. The application works offline as a progressive web application.

## Vocabulary curriculum

The curriculum organizes words by their appearance in the text instead of frequency lists.

You learn words in three steps:
1. In Book 1, you learn words in the order that Caesar uses them.
2. In Book 2, you learn only the words that did not appear in Book 1.
3. In Book 3 through Book 8, you learn only the words that did not appear in earlier books.

The pipeline reduces verbs, nouns, adjectives, and pronouns to their dictionary headwords. When a headword appears in the text, the pipeline records the word. The pipeline then removes all future inflections of that headword from later stages.

## Stage breakdown across all eight books

Books 1, 2, 5, and 7 each contain more than 300 new words. To keep study sessions manageable, the curriculum divides these books into narrative subsections. Each stage requires you to learn between 144 and 264 new words. The average stage size is 205 words.

| Stage | Chapters | Narrative episode | Words read | New words | Cumulative words | Percentage unlocked |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Book 1 Subsection 1 | Chapters 1 to 4 | Geography of Gaul and the Orgetorix conspiracy | 595 words | 261 | 261 | 7.9% |
| Book 1 Subsection 2 | Chapters 5 to 11 | Helvetian migration and defense of the Rhone | 887 words | 226 | 487 | 14.8% |
| Book 1 Subsection 3 | Chapters 12 to 19 | Defeat of the Tigurini and treason of Dumnorix | 1,283 words | 264 | 751 | 22.8% |
| Book 1 Subsection 4 | Chapters 20 to 29 | Battle of Bibracte and Helvetian surrender | 1,263 words | 203 | 954 | 29.0% |
| Book 1 Subsection 5 | Chapters 30 to 40 | German threat and mutiny at Vesontio | 2,119 words | 220 | 1,174 | 35.7% |
| Book 1 Subsection 6 | Chapters 41 to 54 | Parley and defeat of Ariovistus | 2,093 words | 180 | 1,354 | 41.2% |
| Book 2 Subsection 1 | Chapters 1 to 15 | Belgic confederacy and submission of western Belgae | 1,935 words | 144 | 1,498 | 45.5% |
| Book 2 Subsection 2 | Chapters 16 to 35 | Battle of the Sabis and siege of the Aduatuci | 2,291 words | 180 | 1,678 | 51.0% |
| Book 3 | Chapters 1 to 29 | Alpine campaign, Venetian naval war, and Aquitania | 3,663 words | 254 | 1,932 | 58.7% |
| Book 4 | Chapters 1 to 38 | German incursion, first Rhine bridge, and first British expedition | 4,571 words | 208 | 2,140 | 65.0% |
| Book 5 Subsection 1 | Chapters 1 to 23 | Second British expedition and customs of the Britons | 2,950 words | 152 | 2,292 | 69.7% |
| Book 5 Subsection 2 | Chapters 24 to 58 | Ambiorix revolt, disaster at Atuatuca, and siege of Cicero | 4,607 words | 197 | 2,489 | 75.7% |
| Book 6 | Chapters 1 to 44 | Second Rhine expedition and customs of the Gauls and Germans | 5,603 words | 250 | 2,739 | 83.3% |
| Book 7 Subsection 1 | Chapters 1 to 40 | Outbreak of the revolt and siege of Avaricum | 5,291 words | 188 | 2,927 | 89.0% |
| Book 7 Subsection 2 | Chapters 41 to 90 | Assault on Gergovia and siege of Alesia | 6,393 words | 181 | 3,108 | 94.5% |
| Book 8 | Chapters 1 to 70 | Hirtius supplement, final pacification, and siege of Uxellodunum | 8,132 words | 182 | 3,290 | 100.0% |
| Total | All eight books | Complete text of De Bello Gallico | 53,676 words | 3,290 | 3,290 | 100.0% |

## Generated data files

The extraction pipeline writes output files to the `data/output/` directory.

The directory contains four groups of data files:
* Stage vocabulary files: [`book_1_subsection_1_vocab.json`](data/output/book_1_subsection_1_vocab.json) through [`book_7_subsection_2_vocab.json`](data/output/book_7_subsection_2_vocab.json).
* Book vocabulary files: [`book_1_vocab.json`](data/output/book_1_vocab.json) through [`book_8_vocab.json`](data/output/book_8_vocab.json).
* Master dictionary file: [`gallic_wars_full_vocab.json`](data/output/gallic_wars_full_vocab.json). This file contains 3,290 canonical entries with definitions, citations, and stage tags.
* Flashcard file: [`gallic_wars_anki.csv`](data/output/gallic_wars_anki.csv). This file imports into Anki with tags for each of the 16 stages.

## Dictionary entry structure

Every entry in `data/output/gallic_wars_full_vocab.json` matches this structure:

```json
{
	"rank": 4,
	"book": 1,
	"book_rank": 4,
	"stage": "Book 1 Subsection 1",
	"stage_id": "1.1",
	"chunk": 1,
	"chunk_title": "Geography of Gaul & The Orgetorix Conspiracy",
	"chunk_rank": 4,
	"lemma": "divido",
	"headword": "dīvidō, -ere, dīvīsī, dīvīsum",
	"pos": "Verb (3rd)",
	"definition": "divide, separate, distribute, distinguish",
	"first_appearance": {
		"book": 1,
		"chapter": 1,
		"surface_form": "divisa"
	},
	"book_frequency": 7,
	"total_frequency": 19
}
```

## Repository structure

To print the directory tree, run this command:

```bash
tree -L 2 -I "__pycache__|.venv|.git"
```

The repository structure matches this tree:

```
.
├── app.js			# Web application logic and practice modes
├── data
│	├── DICTLINE.GEN	# Whitaker's Words morphology database
│	├── output		# Generated vocabulary JSON and CSV files
│	├── raw			# Source HTML files from The Latin Library
│	├── texts		# Cleaned text chapters for Books 1 to 8
│	├── words.js		# Vocabulary data formatted for browser use
│	└── words.json		# Master vocabulary data in JSON format
├── favicon.png			# Application browser icon
├── icons
│	├── icon-192.png	# Application icon for mobile displays
│	├── icon-512.png	# High-resolution application icon
│	└── logo.png		# Application logo
├── index.html			# Main interface for the web application
├── manifest.json		# Web application manifest for offline installation
├── README.md			# Project documentation
├── requirements.txt		# Python package dependencies
├── src
│	├── dictionary.py	# Morphology lookups and definitions
│	├── lemmatizer.py	# Lemmatization and disambiguation
│	├── pipeline.py		# Extraction pipeline for Books 1 to 8
│	├── scraper.py		# Text scraper for The Latin Library
│	└── tokenizer.py	# Word tokenization and enclitic separation
├── style.css			# Stylesheet for the web application
└── sw.js			# Service worker for offline asset cache
```

## Extract the vocabulary

To download the source texts and generate the vocabulary files, run these commands:

```bash
# Set up a virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Download texts from The Latin Library
python3 src/scraper.py

# Run the vocabulary extraction pipeline
python3 src/pipeline.py
```

## Run the web application

To test the application locally, start a local HTTP server in the repository root:

```bash
python3 -m http.server 8000
```

To open the application, visit `http://localhost:8000` in your browser.
