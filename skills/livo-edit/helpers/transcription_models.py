"""Um modelo de cada tipo por processo. Trocar configuração invalida a cópia antiga."""
from pathlib import Path

_models = {}


def cached_model(kind, key, load):
    old = _models.get(kind)
    if old is not None and old[0] == key:
        return old[1]
    _models.pop(kind, None)
    del old
    value = load()
    _models[kind] = (key, value)
    return value


def clear_models():
    _models.clear()


def parakeet_model(directory, threads):
    import sherpa_onnx
    directory = Path(directory).resolve()
    names = ('encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt')
    # Mudanças nos arquivos ou nas threads não reutilizam um reconhecedor antigo.
    key = (str(directory), threads, tuple((directory / name).stat().st_mtime_ns for name in names))
    return cached_model('parakeet', key, lambda: sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(directory / names[0]), decoder=str(directory / names[1]),
        joiner=str(directory / names[2]), tokens=str(directory / names[3]),
        num_threads=threads, sample_rate=16_000, feature_dim=128,
        decoding_method='greedy_search', model_type='nemo_transducer',
    ))
