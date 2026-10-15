"""
Tokenizer for Caesar's De Bello Gallico.
Handles punctuation, text normalizations, OCR corrections for The Latin Library text,
and Latin enclitics (-que, -ve, -ne, -cum).
"""

import re
from typing import List, Tuple

# Known typos and glued tokens in The Latin Library text
TEXT_CORRECTIONS = {
    "poslulatis": "postulatis",
    "cognoseere": "cognoscere",
    "abstraetos": "abstractos",
    "diripiautur": "diripiantur",
    "pcditibus": "peditibus",
    "puguans": "pugnans",
    "inuria": "iniuria",
    "citeribris": "citerioribus",
    "fatrumque": "fratrumque",
    "audeantflumen": "audeant flumen",
    "beneficiotali": "beneficio tali",
    "dimitterentlongum": "dimitterent longum",
    "recusaretcum": "recusaret cum",
    "adtectus": "affectus",
    "adorirantur": "adorirentur",
    "oppugent": "oppugnent",
    "vulgum": "vulgus",
    "tlabienus": "T Labienus",
    "xlegionem": "X legionem",
}

# Words where -que is part of the root word, NOT an enclitic "and"
INTRINSIC_QUE = {
    "atque", "denique", "itaque", "undique", "ubique", "usque", "quinque",
    "neque", "quoque", "plerique", "uterque", "quisque", "quique", "quaeque",
    "quidque", "quodque", "cuiusque", "cuique", "quemque", "quamque",
    "quoque", "quicumque", "quaecumque", "quodcumque", "ubicumque",
    "undicumque", "utrimque", "absque", "nempe", "usquequaque", "plerumque",
    "tantisque", "quantisque", "utique", "torreque"
}

# Words where -ve is intrinsic
INTRINSIC_VE = {
    "grave", "breve", "leve", "suave", "nive", "iube", "cave", "cave", "vive"
}

ROMAN_NUMERAL_REGEX = re.compile(r'^[IVXLCDMivxlcdm]+$')

def is_roman_numeral(token: str) -> bool:
    """Check if token is a standalone Roman numeral."""
    return bool(ROMAN_NUMERAL_REGEX.match(token))



def split_pronoun_cum(token: str) -> List[str]:
    """Split postponed preposition -cum from pronouns (e.g., quibuscum -> quibus cum)."""
    t_lower = token.lower()
    cum_pronouns = {
        "secum": ("se", "cum"),
        "mecum": ("me", "cum"),
        "tecum": ("te", "cum"),
        "nobiscum": ("nobis", "cum"),
        "vobiscum": ("vobis", "cum"),
        "quocum": ("quo", "cum"),
        "quacum": ("qua", "cum"),
        "quibuscum": ("quibus", "cum"),
    }
    if t_lower in cum_pronouns:
        p1, p2 = cum_pronouns[t_lower]
        # preserve capitalization of first part
        p1_cap = p1.capitalize() if token[0].isupper() else p1
        return [p1_cap, p2]
    return [token]

def split_enclitics(token: str, is_known_word_func=None) -> List[str]:
    """
    Split enclitics -que, -ve, -ne if applicable.
    If is_known_word_func is provided, only splits if the remainder is a valid word.
    """
    t_lower = token.lower()

    # Check -que
    if t_lower.endswith("que") and len(token) > 4 and t_lower not in INTRINSIC_QUE:
        stem = token[:-3]
        if is_known_word_func is None or is_known_word_func(stem):
            return [stem, "que"]

    # Check -ve
    if t_lower.endswith("ve") and len(token) > 3 and t_lower not in INTRINSIC_VE:
        stem = token[:-2]
        if is_known_word_func is None or is_known_word_func(stem):
            return [stem, "ve"]

    # Check -ne (interrogative enclitic)
    if t_lower.endswith("ne") and len(token) > 3 and t_lower not in {"bene", "paene", "sine", "omne"}:
        stem = token[:-2]
        if is_known_word_func is None or is_known_word_func(stem):
            return [stem, "ne"]

    return [token]

def tokenize_text(text: str, is_known_word_func=None) -> List[str]:
    """
    Tokenize Latin text into cleaned tokens.
    Filters out punctuation and isolated Roman numerals.
    """
    # Replace typography / punctuation
    text = text.replace("’", "'").replace("“", '"').replace("”", '"')
    raw_tokens = text.split()
    
    tokens = []
    for raw in raw_tokens:
        # Strip leading/trailing punctuation but keep letters and internal dashes
        w = re.sub(r'^[^\w]+|[^\w]+$', '', raw)
        if not w:
            continue
            
        # Check text corrections
        w_lower = w.lower()
        if w_lower in TEXT_CORRECTIONS:
            corrected = TEXT_CORRECTIONS[w_lower]
            for part in corrected.split():
                tokens.append(part)
            continue
            
        part = re.sub(r'[^a-zA-Z]', '', w)
        if not part:
            continue
            
        # Skip Roman numerals (e.g. I, II, III, CCXL)
        if is_roman_numeral(part):
            continue
            
        # Split pronoun + cum
        cum_parts = split_pronoun_cum(part)
        for cp in cum_parts:
            # Split enclitics
            enc_parts = split_enclitics(cp, is_known_word_func)
            tokens.extend(enc_parts)

    return tokens
