"""Build separate, attributed CEEC metadata and ECDICT Chinese lookup tables.

Requires pypdf and opencc-python-reimplemented (build tools only).
The input PDF is read-only; all generated files are deterministic UTF-8 text.
"""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

from pypdf import PdfReader


PARTS = {
    "n": "noun", "v": "verb", "adj": "adjective", "adv": "adverb",
    "prep": "preposition", "conj": "conjunction", "pron": "pronoun",
    "art": "article", "aux": "auxiliary",
}
POS = r"\(?(?:prep|conj|pron|adj|adv|art|aux|n|v)\.?\)?"
ENTRY = re.compile(r"(?P<word>[A-Za-zÀ-ž][A-Za-zÀ-ž'’(),./ -]*?)\s+(?P<pos>" + POS + r"(?:\s*/\s*" + POS + r")*)\s+(?P<level>[1-6])(?=\s|$)")


def official_rows(pdf):
    reader = PdfReader(pdf)
    rows = []
    leftovers = []
    for index in range(64, 115):
        lines = unicodedata.normalize("NFKC", reader.pages[index].extract_text()).replace("’", "'").splitlines()
        # Printed pages 53-103 are the alphabetic list, excluding the ungraded appendix.
        lines = [line.strip() for line in lines if line.strip()]
        if len(lines) > 1 and re.fullmatch(r"\d+", lines[1]):
            lines = lines[2:]
        text = " ".join(line for line in lines if not line.startswith("依字母排序") and not re.fullmatch(r"[A-Z]", line))
        for match in ENTRY.finditer(text):
            rows.append({"entry": match["word"].strip(), "pos": match["pos"].replace(" ", ""), "level": int(match["level"]), "page": index - 11})
        rest = ENTRY.sub("", text).strip()
        if rest:
            leftovers.append((index + 1, rest))
    if leftovers:
        raise ValueError(f"Unparsed PDF content: {leftovers}")
    return rows


def expanded_words(row):
    raw_parts = row["pos"].split("/")
    base_parts = [PARTS[part.strip("().")] for part in raw_parts if not part.startswith("(")]
    derived_parts = [PARTS[part.strip("().")] for part in raw_parts if part.startswith("(")]
    output = []
    for alternative in row["entry"].split("/"):
        # The PDF explicitly documents (ment), full noun variants and plural (s).
        full = re.fullmatch(r"([A-Za-z'-]+)\s*\(([A-Za-z', -]+)\)", alternative.strip())
        if full:
            base, addition = full.groups()
            if "," in addition:
                output.append((base, base_parts))
                output.extend((form.strip(), base_parts) for form in addition.split(","))
                continue
            if addition in ("ment", "s", "es", "ism"):
                derived = base + addition
            else:
                derived = addition
            if addition != "ism":
                output.append((base, base_parts))
            plural_parts = ["noun"] if addition in ("s", "es") and "noun" in base_parts else base_parts
            output.append((derived, derived_parts or plural_parts))
        else:
            if not re.fullmatch(r"[A-Za-zÀ-ž][A-Za-zÀ-ž'. -]*", alternative.strip()):
                raise ValueError(f"Unhandled spelling: {row}")
            # advertise(ment)/ad: the alternative is the noun, not a verb.
            parts = derived_parts if derived_parts and alternative != row["entry"].split("/")[0] else base_parts
            output.append((alternative.strip(), parts))
    return output


def official_index(rows):
    result = {}
    for row in rows:
        for word, parts in expanded_words(row):
            key = word.lower()
            entry = {"level": row["level"], "levels": [row["level"]], "parts": parts, "entry": row["entry"], "page": row["page"]}
            if key in result and result[key] != entry:
                previous = result[key]
                entry["parts"] = list(dict.fromkeys(previous["parts"] + parts))
                entry["entry"] = "；".join(dict.fromkeys([previous["entry"], row["entry"]]))
                entry["page"] = min(previous["page"], entry["page"])
                entry["levels"] = sorted(set(previous["levels"] + entry["levels"]))
                entry["level"] = min(entry["levels"])
            result[key] = entry
    return dict(sorted(result.items()))


def dictionary_index(path, official, converter):
    result = {}
    tags = {"n": "noun", "v": "verb", "vt": "verb", "vi": "verb", "a": "adjective", "adj": "adjective",
            "ad": "adverb", "adv": "adverb", "prep": "preposition", "conj": "conjunction",
            "pron": "pronoun", "art": "article", "aux": "auxiliary", "aux.v": "auxiliary"}
    marker = re.compile(r"^\s*(n|vt|vi|v|adj|a|adv|ad|prep|conj|pron|art|aux\.v|aux)\.\s*(.*)$")
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            key = row["word"].lower()
            if key not in official:
                continue
            groups = {}
            for line in row["translation"].split(r"\n"):
                match = marker.match(line)
                if not match:
                    continue
                field = tags[match[1]]
                if field not in official[key]["parts"]:
                    continue
                # Skip person-name glosses and unrelated domain-indexed addenda.
                if re.search(r"人名|\(.*人名|（.*人名", match[2]):
                    continue
                meanings = [converter.convert(term) for term in split_meanings(match[2]) if re.search(r"[\u3400-\u9fff]", term)]
                for meaning in meanings:
                    if meaning not in groups.setdefault(field, []):
                        groups[field].append(meaning)
            if groups:
                result[key] = groups
    return dict(sorted(result.items()))


def split_meanings(value):
    closing = []
    pairs = {"(": ")", "（": "）", "[": "]", "【": "】", "「": "」", "『": "』"}
    terms = []
    term = ""
    for character in value:
        if character in pairs:
            closing.append(pairs[character])
        elif closing and character == closing[-1]:
            closing.pop()
        if not closing and character in ",，、;；":
            if term.strip():
                terms.append(term.strip())
            term = ""
        else:
            term += character
    if term.strip():
        terms.append(term.strip())
    return terms


def write_table(path, declaration, entries):
    rows = [f"  {json.dumps(word, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False, separators=(',', ':'))}," for word, value in entries.items()]
    path.write_text("// Generated by scripts/build_vocabulary_reference.py; see VOCABULARY_SOURCES.md.\n" + declaration + " = {\n" + "\n".join(rows) + "\n};\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--vendor", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.vendor:
        sys.path.insert(0, str(args.vendor.resolve()))
    from opencc import OpenCC

    rows = official_rows(args.pdf)
    counts = {level: sum(row["level"] == level for row in rows) for level in range(1, 7)}
    if len(rows) != 6012 or set(counts.values()) != {1002}:
        raise ValueError(f"Unexpected official edition or incomplete extraction: {counts}")
    official = official_index(rows)
    translations = dictionary_index(args.dictionary, official, OpenCC("s2twp"))
    print(json.dumps({"official_rows": len(rows), "matched_spellings": len(official), "translated_spellings": len(translations),
        "levels": counts,
        "pdf_sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
        "dictionary_sha256": hashlib.sha256(args.dictionary.read_bytes()).hexdigest()}, ensure_ascii=False))
    for key in ["ability", "abandon", "novelty", "alternate", "agree", "agreement", "ad", "you", "the", "should"]:
        print(key, json.dumps({"official": official.get(key), "translations": translations.get(key)}, ensure_ascii=False))
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        write_table(args.output / "ceecVocabulary.ts", "export const CEEC_VOCABULARY: Record<string, {level: number; levels: number[]; parts: string[]; entry: string; page: number}>", official)
        write_table(args.output / "ceecTranslations.ts", "export const CEEC_TRANSLATIONS: Record<string, Partial<Record<string, string[]>>>", translations)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
