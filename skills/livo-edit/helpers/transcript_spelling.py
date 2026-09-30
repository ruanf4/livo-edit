"""Grafia explícita do usuário, sem mudar os tempos ou adivinhar palavras."""
from __future__ import annotations
import json
import re
import unicodedata
from pathlib import Path

WORD = re.compile(r"[^\W_]+", re.UNICODE)

def fold(text: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', text.casefold())
                   if unicodedata.category(c) != 'Mn')

def validate_rule(source: str, target: str) -> tuple[list[str], list[str]]:
    a = WORD.findall(unicodedata.normalize('NFC', source))
    b = WORD.findall(unicodedata.normalize('NFC', target))
    if len(a) != 1 or len(b) != 1:
        raise ValueError('A correção de grafia atua em uma palavra inteira; para reescrever frases, use o editor de texto.')
    return [fold(w) for w in a], b

def replace_text(text: str, source: str, target: str) -> tuple[str, int]:
    wanted, new = validate_rule(source, target)
    text = unicodedata.normalize('NFC', text)
    tokens = list(WORD.finditer(text))
    edits, count, i = [], 0, 0
    while i <= len(tokens) - len(wanted):
        group = tokens[i:i+len(wanted)]
        if ([fold(m.group()) for m in group] == wanted and
            all(text[a.end():b.start()].isspace() for a, b in zip(group, group[1:]))):
            for match, value in zip(group, new):
                edits.append((match.start(), match.end(), value))
            count += 1
            i += len(wanted)
        else:
            i += 1
    for start, end, value in reversed(edits):
        text = text[:start] + value + text[end:]
    return text, count

def correct_payload(data, rules: list[dict]) -> tuple[object, int]:
    """Só campos de fala; caminhos, ids, estilos, metadados e números ficam intactos."""
    count = 0
    def visit(value):
        nonlocal count
        if isinstance(value, list):
            return [visit(v) for v in value]
        if not isinstance(value, dict):
            return value
        out = {}
        for key, child in value.items():
            if key in ('text', 'word', 'texto') and isinstance(child, str):
                for rule in rules:
                    child, found = replace_text(child, rule['from'], rule['to'])
                    count += found
                out[key] = child
            else:
                out[key] = visit(child)
        return out
    return visit(data), count

def load_rules(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rules = json.loads(path.read_text(encoding='utf-8')).get('replacements', [])
    for rule in rules:
        validate_rule(rule['from'], rule['to'])
    return rules

def prompt_for(rules: list[dict], extra: str = '') -> str:
    names = list(dict.fromkeys(rule['to'] for rule in rules))
    return ' '.join(filter(None, [extra.strip(), 'Grafias do projeto: ' + ', '.join(names) + '.' if names else '']))[:1200]

def atomic_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.spelling.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)

def glossary_for(path: Path) -> Path:
    for parent in (path.resolve(), *path.resolve().parents):
        for candidate in (parent/'transcription-glossary.json', parent/'edit'/'transcription-glossary.json'):
            if candidate.is_file():
                return candidate
    return path.resolve().parent/'transcription-glossary.json'

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--transcript', required=True, type=Path)
    args = ap.parse_args()
    rules = load_rules(glossary_for(args.transcript))
    if rules:
        data = json.loads(args.transcript.read_text(encoding='utf-8'))
        new, count = correct_payload(data, rules)
        if new != data:
            atomic_json(args.transcript, new)
