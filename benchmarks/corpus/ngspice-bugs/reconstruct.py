"""Bounded #803 pin recovery, not an engine or a new-pin generator.
Run fetch.ts 158 737 738 791 794 first, then python3 reconstruct.py <receipt.json>.
Only attachment-hash-verified archives are extracted. Candidate hashes/recipes,
not vendor bytes, are written to the receipt. Only exact original pin matches
are materialized in fetched/. No deck/model semantics are changed.
"""
import hashlib
import itertools
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def formats(text):
    for spaces in ['retain', 'rstrip-lines', 'strip-document']:
        clean = text if spaces == 'retain' else '\n'.join(line.rstrip() for line in text.split('\n'))
        if spaces == 'strip-document':
            clean = clean.strip()
        for ending in ['LF', 'CRLF', 'CR']:
            for trailing in [0, 1, 2, 3]:
                body = clean.rstrip('\r\n') + '\n' * trailing
                body = body.replace('\n', {'LF': '\n', 'CRLF': '\r\n', 'CR': '\r'}[ending])
                for encoding in ['utf-8', 'utf-8-sig', 'utf-16', 'utf-16-be']:
                    yield {'spaces': spaces, 'ending': ending, 'trailing': trailing, 'encoding': encoding}, body.encode(encoding)


def candidates(ticket, text):
    if ticket == 158:
        # Control-block conversion recorded by the harvest; vary spelling/spacing
        # and location only, not the transfer-function or PZ arguments.
        for tf, pz, pr in itertools.product(['.tf', '.TF'], ['.pz', '.PZ'], ['.print pz all', '.print PZ all', '.PRINT PZ ALL']):
            for blank in ['', '\n']:
                cards = f'{tf} v(VOUT,0) VIN\n{pz} VP 0 VOUT 0 vol pz\n{pr}\n'
                replacement = blank + cards + blank
                yield {'control': [tf, pz, pr], 'blank': len(blank), 'location': 'in-place'}, re.sub(r'\.control\n.*?\.endc\n', replacement, text, flags=re.S)
                removed = re.sub(r'\.control\n.*?\.endc\n', '', text, flags=re.S)
                yield {'control': [tf, pz, pr], 'blank': len(blank), 'location': 'before-end'}, re.sub(r'(?im)^\.end\s*$', replacement + '.end', removed)
        for output in ['v(VOUT)', 'v(vout)', 'V(VOUT)', 'v(VOUT,0)']:
            for blanks in range(4):
                cards = f'.tf {output} VIN\n.pz VP 0 VOUT 0 vol pz\n.print pz all' + '\n' * blanks
                yield {'control-output': output, 'blank-after': blanks}, re.sub(r'\.control\n.*?\.endc\n', cards, text, flags=re.S)
        return
    pattern = r'(?im)^(\.(?:include|lib)\s+)"([^"]+)"'
    includes = list(re.finditer(pattern, text))
    for style in ['original', 'relative', 'dot-relative', 'parent-relative', 'basename', 'dot-basename', 'backslash-relative']:
        for case in ['retain', 'lower', 'upper']:
            for quotes in itertools.product([False, True], repeat=len(includes)):
                index = iter(quotes)
                def replace(match):
                    path = match[2]
                    relative = re.sub(r'^[A-Za-z]:[/\\]', '', path)
                    path = {'original': path, 'relative': relative, 'dot-relative': './' + relative, 'parent-relative': '../' + relative, 'basename': relative.split('/')[-1], 'dot-basename': './' + relative.split('/')[-1], 'backslash-relative': relative.replace('/', '\\')}[style]
                    path = path if case == 'retain' else getattr(path, case)()
                    quote = '"' if next(index) else ''
                    return match[1] + quote + path + quote
                yield {'paths': style, 'case': case, 'quotes': quotes}, re.sub(pattern, replace, text)


def main(output):
    if Path(output).exists():
        raise FileExistsError('Refusing to overwrite receipt: ' + output)
    manifest = json.loads((HERE / 'manifest.json').read_text())
    rows = []
    for ticket in [158, 738, 791, 794]:
        entry = next(e for e in manifest['tickets'] if e['ticket'] == ticket)
        directory = HERE / 'fetched' / str(ticket)
        for attachment in entry['attachments']:
            archive = directory / attachment['name']
            assert sha(archive.read_bytes()) == attachment['sha256'], str(archive)
            subprocess.run(['tar', '-xf', str(archive), '-C', str(directory)], check=True)
        for deck in entry['uncommittedDecks']:
            source = 'amp3/amp3.net' if ticket == 158 else deck['name'].replace('.local.cir', '.cir')
            original = (directory / source).read_bytes()
            text = original.decode('utf-8-sig').replace('\r\n', '\n')
            attempts = {}
            matches = []
            for recipe, candidate in candidates(ticket, text):
                for formatting, data in formats(candidate):
                    digest = sha(data)
                    if digest in attempts:
                        continue
                    full = {**recipe, **formatting}
                    attempts[digest] = {'sha256': digest, 'bytes': len(data), 'recipe': full}
                    if digest == deck['sha256']:
                        assert len(data) == deck['bytes']
                        target = directory / deck['name']
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                        matches.append(full)
            examples = [a for a in attempts.values() if a['recipe']['spaces'] == 'retain' and a['recipe']['ending'] in ['LF', 'CRLF'] and a['recipe']['trailing'] == 1 and a['recipe']['encoding'] == 'utf-8' and (ticket == 158 or len(set(a['recipe']['quotes'])) == 1) and a['recipe'].get('case', 'retain') == 'retain']
            row = {'ticket': ticket, 'deck': deck['name'], 'expectedSha256': deck['sha256'], 'source': source, 'sourceSha256': sha(original), 'status': 'restored' if matches else 'provenance-gap', 'matches': matches, 'attemptCount': len(attempts), 'attemptedHashSetSha256': sha(('\n'.join(sorted(attempts)) + '\n').encode()), 'examples': examples}
            rows.append(row)
            print(ticket, deck['name'], row['status'], len(attempts), matches)
    Path(output).write_text(json.dumps({'schema': 1, 'rows': rows}, indent=2) + '\n')


if __name__ == '__main__':
    main(sys.argv[1])
