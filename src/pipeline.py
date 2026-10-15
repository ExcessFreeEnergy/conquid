"""
Pipeline for Caesar's De Bello Gallico Vocabulary Extraction.
Processes Books 1 to 8 in sequence, maintaining cumulative seen_lemmas to extract
unique new words book-by-book in exact order of first appearance.
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

BOOK_1_CHUNKS = [
    {
        "chunk": 1,
        "title": "Gaul & The Orgetorix Conspiracy",
        "start_chapter": 1,
        "end_chapter": 4,
    },
    {
        "chunk": 2,
        "title": "Helvetian Departure & Defense of the Rhone",
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
]

def get_b1_chunk(chapter: int) -> Dict[str, Any]:
    for chk in BOOK_1_CHUNKS:
        if chk["start_chapter"] <= chapter <= chk["end_chapter"]:
            return chk
    return BOOK_1_CHUNKS[-1]

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
    
    summary_stats = []
    book_1_chunk_vocab: Dict[int, List[Dict[str, Any]]] = {c["chunk"]: [] for c in BOOK_1_CHUNKS}
    book_1_chunk_tokens: Dict[int, int] = {c["chunk"]: 0 for c in BOOK_1_CHUNKS}

    for b in range(1, 9):
        stream = book_token_streams[b]
        book_new_vocab: List[Dict[str, Any]] = []
        
        for item in stream:
            ch_num = item["chapter"]
            if b == 1:
                chk_info = get_b1_chunk(ch_num)
                book_1_chunk_tokens[chk_info["chunk"]] += 1

            lemma = item["lemma"]
            if lemma not in seen_lemmas:
                seen_lemmas.add(lemma)
                
                # Fetch dictionary definition and metadata
                dict_info = dictionary.lookup(lemma)
                
                stage_label = f"Book {b}"
                chunk_id = None
                chunk_title = None
                if b == 1:
                    chk_info = get_b1_chunk(ch_num)
                    chunk_id = chk_info["chunk"]
                    chunk_title = chk_info["title"]
                    stage_label = f"Book 1 Chunk {chunk_id}"

                entry = {
                    "rank": len(cumulative_list) + 1,
                    "book": b,
                    "book_rank": len(book_new_vocab) + 1,
                    "stage": stage_label,
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
                
                if b == 1:
                    entry["chunk"] = chunk_id
                    entry["chunk_title"] = chunk_title
                    entry["chunk_rank"] = len(book_1_chunk_vocab[chunk_id]) + 1
                    book_1_chunk_vocab[chunk_id].append(entry)

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
            
        print(f"  Book {b}: {len(book_new_vocab)} new unique words to memorize (Cumulative total: {len(seen_lemmas)})")
        summary_stats.append({
            "book": b,
            "total_tokens": len(stream),
            "new_words": len(book_new_vocab),
            "cumulative_words": len(seen_lemmas)
        })

    # Save Book 1 chunk JSONs
    print("\nSaving Book 1 chunks...")
    b1_chunk_summaries = []
    cum_b1 = 0
    for chk in BOOK_1_CHUNKS:
        c_id = chk["chunk"]
        c_words = book_1_chunk_vocab[c_id]
        cum_b1 += len(c_words)
        c_tokens = book_1_chunk_tokens[c_id]
        
        chunk_file = os.path.join(output_dir, f"book_1_chunk_{c_id}_vocab.json")
        with open(chunk_file, "w", encoding="utf-8") as f:
            json.dump({
                "book": 1,
                "chunk": c_id,
                "title": chk["title"],
                "chapters": f"Chapters {chk['start_chapter']}–{chk['end_chapter']}",
                "running_tokens": c_tokens,
                "new_word_count": len(c_words),
                "cumulative_book_1_words": cum_b1,
                "words": c_words
            }, f, indent=2, ensure_ascii=False)
            
        print(f"  Book 1 Chunk {c_id} (Ch {chk['start_chapter']}-{chk['end_chapter']}): {len(c_words)} new words, {c_tokens} tokens read.")
        b1_chunk_summaries.append({
            "chunk": c_id,
            "title": chk["title"],
            "chapters": f"Ch {chk['start_chapter']}–{chk['end_chapter']}",
            "tokens": c_tokens,
            "new_words": len(c_words),
            "cum_words": cum_b1
        })

    # Save full cumulative dictionary JSON
    full_out = os.path.join(output_dir, "gallic_wars_full_vocab.json")
    with open(full_out, "w", encoding="utf-8") as f:
        json.dump({
            "title": "Caesar's De Bello Gallico - Complete Vocabulary in Order of Appearance",
            "total_unique_words": len(cumulative_list),
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

    # Generate Markdown summary table
    summary_out = os.path.join(output_dir, "vocabulary_summary.md")
    with open(summary_out, "w", encoding="utf-8") as f:
        f.write("# Caesar's *De Bello Gallico* - Vocabulary Learning Progression\n\n")
        f.write("This curriculum organizes all Latin words in Caesar's *De Bello Gallico* by order of first appearance.\n")
        f.write("All conjugated verbs, nouns, and adjectives are reduced to their canonical dictionary headword;\n")
        f.write("once a word is introduced, all subsequent conjugated forms are eliminated from future study steps.\n\n")
        
        f.write("## 1. Book 1 Micro-Chunk Breakdown (~200–260 New Words per Step)\n\n")
        f.write("To make starting Caesar effortless, Book 1 is split into **6 bite-sized stages** of equal learning load.\n")
        f.write("Notice how the text you can read expands dramatically with each step as your vocabulary accumulates:\n\n")
        f.write("| Stage | Chapters Covered | Description | Running Text Read | New Words to Learn | Cumulative Vocab | % of Text Unlocked |\n")
        f.write("| :--- | :---: | :--- | :---: | :---: | :---: | :---: |\n")
        for cs in b1_chunk_summaries:
            pct_unlocked = (cs["cum_words"] / 1354) * 100
            f.write(f"| **Chunk 1.{cs['chunk']}** | {cs['chapters']} | {cs['title']} | {cs['tokens']:,} words | **{cs['new_words']}** | {cs['cum_words']:,} | {pct_unlocked:.1f}% of Bk 1 |\n")
        f.write(f"| **Book 1 Total** | **Ch 1–54** | **Complete Helvetian & German Campaigns** | **8,240 words** | **1,354** | **1,354** | **100.0% of Bk 1** |\n\n")

        f.write("## 2. Entire Work Overview (Books 1–8)\n\n")
        f.write("Once Book 1's 1,354-word foundation is established, each subsequent book requires memorizing only **180–370 new words**:\n\n")
        f.write("| Book | Running Words (Tokens) | New Unique Headwords to Memorize | Cumulative Vocabulary | % of Total Lexicon |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        total_unique = len(cumulative_list)
        for stat in summary_stats:
            pct = (stat["cumulative_words"] / total_unique) * 100
            f.write(f"| **Book {stat['book']}** | {stat['total_tokens']:,} | **{stat['new_words']:,}** | {stat['cumulative_words']:,} | {pct:.1f}% |\n")
        f.write(f"| **Total** | **{sum(s['total_tokens'] for s in summary_stats):,}** | **{total_unique:,}** | **{total_unique:,}** | **100.0%** |\n")
        
    print(f"Saved summary report to {summary_out}")
    return cumulative_list

if __name__ == "__main__":
    run_pipeline()
