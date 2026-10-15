"""
Dictionary and Definition Enrichment Engine.
Combines Collatinus morphology (principal parts, gender, part-of-speech)
with Whitaker's Words (DICTLINE.GEN) and curated Classical Latin core definitions.
"""

import os
import re
import unicodedata
from typing import Dict, Optional, Tuple, Any
import pycollatinus

def strip_accents(s: str) -> str:
    """Strip macrons and accents."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

CORE_ENTRIES = {
    "sum": {
        "headword": "sum, esse, fui, futūrus",
        "pos": "Verb",
        "definition": "be, exist, live; belong to (with dat.)"
    },
    "qui": {
        "headword": "quī, quae, quod",
        "pos": "Relative Pronoun",
        "definition": "who, which, that; what"
    },
    "quis": {
        "headword": "quis, quid",
        "pos": "Interrogative Pronoun",
        "definition": "who?, what?, anyone, anything"
    },
    "is": {
        "headword": "is, ea, id",
        "pos": "Demonstrative Pronoun",
        "definition": "he, she, it; this, that; the one mentioned"
    },
    "hic": {
        "headword": "hic, haec, hoc",
        "pos": "Demonstrative Pronoun",
        "definition": "this, these; the latter"
    },
    "ille": {
        "headword": "ille, illa, illud",
        "pos": "Demonstrative Pronoun",
        "definition": "that, those; the former, the well-known"
    },
    "ipse": {
        "headword": "ipse, ipsa, ipsum",
        "pos": "Intensive Pronoun",
        "definition": "himself, herself, itself, themselves; very, actual"
    },
    "sui": {
        "headword": "suī, sibi, sē, sē",
        "pos": "Reflexive Pronoun",
        "definition": "himself, herself, itself, themselves"
    },
    "suus": {
        "headword": "suus, -a, -um",
        "pos": "Possessive Adjective",
        "definition": "his own, her own, its own, their own"
    },
    "noster": {
        "headword": "noster, nostra, nostrum",
        "pos": "Possessive Adjective",
        "definition": "our, ours"
    },
    "tuus": {
        "headword": "tuus, -a, -um",
        "pos": "Possessive Adjective",
        "definition": "your, yours (singular)"
    },
    "vester": {
        "headword": "vester, vestra, vestrum",
        "pos": "Possessive Adjective",
        "definition": "your, yours (plural)"
    },
    "Gallia": {
        "headword": "Gallia, -ae, f.",
        "pos": "Proper Noun",
        "definition": "Gaul (transalpine region encompassing modern France, Belgium, and parts of Germany/Switzerland)"
    },
    "Galli": {
        "headword": "Gallī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Gauls (specifically the Celts inhabiting central Gaul)"
    },
    "Belgae": {
        "headword": "Belgae, -ārum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Belgae (warlike confederation of tribes inhabiting northeastern Gaul)"
    },
    "Aquitani": {
        "headword": "Aquītānī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Aquitani (peoples inhabiting southwestern Gaul between the Garonne and Pyrenees)"
    },
    "Celtae": {
        "headword": "Celtae, -ārum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Celts (indigenous name for the inhabitants of central Gaul)"
    },
    "Helvetii": {
        "headword": "Helvētiī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Helvetii (powerful Celtic tribe inhabiting modern Switzerland)"
    },
    "Germani": {
        "headword": "Germānī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Germans (peoples living east of the Rhine river)"
    },
    "Sequani": {
        "headword": "Sēquanī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Sequani (Celtic tribe along the Arar/Saone river, neighbors of the Aedui)"
    },
    "Haedui": {
        "headword": "Haeduī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Aedui/Haedui (influential Celtic tribe allied with Rome)"
    },
    "Aedui": {
        "headword": "Aeduī, -ōrum, m. pl.",
        "pos": "Proper Noun",
        "definition": "the Aedui (allies of the Romans in central Gaul)"
    },
    "Garumna": {
        "headword": "Garumna, -ae, m./f.",
        "pos": "Proper Noun",
        "definition": "the Garonne river in southwestern Gaul"
    },
    "Matrona": {
        "headword": "Matrona, -ae, m.",
        "pos": "Proper Noun",
        "definition": "the Marne river in northern Gaul"
    },
    "Sequana": {
        "headword": "Sēquana, -ae, m.",
        "pos": "Proper Noun",
        "definition": "the Seine river in northern Gaul"
    },
    "Rhenus": {
        "headword": "Rhēnus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "the Rhine river, frontier between Gaul and Germany"
    },
    "Rhodanus": {
        "headword": "Rhodanus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "the Rhone river flowing through Lake Geneva into the Mediterranean"
    },
    "Iura": {
        "headword": "Iūra, -ae, m.",
        "pos": "Proper Noun",
        "definition": "the Jura mountain range between the Sequani and Helvetii"
    },
    "Lemmanus": {
        "headword": "Lemmānus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "Lake Geneva (Lacus Lemannus)"
    },
    "Genava": {
        "headword": "Genava, -ae, f.",
        "pos": "Proper Noun",
        "definition": "Geneva (frontier town of the Allobroges on the Rhone)"
    },
    "Orgetorix": {
        "headword": "Orgetorīx, Orgetorīgis, m.",
        "pos": "Proper Noun",
        "definition": "Orgetorix (wealthy and noble Helvetian chieftain who orchestrated the migration)"
    },
    "Diviciacus": {
        "headword": "Dīviciācus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "Diviciacus (Aeduan druid, leader and loyal ally of Julius Caesar)"
    },
    "Dumnorix": {
        "headword": "Dumnorīx, Dumnorīgis, m.",
        "pos": "Proper Noun",
        "definition": "Dumnorix (anti-Roman brother of Diviciacus who conspired with the Helvetii)"
    },
    "Divico": {
        "headword": "Dīvicō, -ōnis, m.",
        "pos": "Proper Noun",
        "definition": "Divico (Helvetian commander who had defeated Cassius in 107 BC, envoy to Caesar)"
    },
    "Vercingetorix": {
        "headword": "Vercingetorīx, -īgis, m.",
        "pos": "Proper Noun",
        "definition": "Vercingetorix (Arvernian chieftain who united the Gallic tribes in revolt against Caesar)"
    },
    "Ariovistus": {
        "headword": "Ariovistus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "Ariovistus (German king of the Suebi who invaded eastern Gaul)"
    },
    "Caesar": {
        "headword": "Caesar, Caesaris, m.",
        "pos": "Proper Noun",
        "definition": "Gaius Julius Caesar (Roman proconsul, general, and author of the Gallic Wars)"
    },
    "Labienus": {
        "headword": "Labiēnus, -ī, m.",
        "pos": "Proper Noun",
        "definition": "Titus Labienus (Caesar's most trusted legatus and second-in-command during the Gallic Wars)"
    },
    "in": {
        "headword": "in (+ abl. / + acc.)",
        "pos": "Preposition",
        "definition": "in, on, among (+ abl.); into, onto, against, towards (+ acc.)"
    },
    "ad": {
        "headword": "ad (+ acc.)",
        "pos": "Preposition",
        "definition": "to, toward, near, at, for the purpose of (+ acc.)"
    },
    "ab": {
        "headword": "ab / ā (+ abl.)",
        "pos": "Preposition",
        "definition": "from, away from, by (agent) (+ abl.)"
    },
    "cum": {
        "headword": "cum (+ abl. / conj.)",
        "pos": "Preposition / Conjunction",
        "definition": "with (+ abl.); when, since, although (conj. + subj.)"
    },
    "de": {
        "headword": "dē (+ abl.)",
        "pos": "Preposition",
        "definition": "down from, from, concerning, about (+ abl.)"
    },
    "ex": {
        "headword": "ex / ē (+ abl.)",
        "pos": "Preposition",
        "definition": "out of, from, in accordance with (+ abl.)"
    },
    "per": {
        "headword": "per (+ acc.)",
        "pos": "Preposition",
        "definition": "through, throughout, by means of (+ acc.)"
    },
    "trans": {
        "headword": "trāns (+ acc.)",
        "pos": "Preposition",
        "definition": "across, beyond (+ acc.)"
    },
    "et": {
        "headword": "et",
        "pos": "Conjunction",
        "definition": "and, also, even; et... et = both... and"
    },
    "que": {
        "headword": "-que (enclitic)",
        "pos": "Conjunction",
        "definition": "and (attached to following word)"
    },
    "atque": {
        "headword": "atque / ac",
        "pos": "Conjunction",
        "definition": "and also, and even, and moreover"
    },
    "aut": {
        "headword": "aut",
        "pos": "Conjunction",
        "definition": "or; aut... aut = either... or"
    },
    "sed": {
        "headword": "sed",
        "pos": "Conjunction",
        "definition": "but, yet"
    },
    "ut": {
        "headword": "ut / utī",
        "pos": "Conjunction",
        "definition": "so that, in order that, that; as, when (+ indic.)"
    },
    "ne": {
        "headword": "nē",
        "pos": "Conjunction / Adverb",
        "definition": "that... not, lest, in order that not; not"
    },
    "si": {
        "headword": "sī",
        "pos": "Conjunction",
        "definition": "if, whether"
    },
    "non": {
        "headword": "nōn",
        "pos": "Adverb",
        "definition": "not, no"
    },
    "itaque": {
        "headword": "itaque",
        "pos": "Conjunction",
        "definition": "and so, therefore, accordingly"
    },
    "propterea": {
        "headword": "proptereā",
        "pos": "Adverb",
        "definition": "on that account, for that reason (frequently 'propterea quod' = because)"
    },
    "fere": {
        "headword": "ferē",
        "pos": "Adverb",
        "definition": "almost, nearly, generally, about"
    },
    "saepe": {
        "headword": "saepe",
        "pos": "Adverb",
        "definition": "often, frequently"
    },
    "undique": {
        "headword": "undique",
        "pos": "Adverb",
        "definition": "from all sides, on every side, everywhere"
    },
    "longe": {
        "headword": "longē",
        "pos": "Adverb",
        "definition": "far, by far, at a distance"
    },
    "continenter": {
        "headword": "continenter",
        "pos": "Adverb",
        "definition": "continuously, without interruption"
    },
    "omnis": {
        "headword": "omnis, omne",
        "pos": "Adjective",
        "definition": "all, every, whole, entire"
    },
    "tres": {
        "headword": "trēs, tria",
        "pos": "Numeral Adjective",
        "definition": "three"
    },
    "unus": {
        "headword": "ūnus, -a, -um",
        "pos": "Numeral Adjective",
        "definition": "one, single, alone"
    },
    "duo": {
        "headword": "duo, duae, duo",
        "pos": "Numeral Adjective",
        "definition": "two"
    },
    "quattuor": {
        "headword": "quattuor",
        "pos": "Numeral Adjective",
        "definition": "four"
    },
    "pars": {
        "headword": "pars, partis, f.",
        "pos": "Noun (3rd)",
        "definition": "part, portion, direction, side; party, faction"
    },
    "divido": {
        "headword": "dīvidō, -ere, dīvīsī, dīvīsum",
        "pos": "Verb (3rd)",
        "definition": "divide, separate, distribute, distinguish"
    },
    "incolo": {
        "headword": "incolō, -ere, incoluī, -",
        "pos": "Verb (3rd)",
        "definition": "inhabit, dwell in, live"
    },
    "differo": {
        "headword": "differō, differre, distulī, dīlātum",
        "pos": "Verb (irreg.)",
        "definition": "differ, disagree; scatter, spread; postpone, delay"
    },
    "flumen": {
        "headword": "flūmen, flūminis, n.",
        "pos": "Noun (3rd)",
        "definition": "river, stream, flowing water"
    },
    "lingua": {
        "headword": "lingua, -ae, f.",
        "pos": "Noun (1st)",
        "definition": "tongue, language, dialect, speech"
    },
    "institutum": {
        "headword": "īnstitūtum, -ī, n.",
        "pos": "Noun (2nd)",
        "definition": "custom, institution, habit, practice"
    },
    "lex": {
        "headword": "lēx, lēgis, f.",
        "pos": "Noun (3rd)",
        "definition": "law, statute, ordinance"
    },
    "bellum": {
        "headword": "bellum, -ī, n.",
        "pos": "Noun (2nd)",
        "definition": "war, warfare; bellum gerere = wage war"
    },
    "gero": {
        "headword": "gerō, -ere, gessī, gestum",
        "pos": "Verb (3rd)",
        "definition": "carry, wear, conduct, manage, wage (war)"
    },
    "virtus": {
        "headword": "virtūs, virtūtis, f.",
        "pos": "Noun (3rd)",
        "definition": "courage, bravery, valor, excellence, virtue"
    },
    "finis": {
        "headword": "fīnis, fīnis, m.",
        "pos": "Noun (3rd)",
        "definition": "end, limit, boundary; pl. finēs = territory, borders"
    },
}

class LatinDictionary:
    def __init__(self, dictline_path: str = "data/DICTLINE.GEN"):
        self.collatinus_data = self._load_collatinus()
        self.whitaker_defs = self._load_whitaker(dictline_path)

    def _load_collatinus(self) -> Dict[str, Dict[str, str]]:
        info = {}
        data_path = os.path.join(
            os.path.dirname(pycollatinus.__file__),
            "data", "lemmes.la"
        )
        if os.path.exists(data_path):
            with open(data_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("!"):
                        continue
                    parts = line.split("|")
                    raw = parts[0].split("=")[0]
                    clean = strip_accents(raw).lower()
                    model = parts[1] if len(parts) > 1 else ""
                    morph = parts[4] if len(parts) > 4 else ""
                    freq = parts[5] if len(parts) > 5 else "0"
                    if clean not in info or (morph and not info[clean]["morph"]):
                        info[clean] = {
                            "raw": raw,
                            "model": model,
                            "morph": morph,
                            "freq": freq
                        }
        return info

    def _load_whitaker(self, dictline_path: str) -> Dict[str, Tuple[str, str]]:
        whitaker = {}
        if not os.path.exists(dictline_path):
            return whitaker

        with open(dictline_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                s1 = line[0:19].strip().lower()
                s2 = line[19:38].strip().lower()
                pos = line[76:83].strip()
                meaning = line[110:].strip().rstrip(";").strip()
                
                # Clean up Whitaker dictionary formatting
                meaning = re.sub(r'\[.*?\]', '', meaning).strip()
                meaning = re.sub(r'\(.*?\)', '', meaning).strip()
                meaning = meaning.replace("|", "").strip("; ")
                if not meaning:
                    continue

                for s in (s1, s2):
                    if s:
                        # Keep longer or more descriptive definition
                        if s not in whitaker or len(meaning) > len(whitaker[s][1]):
                            whitaker[s] = (pos, meaning)
        return whitaker

    def get_pos_label(self, model: str, morph: str, whitaker_pos: str) -> str:
        """Map raw model and Whitaker pos to clean human-readable Part of Speech."""
        if "npr" in morph:
            return "Proper Noun"
        if whitaker_pos == "V" or "ere" in morph or "are" in morph or "ire" in morph:
            return "Verb"
        if whitaker_pos == "N" or ", m." in morph or ", f." in morph or ", n." in morph:
            return "Noun"
        if whitaker_pos == "ADJ" or "a, um" in morph or morph == "e":
            return "Adjective"
        if whitaker_pos == "ADV" or "adv" in morph:
            return "Adverb"
        if whitaker_pos == "PREP" or "prép" in morph:
            return "Preposition"
        if whitaker_pos == "CONJ" or "conj" in morph:
            return "Conjunction"
        if whitaker_pos == "PRON":
            return "Pronoun"
        return "Word"

    def format_headword(self, lemma: str, col_info: Optional[Dict[str, str]]) -> str:
        """Format lemma into canonical citation form (e.g. divido, -ere, divisi, divisum)."""
        if col_info and col_info.get("morph"):
            morph = col_info["morph"]
            # Clean up french/collatinus markers
            morph_clean = morph.replace("prép. + abl.", "prep. (+ abl.)")
            morph_clean = morph_clean.replace("prép. + acc.", "prep. (+ acc.)")
            morph_clean = morph_clean.replace("npr.", "").strip(", ")
            return f"{lemma}, {morph_clean}" if morph_clean else lemma
        return lemma

    def lookup(self, lemma: str) -> Dict[str, Any]:
        """Lookup full dictionary information for a given lemma."""
        clean = strip_accents(lemma)
        clean_lower = clean.lower()

        # 1. Curated core entries
        if lemma in CORE_ENTRIES:
            return CORE_ENTRIES[lemma]
        if clean_lower in CORE_ENTRIES:
            return CORE_ENTRIES[clean_lower]

        # 2. Collatinus morphological info
        col_info = self.collatinus_data.get(clean_lower)
        headword = self.format_headword(lemma, col_info)
        col_morph = col_info["morph"] if col_info else ""
        col_model = col_info["model"] if col_info else ""

        # 3. Whitaker's Words definition
        w_pos, w_meaning = "", ""
        if clean_lower in self.whitaker_defs:
            w_pos, w_meaning = self.whitaker_defs[clean_lower]
        else:
            # Stem search
            for ending in ("o", "or", "um", "us", "a", "is", "es", "ex"):
                if clean_lower.endswith(ending):
                    stem = clean_lower[:-len(ending)]
                    if stem in self.whitaker_defs:
                        w_pos, w_meaning = self.whitaker_defs[stem]
                        break

        pos_label = self.get_pos_label(col_model, col_morph, w_pos)
        definition = w_meaning if w_meaning else "Definition to be reviewed"

        return {
            "headword": headword,
            "pos": pos_label,
            "definition": definition
        }
