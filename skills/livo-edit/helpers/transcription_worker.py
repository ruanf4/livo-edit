"""Worker local serial de Parakeet. EOF fecha; não usa rede nem persiste credenciais."""
import json
import sys
import traceback
from pathlib import Path

PREFIX = 'LIVO_TRANSCRIPTION_RESULT '


def serve():
    import parakeet_transcribe
    from transcription_models import clear_models
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            args = request['args']
            if not isinstance(args, list) or not all(isinstance(v, str) for v in args):
                raise ValueError('Argumentos de transcrição inválidos.')
            sys.argv = [str(Path(parakeet_transcribe.__file__)), *args]
            code = parakeet_transcribe.main()
            if code:
                raise RuntimeError(f'Transcritor encerrou com código {code}')
            response = {'id': request['id'], 'ok': True}
        except (Exception, SystemExit) as error:
            clear_models()
            traceback.print_exc(file=sys.stderr)
            response = {'id': request.get('id') if isinstance(request, dict) else None,
                        'ok': False, 'error': str(error)}
        print(PREFIX + json.dumps(response, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    serve()
