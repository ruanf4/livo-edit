"""Corrige todas as ocorrências de uma grafia no projeto e lembra a preferência."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from transcript_spelling import atomic_json, correct_payload, fold, load_rules, validate_rule

FOLDERS = ('transcripts', 'transcricao_raw', 'transcricao_revisada', 'transcricao_corte_raw')

def correct_project(project: Path, source: str, target: str, remember: bool = True) -> dict:
    validate_rule(source, target)
    edit = project if project.name == 'edit' else project / 'edit'
    public = edit / 'remotion' / 'public'
    files = sorted({p for folder in FOLDERS for p in (edit / folder).glob('*.json')})
    files += [p for p in (public/'captions.json', public/'caption-cues.json') if p.is_file()]
    rule = {'from': source, 'to': target}
    changed, matched, caption_matches, backups = [], 0, 0, []
    pending = []
    # Leia e valide tudo antes de gravar qualquer arquivo.
    for file in files:
        original = file.read_bytes()
        old = json.loads(original.decode('utf-8-sig'))
        new, count = correct_payload(old, [rule])
        matched += count
        if file == public/'captions.json':
            caption_matches = count
        if new != old:
            pending.append((file, original, new))
    glossary = edit/'transcription-glossary.json'
    rules = load_rules(glossary)
    if remember:
        rules = [r for r in rules if fold(r['from']) != fold(source)] + [rule]
    try:
        for file, original, new in pending:
            backups.append((file, original))
            atomic_json(file, new)
            changed.append(str(file.relative_to(edit)))
        if remember:
            atomic_json(glossary, {'replacements': rules})
    except Exception:
        for file, original in reversed(backups):
            file.write_bytes(original)
        raise
    return {'occurrences': caption_matches if (public/'captions.json').exists() else matched,
            'matchedFields': matched, 'files': changed, 'remembered': remember}

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--project', required=True, type=Path)
    ap.add_argument('--from', dest='source', required=True)
    ap.add_argument('--to', dest='target', required=True)
    ap.add_argument('--no-remember', action='store_true')
    args = ap.parse_args()
    project = args.project.resolve()
    report = correct_project(project, args.source, args.target, not args.no_remember)
    atomic_json((project if project.name == 'edit' else project/'edit')/'spelling-result.json', report)
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
