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

    for b in range(1, 9):
        stream = book_token_streams[b]
        book_new_vocab: List[Dict[str, Any]] = []
        
        for item in stream:
            lemma = item["lemma"]
            if lemma not in seen_lemmas:
                seen_lemmas.add(lemma)
                
                # Fetch dictionary definition and metadata
                dict_info = dictionary.lookup(lemma)
                
                entry = {
                    "rank": len(cumulative_list) + 1,
                    "book_rank": len(book_new_vocab) + 1,
                    "lemma": lemma,
                    "headword": dict_info["headword"],
                    "pos": dict_info["pos"],
                    "definition": dict_info["definition"],
                    "first_appearance": {
                        "book": b,
                        "chapter": item["chapter"],
                        "surface_form": item["token"]
                    },
                    "book_frequency": lemma_book_counts[b][lemma],
                    "total_frequency": lemma_total_counts[lemma]
                }
                
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

    # Save full cumulative dictionary JSON
    full_out = os.path.join(output_dir, "gallic_wars_full_vocab.json")
    with open(full_out, "w", encoding="utf-8") as f:
        json.dump({
            "title": "Caesar's De Bello Gallico - Complete Vocabulary in Order of Appearance",
            "total_unique_words": len(cumulative_list),
            "words": cumulative_list
        }, f, indent=2, ensure_ascii=False)
    print(f"\nSaved full dictionary to {full_out}")

    # Save Anki-ready CSV
    csv_out = os.path.join(output_dir, "gallic_wars_anki.csv")
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Overall Rank", "Book", "Book Rank", "Headword", "Part of Speech",
            "Definition", "First Seen Form", "First Seen Chapter", "Total Occurrences"
        ])
        for item in cumulative_list:
            writer.writerow([
                item["rank"],
                item["first_appearance"]["book"],
                item["book_rank"],
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
        f.write("This table shows the number of new words to memorize per book in order of first reading.\n")
        f.write("All conjugated verbs, declined nouns, and adjectives have been reduced to canonical dictionary headwords;\n")
        f.write("subsequent occurrences of any inflected form are eliminated from future books.\n\n")
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
