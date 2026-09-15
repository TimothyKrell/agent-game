"""Bounded ZIP extraction before deployment credentials enter the job. No extractall."""
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

archive, destination, digest = sys.argv[1:]
root = Path(destination)
assert not root.exists(), 'Quarantine must be new'
assert Path(archive).stat().st_size <= 110 * 1024 * 1024, 'Archive too large'
assert re.fullmatch(r'[a-f0-9]{64}', digest), 'Invalid digest'
with open(archive, 'rb') as source:
    assert hashlib.file_digest(source, 'sha256').hexdigest() == digest, 'ZIP digest mismatch'
    source.seek(0)
    with zipfile.ZipFile(source) as bundle:
        entries = bundle.infolist()
        assert len(entries) <= 4096, 'Too many ZIP entries'
        names = set()
        total = 0
        for entry in entries:
            name = entry.filename.rstrip('/') if entry.is_dir() else entry.filename
            assert len(name) <= 240 and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./-]*', name), 'Invalid ZIP path'
            assert all(part and not part.startswith('.') for part in name.split('/')), 'Traversal'
            assert str(PurePosixPath(name)) == name and name not in names, 'Ambiguous ZIP path'
            names.add(name)
            mode = entry.external_attr >> 16
            kind = stat.S_IFMT(mode)
            assert kind in (0, stat.S_IFREG, stat.S_IFDIR), 'ZIP symlink/special file'
            assert not (entry.flag_bits & 1), 'Encrypted ZIP'
            assert entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'Unsupported compression'
            maximum = 512 * 1024 if name == 'manifest.json' else 16 * 1024 * 1024
            assert entry.file_size <= maximum, 'ZIP entry too large'
            total += entry.file_size
            assert total <= 101 * 1024 * 1024, 'Expanded ZIP too large'
        root.mkdir(mode=0o700)
        for entry in entries:
            target = root / entry.filename
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with bundle.open(entry) as source_file, open(target, 'xb') as output:
                count = 0
                while chunk := source_file.read(64 * 1024):
                    count += len(chunk)
                    assert count <= entry.file_size, 'Expanded ZIP size mismatch'
                    output.write(chunk)
                assert count == entry.file_size, 'Truncated ZIP'
            os.chmod(target, 0o400)
