"""
Scraper for Caesar's De Bello Gallico from The Latin Library.
Downloads Books 1 through 8 and parses chapters into clean structured data.
"""

import os
import re
import json
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.thelatinlibrary.com/caesar/gallic/gall{book_num}.shtml"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

def download_book(book_num: int, raw_dir: str = "data/raw") -> str:
    """Download raw HTML of a book from The Latin Library if not cached."""
    os.makedirs(raw_dir, exist_ok=True)
    raw_path = os.path.join(raw_dir, f"gall{book_num}.shtml")
    
    if os.path.exists(raw_path):
        with open(raw_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
            
    url = BASE_URL.format(book_num=book_num)
    headers = {"User-Agent": USER_AGENT}
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    
    # Store raw HTML
    with open(raw_path, "w", encoding="utf-8") as f:
        f.write(resp.text)
        
    return resp.text

def parse_book_html(html_content: str, book_num: int) -> dict:
    """
    Parse the HTML content into chapters and text.
    Returns a dict with metadata and a list of chapters:
    [{"chapter": 1, "text": "..."}, ...]
    """
    soup = BeautifulSoup(html_content, "html.parser")
    
    # Remove navigation, headers, footers, scripts, styles
    for tag in soup(["script", "style", "table"]):
        tag.decompose()
        
    for nav in soup.find_all(class_=re.compile(r"internal_navigation|footer")):
        nav.decompose()
        
    for p in soup.find_all("p"):
        if "The Latin Library" in p.get_text() or "The Classics Page" in p.get_text():
            p.decompose()

    # The body contains paragraphs with [1], [2], etc.
    # Let's extract text by chapter
    paragraphs = soup.find_all("p")
    chapters = []
    current_chapter = None
    current_text = []
    
    for p in paragraphs:
        text = p.get_text()
        text = text.replace("\xa0", " ").strip()
        if not text:
            continue
            
        # Match chapter markers like [1], [2], or [1] at start
        # Some paragraphs might contain multiple chapter markers if formatted that way,
        # but typically each chapter is in its own paragraph or starts with [N]
        # Let's split by [N] regex
        tokens = re.split(r'\[(\d+)\]', text)
        if len(tokens) > 1:
            # tokens[0] is preamble before first [N]
            # tokens[1] is chapter num, tokens[2] is text, tokens[3] is chapter num...
            if tokens[0].strip() and current_chapter is not None:
                current_text.append(tokens[0].strip())
                
            i = 1
            while i < len(tokens):
                if current_chapter is not None and current_text:
                    chapters.append({
                        "chapter": current_chapter,
                        "text": " ".join(current_text)
                    })
                    current_text = []
                current_chapter = int(tokens[i])
                if i + 1 < len(tokens) and tokens[i+1].strip():
                    current_text.append(tokens[i+1].strip())
                i += 2
        else:
            if current_chapter is not None:
                current_text.append(text)
            elif not chapters:
                # Preamble or first chapter without bracket
                current_chapter = 1
                current_text.append(text)
                
    if current_chapter is not None and current_text:
        chapters.append({
            "chapter": current_chapter,
            "text": " ".join(current_text)
        })
        
    return {
        "book": book_num,
        "title": f"Commentarii de Bello Gallico - Liber {book_num}",
        "chapters": chapters
    }

def scrape_all_books(raw_dir: str = "data/raw", texts_dir: str = "data/texts"):
    """Scrape and parse all 8 books."""
    os.makedirs(texts_dir, exist_ok=True)
    all_books = []
    
    for b in range(1, 9):
        print(f"Fetching Book {b}...")
        html = download_book(b, raw_dir=raw_dir)
        parsed = parse_book_html(html, b)
        
        out_path = os.path.join(texts_dir, f"book_{b}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2, ensure_ascii=False)
            
        total_ch = len(parsed["chapters"])
        total_words = sum(len(ch["text"].split()) for ch in parsed["chapters"])
        print(f"Book {b}: {total_ch} chapters, approx {total_words} words parsed.")
        all_books.append(parsed)
        
    return all_books

if __name__ == "__main__":
    scrape_all_books()
