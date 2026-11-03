"""Build attributed, on-demand ECDICT shards and an inline CEEC spelling subset."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

from build_vocabulary_reference import split_meanings, write_table

TAGS = {"n": "noun", "v": "verb", "vt": "verb", "vi": "verb", "a": "adjective", "adj": "adjective",
        "ad": "adverb", "adv": "adverb", "prep": "preposition", "conj": "conjunction",
        "pron": "pronoun", "art": "article", "aux": "auxiliary", "aux.v": "auxiliary"}
MARKER = re.compile(r"^\s*([a-z]+(?:\.v)?)\.\s*(.*)$")


def groups(translation, converter):
    result = {}
    for line in translation.split(r"\n"):
        if re.search(r"人名", line):
            continue
        match = MARKER.match(line)
        field = TAGS.get(match[1], "unclassified") if match else "unclassified"
        gloss = match[2] if match and field != "unclassified" else line
        for term in split_meanings(gloss):
            text = converter.convert(term.strip())
            if not re.search(r"[\u3400-\u9fff]", text) or len(text) > 240 or re.search(r"[<>\x00-\x08\x0b\x0c\x0e-\x1f]", text):
                continue
            if text not in result.setdefault(field, []):
                result[field].append(text)
    if len(result) > 1:
        result.pop('unclassified', None)
    return result


def bucket(word):
    value = 2166136261
    for letter in word:
        value = ((value ^ ord(letter)) * 16777619) & 0xffffffff
    return f"{value % 256:02x}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--vendor", type=Path)
    args = parser.parse_args()
    if args.vendor:
        sys.path.insert(0, str(args.vendor.resolve()))
    from opencc import OpenCC

    converter = OpenCC("s2twp")
    core_file = args.project / "src/data/ceecVocabulary.ts"
    core_keys = set(re.findall(r'^  "([^"]+)":', core_file.read_text(encoding="utf-8"), re.M))
    entries = {}
    with args.dictionary.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            key = unicodedata.normalize("NFKC", row["word"]).strip().lower().replace("’", "'")
            if len(key) > 80 or not re.fullmatch(r"[a-zà-ž]+(?:[' -][a-zà-ž]+)*", key):
                continue
            meanings = groups(row["translation"], converter)
            if meanings:
                target = entries.setdefault(key, {})
                for field, values in meanings.items():
                    target[field] = list(dict.fromkeys(target.get(field, []) + values))
    core = {key: entries[key] for key in sorted(core_keys) if key in entries}
    write_table(args.project / "src/data/ceecTranslations.ts",
                "export const CEEC_TRANSLATIONS: Record<string, Partial<Record<string, string[]>>>", core, generator="build_ecdict_lookup.py")
    shards = {f"{value:02x}": {} for value in range(256)}
    for key in sorted(entries):
        shards[bucket(key)][key] = entries[key]
    output = args.project / "public/dictionaries/ecdict-v1"
    output.mkdir(parents=True, exist_ok=True)
    sizes = []
    for shard_key, values in shards.items():
        payload = json.dumps(values, ensure_ascii=False, separators=(",", ":")) + "\n"
        (output / f"{shard_key}.json").write_bytes(payload.encode("utf-8"))
        sizes.append(len(payload.encode("utf-8")))
    manifest = {"source": "https://github.com/skywind3000/ECDICT", "sha256": hashlib.sha256(args.dictionary.read_bytes()).hexdigest(),
                "license": "MIT", "generatedOn": "2026-11-02", "entries": len(entries), "coreEntries": len(core),
                "shards": len(shards), "totalBytes": sum(sizes), "maxShardBytes": max(sizes)}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest))
    for key in ["novelty", "ability", "alternate", "the", "may", "you"]:
        print(key, json.dumps(entries.get(key), ensure_ascii=True))


if __name__ == "__main__":
    main()
