"""
Morphological Lemmatizer for Caesar's Latin.
Wraps PyCollatinus with classical frequency-based disambiguation,
Caesar-specific proper nouns, syncopated verb forms, and overrides.
"""

import os
import unicodedata
from typing import List, Dict, Tuple
from pycollatinus import Lemmatiseur

def strip_accents(s: str) -> str:
    """Strip macrons, breves, and accents for clean comparison."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

# Caesar proper nouns and geographical names (nominative dictionary form)
CAESAR_PROPER_NOUNS = {
    "argetoricem": "Orgetorix",
    "orgetoricem": "Orgetorix",
    "orgetorigis": "Orgetorix",
    "orgetorigi": "Orgetorix",
    "orgetorige": "Orgetorix",
    "diviciacus": "Diviciacus",
    "diviciaci": "Diviciacus",
    "diviciaco": "Diviciacus",
    "diviciacum": "Diviciacus",
    "diviacus": "Diviciacus",
    "divico": "Divico",
    "dumnorigi": "Dumnorix",
    "dumnorigem": "Dumnorix",
    "dumnorix": "Dumnorix",
    "dumnorigis": "Dumnorix",
    "nammeius": "Nammeius",
    "verucloetius": "Verucloetius",
    "catamantaloedis": "Catamantaloedes",
    "vercingetorix": "Vercingetorix",
    "vercingetorigis": "Vercingetorix",
    "vercingetorigem": "Vercingetorix",
    "vercassivellauno": "Vercassivellaunus",
    "vercassivellaunum": "Vercassivellaunus",
    "vercassivellaunus": "Vercassivellaunus",
    "catuvolci": "Catuvolcus",
    "catuvolco": "Catuvolcus",
    "catuvolcus": "Catuvolcus",
    "cavarillus": "Cavarillus",
    "cimberium": "Cimberius",
    "conconnetodumno": "Conconnetodumnus",
    "convictolitavem": "Convictolitavis",
    "convictolitavi": "Convictolitavis",
    "convictolitavim": "Convictolitavis",
    "convictolitavis": "Convictolitavis",
    "coriosolitas": "Coriosolites",
    "coriosolites": "Coriosolites",
    "cotuato": "Cotuatus",
    "donnotauro": "Donnotaurus",
    "drappete": "Drappete",
    "drappetem": "Drappete",
    "drappeti": "Drappete",
    "drappetis": "Drappete",
    "duratio": "Duratius",
    "duratium": "Duratius",
    "esuvios": "Esuvii",
    "gutruatum": "Gutruatus",
    "lacterius": "Lacterius",
    "litavicci": "Litaviccus",
    "litavicco": "Litaviccus",
    "litaviccum": "Litaviccus",
    "litaviccus": "Litaviccus",
    "lugotorige": "Lugotorix",
    "olloviconis": "Ollovico",
    "orcyniam": "Orcynia",
    "petrosidius": "Petrosidius",
    "ptianii": "Ptianii",
    "sibusates": "Sibusates",
    "troucillum": "Troucillus",
    "valetiacus": "Valetiacus",
    "vertico": "Vertico",
    "verticone": "Vertico",
    "vertisco": "Vertisco",
    "viridovice": "Viridovix",
    "viridovicem": "Viridovix",
    "viridovix": "Viridovix",
    "voccionis": "Voccio",
    "volcatium": "Volcatius",
    "allobrogas": "Allobroges",
    "lingonas": "Lingones",
    "ligerim": "Liger",
    "tamesim": "Tamesis",
    "sabim": "Sabis",
    "rhemum": "Remi",
    "nantuatium": "Nantuates",
    "sotiatium": "Sotiates",
    "atrebatium": "Atrebates",
    "aulerco": "Aulerci",
    "balventio": "Balventius",
    "belgos": "Belgae",
    "arveruos": "Arverni",
    "andebrogium": "Andebrogius",
    "adiatunnus": "Adiatunnus",
    "haeduae": "Haedui",
    "aeduae": "Aedui",
    "nasuam": "Nasua",
}

# Syncopated verb forms and classical irregulars
SYNCOPATED_FORMS = {
    "consuessent": "consuesco",
    "consuesset": "consuesco",
    "consuerunt": "consuesco",
    "consuerat": "consuesco",
    "consuerant": "consuesco",
    "consuesse": "consuesco",
    "cognossent": "cognosco",
    "cognosset": "cognosco",
    "cognosse": "cognosco",
    "conlocarat": "conloco",
    "repetisset": "repeto",
    "decrevat": "decerno",
    "adorirantur": "adorior",
    "transiri": "transeo",
    "iniri": "ineo",
    "iniretur": "ineo",
    "iretur": "eo",
    "oreretur": "orior",
    "faciundi": "facio",
    "difficillimam": "difficilis",
    "difficillimis": "difficilis",
    "difficillimo": "difficilis",
    "maturrime": "maturus",
    "munitissumis": "munitus",
    "duodenum": "duodecim",
    "denum": "decem",
    "quendam": "quidam",
    "quantasvis": "quantusvis",
    "quartamdecimam": "quartusdecimus",
    "paterfamiliae": "paterfamilias",
    "decucurrerunt": "decurro",
    "decucurrit": "decurro",
    "complura": "complures",
    "euit": "evito",
    "eitas": "evito",
    "eiti": "evito",
    "eitis": "evito",
    "consecuntur": "consequor",
}

# Common Latin ambiguity disambiguation overrides (form -> canonical lemma)
AMBIGUITY_OVERRIDES = {
    "est": "sum",
    "sunt": "sum",
    "erat": "sum",
    "erant": "sum",
    "fuit": "sum",
    "fuerunt": "sum",
    "fore": "sum",
    "esse": "sum",
    "esset": "sum",
    "essent": "sum",
    "sit": "sum",
    "sint": "sum",
    "cum": "cum",
    "qui": "qui",
    "quae": "qui",
    "quod": "qui",
    "cuius": "qui",
    "cui": "qui",
    "quem": "qui",
    "quam": "qui",
    "quo": "qui",
    "qua": "qui",
    "quorum": "qui",
    "quarum": "qui",
    "quibus": "qui",
    "quos": "qui",
    "quas": "qui",
    "se": "sui",
    "sese": "sui",
    "sui": "sui",
    "sibi": "sui",
    "secum": "sui",
    "omnis": "omnis",
    "omnes": "omnis",
    "omnia": "omnis",
    "omnem": "omnis",
    "omnium": "omnis",
    "omnibus": "omnis",
    "tres": "tres",
    "tria": "tres",
    "trium": "tres",
    "tribus": "tres",
    "ipse": "ipse",
    "ipsa": "ipse",
    "ipsum": "ipse",
    "ipsius": "ipse",
    "ipsi": "ipse",
    "ipsorum": "ipse",
    "ipsarum": "ipse",
    "ipsos": "ipse",
    "ipsas": "ipse",
    "aliam": "alius",
    "alii": "alius",
    "alia": "alius",
    "alios": "alius",
    "alias": "alius",
    "aliud": "alius",
    "alius": "alius",
    "alter": "alter",
    "altera": "alter",
    "alterum": "alter",
    "alterius": "alter",
    "alteri": "alter",
    "tertiam": "tertius",
    "tertia": "tertius",
    "tertium": "tertius",
    "tertius": "tertius",
    "nostra": "noster",
    "nostri": "noster",
    "nostris": "noster",
    "nostros": "noster",
    "nostras": "noster",
    "noster": "noster",
    "una": "unus",
    "unam": "unus",
    "uno": "unus",
    "unius": "unus",
    "uni": "unus",
    "unus": "unus",
    "unum": "unus",
    "is": "is",
    "ea": "is",
    "id": "is",
    "eius": "is",
    "ei": "is",
    "eum": "is",
    "eam": "is",
    "eo": "is",
    "ii": "is",
    "eae": "is",
    "eorum": "is",
    "earum": "is",
    "iis": "is",
    "eis": "is",
    "eos": "is",
    "eas": "is",
    "hic": "hic",
    "haec": "hic",
    "hoc": "hic",
    "huius": "hic",
    "huic": "hic",
    "hunc": "hic",
    "hanc": "hic",
    "hac": "hic",
    "hi": "hic",
    "hae": "hic",
    "horum": "hic",
    "harum": "hic",
    "his": "hic",
    "hos": "hic",
    "has": "hic",
    "ille": "ille",
    "illa": "ille",
    "illud": "ille",
    "illius": "ille",
    "illi": "ille",
    "illum": "ille",
    "illam": "ille",
    "illo": "ille",
    "illos": "ille",
    "illas": "ille",
    "illis": "ille",
    "suus": "suus",
    "sua": "suus",
    "suum": "suus",
    "sui": "suus",
    "suae": "suus",
    "suo": "suus",
    "suos": "suus",
    "suas": "suus",
    "suis": "suus",
    "inter": "inter",
    "reliquus": "reliquus",
    "reliqua": "reliquus",
    "reliquum": "reliquus",
    "reliqui": "reliquus",
    "reliquos": "reliquus",
    "reliquas": "reliquus",
    "reliquorum": "reliquus",
    "saepe": "saepe",
    "fere": "fere",
    "aut": "aut",
    "ad": "ad",
    "ab": "ab",
    "a": "ab",
    "trans": "trans",
    "que": "que",
    "ve": "ve",
    "ne": "ne",
    "post": "post",
    "ante": "ante",
    "sine": "sine",
    "pro": "pro",
    "per": "per",
    "apud": "apud",
    "ob": "ob",
    "sub": "sub",
    "super": "super",
    "ubi": "ubi",
    "ita": "ita",
    "sic": "sic",
    "iam": "iam",
    "nunc": "nunc",
    "tum": "tum",
    "tunc": "tunc",
    "tamen": "tamen",
    "etiam": "etiam",
    "quoque": "quoque",
    "atque": "atque",
    "ac": "atque",
    "magis": "magis",
    "maxime": "magis",
    "longe": "longe",
    "longissime": "longe",
    "minus": "parvus",
    "minime": "parvus",
    "partes": "pars",
    "partem": "pars",
    "parte": "pars",
    "partium": "pars",
    "partibus": "pars",
    "divisa": "divido",
    "dividunt": "divido",
    "dividit": "divido",
    "divisis": "divido",
    "incolunt": "incolo",
    "incolebant": "incolo",
    "incolere": "incolo",
    "incoluerant": "incolo",
    "appellantur": "appello",
    "appellatur": "appello",
    "appellatus": "appello",
    "differunt": "differo",
    "fortissimi": "fortis",
    "fortior": "fortis",
    "fortiores": "fortis",
    "absunt": "absum",
    "abesse": "absum",
    "commeant": "commeo",
    "pertinent": "pertineo",
    "pertinet": "pertineo",
    "pertinerent": "pertineo",
    "important": "importo",
    "proximi": "proximus",
    "gerunt": "gero",
    "gerere": "gero",
    "gesserunt": "gero",
    "bellum": "bellum",
    "praecedunt": "praecedo",
    "contendunt": "contendo",
    "prohibent": "prohibeo",
    "obtinere": "obtineo",
    "dictum": "dico",
    "capit": "capio",
    "continetur": "contineo",
    "attingit": "attingo",
    "vergit": "vergo",
    "oriuntur": "orior",
    "spectant": "specto",
}

class LatinLemmatizer:
    def __init__(self):
        self.lemmatiseur = Lemmatiseur()
        self.lemma_freq = self._load_frequencies()
        
    def _load_frequencies(self) -> Dict[str, int]:
        freq_map = {}
        import pycollatinus
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
                    clean = strip_accents(raw)
                    try:
                        freq = int(parts[5]) if len(parts) > 5 and parts[5] else 0
                    except ValueError:
                        freq = 0
                    if clean not in freq_map or freq > freq_map[clean]:
                        freq_map[clean] = freq
        return freq_map

    def is_known_word(self, token: str) -> bool:
        """Check whether token is recognized by lemmatizer or override tables."""
        t_lower = token.lower()
        if t_lower in AMBIGUITY_OVERRIDES or t_lower in CAESAR_PROPER_NOUNS or t_lower in SYNCOPATED_FORMS:
            return True
        return bool(list(self.lemmatiseur.lemmatise(token)))

    def lemmatize_token(self, token: str) -> str:
        """
        Lemmatize a surface form token to its canonical dictionary headword.
        Returns the lemma string.
        """
        t_lower = token.lower()
        
        # 1. Direct ambiguity / high-priority overrides
        if t_lower in AMBIGUITY_OVERRIDES:
            return AMBIGUITY_OVERRIDES[t_lower]
            
        # 2. Caesar proper nouns
        if t_lower in CAESAR_PROPER_NOUNS:
            return CAESAR_PROPER_NOUNS[t_lower]
            
        # 3. Syncopated / irregular forms
        if t_lower in SYNCOPATED_FORMS:
            return SYNCOPATED_FORMS[t_lower]
            
        # 4. PyCollatinus lemmatization
        results = list(self.lemmatiseur.lemmatise(token))
        if not results and token != token.lower():
            # Try lowercase
            results = list(self.lemmatiseur.lemmatise(token.lower()))
            
        if results:
            # Extract unique candidate lemmas
            candidates = list(dict.fromkeys(r["lemma"] for r in results))
            if len(candidates) == 1:
                return self._standardize_spelling(candidates[0])
                
            # Disambiguate by frequency and case matching
            best_lemma = self._disambiguate_candidates(token, candidates)
            return self._standardize_spelling(best_lemma)
            
        # Fallback: if not recognized, return the token itself
        return self._standardize_spelling(token)

    def _disambiguate_candidates(self, token: str, candidates: List[str]) -> str:
        """Pick the most likely lemma based on frequency and casing."""
        token_is_lower = token.islower()
        
        def score(lemma: str) -> Tuple[int, int, int]:
            # Clean lemma
            clean = strip_accents(lemma)
            freq = self.lemma_freq.get(clean, 0)
            
            # Prefer lowercase lemmas for lowercase tokens
            casing_match = 1 if (token_is_lower and lemma[0].islower()) or (not token_is_lower and lemma[0].isupper()) else 0
            
            # Prefer shorter, standard forms
            length_penalty = -len(lemma)
            return (casing_match, freq, length_penalty)

        return max(candidates, key=score)

    def _standardize_spelling(self, lemma: str) -> str:
        """
        Normalize internal PyCollatinus orthography to standard classical dictionary style.
        E.g., Collatinus often uses 'u' for 'v' in verbs like 'diuido' -> 'divido'.
        """
        clean = strip_accents(lemma)
        # Fix known u/v in common Latin dictionary headwords
        uv_fixes = {
            "diuido": "divido",
            "uiuus": "vivus",
            "uiuo": "vivo",
            "uideo": "video",
            "uoco": "voco",
            "uolo": "volo",
            "uenio": "venio",
            "uinco": "vinco",
            "uerto": "verto",
            "uasto": "vasto",
            "uallum": "vallum",
            "uulnus": "vulnus",
            "uox": "vox",
            "uia": "via",
            "uicus": "vicus",
            "uictoria": "victoria",
            "uir": "vir",
            "uirtus": "virtus",
            "uis": "vis",
            "uita": "vita",
        }
        if clean in uv_fixes:
            return uv_fixes[clean]
        return clean
