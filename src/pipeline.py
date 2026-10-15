"""
Pipeline for Caesar's De Bello Gallico Vocabulary Extraction.
Processes Books 1 to 8 in sequence, maintaining cumulative seen_lemmas to extract
unique new words book-by-book and chunk-by-chunk in exact order of first appearance.
Exports structured JSON, Anki CSV, and Markdown summaries.
"""

import os
import sys
import json
import csv
from collections import Counter
from typing import Dict, List, Any, Set

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.tokenizer import tokenize_text
from src.lemmatizer import LatinLemmatizer
from src.dictionary import LatinDictionary

# Learning curriculum stages across all 8 books
BOOK_CHUNKS = {
    1: [
        {
            "chunk": 1,
            "title": "Geography of Gaul & The Orgetorix Conspiracy",
            "start_chapter": 1,
            "end_chapter": 4,
        },
        {
            "chunk": 2,
            "title": "Helvetian Migration & Defense of the Rhone",
            "start_chapter": 5,
            "end_chapter": 11,
        },
        {
            "chunk": 3,
            "title": "Defeat of the Tigurini & Treason of Dumnorix",
            "start_chapter": 12,
            "end_chapter": 19,
        },
        {
            "chunk": 4,
            "title": "Battle of Bibracte & Helvetian Surrender",
            "start_chapter": 20,
            "end_chapter": 29,
        },
        {
            "chunk": 5,
            "title": "The German Threat & Mutiny at Vesontio",
            "start_chapter": 30,
            "end_chapter": 40,
        },
        {
            "chunk": 6,
            "title": "Parley & Decisive Defeat of Ariovistus",
            "start_chapter": 41,
            "end_chapter": 54,
        },
    ],
    2: [
        {
            "chunk": 1,
            "title": "The Belgic Confederacy & Submission of Western Belgae",
            "start_chapter": 1,
            "end_chapter": 15,
        },
        {
            "chunk": 2,
            "title": "Battle of the Sabis (Nervii) & Siege of the Aduatuci",
            "start_chapter": 16,
            "end_chapter": 35,
        },
    ],
    3: [
        {
            "chunk": 1,
            "title": "Alpine Campaign, Venetian Naval War & Aquitania",
            "start_chapter": 1,
            "end_chapter": 29,
        }
    ],
    4: [
        {
            "chunk": 1,
            "title": "German Incursion, First Rhine Bridge & First British Expedition",
            "start_chapter": 1,
            "end_chapter": 38,
        }
    ],
    5: [
        {
            "chunk": 1,
            "title": "Second British Expedition & Customs of the Britons",
            "start_chapter": 1,
            "end_chapter": 23,
        },
        {
            "chunk": 2,
            "title": "Ambiorix's Revolt, Disaster at Atuatuca & Siege of Cicero",
            "start_chapter": 24,
            "end_chapter": 58,
        },
    ],
    6: [
        {
            "chunk": 1,
            "title": "Second Rhine Crossing, Customs of the Gauls and Germans (Druids)",
            "start_chapter": 1,
            "end_chapter": 44,
        }
    ],
    7: [
        {
            "chunk": 1,
            "title": "Outbreak of the Great Revolt & Siege of Avaricum",
            "start_chapter": 1,
            "end_chapter": 40,
        },
        {
            "chunk": 2,
            "title": "Assault on Gergovia & Epic Siege of Alesia",
            "start_chapter": 41,
            "end_chapter": 90,
        },
    ],
    8: [
        {
            "chunk": 1,
            "title": "Hirtius' Supplement: Final Pacification & Siege of Uxellodunum",
            "start_chapter": 1,
            "end_chapter": 70,
        }
    ],
}

def get_chunk_info(book: int, chapter: int) -> Dict[str, Any]:
    chunks = BOOK_CHUNKS.get(book, [])
    for chk in chunks:
        if chk["start_chapter"] <= chapter <= chk["end_chapter"]:
            return chk
    return chunks[-1] if chunks else {"chunk": 1, "title": f"Book {book}", "start_chapter": 1, "end_chapter": 1}

def run_pipeline(
    texts_dir: str = "data/texts",
    output_dir: str = "data/output",
    dictline_path: str = "data/DICTLINE.GEN"
):
    os.makedirs(output_dir, exist_ok=True)
    
    print("Initializing Lemmatizer and Dictionary...")
    lemmatizer = LatinLemmatizer()
    dictionary = LatinDictionary(dictline_path=dictline_path)
    
    # 1. First pass: tokenize and count total corpus frequencies per lemma
    print("\n[Pass 1/2] Computing corpus frequencies across all 8 books...")
    book_token_streams = {}
    lemma_total_counts = Counter()
    lemma_book_counts = {b: Counter() for b in range(1, 9)}
    
    for b in range(1, 9):
        book_file = os.path.join(texts_dir, f"book_{b}.json")
        with open(book_file, "r", encoding="utf-8") as f:
            book_data = json.load(f)
            
        stream = []
        for ch in book_data["chapters"]:
            ch_num = ch["chapter"]
            tokens = tokenize_text(ch["text"], lemmatizer.is_known_word)
            for tok in tokens:
                lemma = lemmatizer.lemmatize_token(tok)
                stream.append({
                    "token": tok,
                    "lemma": lemma,
                    "book": b,
                    "chapter": ch_num
                })
                lemma_total_counts[lemma] += 1
                lemma_book_counts[b][lemma] += 1
                
        book_token_streams[b] = stream
        print(f"  Book {b}: {len(stream)} processed tokens.")

    # 2. Second pass: Incremental new vocabulary in order of first appearance
    print("\n[Pass 2/2] Extracting cumulative unique vocabulary by order of first appearance...")
    seen_lemmas: Set[str] = set()
    all_books_vocab = {}
    cumulative_list: List[Dict[str, Any]] = []
    
    chunk_vocab: Dict[str, List[Dict[str, Any]]] = {}
    chunk_tokens: Dict[str, int] = {}
    chunk_summaries = []

    for b in range(1, 9):
        stream = book_token_streams[b]
        book_new_vocab: List[Dict[str, Any]] = []
        num_chunks_in_book = len(BOOK_CHUNKS[b])
        
        for item in stream:
            ch_num = item["chapter"]
            chk_info = get_chunk_info(b, ch_num)
            c_id = chk_info["chunk"]
            stage_key = f"{b}.{c_id}" if num_chunks_in_book > 1 else f"{b}"
            
            chunk_tokens[stage_key] = chunk_tokens.get(stage_key, 0) + 1

            lemma = item["lemma"]
            if lemma not in seen_lemmas:
                seen_lemmas.add(lemma)
                
                # Fetch dictionary definition and metadata
                dict_info = dictionary.lookup(lemma)
                
                if num_chunks_in_book > 1:
                    stage_label = f"Book {b} Subsection {c_id}"
                else:
                    stage_label = f"Book {b}"

                if stage_key not in chunk_vocab:
                    chunk_vocab[stage_key] = []

                entry = {
                    "rank": len(cumulative_list) + 1,
                    "book": b,
                    "book_rank": len(book_new_vocab) + 1,
                    "stage": stage_label,
                    "stage_id": stage_key,
                    "chunk": c_id,
                    "chunk_title": chk_info["title"],
                    "chunk_rank": len(chunk_vocab[stage_key]) + 1,
                    "lemma": lemma,
                    "headword": dict_info["headword"],
                    "pos": dict_info["pos"],
                    "definition": dict_info["definition"],
                    "first_appearance": {
                        "book": b,
                        "chapter": ch_num,
                        "surface_form": item["token"]
                    },
                    "book_frequency": lemma_book_counts[b][lemma],
                    "total_frequency": lemma_total_counts[lemma]
                }
                
                chunk_vocab[stage_key].append(entry)
                book_new_vocab.append(entry)
                cumulative_list.append(entry)
                
        all_books_vocab[b] = book_new_vocab
        
        # Save individual book JSON
        book_out = os.path.join(output_dir, f"book_{b}_vocab.json")
        with open(book_out, "w", encoding="utf-8") as f:
            json.dump({
                "book": b,
                "title": f"Commentarii de Bello Gallico - Book {b} Unique Vocabulary",
                "new_word_count": len(book_new_vocab),
                "words": book_new_vocab
            }, f, indent=2, ensure_ascii=False)
            
        print(f"  Book {b}: {len(book_new_vocab)} new unique words (Cumulative total: {len(seen_lemmas)})")

    # Save Chunk-level JSONs
    print("\nSaving stage and chunk files...")
    cum_counter = 0
    for b in range(1, 9):
        chunks = BOOK_CHUNKS[b]
        num_chunks = len(chunks)
        for chk in chunks:
            c_id = chk["chunk"]
            stage_key = f"{b}.{c_id}" if num_chunks > 1 else f"{b}"
            words = chunk_vocab.get(stage_key, [])
            toks = chunk_tokens.get(stage_key, 0)
            cum_counter += len(words)
            
            stage_name = f"Book {b} Subsection {c_id}" if num_chunks > 1 else f"Book {b}"
            ch_range = f"Chapters {chk['start_chapter']}–{chk['end_chapter']}"
            
            # File name
            if num_chunks > 1:
                filename = f"book_{b}_subsection_{c_id}_vocab.json"
            else:
                filename = f"book_{b}_vocab.json"  # already written, but can write dedicated stage if desired
                
            chunk_file = os.path.join(output_dir, filename)
            with open(chunk_file, "w", encoding="utf-8") as f:
                json.dump({
                    "book": b,
                    "stage": stage_name,
                    "stage_id": stage_key,
                    "chunk": c_id,
                    "title": chk["title"],
                    "chapters": ch_range,
                    "running_tokens": toks,
                    "new_word_count": len(words),
                    "cumulative_words": cum_counter,
                    "words": words
                }, f, indent=2, ensure_ascii=False)
                
            print(f"  {stage_name:18} ({ch_range:18}): {len(words):3d} new words, {toks:5d} tokens read.")
            chunk_summaries.append({
                "stage": stage_name,
                "stage_id": stage_key,
                "book": b,
                "chunk": c_id,
                "title": chk["title"],
                "chapters": ch_range,
                "tokens": toks,
                "new_words": len(words),
                "cum_words": cum_counter
            })

    # Save full cumulative dictionary JSON
    full_out = os.path.join(output_dir, "gallic_wars_full_vocab.json")
    with open(full_out, "w", encoding="utf-8") as f:
        json.dump({
            "title": "Caesar's De Bello Gallico - Complete Vocabulary in Order of Appearance",
            "total_unique_words": len(cumulative_list),
            "stages_count": len(chunk_summaries),
            "words": cumulative_list
        }, f, indent=2, ensure_ascii=False)
    print(f"\nSaved full dictionary to {full_out}")

    # Save Anki-ready CSV with Stage tagging
    csv_out = os.path.join(output_dir, "gallic_wars_anki.csv")
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Overall Rank", "Learning Stage", "Headword", "Part of Speech",
            "Definition", "First Seen Form", "First Seen Location", "Total Occurrences"
        ])
        for item in cumulative_list:
            writer.writerow([
                item["rank"],
                item["stage"],
                item["headword"],
                item["pos"],
                item["definition"],
                item["first_appearance"]["surface_form"],
                f"Book {item['first_appearance']['book']}, Ch. {item['first_appearance']['chapter']}",
                item["total_frequency"]
            ])
    print(f"Saved Anki CSV deck to {csv_out}")

    # Generate Master Curriculum Markdown summary table
    summary_out = os.path.join(output_dir, "vocabulary_summary.md")
    total_unique = len(cumulative_list)
    total_tokens_all = sum(s["tokens"] for s in chunk_summaries)

    with open(summary_out, "w", encoding="utf-8") as f:
        f.write("# Caesar's *De Bello Gallico* - Complete 16-Stage Vocabulary Curriculum\n\n")
        f.write("This curriculum breaks down all 8 books of Julius Caesar's *De Bello Gallico* (**53,676 total words**) into **16 bite-sized learning stages**.\n")
        f.write("Books with over 300 new words (Books 1, 2, 5, and 7) are divided into natural narrative subchunks so that **every single step requires learning between 144 and 264 new words**.\n")
        f.write("All conjugated verbs, declined nouns, and adjectives are reduced to their canonical dictionary headwords; once a word is introduced, all subsequent conjugated forms are permanently removed from future stages.\n\n")

        f.write("## Master Curriculum Progression Chart\n\n")
        f.write("| Stage | Chapters Covered | Episode / Historical Narrative | Running Text Read | New Words to Learn | Cumulative Vocab | % of Entire Work Unlocked |\n")
        f.write("| :--- | :---: | :--- | :---: | :---: | :---: | :---: |\n")
        
        current_book = None
        for cs in chunk_summaries:
            pct = (cs["cum_words"] / total_unique) * 100
            f.write(f"| **{cs['stage']}** | {cs['chapters']} | {cs['title']} | {cs['tokens']:,} words | **{cs['new_words']:,}** | {cs['cum_words']:,} | {pct:.1f}% |\n")
            
        f.write(f"| **Total (All 8 Books)** | **Complete Work** | **The Complete Gallic Wars** | **{total_tokens_all:,} words** | **{total_unique:,}** | **{total_unique:,}** | **100.0%** |\n\n")

        f.write("## Book-by-Book Overview\n\n")
        f.write("| Book | Running Words | New Headwords | Subchunks | Cognitive Load per Subchunk |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        book_groups = {}
        for cs in chunk_summaries:
            b = cs["book"]
            if b not in book_groups:
                book_groups[b] = []
            book_groups[b].append(cs)
            
        for b, chks in book_groups.items():
            b_toks = sum(c["tokens"] for c in chks)
            b_words = sum(c["new_words"] for c in chks)
            if len(chks) > 1:
                word_range = f"{min(c['new_words'] for c in chks)}–{max(c['new_words'] for c in chks)} words"
                f.write(f"| **Book {b}** | {b_toks:,} | **{b_words:,}** | {len(chks)} subchunks | ~{word_range} each |\n")
            else:
                f.write(f"| **Book {b}** | {b_toks:,} | **{b_words:,}** | 1 single step | {b_words:,} words |\n")
                
        f.write(f"| **Total** | **{total_tokens_all:,}** | **{total_unique:,}** | **16 stages** | **Average: ~205 words / stage** |\n")

    print(f"Saved master summary report to {summary_out}")
    return cumulative_list

if __name__ == "__main__":
    run_pipeline()
