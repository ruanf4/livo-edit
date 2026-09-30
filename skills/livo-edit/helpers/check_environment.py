"""Confere ferramentas de mídia sem carregar modelos ou imprimir credenciais."""
import importlib.util
import json
import shutil
import sys


def main():
    status = {name: bool(shutil.which(name)) for name in ('uv', 'ffmpeg', 'ffprobe', 'node')}
    status['python'] = sys.version.split()[0]
    status['whisperx'] = importlib.util.find_spec('whisperx') is not None
    status['opencv'] = importlib.util.find_spec('cv2') is not None
    print(json.dumps(status, indent=2))
    missing = [name for name, ready in status.items() if ready is False]
    if missing:
        print('Ferramentas/dependências ausentes: ' + ', '.join(missing))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
